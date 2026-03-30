"""
Regulatory Library — obligation extraction and MongoDB persistence.

Extracts all regulatory obligations from uploaded regulatory documents (MAS TRM,
NIST CSWP, ISO 27001, etc.) and stores them in MongoDB for persistent cross-session
access and search.
"""

import os
import re
import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import List, Dict, Optional, Any, Tuple

from langchain_community.llms import Ollama
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader

# Reuse shared utilities from regulatory_comparision
from utils.regulatory_comparision import (
    safe_json_loads,
    classify_domain,
    CONTROL_DOMAINS,
    OLLAMA_BASE_URL,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    DocumentAnalyzerAgent,
)

logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "controltester_db"
COLLECTION_NAME = "regulatory_library"

OBLIGATION_TYPES = [
    "technical_control",
    "governance",
    "reporting",
    "risk_assessment",
    "audit",
]


# ------------------------------------------------------------------
# OBLIGATION EXTRACTOR AGENT
# ------------------------------------------------------------------
class ObligationExtractorAgent:
    """Extracts all regulatory obligations from document chunks.

    Richer than ControlExtractorAgent — captures section references and
    obligation typing in addition to the standard control fields.
    """

    # Ollama is configured with OLLAMA_NUM_PARALLEL=4 — use same parallelism
    MAX_WORKERS = 4
    # Larger batch = fewer total LLM calls
    BATCH_SIZE = 5
    # Skip chunks too short to contain obligations
    MIN_CHUNK_CHARS = 80

    def __init__(self, model: str, kb_vectorstore=None, kb_graph=None):
        self.model = model
        self.kb_vectorstore = kb_vectorstore
        self.kb_graph = kb_graph

    def _make_llm(self) -> Ollama:
        """Each worker thread needs its own Ollama instance (not thread-safe to share)."""
        return Ollama(model=self.model, base_url=OLLAMA_BASE_URL, temperature=0.1)

    def _get_kb_context(self, batch_text: str) -> str:
        """Retrieve relevant KB context for a batch. Returns empty string on failure."""
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

    def _build_prompt(self, batch_text: str, kb_context: str, counter: int = 1) -> str:
        if kb_context:
            kb_section = (
                f"KNOWLEDGE BASE CONTEXT (cybersecurity risk/control standards):\n"
                f"{kb_context}\n\n"
                f"Use the above context STRICTLY to identify and classify ONLY cybersecurity / technology risk control obligations.\n"
                f"Ignore non-technology, business, legal, or generic governance content unless it directly impacts cybersecurity.\n\n"
            )
        else:
            kb_section = ""

        return f"""{kb_section}
You are a cybersecurity auditor extracting ONLY technology risk and cybersecurity control obligations.

STRICT EXTRACTION RULES:
- Extract ONLY obligations related to:
  • Cybersecurity
  • Technology risk
  • Information security
  • IT operations impacting security
- DO NOT extract:
  • Pure business policies
  • Financial/legal/general governance statements
  • High-level statements with no control intent
- Focus on CONTROL-LEVEL requirements (what must be implemented, enforced, monitored, or tested)

For EACH obligation, return a JSON object with EXACTLY these fields:

- obligation_id: string like "OBL-{counter:03d}" (sequential, continue from {counter})

- section_reference: the clause/section number as written in the document
  (e.g., "9.1.2", "ID.AM-1", "§4.3", "" if not present)

- obligation_text: the exact verbatim text of the obligation (DO NOT paraphrase)

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

- enforcement_level:
  "mandatory" → words like must, shall, required
  "recommended" → should, recommended
  "optional" → may, optional

- obligation_type: one of [
    technical_control,
    preventive_control,
    detective_control,
    corrective_control,
    governance,
    monitoring,
    risk_assessment,
    audit
  ]

- keywords: list of 3–6 key cybersecurity terms from the obligation

- specificity_level:
  "specific" → includes measurable thresholds, configs, timelines
  "general" → high-level control requirement

- has_metric: true if obligation includes measurable targets
  (%, thresholds, counts, limits), else false

- has_frequency: true if obligation specifies time-based action
  (e.g., "annually", "within 30 days"), else false


ADDITIONAL CLASSIFICATION RULES:
- Map IAM-related controls → access_control
- Encryption / key mgmt → cryptography
- SOC / monitoring / SIEM → cyber_operations
- VAPT / red teaming → va_pt
- DR / backup → business_continuity
- Secure coding / SDLC → application_security
- Infra hardening → system_security


OUTPUT FORMAT:
- Return a JSON array of obligation objects
- If NO cybersecurity obligations found → return []

TEXT:
{batch_text}

Return ONLY the JSON array.
"""

    def _process_batch(self, batch_idx: int, batch_text: str, total_batches: int) -> Tuple[int, List[Dict]]:
        """Process a single batch. Called from worker threads."""
        logger.info(f"[LIBRARY] Batch {batch_idx + 1}/{total_batches} — LLM call started")
        llm = self._make_llm()
        kb_context = self._get_kb_context(batch_text)
        counter = batch_idx * self.BATCH_SIZE + 1
        prompt = self._build_prompt(batch_text, kb_context, counter)
        try:
            raw = llm.invoke(prompt)
            parsed = safe_json_loads(raw, default=[])
            if not isinstance(parsed, list):
                parsed = []
            # Basic cleanup — full renumbering happens in run() after all futures complete
            valid = []
            for obl in parsed:
                if not obl.get("obligation_text"):
                    continue
                if not obl.get("domain") or obl.get("domain") == "general":
                    obl["domain"] = classify_domain(obl.get("obligation_text", ""))
                obl["has_metric"] = bool(obl.get("has_metric", False))
                obl["has_frequency"] = bool(obl.get("has_frequency", False))
                obl.setdefault("section_reference", "")
                obl.setdefault("enforcement_level", "mandatory")
                obl.setdefault("obligation_type", "technical_control")
                obl.setdefault("keywords", [])
                obl.setdefault("specificity_level", "general")
                valid.append(obl)
            logger.info(f"[LIBRARY] Batch {batch_idx + 1}/{total_batches} — {len(valid)} obligations extracted")
            return batch_idx, valid
        except Exception as exc:
            logger.warning(f"[LIBRARY] Batch {batch_idx + 1}/{total_batches} failed: {exc}")
            return batch_idx, []

    def run(self, chunks: List) -> List[Dict]:
        # Filter out trivially short chunks
        useful_chunks = [c for c in chunks if len(c.page_content.strip()) >= self.MIN_CHUNK_CHARS]
        logger.info(f"[LIBRARY] {len(useful_chunks)}/{len(chunks)} chunks pass minimum-length filter")

        # Build batch list
        batches: List[Tuple[int, str]] = []
        for i in range(0, len(useful_chunks), self.BATCH_SIZE):
            batch = useful_chunks[i: i + self.BATCH_SIZE]
            batch_text = "\n\n---CHUNK---\n\n".join(c.page_content for c in batch)
            batches.append((len(batches), batch_text))

        total_batches = len(batches)
        logger.info(f"[LIBRARY] Processing {total_batches} batches with up to {self.MAX_WORKERS} parallel workers")

        # Run batches in parallel — order preserved via batch_idx
        results: Dict[int, List[Dict]] = {}
        with ThreadPoolExecutor(max_workers=self.MAX_WORKERS) as pool:
            futures = {
                pool.submit(self._process_batch, idx, text, total_batches): idx
                for idx, text in batches
            }
            for fut in as_completed(futures):
                batch_idx, obls = fut.result()
                results[batch_idx] = obls

        # Reassemble in original order and assign sequential IDs
        obligations: List[Dict] = []
        for idx in sorted(results):
            obligations.extend(results[idx])

        for i, obl in enumerate(obligations, start=1):
            obl["obligation_id"] = f"OBL-{i:03d}"

        logger.info(f"[LIBRARY] Total obligations extracted: {len(obligations)}")
        return obligations


# ------------------------------------------------------------------
# MONGODB LIBRARY STORE
# ------------------------------------------------------------------
class MongoLibraryStore:
    """Thin wrapper around pymongo for the regulatory library collection."""

    def __init__(self):
        try:
            from pymongo import MongoClient
            from pymongo.errors import ConnectionFailure
            self._client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
            # Probe the connection
            self._client.admin.command("ping")
            self._db = self._client[DB_NAME]
            self._col = self._db[COLLECTION_NAME]
            # Index for fast lookup by document_id and source_filename
            self._col.create_index("document_id", unique=True)
            self._col.create_index("source_filename")
            logger.info(f"MongoLibraryStore connected to {MONGO_URI}")
        except Exception as exc:
            logger.error(f"MongoDB connection failed: {exc}")
            self._client = None
            self._col = None

    @property
    def is_connected(self) -> bool:
        return self._col is not None

    def _require_connection(self):
        if not self.is_connected:
            raise RuntimeError(
                f"MongoDB unavailable (URI={MONGO_URI}). "
                "Ensure the mongodb service is running."
            )

    def save_document(self, doc: dict) -> str:
        """Upsert a library document. Returns the document_id."""
        self._require_connection()
        from pymongo import ASCENDING
        doc_id = doc["document_id"]
        # Remove MongoDB's _id if present (upsert will recreate)
        doc.pop("_id", None)
        self._col.replace_one(
            {"document_id": doc_id},
            doc,
            upsert=True,
        )
        logger.info(f"Saved library document {doc_id} ({doc.get('source_filename')})")
        return doc_id

    def list_documents(self) -> List[Dict]:
        """Return all documents (summary only — no obligations array)."""
        self._require_connection()
        cursor = self._col.find(
            {},
            {
                "_id": 0,
                "document_id": 1,
                "framework_name": 1,
                "issuing_authority": 1,
                "source_filename": 1,
                "upload_timestamp": 1,
                "model_used": 1,
                "total_obligations": 1,
                "obligations_by_domain": 1,
            },
        )
        return list(cursor)

    def get_document(self, document_id: str) -> Optional[Dict]:
        """Return full document including obligations array."""
        self._require_connection()
        doc = self._col.find_one({"document_id": document_id}, {"_id": 0})
        return doc

    def delete_document(self, document_id: str) -> bool:
        """Delete a library document. Returns True if deleted."""
        self._require_connection()
        result = self._col.delete_one({"document_id": document_id})
        return result.deleted_count > 0

    def search_obligations(
        self,
        domain: Optional[str] = None,
        enforcement_level: Optional[str] = None,
        keyword: Optional[str] = None,
    ) -> List[Dict]:
        """Cross-document search over the embedded obligations array."""
        self._require_connection()

        # Build aggregation pipeline: unwind obligations then match
        pipeline: List[Dict] = [
            {"$unwind": "$obligations"},
            {
                "$project": {
                    "_id": 0,
                    "document_id": 1,
                    "framework_name": 1,
                    "source_filename": 1,
                    "obligation": "$obligations",
                }
            },
        ]

        match_conditions: Dict[str, Any] = {}
        if domain:
            match_conditions["obligation.domain"] = domain
        if enforcement_level:
            match_conditions["obligation.enforcement_level"] = enforcement_level
        if keyword:
            match_conditions["obligation.obligation_text"] = {
                "$regex": keyword,
                "$options": "i",
            }

        if match_conditions:
            pipeline.insert(1, {"$match": match_conditions})

        results = list(self._col.aggregate(pipeline))
        # Flatten for simpler response
        flattened = []
        for r in results:
            item = r["obligation"].copy()
            item["document_id"] = r["document_id"]
            item["framework_name"] = r["framework_name"]
            item["source_filename"] = r["source_filename"]
            flattened.append(item)
        return flattened


# ------------------------------------------------------------------
# TOP-LEVEL INGEST FUNCTION
# ------------------------------------------------------------------
def ingest_regulatory_document(
    file_path: str,
    filename: str,
    selected_model: str,
    kb_vectorstore=None,
    kb_graph=None,
) -> Dict:
    """
    Full ingest pipeline for a single regulatory document.

    Returns a result dict with keys:
        success, document_id, framework_name, issuing_authority,
        source_filename, total_obligations, obligations_by_domain, error
    """
    logger.info(f"[LIBRARY] Ingesting: {filename} | model: {selected_model}")

    # 1. Load document
    try:
        if file_path.lower().endswith(".pdf"):
            loader = PyPDFLoader(file_path)
        else:
            loader = TextLoader(file_path)
        docs = loader.load()
        for d in docs:
            d.metadata["source"] = filename
        logger.info(f"[LIBRARY] Loaded {len(docs)} pages from {filename}")
    except Exception as exc:
        logger.error(f"[LIBRARY] Failed to load {filename}: {exc}")
        return {"success": False, "source_filename": filename, "error": str(exc)}

    # 2. Chunk
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(docs)
    logger.info(f"[LIBRARY] {len(chunks)} chunks from {filename}")

    # 3 + 4. Run DocumentAnalyzer and ObligationExtractor concurrently.
    #   DocumentAnalyzer makes 1 LLM call; ObligationExtractor makes N/5 parallel calls.
    #   Running them at the same time keeps all Ollama slots busy from the start.
    doc_analyzer = DocumentAnalyzerAgent(selected_model)
    extractor = ObligationExtractorAgent(
        selected_model, kb_vectorstore=kb_vectorstore, kb_graph=kb_graph
    )

    with ThreadPoolExecutor(max_workers=2) as stage_pool:
        doc_future = stage_pool.submit(doc_analyzer.run, chunks, [filename])
        obl_future = stage_pool.submit(extractor.run, chunks)

        try:
            doc_analyses = doc_future.result()
            meta = doc_analyses.get(filename, {})
        except Exception as exc:
            logger.warning(f"[LIBRARY] DocumentAnalyzer failed for {filename}: {exc}")
            meta = {}

        try:
            obligations = obl_future.result()
        except Exception as exc:
            logger.warning(f"[LIBRARY] ObligationExtractor failed for {filename}: {exc}")
            obligations = []

    logger.info(f"[LIBRARY] Extracted {len(obligations)} obligations from {filename}")
    framework_name = meta.get("framework_name") or filename
    issuing_authority = meta.get("issuing_authority") or "Unknown"

    # 5. Per-domain summary
    obligations_by_domain: Dict[str, int] = {}
    for obl in obligations:
        d = obl.get("domain", "general")
        obligations_by_domain[d] = obligations_by_domain.get(d, 0) + 1

    # 6. Build deterministic document_id
    document_id = hashlib.md5(
        f"{filename}:{selected_model}".encode()
    ).hexdigest()[:16]

    # 7. Save to MongoDB
    library_doc = {
        "document_id": document_id,
        "framework_name": framework_name,
        "issuing_authority": issuing_authority,
        "source_filename": filename,
        "upload_timestamp": datetime.utcnow().isoformat(),
        "model_used": selected_model,
        "total_obligations": len(obligations),
        "obligations_by_domain": obligations_by_domain,
        "obligations": obligations,
        "document_metadata": meta,
    }

    try:
        store = MongoLibraryStore()
        store.save_document(library_doc)
        mongo_ok = True
    except Exception as exc:
        logger.error(f"[LIBRARY] MongoDB save failed for {filename}: {exc}")
        mongo_ok = False

    return {
        "success": True,
        "document_id": document_id,
        "framework_name": framework_name,
        "issuing_authority": issuing_authority,
        "source_filename": filename,
        "total_obligations": len(obligations),
        "obligations_by_domain": obligations_by_domain,
        "mongo_saved": mongo_ok,
    }
