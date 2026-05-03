from __future__ import annotations

import hashlib
import os
import uuid
from datetime import datetime
from typing import Any

import pymongo
import gridfs
from pymongo.errors import OperationFailure


def utc_now() -> str:
    return datetime.utcnow().isoformat()


def bucket_for_tag(tag: str | None) -> str | None:
    return {
        "sop": "sops",
        "policy": "procedures",
        "risk_control_matrix": "risk_control_matrices",
        "risk_register": "risk_registers",
        "control_inventory": "control_inventories",
        "evidence": "evidence",
        "process_diagram": "diagrams",
        "audit_report": "audit_reports",
        "supporting_material": "supporting_material",
    }.get(tag or "")


class SopUpliftCaseStore:
    def __init__(self, mongo_uri: str | None = None):
        uri = mongo_uri or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        self.client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=1500)
        db_name = os.environ.get("SOP_UPLIFT_MONGO_DB", "trace_db")
        self.db = self.client[db_name]
        self.col = self.db["sop_uplift_cases"]
        self.fs = gridfs.GridFS(self.db, collection="sop_uplift_files")
        self.is_connected = True
        try:
            self.client.admin.command("ping")
            self._ensure_indexes()
        except OperationFailure as exc:
            if "DatabaseDifferCase" not in str(exc) or db_name == "Trace_db":
                self._use_memory_fallback()
                return
            self.db = self.client["Trace_db"]
            self.col = self.db["sop_uplift_cases"]
            self.fs = gridfs.GridFS(self.db, collection="sop_uplift_files")
            try:
                self._ensure_indexes()
            except Exception:
                self._use_memory_fallback()
        except Exception:
            self._use_memory_fallback()

    def _ensure_indexes(self) -> None:
        self.col.create_index("case_id", unique=True)
        self.col.create_index("created_at")

    def _use_memory_fallback(self) -> None:
        self.is_connected = False
        self._memory: dict[str, dict[str, Any]] = {}
        self._memory_files: dict[str, bytes] = {}
        self._memory_outputs: dict[str, bytes] = {}

    def _case_template(self, data: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        return {
            "case_id": str(uuid.uuid4()),
            "title": data.get("title", "").strip(),
            "process_name": data.get("process_name", "").strip(),
            "domain_label": data.get("domain_label", "").strip(),
            "notes": data.get("notes", "").strip(),
            "status": "draft",
            "readiness": {},
            "uploaded_files": [],
            "document_tags": [],
            "markdown_documents": [],
            "anchors": [],
            "chunks": [],
            "case_chat": [],
            "case_context": [],
            "corpus_map": {},
            "suggestions": [],
            "diagram_model": {},
            "outputs": [],
            "prompt_runs": [],
            "processing_state": {},
            "created_at": now,
            "updated_at": now,
        }

    def _clean(self, doc: dict[str, Any] | None) -> dict[str, Any] | None:
        if not doc:
            return None
        cleaned = dict(doc)
        cleaned.pop("_id", None)
        return cleaned

    def create_case(self, data: dict[str, Any]) -> dict[str, Any]:
        doc = self._case_template(data)
        if self.is_connected:
            self.col.insert_one({**doc, "_id": doc["case_id"]})
        else:
            self._memory[doc["case_id"]] = doc
        return doc

    def list_cases(self) -> list[dict[str, Any]]:
        if self.is_connected:
            return [self._clean(doc) for doc in self.col.find({}, {"_id": 0}).sort("created_at", -1)]
        return sorted(self._memory.values(), key=lambda item: item["created_at"], reverse=True)

    def get_case(self, case_id: str) -> dict[str, Any] | None:
        if self.is_connected:
            return self._clean(self.col.find_one({"case_id": case_id}))
        return self._memory.get(case_id)

    def update_case(self, case_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        updates = {k: v for k, v in updates.items() if v is not None}
        updates["updated_at"] = utc_now()
        if self.is_connected:
            self.col.update_one({"case_id": case_id}, {"$set": updates})
            return self.get_case(case_id)
        case = self._memory.get(case_id)
        if not case:
            return None
        case.update(updates)
        return case

    def delete_case(self, case_id: str) -> bool:
        if self.is_connected:
            case = self.get_case(case_id)
            if not case:
                return False
            from bson import ObjectId

            for item in [*case.get("uploaded_files", []), *case.get("outputs", [])]:
                gridfs_file_id = item.get("gridfs_file_id")
                if not gridfs_file_id:
                    continue
                try:
                    self.fs.delete(ObjectId(gridfs_file_id))
                except Exception:
                    pass
            return self.col.delete_one({"case_id": case_id}).deleted_count == 1
        return self._memory.pop(case_id, None) is not None

    def add_file_metadata(self, case_id: str, metadata: dict[str, Any]) -> dict[str, Any] | None:
        raw_content = metadata.get("raw_content")
        if raw_content is None and metadata.get("raw_content_b64"):
            import base64
            raw_content = base64.b64decode(metadata["raw_content_b64"])
        file_id = metadata.get("file_id") or str(uuid.uuid4())
        gridfs_file_id = ""
        if self.is_connected and raw_content is not None:
            gridfs_file_id = str(
                self.fs.put(
                    raw_content,
                    filename=metadata.get("filename", "upload"),
                    case_id=case_id,
                    file_id=file_id,
                    content_type=metadata.get("content_type", "application/octet-stream"),
                )
            )
        metadata = {
            "file_id": file_id,
            "filename": metadata.get("filename", "upload"),
            "content_type": metadata.get("content_type", "application/octet-stream"),
            "size": metadata.get("size", 0),
            "sha256": metadata.get("sha256", ""),
            "gridfs_file_id": gridfs_file_id,
            "raw_content_b64": metadata.get("raw_content_b64", ""),
            "bucket": metadata.get("bucket", "supporting_material"),
            "user_description": metadata.get("user_description", ""),
            "conversion": metadata.get("conversion", {"status": "pending"}),
            "uploaded_at": utc_now(),
        }
        if self.is_connected:
            self.col.update_one(
                {"case_id": case_id},
                {"$push": {"uploaded_files": metadata}, "$set": {"updated_at": utc_now()}},
            )
        else:
            case = self._memory.get(case_id)
            if not case:
                return None
            if raw_content is not None:
                if not hasattr(self, "_memory_files"):
                    self._memory_files = {}
                self._memory_files[f"{case_id}:{metadata['file_id']}"] = raw_content
            case["uploaded_files"].append(metadata)
            case["updated_at"] = utc_now()
        return metadata

    def get_file_content(self, case_id: str, file_id: str) -> bytes | None:
        case = self.get_case(case_id)
        if not case:
            return None
        file_meta = next((item for item in case.get("uploaded_files", []) if item.get("file_id") == file_id), None)
        if not file_meta:
            return None

        def raw_b64_fallback() -> bytes | None:
            if file_meta.get("raw_content_b64"):
                import base64

                return base64.b64decode(file_meta["raw_content_b64"])
            return None

        if self.is_connected and file_meta.get("gridfs_file_id"):
            try:
                from bson import ObjectId

                return self.fs.get(ObjectId(file_meta["gridfs_file_id"])).read()
            except Exception:
                return raw_b64_fallback()
        if not self.is_connected:
            if not hasattr(self, "_memory_files"):
                self._memory_files = {}
            return self._memory_files.get(f"{case_id}:{file_id}")
        return raw_b64_fallback()

    def delete_file(self, case_id: str, file_id: str) -> bool:
        case = self.get_case(case_id)
        if not case:
            return False
        file_meta = next((item for item in case.get("uploaded_files", []) if item.get("file_id") == file_id), None)
        if not file_meta:
            return False
        removed_docs = [doc for doc in case.get("markdown_documents", []) if doc.get("file_id") == file_id]
        removed_doc_ids = {doc.get("document_id") for doc in removed_docs}
        removed_anchor_ids = {
            anchor.get("anchor_id")
            for anchor in case.get("anchors", [])
            if anchor.get("file_id") == file_id or anchor.get("document_id") in removed_doc_ids
        }
        updates = {
            "uploaded_files": [item for item in case.get("uploaded_files", []) if item.get("file_id") != file_id],
            "document_tags": [item for item in case.get("document_tags", []) if item.get("file_id") != file_id],
            "markdown_documents": [doc for doc in case.get("markdown_documents", []) if doc.get("file_id") != file_id],
            "anchors": [
                anchor
                for anchor in case.get("anchors", [])
                if anchor.get("file_id") != file_id and anchor.get("document_id") not in removed_doc_ids
            ],
            "chunks": [
                chunk
                for chunk in case.get("chunks", [])
                if chunk.get("document_id") not in removed_doc_ids
                and not set(chunk.get("anchor_ids", [])).intersection(removed_anchor_ids)
            ],
            "suggestions": [
                suggestion
                for suggestion in case.get("suggestions", [])
                if suggestion.get("anchor_id") not in removed_anchor_ids
            ],
        }
        if self.is_connected and file_meta.get("gridfs_file_id"):
            try:
                from bson import ObjectId

                self.fs.delete(ObjectId(file_meta["gridfs_file_id"]))
            except Exception:
                pass
        if not self.is_connected:
            if not hasattr(self, "_memory_files"):
                self._memory_files = {}
            self._memory_files.pop(f"{case_id}:{file_id}", None)
        self.update_case(case_id, updates)
        return True

    def save_output_content(self, case_id: str, output_metadata: dict[str, Any], content: bytes) -> dict[str, Any]:
        output = {
            "output_id": output_metadata.get("output_id") or str(uuid.uuid4()),
            "type": output_metadata.get("type", ""),
            "filename": output_metadata.get("filename", "output.bin"),
            "gridfs_file_id": "",
            "created_at": utc_now(),
            "generated_at_display": utc_now(),
            "source_suggestion_ids": output_metadata.get("source_suggestion_ids", []),
            "status": output_metadata.get("status", "generated"),
            "content_type": output_metadata.get("content_type", "application/octet-stream"),
            "metadata": output_metadata.get("metadata", {}),
        }
        if self.is_connected:
            output["gridfs_file_id"] = str(
                self.fs.put(
                    content,
                    filename=output["filename"],
                    case_id=case_id,
                    output_id=output["output_id"],
                    content_type=output["content_type"],
                )
            )
        else:
            if not hasattr(self, "_memory_outputs"):
                self._memory_outputs = {}
            self._memory_outputs[f"{case_id}:{output['output_id']}"] = content
        case = self.get_case(case_id)
        if case:
            outputs = [item for item in case.get("outputs", []) if item.get("output_id") != output["output_id"]]
            outputs.append(output)
            self.update_case(case_id, {"outputs": outputs})
        return output

    def get_output_content(self, case_id: str, output_id: str) -> bytes | None:
        case = self.get_case(case_id)
        if not case:
            return None
        output = next((item for item in case.get("outputs", []) if item.get("output_id") == output_id), None)
        if not output:
            return None
        if self.is_connected and output.get("gridfs_file_id"):
            from bson import ObjectId
            return self.fs.get(ObjectId(output["gridfs_file_id"])).read()
        if not self.is_connected:
            if not hasattr(self, "_memory_outputs"):
                self._memory_outputs = {}
            return self._memory_outputs.get(f"{case_id}:{output_id}")
        return None

    def set_document_tag(self, case_id: str, file_id: str, tag_data: dict[str, Any]) -> dict[str, Any] | None:
        tag = {
            "file_id": file_id,
            "suggested_tag": tag_data.get("suggested_tag") or tag_data.get("confirmed_tag"),
            "confirmed_tag": tag_data.get("confirmed_tag") or tag_data.get("suggested_tag"),
            "confidence": tag_data.get("confidence", "medium"),
            "user_description": tag_data.get("user_description", ""),
            "updated_at": utc_now(),
        }
        case = self.get_case(case_id)
        if not case:
            return None
        tags = [item for item in case.get("document_tags", []) if item.get("file_id") != file_id]
        tags.append(tag)
        updates: dict[str, Any] = {"document_tags": tags}
        corrected_bucket = bucket_for_tag(tag.get("confirmed_tag"))
        if corrected_bucket:
            files = []
            for file_meta in case.get("uploaded_files", []):
                if file_meta.get("file_id") == file_id:
                    file_meta = dict(file_meta)
                    file_meta.setdefault("original_bucket", file_meta.get("bucket", ""))
                    file_meta["bucket"] = corrected_bucket
                files.append(file_meta)
            updates["uploaded_files"] = files
        self.update_case(case_id, updates)
        return tag

    def add_chat_message(self, case_id: str, role: str, content: str, context_snapshot: dict[str, Any] | None = None) -> dict[str, Any] | None:
        message = {
            "message_id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "context_snapshot": context_snapshot or {},
            "created_at": utc_now(),
            "linked_suggestion_ids": [],
            "captured_context": {
                "type": "other",
                "value": content,
                "confidence": "medium",
            } if role == "user" else None,
        }
        if self.is_connected:
            self.col.update_one(
                {"case_id": case_id},
                {"$push": {"case_chat": message}, "$set": {"updated_at": utc_now()}},
            )
        else:
            case = self._memory.get(case_id)
            if not case:
                return None
            case["case_chat"].append(message)
            case["updated_at"] = utc_now()
        return message

    def update_suggestion(self, case_id: str, suggestion_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        case = self.get_case(case_id)
        if not case:
            return None
        suggestions = []
        updated = None
        for suggestion in case.get("suggestions", []):
            if suggestion.get("suggestion_id") == suggestion_id:
                suggestion = {**suggestion, **updates, "decided_at": utc_now()}
                updated = suggestion
            suggestions.append(suggestion)
        if updated is None:
            return None
        self.update_case(case_id, {"suggestions": suggestions})
        return updated

    @staticmethod
    def sha256_bytes(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()
