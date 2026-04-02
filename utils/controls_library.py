"""
Controls Library — control extraction, deduplication, and obligation mapping.

Extracts all controls from uploaded company policy documents (PDF, DOCX, TXT, MD),
deduplicates similar ones using Jaccard keyword similarity, and maps each control
to relevant obligations from the Regulatory Library.
"""

import os
import uuid
import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import List, Dict, Optional, Any, Tuple

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader

from utils.regulatory_comparision import (
    safe_json_loads,
    classify_domain,
    CONTROL_DOMAINS,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    _make_llm as _google_make_llm,
)

logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "controltester_db"
COLLECTION_NAME = "controls_library"

SIM_THRESHOLD_CONTROLS = 0.35  # Jaccard threshold for grouping similar controls

CONTROL_TYPES = [
    "preventive",
    "detective",
    "corrective",
    "directive",
    "compensating",
]


# ------------------------------------------------------------------
# CONTROL EXTRACTOR AGENT
# ------------------------------------------------------------------
class ControlExtractorAgent:
    """Extracts controls from company policy document chunks."""

    MAX_WORKERS = 4
    BATCH_SIZE = 5
    MIN_CHUNK_CHARS = 80

    def __init__(self, model: str, kb_vectorstore=None, kb_graph=None):
        self.model = model
        self.kb_vectorstore = kb_vectorstore
        self.kb_graph = kb_graph

    def _make_llm(self):
        return _google_make_llm(self.model, temperature=0.1)

    def _get_kb_context(self, batch_text: str) -> str:
        """Retrieve relevant KB context using GraphRAG. Falls back to pure FAISS, then empty."""
        if self.kb_vectorstore is None:
            return ""
        try:
            from utils.graph_rag import GraphRAGRetriever
            retriever = GraphRAGRetriever(
                self.kb_vectorstore, self.kb_graph, seed_k=3, final_k=4
            )
            docs = retriever.retrieve(batch_text[:500])
            if not docs:
                return ""
            return "\n---\n".join(d.page_content[:300] for d in docs)
        except Exception as exc:
            logger.warning(f"KB context retrieval failed (non-fatal): {exc}")
            return ""

    def _build_prompt(self, batch_text: str, counter: int = 1, kb_context: str = "") -> str:
        kb_section = (
            f"KNOWLEDGE BASE CONTEXT (cybersecurity risk/control standards):\n"
            f"{kb_context}\n\n"
            f"Use the above context STRICTLY to improve domain classification and identify control intent.\n\n"
        ) if kb_context else ""

        return f"""{kb_section}You are a cybersecurity auditor extracting internal controls from company policy documents.

STRICT EXTRACTION RULES:
- Extract ONLY concrete, actionable controls (what the company must implement, enforce, or verify)
- DO NOT extract:
  • General purpose statements or visions
  • Non-technology / non-security policies
  • Simple definitions or glossary entries
- Focus on CONTROL-LEVEL requirements (access, monitoring, encryption, patching, auditing, etc.)

For EACH control, return a JSON object with EXACTLY these fields:

- control_id: placeholder like "CTL-{counter:03d}" (sequential, increment per control)

- control_name: short imperative title (5–10 words, e.g. "Enforce MFA for all privileged accounts")

- description: the full verbatim text or a close paraphrase of the control requirement

- document_reference: section/clause/page number as written in the document
  (e.g., "Section 4.2", "Policy 3.1.b", "Page 12", "" if not present)

- domain: one of [
    governance,
    asset_management,
    access_control,
    cryptography,
    network_security,
    data_security,
    system_security,
    application_security,
    change_management,
    incident_response,
    business_continuity,
    cyber_operations,
    third_party,
    va_pt,
    audit,
    online_services,
    emerging_tech
  ]

- control_type: one of [preventive, detective, corrective, directive, compensating]

- keywords: list of 3–6 key cybersecurity terms from the control

- specificity_level:
  "specific" → includes measurable thresholds, configs, timelines
  "general" → high-level control requirement

OUTPUT FORMAT:
- Return a JSON array of control objects
- If NO controls found → return []

DOCUMENT TEXT:
{batch_text}

Return ONLY the JSON array.
"""

    def _process_batch(self, batch_idx: int, batch_text: str, total_batches: int) -> Tuple[int, List[Dict]]:
        logger.info(f"[CONTROLS] Batch {batch_idx + 1}/{total_batches} — LLM call started")
        llm = self._make_llm()
        kb_context = self._get_kb_context(batch_text)
        counter = batch_idx * self.BATCH_SIZE + 1
        prompt = self._build_prompt(batch_text, counter, kb_context)
        try:
            raw = llm.invoke(prompt)
            parsed = safe_json_loads(raw, default=[])
            if not isinstance(parsed, list):
                parsed = []
            valid = []
            for ctrl in parsed:
                if not ctrl.get("control_name") or not ctrl.get("description"):
                    continue
                if not ctrl.get("domain") or ctrl.get("domain") == "general":
                    ctrl["domain"] = classify_domain(
                        ctrl.get("description", "") + " " + ctrl.get("control_name", "")
                    )
                ctrl.setdefault("document_reference", "")
                ctrl.setdefault("control_type", "preventive")
                ctrl.setdefault("keywords", [])
                ctrl.setdefault("specificity_level", "general")
                valid.append(ctrl)
            logger.info(f"[CONTROLS] Batch {batch_idx + 1}/{total_batches} — {len(valid)} controls extracted")
            return batch_idx, valid
        except Exception as exc:
            logger.warning(f"[CONTROLS] Batch {batch_idx + 1}/{total_batches} failed: {exc}")
            return batch_idx, []

    def run(self, chunks: List) -> List[Dict]:
        useful_chunks = [c for c in chunks if len(c.page_content.strip()) >= self.MIN_CHUNK_CHARS]
        logger.info(f"[CONTROLS] {len(useful_chunks)}/{len(chunks)} chunks pass minimum-length filter")

        batches: List[Tuple[int, str]] = []
        for i in range(0, len(useful_chunks), self.BATCH_SIZE):
            batch = useful_chunks[i: i + self.BATCH_SIZE]
            batch_text = "\n\n---CHUNK---\n\n".join(c.page_content for c in batch)
            batches.append((len(batches), batch_text))

        total_batches = len(batches)
        logger.info(f"[CONTROLS] Processing {total_batches} batches with up to {self.MAX_WORKERS} parallel workers")

        results: Dict[int, List[Dict]] = {}
        with ThreadPoolExecutor(max_workers=self.MAX_WORKERS) as pool:
            futures = {
                pool.submit(self._process_batch, idx, text, total_batches): idx
                for idx, text in batches
            }
            for fut in as_completed(futures):
                batch_idx, ctrls = fut.result()
                results[batch_idx] = ctrls

        # Reassemble in original order
        controls: List[Dict] = []
        for idx in sorted(results):
            controls.extend(results[idx])

        # Assign globally unique IDs — LLM placeholder is discarded
        for ctrl in controls:
            ctrl["control_id"] = "CTL-" + uuid.uuid4().hex[:12].upper()

        logger.info(f"[CONTROLS] Total controls extracted: {len(controls)}")
        return controls


# ------------------------------------------------------------------
# DEDUPLICATION
# ------------------------------------------------------------------
def _jaccard(set_a: set, set_b: set) -> float:
    if not set_a and not set_b:
        return 1.0
    union = set_a | set_b
    if not union:
        return 0.0
    return len(set_a & set_b) / len(union)


def merge_similar_controls(controls: List[Dict]) -> List[Dict]:
    """
    Group similar controls using Jaccard keyword similarity (threshold = SIM_THRESHOLD_CONTROLS).
    For each group, the control with the longest description is elected as primary.
    Returns the merged/deduplicated list with source attribution.
    """
    if not controls:
        return []

    n = len(controls)
    # Build keyword sets (lowercase, fallback to name words)
    kw_sets = []
    for ctrl in controls:
        raw_kw = ctrl.get("keywords", [])
        if not raw_kw:
            raw_kw = ctrl.get("control_name", "").lower().split()
        kw_sets.append(set(k.lower() for k in raw_kw))

    # Union-Find
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: int, y: int):
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[ry] = rx

    # O(n²) pairwise — acceptable for typical policy doc sizes (< 500 controls)
    for i in range(n):
        for j in range(i + 1, n):
            # Only group within the same domain
            if controls[i].get("domain") != controls[j].get("domain"):
                continue
            sim = _jaccard(kw_sets[i], kw_sets[j])
            if sim >= SIM_THRESHOLD_CONTROLS:
                union(i, j)

    # Collect groups
    groups: Dict[int, List[int]] = {}
    for i in range(n):
        root = find(i)
        groups.setdefault(root, []).append(i)

    merged: List[Dict] = []
    for root, members in groups.items():
        if len(members) == 1:
            ctrl = dict(controls[members[0]])
            ctrl["merged_from_count"] = 1
            ctrl["source_documents"] = [
                {
                    "filename": ctrl.pop("_source_filename", ""),
                    "document_reference": ctrl.get("document_reference", ""),
                    "is_primary": True,
                }
            ]
            merged.append(ctrl)
        else:
            # Elect primary = longest description
            primary_idx = max(members, key=lambda i: len(controls[i].get("description", "")))
            primary = dict(controls[primary_idx])
            sources = []
            for i in members:
                sources.append({
                    "filename": controls[i].get("_source_filename", ""),
                    "document_reference": controls[i].get("document_reference", ""),
                    "is_primary": i == primary_idx,
                })
            primary["merged_from_count"] = len(members)
            primary["source_documents"] = sources
            primary.pop("_source_filename", None)
            merged.append(primary)

    logger.info(f"[CONTROLS] Deduplication: {n} raw → {len(merged)} merged controls")
    return merged


# ------------------------------------------------------------------
# OBLIGATION MAPPING
# ------------------------------------------------------------------
def map_controls_to_obligations(
    controls: List[Dict],
    regulatory_store: Any,  # MongoLibraryStore
    top_k: int = 5,
) -> List[Dict]:
    """
    For each control, find the most relevant regulatory obligations using
    domain filtering + keyword overlap scoring. No embeddings — pure keyword match.
    """
    for ctrl in controls:
        domain = ctrl.get("domain", "")
        ctrl_keywords = set(k.lower() for k in ctrl.get("keywords", []))
        ctrl_name_words = set(ctrl.get("control_name", "").lower().split())
        ctrl_kw_full = ctrl_keywords | ctrl_name_words

        try:
            candidates = regulatory_store.search_obligations(domain=domain)
        except Exception as exc:
            logger.warning(f"[CONTROLS] Obligation lookup failed for domain={domain}: {exc}")
            candidates = []

        scored = []
        for obl in candidates:
            obl_kw = set(k.lower() for k in obl.get("keywords", []))
            obl_words = set(obl.get("obligation_text", "").lower().split())
            obl_kw_full = obl_kw | obl_words

            overlap = len(ctrl_kw_full & obl_kw_full)
            union = len(ctrl_kw_full | obl_kw_full)
            score = round(overlap / union, 3) if union else 0.0
            scored.append((score, obl))

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:top_k]

        ctrl["mapped_obligations"] = [
            {
                "obligation_id": obl.get("obligation_id", ""),
                "obligation_text": obl.get("obligation_text", "")[:300],
                "section_reference": obl.get("section_reference", ""),
                "framework_name": obl.get("framework_name", ""),
                "enforcement_level": obl.get("enforcement_level", ""),
                "match_score": score,
            }
            for score, obl in top
            if score > 0
        ]

    return controls


def remap_obligations_for_all(controls_store: Any, regulatory_store: Any) -> dict:
    """Re-run obligation mapping for every control in every stored document and persist results."""
    docs = controls_store.list_documents()
    total_updated = 0
    for doc_summary in docs:
        doc = controls_store.get_document(doc_summary["document_id"])
        if not doc or not doc.get("controls"):
            continue
        doc["controls"] = map_controls_to_obligations(doc["controls"], regulatory_store)
        controls_store.save_document(doc)
        total_updated += len(doc["controls"])
    return {"documents_processed": len(docs), "controls_updated": total_updated}


# ------------------------------------------------------------------
# MONGODB CONTROLS STORE
# ------------------------------------------------------------------
class MongoControlsStore:
    """Thin MongoDB wrapper for the controls library collection."""

    def __init__(self):
        try:
            from pymongo import MongoClient
            self._client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
            self._client.admin.command("ping")
            self._db = self._client[DB_NAME]
            self._col = self._db[COLLECTION_NAME]
            self._col.create_index("document_id", unique=True)
            self._col.create_index("source_filename")
            logger.info(f"MongoControlsStore connected to {MONGO_URI}")
        except Exception as exc:
            logger.error(f"MongoDB connection failed: {exc}")
            self._client = None
            self._col = None

    @property
    def is_connected(self) -> bool:
        return self._col is not None

    def _require_connection(self):
        if not self.is_connected:
            raise RuntimeError(f"MongoDB unavailable (URI={MONGO_URI}).")

    def save_document(self, doc: dict) -> str:
        self._require_connection()
        doc_id = doc["document_id"]
        doc.pop("_id", None)
        self._col.replace_one({"document_id": doc_id}, doc, upsert=True)
        logger.info(f"Saved controls document {doc_id} ({doc.get('source_filename')})")
        return doc_id

    def list_documents(self) -> List[Dict]:
        self._require_connection()
        cursor = self._col.find(
            {},
            {
                "_id": 0,
                "document_id": 1,
                "source_filename": 1,
                "upload_timestamp": 1,
                "model_used": 1,
                "total_controls": 1,
                "controls_by_domain": 1,
            },
        )
        return list(cursor)

    def get_document(self, document_id: str) -> Optional[Dict]:
        self._require_connection()
        return self._col.find_one({"document_id": document_id}, {"_id": 0})

    def delete_document(self, document_id: str) -> bool:
        self._require_connection()
        result = self._col.delete_one({"document_id": document_id})
        return result.deleted_count > 0

    def delete_all(self) -> int:
        """Delete all documents from the controls library. Returns count deleted."""
        self._require_connection()
        result = self._col.delete_many({})
        logger.info(f"Deleted all {result.deleted_count} controls library documents")
        return result.deleted_count

    def all_controls(self) -> List[Dict]:
        """Return all controls across all documents (with _source_filename injected)."""
        self._require_connection()
        docs = list(self._col.find({}, {"_id": 0}))
        controls = []
        for doc in docs:
            fname = doc.get("source_filename", "")
            for ctrl in doc.get("controls", []):
                ctrl = dict(ctrl)
                ctrl["_source_filename"] = fname
                ctrl["_document_id"] = doc.get("document_id", "")
                controls.append(ctrl)
        return controls


# ------------------------------------------------------------------
# TOP-LEVEL INGEST FUNCTION
# ------------------------------------------------------------------
def ingest_controls_document(
    file_path: str,
    filename: str,
    selected_model: str,
    regulatory_store: Optional[Any] = None,
    kb_vectorstore: Optional[Any] = None,
    kb_graph: Optional[Any] = None,
) -> Dict:
    """
    Full ingest pipeline for a single company policy document.

    Returns a result dict with keys:
        success, document_id, source_filename, total_controls, controls_by_domain, error
    """
    logger.info(f"[CONTROLS] Ingesting: {filename} | model: {selected_model}")

    # 1. Load document
    try:
        if file_path.lower().endswith(".pdf"):
            loader = PyPDFLoader(file_path)
        elif file_path.lower().endswith((".docx", ".doc")):
            try:
                from langchain_community.document_loaders import Docx2txtLoader
                loader = Docx2txtLoader(file_path)
            except ImportError:
                from langchain_community.document_loaders import UnstructuredWordDocumentLoader
                loader = UnstructuredWordDocumentLoader(file_path)
        else:
            loader = TextLoader(file_path)
        docs = loader.load()
        for d in docs:
            d.metadata["source"] = filename
        logger.info(f"[CONTROLS] Loaded {len(docs)} pages from {filename}")
    except Exception as exc:
        logger.error(f"[CONTROLS] Failed to load {filename}: {exc}")
        return {"success": False, "source_filename": filename, "error": str(exc)}

    # 2. Chunk
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(docs)
    logger.info(f"[CONTROLS] {len(chunks)} chunks from {filename}")

    # 3. Extract controls (GraphRAG KB context if available)
    extractor = ControlExtractorAgent(selected_model, kb_vectorstore=kb_vectorstore, kb_graph=kb_graph)
    controls = extractor.run(chunks)

    # 4. Map obligations (if regulatory library is available)
    if regulatory_store is not None and controls:
        try:
            controls = map_controls_to_obligations(controls, regulatory_store)
            logger.info(f"[CONTROLS] Obligation mapping complete for {filename}")
        except Exception as exc:
            logger.warning(f"[CONTROLS] Obligation mapping failed (non-fatal): {exc}")
            for ctrl in controls:
                ctrl.setdefault("mapped_obligations", [])
    else:
        for ctrl in controls:
            ctrl.setdefault("mapped_obligations", [])

    # 5. Per-domain summary
    controls_by_domain: Dict[str, int] = {}
    for ctrl in controls:
        d = ctrl.get("domain", "general")
        controls_by_domain[d] = controls_by_domain.get(d, 0) + 1

    # 6. Deterministic document_id
    document_id = hashlib.md5(f"{filename}:{selected_model}".encode()).hexdigest()[:16]

    # 7. Save to MongoDB
    store_doc = {
        "document_id": document_id,
        "source_filename": filename,
        "upload_timestamp": datetime.utcnow().isoformat(),
        "model_used": selected_model,
        "total_controls": len(controls),
        "controls_by_domain": controls_by_domain,
        "controls": controls,
    }

    try:
        store = MongoControlsStore()
        store.save_document(store_doc)
        mongo_ok = True
    except Exception as exc:
        logger.error(f"[CONTROLS] MongoDB save failed for {filename}: {exc}")
        mongo_ok = False

    return {
        "success": True,
        "document_id": document_id,
        "source_filename": filename,
        "total_controls": len(controls),
        "controls_by_domain": controls_by_domain,
        "mongo_saved": mongo_ok,
    }
