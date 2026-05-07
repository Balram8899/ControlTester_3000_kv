from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timedelta
from typing import Any

import gridfs
import pymongo
from pymongo.errors import OperationFailure

from utils.services.schemas import DocumentUpliftCase


logger = logging.getLogger(__name__)

CONTENT_FIELDS = {"markdown_documents", "anchors", "chunks"}
RUNNING_PIPELINE_STAGES = {"converting", "analyzing", "generating_outputs"}


def utc_now() -> str:
    return datetime.utcnow().isoformat()


def _pipeline_timeout_seconds() -> int:
    try:
        return int(os.getenv("DOCUMENT_UPLIFT_PIPELINE_TIMEOUT_SECONDS", "3600"))
    except (TypeError, ValueError):
        return 3600


def _parse_utc(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


class DocumentUpliftCaseStore:
    def __init__(self, mongo_uri: str | None = None) -> None:
        uri = mongo_uri or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        self.client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=1500)
        db_name = os.environ.get("DOCUMENT_UPLIFT_MONGO_DB", "trace_db")
        self.db = self.client[db_name]
        self._bind_collections()
        self.input_fs = gridfs.GridFS(self.db, collection="document_uplift_inputs")
        self.output_fs = gridfs.GridFS(self.db, collection="document_uplift_outputs")
        self.is_connected = True
        try:
            self.client.admin.command("ping")
            self._ensure_indexes()
        except OperationFailure as exc:
            if "DatabaseDifferCase" not in str(exc) or db_name == "Trace_db":
                self._use_memory_fallback()
                return
            self.db = self.client["Trace_db"]
            self._bind_collections()
            self.input_fs = gridfs.GridFS(self.db, collection="document_uplift_inputs")
            self.output_fs = gridfs.GridFS(self.db, collection="document_uplift_outputs")
            try:
                self._ensure_indexes()
            except Exception as inner_exc:
                logger.warning("Document Uplift Mongo index setup failed: %s", inner_exc)
                self._use_memory_fallback()
        except Exception as exc:
            logger.warning("Document Uplift case store using memory fallback: %s", exc)
            self._use_memory_fallback()

    def _bind_collections(self) -> None:
        self.col = self.db["document_uplift_cases"]
        self.markdown_col = self.db["document_uplift_markdown"]
        self.anchors_col = self.db["document_uplift_anchors"]
        self.chunks_col = self.db["document_uplift_chunks"]
        self.facts_col = self.db["document_uplift_facts"]

    def _ensure_indexes(self) -> None:
        self.col.create_index("case_id", unique=True)
        self.col.create_index("created_at")
        self.markdown_col.create_index([("case_id", 1), ("file_id", 1)], unique=True)
        self.anchors_col.create_index("case_id", unique=True)
        self.chunks_col.create_index("case_id", unique=True)
        self.facts_col.create_index([("case_id", 1), ("fact_id", 1)], unique=True)

    def _use_memory_fallback(self) -> None:
        self.is_connected = False
        self._memory: dict[str, dict[str, Any]] = {}
        self._memory_inputs: dict[str, bytes] = {}
        self._memory_outputs: dict[str, bytes] = {}
        self._memory_markdown: dict[str, list[dict[str, Any]]] = {}
        self._memory_anchors: dict[str, list[dict[str, Any]]] = {}
        self._memory_chunks: dict[str, list[dict[str, Any]]] = {}
        self._memory_facts: dict[str, list[dict[str, Any]]] = {}

    def _ensure_memory_content_stores(self) -> None:
        if not hasattr(self, "_memory_markdown"):
            self._memory_markdown = {}
        if not hasattr(self, "_memory_anchors"):
            self._memory_anchors = {}
        if not hasattr(self, "_memory_chunks"):
            self._memory_chunks = {}
        if not hasattr(self, "_memory_facts"):
            self._memory_facts = {}
        if not hasattr(self, "_memory_inputs"):
            self._memory_inputs = {}
        if not hasattr(self, "_memory_outputs"):
            self._memory_outputs = {}

    def _case_template(self, data: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        case = DocumentUpliftCase(
            case_id=str(uuid.uuid4()),
            title=str(data.get("title", "")).strip(),
            process_name=str(data.get("process_name", "")).strip() or None,
            domain_label=str(data.get("domain_label", "")).strip() or None,
            notes=str(data.get("notes", "")).strip() or None,
            created_at=now,
            updated_at=now,
        ).model_dump(mode="json")
        return case

    def _clean(self, doc: dict[str, Any] | None) -> dict[str, Any] | None:
        if not doc:
            return None
        cleaned = dict(doc)
        cleaned.pop("_id", None)
        return cleaned

    def _raw_case(self, case_id: str) -> dict[str, Any] | None:
        if self.is_connected:
            return self._clean(self.col.find_one({"case_id": case_id}))
        case = self._memory.get(case_id)
        return dict(case) if case else None

    def create_case(self, data: dict[str, Any]) -> dict[str, Any]:
        doc = self._case_template(data)
        if self.is_connected:
            self.col.insert_one({**doc, "_id": doc["case_id"]})
        else:
            self._memory[doc["case_id"]] = doc
        return self._hydrate_case_content(doc)

    def list_cases(self) -> list[dict[str, Any]]:
        if self.is_connected:
            return [
                self._hydrate_case_content(self._clean(doc)) or {}
                for doc in self.col.find({}, {"_id": 0}).sort("created_at", -1)
            ]
        return [
            self._hydrate_case_content(case) or {}
            for case in sorted(
                self._memory.values(),
                key=lambda item: str(item.get("created_at", "")),
                reverse=True,
            )
        ]

    def get_case(self, case_id: str) -> dict[str, Any] | None:
        return self._hydrate_case_content(
            self._fail_stale_running_pipeline(self._raw_case(case_id))
        )

    def update_case(self, case_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        raw_case = self._raw_case(case_id)
        if not raw_case:
            return None
        clean_updates = {key: value for key, value in updates.items() if value is not None}
        content_updates: dict[str, Any] = {}
        for field in CONTENT_FIELDS:
            if field in clean_updates:
                content_updates[field] = clean_updates.pop(field)
        if content_updates:
            self._write_case_content(case_id, content_updates)
        clean_updates["updated_at"] = utc_now()
        if self.is_connected:
            self.col.update_one({"case_id": case_id}, {"$set": clean_updates})
            return self.get_case(case_id)
        case = self._memory.get(case_id)
        if not case:
            return None
        case.update(clean_updates)
        return self.get_case(case_id)

    def _fail_stale_running_pipeline(
        self,
        case: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if not case:
            return None
        status = case.get("status") or {}
        stage = str(status.get("stage") or "")
        if stage not in RUNNING_PIPELINE_STAGES:
            return case
        timeout_seconds = _pipeline_timeout_seconds()
        if timeout_seconds <= 0:
            return case
        updated_at = _parse_utc(case.get("updated_at"))
        if not updated_at:
            return case
        if datetime.utcnow() - updated_at <= timedelta(seconds=timeout_seconds):
            return case

        processing_state = dict(case.get("processing_state") or {})
        processing_state["pipeline_status"] = "failed"
        processing_state["pipeline_error"] = (
            f"Document Uplift pipeline stale for more than {timeout_seconds} seconds"
        )
        updates = {
            "status": {"stage": "failed"},
            "processing_state": processing_state,
            "updated_at": utc_now(),
        }
        case.update(updates)
        case_id = str(case.get("case_id") or "")
        if self.is_connected:
            self.col.update_one({"case_id": case_id}, {"$set": updates})
        elif case_id in self._memory:
            self._memory[case_id].update(updates)
        return case

    def delete_case(self, case_id: str) -> bool:
        case = self.get_case(case_id)
        if not case:
            return False
        if self.is_connected:
            from bson import ObjectId

            for grid_file in self.input_fs.find({"case_id": case_id}):
                self._delete_gridfs_file(self.input_fs, grid_file._id)
            for output in case.get("outputs", []):
                gridfs_file_id = output.get("gridfs_file_id")
                if gridfs_file_id:
                    self._delete_gridfs_file(self.output_fs, ObjectId(gridfs_file_id))
            deleted = self.col.delete_one({"case_id": case_id}).deleted_count == 1
            if deleted:
                self.markdown_col.delete_many({"case_id": case_id})
                self.anchors_col.delete_many({"case_id": case_id})
                self.chunks_col.delete_many({"case_id": case_id})
                self.facts_col.delete_many({"case_id": case_id})
            return deleted
        self._ensure_memory_content_stores()
        deleted = self._memory.pop(case_id, None) is not None
        if deleted:
            self._memory_markdown.pop(case_id, None)
            self._memory_anchors.pop(case_id, None)
            self._memory_chunks.pop(case_id, None)
            self._memory_facts.pop(case_id, None)
            for key in list(self._memory_outputs):
                if key.startswith(f"{case_id}:"):
                    self._memory_outputs.pop(key, None)
        return deleted

    def save_case_facts(self, case_id: str, facts: list[dict[str, Any]]) -> None:
        now = utc_now()
        fact_docs = [
            {**dict(fact), "case_id": case_id, "updated_at": now}
            for fact in facts
        ]
        if self.is_connected:
            self.facts_col.delete_many({"case_id": case_id})
            if fact_docs:
                self.facts_col.insert_many(fact_docs)
            return
        self._ensure_memory_content_stores()
        self._memory_facts[case_id] = fact_docs

    def get_case_facts(self, case_id: str) -> list[dict[str, Any]]:
        if self.is_connected:
            return [
                self._clean(doc) or {}
                for doc in self.facts_col.find({"case_id": case_id}, {"_id": 0})
            ]
        self._ensure_memory_content_stores()
        return list(self._memory_facts.get(case_id, []))

    def get_case_content(self, case_id: str) -> dict[str, list[dict[str, Any]]]:
        if self.is_connected:
            markdown_documents = [
                self._clean(doc) or {}
                for doc in self.markdown_col.find({"case_id": case_id}, {"_id": 0})
            ]
            anchors_doc = self._clean(self.anchors_col.find_one({"case_id": case_id})) or {}
            chunks_doc = self._clean(self.chunks_col.find_one({"case_id": case_id})) or {}
            return {
                "markdown_documents": markdown_documents,
                "anchors": list(anchors_doc.get("anchors", [])),
                "chunks": list(chunks_doc.get("chunks", [])),
            }
        self._ensure_memory_content_stores()
        return {
            "markdown_documents": list(self._memory_markdown.get(case_id, [])),
            "anchors": list(self._memory_anchors.get(case_id, [])),
            "chunks": list(self._memory_chunks.get(case_id, [])),
        }

    def _hydrate_case_content(self, case: dict[str, Any] | None) -> dict[str, Any] | None:
        if not case:
            return None
        hydrated = dict(case)
        hydrated.update(self.get_case_content(str(hydrated.get("case_id", ""))))
        return hydrated

    def _write_case_content(self, case_id: str, updates: dict[str, Any]) -> None:
        now = utc_now()
        if self.is_connected:
            if "markdown_documents" in updates:
                self.markdown_col.delete_many({"case_id": case_id})
                markdown_documents = [
                    {**document, "case_id": case_id, "updated_at": now}
                    for document in updates.get("markdown_documents", [])
                ]
                if markdown_documents:
                    self.markdown_col.insert_many(markdown_documents)
            if "anchors" in updates:
                self.anchors_col.update_one(
                    {"case_id": case_id},
                    {"$set": {"case_id": case_id, "anchors": updates.get("anchors", []), "updated_at": now}},
                    upsert=True,
                )
            if "chunks" in updates:
                self.chunks_col.update_one(
                    {"case_id": case_id},
                    {"$set": {"case_id": case_id, "chunks": updates.get("chunks", []), "updated_at": now}},
                    upsert=True,
                )
            return
        self._ensure_memory_content_stores()
        if "markdown_documents" in updates:
            self._memory_markdown[case_id] = list(updates.get("markdown_documents", []))
        if "anchors" in updates:
            self._memory_anchors[case_id] = list(updates.get("anchors", []))
        if "chunks" in updates:
            self._memory_chunks[case_id] = list(updates.get("chunks", []))

    def store_input_file(
        self,
        case_id: str,
        file_id: str,
        filename: str,
        content: bytes,
        content_type: str = "application/octet-stream",
    ) -> Any:
        if self.is_connected:
            return self.input_fs.put(
                content,
                filename=filename,
                case_id=case_id,
                file_id=file_id,
                content_type=content_type,
                sha256=self.sha256_bytes(content),
            )
        self._ensure_memory_content_stores()
        self._memory_inputs[file_id] = content
        return file_id

    def get_input_file(self, file_id: str) -> bytes | None:
        if self.is_connected:
            grid_file = self.input_fs.find_one({"file_id": file_id})
            return grid_file.read() if grid_file else None
        self._ensure_memory_content_stores()
        return self._memory_inputs.get(file_id)

    def save_output_content(
        self,
        case_id: str,
        output_metadata: dict[str, Any],
        content: bytes,
    ) -> dict[str, Any]:
        output_id = str(output_metadata.get("output_id") or uuid.uuid4())
        output_type = str(output_metadata.get("output_type") or output_metadata.get("type") or "docx")
        filename = str(output_metadata.get("filename") or "document-uplift-output.bin")
        content_type = str(output_metadata.get("content_type") or "application/octet-stream")
        gridfs_file_id = ""
        if self.is_connected:
            gridfs_file_id = str(
                self.output_fs.put(
                    content,
                    filename=filename,
                    case_id=case_id,
                    output_id=output_id,
                    output_type=output_type,
                    content_type=content_type,
                    sha256=self.sha256_bytes(content),
                )
            )
        else:
            self._ensure_memory_content_stores()
            gridfs_file_id = f"memory:{case_id}:{output_id}"
            self._memory_outputs[f"{case_id}:{output_id}"] = content

        output = {
            "output_id": output_id,
            "output_type": output_type,
            "filename": filename,
            "output_mode": output_metadata.get("output_mode", "track_changes"),
            "gridfs_file_id": gridfs_file_id,
            "content_type": content_type,
            "created_at": utc_now(),
        }
        case = self.get_case(case_id)
        if case:
            outputs = [
                item
                for item in case.get("outputs", [])
                if item.get("output_id") != output_id
            ]
            outputs.append(output)
            self.update_case(case_id, {"outputs": outputs})
        return output

    def get_output_content(self, case_id: str, output_id: str) -> bytes | None:
        case = self.get_case(case_id)
        if not case:
            return None
        output = next(
            (item for item in case.get("outputs", []) if item.get("output_id") == output_id),
            None,
        )
        if not output:
            return None
        if self.is_connected and output.get("gridfs_file_id"):
            from bson import ObjectId

            return self.output_fs.get(ObjectId(output["gridfs_file_id"])).read()
        self._ensure_memory_content_stores()
        return self._memory_outputs.get(f"{case_id}:{output_id}")

    @staticmethod
    def sha256_bytes(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()

    @staticmethod
    def _delete_gridfs_file(fs: Any, file_id: Any) -> None:
        try:
            fs.delete(file_id)
        except Exception as exc:
            logger.warning("Unable to delete Document Uplift GridFS file %s: %s", file_id, exc)
