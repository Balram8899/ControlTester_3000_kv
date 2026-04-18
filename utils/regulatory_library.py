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

from langchain.text_splitter import RecursiveCharacterTextSplitter

# Reuse shared utilities from regulatory_comparision
from utils.document_ingestion import DocumentLoadError, load_documents
from utils.regulatory_comparision import (
    safe_json_loads,
    classify_domain,
    CONTROL_DOMAINS,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    GOOGLE_LLM_MODEL,
    DocumentAnalyzerAgent,
)
from utils.llm_factory import make_llm

logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "trace_db"
COLLECTION_NAME = "regulatory_library"

LIBRARY_GRAPH_DIR = "data/library_graphs/regulatory"

OBLIGATION_TYPES = [
    "technical_control",
    "governance",
    "reporting",
    "risk_assessment",
    "audit",
]


def _clean_llm_json_candidate(text: str) -> str:
    """Normalize common model wrappers before JSON checks."""
    if not text:
        return ""
    cleaned = text.strip()
    cleaned = re.sub(r"<think>.*?</think>", "", cleaned, flags=re.DOTALL | re.IGNORECASE).strip()
    cleaned = re.sub(r"```json|```", "", cleaned, flags=re.IGNORECASE).strip()
    return cleaned


def _is_explicit_empty_array_response(text: str) -> bool:
    """Return True only when the model explicitly answered with an empty JSON array."""
    cleaned = _clean_llm_json_candidate(text)
    return cleaned in {"[]", "[ ]"}


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

    def _make_llm(self):
        """Each worker thread gets its own LLM instance."""
        return make_llm(self.model, temperature=0.1)

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

    def _process_batch(
        self, batch_idx: int, batch_text: str, total_batches: int
    ) -> Tuple[int, List[Dict], Optional[str]]:
        """Process a single batch. Called from worker threads."""
        logger.info(f"[LIBRARY] Batch {batch_idx + 1}/{total_batches} — LLM call started")
        llm = self._make_llm()
        kb_context = self._get_kb_context(batch_text)
        counter = batch_idx * self.BATCH_SIZE + 1
        prompt = self._build_prompt(batch_text, kb_context, counter)
        try:
            raw = llm.invoke(prompt)
            parsed = safe_json_loads(raw, default=[])
            if parsed == [] and raw and not _is_explicit_empty_array_response(raw):
                raise ValueError("LLM returned output that could not be parsed into an obligations JSON array")
            if not isinstance(parsed, list):
                raise ValueError(f"LLM returned {type(parsed).__name__} instead of a JSON array")
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
            return batch_idx, valid, None
        except Exception as exc:
            logger.warning(f"[LIBRARY] Batch {batch_idx + 1}/{total_batches} failed: {exc}")
            return batch_idx, [], str(exc)

    def run(self, chunks: List) -> List[Dict]:
        # Filter out trivially short chunks
        useful_chunks = [c for c in chunks if len(c.page_content.strip()) >= self.MIN_CHUNK_CHARS]
        logger.info(f"[LIBRARY] {len(useful_chunks)}/{len(chunks)} chunks pass minimum-length filter")
        if not useful_chunks:
            raise ValueError(
                "No usable text chunks were extracted from the document. "
                "The PDF may be image-based, empty, or not machine-readable."
            )

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
        batch_errors: List[str] = []
        with ThreadPoolExecutor(max_workers=self.MAX_WORKERS) as pool:
            futures = {
                pool.submit(self._process_batch, idx, text, total_batches): idx
                for idx, text in batches
            }
            for fut in as_completed(futures):
                batch_idx, obls, error = fut.result()
                results[batch_idx] = obls
                if error:
                    batch_errors.append(f"batch {batch_idx + 1}: {error}")

        # Reassemble in original order and assign sequential IDs
        obligations: List[Dict] = []
        for idx in sorted(results):
            obligations.extend(results[idx])

        if batch_errors and not obligations:
            raise ValueError(
                "Obligation extraction failed for all batches: " + "; ".join(batch_errors[:3])
            )

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

    def delete_all(self) -> int:
        """Delete all documents from the regulatory library. Returns count deleted."""
        self._require_connection()
        result = self._col.delete_many({})
        logger.info(f"Deleted all {result.deleted_count} regulatory library documents")
        return result.deleted_count

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
            match_conditions["obligations.domain"] = domain
        if enforcement_level:
            match_conditions["obligations.enforcement_level"] = enforcement_level
        if keyword:
            match_conditions["obligations.obligation_text"] = {
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

    # Load existing library graph for context enrichment of this new doc
    if kb_graph is None:
        try:
            from utils.graph_rag import KnowledgeGraph
            if KnowledgeGraph.exists(LIBRARY_GRAPH_DIR):
                kb_graph = KnowledgeGraph.load(LIBRARY_GRAPH_DIR)
        except Exception as _exc:
            pass

    # 1. Load document
    try:
        docs = load_documents(file_path, filename)
        logger.info(f"[LIBRARY] Loaded {len(docs)} pages from {filename}")
    except DocumentLoadError as exc:
        logger.error(f"[LIBRARY] Failed to load {filename}: {exc}")
        return {"success": False, "source_filename": filename, "error": str(exc)}
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
    if not chunks:
        return {
            "success": False,
            "source_filename": filename,
            "error": "Document text was loaded, but no chunks could be created for obligation extraction.",
        }

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
            return {
                "success": False,
                "source_filename": filename,
                "error": str(exc),
            }

    logger.info(f"[LIBRARY] Extracted {len(obligations)} obligations from {filename}")
    if not obligations:
        return {
            "success": False,
            "source_filename": filename,
            "error": (
                "No obligations were extracted from the document. "
                "Review the source text quality and model output for this file."
            ),
        }
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

    store = None
    mongo_ok = False
    try:
        store = MongoLibraryStore()
        store.save_document(library_doc)
        mongo_ok = True
    except Exception as exc:
        logger.error(f"[LIBRARY] MongoDB save failed for {filename}: {exc}")

    # 8. Rebuild and save library knowledge graph (non-fatal)
    graph_result: Dict = {"graph_saved": False}
    if mongo_ok and store is not None:
        try:
            graph_result = build_and_save_library_graph(store, LIBRARY_GRAPH_DIR)
        except Exception as exc:
            logger.warning(f"[LIBRARY] Library graph save failed (non-fatal): {exc}")

    return {
        "success": True,
        "document_id": document_id,
        "framework_name": framework_name,
        "issuing_authority": issuing_authority,
        "source_filename": filename,
        "total_obligations": len(obligations),
        "obligations_by_domain": obligations_by_domain,
        "mongo_saved": mongo_ok,
        **{k: v for k, v in graph_result.items()},
    }


# ------------------------------------------------------------------
# LIBRARY KNOWLEDGE GRAPH
# ------------------------------------------------------------------
def build_and_save_library_graph(store: "MongoLibraryStore", graph_dir: str) -> Dict:
    """
    Rebuild the combined regulatory library knowledge graph from all stored
    obligations and save it to graph_dir/graph.json. Returns graph stats dict.
    """
    try:
        from langchain.schema import Document
        from utils.graph_rag import build_knowledge_graph_from_documents

        summaries = store.list_documents()
        if not summaries:
            logger.info("[LIBRARY] No documents in store — skipping graph build")
            return {"nodes": 0, "edges": 0, "graph_saved": False}

        documents = []
        for summary in summaries:
            full = store.get_document(summary["document_id"])
            if not full:
                continue
            for obl in full.get("obligations", []):
                text = (
                    f"{obl.get('section_reference', '')}: {obl.get('obligation_text', '')}"
                ).strip()
                if len(text) < 30:
                    continue
                doc = Document(
                    page_content=text,
                    metadata={
                        "obligation_id": obl.get("obligation_id", ""),
                        "domain": obl.get("domain", ""),
                        "enforcement_level": obl.get("enforcement_level", ""),
                        "source": full.get("source_filename", ""),
                        "framework_name": full.get("framework_name", ""),
                    },
                )
                documents.append(doc)

        if not documents:
            return {"nodes": 0, "edges": 0, "graph_saved": False}

        graph = build_knowledge_graph_from_documents(documents)
        os.makedirs(graph_dir, exist_ok=True)
        graph.save(graph_dir)
        stats = graph.get_graph_stats()
        logger.info(f"[LIBRARY] Regulatory library graph saved to {graph_dir}: {stats}")
        return {**stats, "graph_saved": True, "graph_path": os.path.join(graph_dir, "graph.json")}
    except Exception as exc:
        logger.warning(f"[LIBRARY] Library graph build failed (non-fatal): {exc}")
        return {"nodes": 0, "edges": 0, "graph_saved": False, "error": str(exc)}


# ------------------------------------------------------------------
# OBLIGATION DEDUPLICATION
# ------------------------------------------------------------------
SIM_THRESHOLD_OBLIGATIONS = 0.35  # Jaccard threshold for grouping similar obligations


def merge_similar_obligations(obligations: List[Dict]) -> List[Dict]:
    """
    Group similar obligations using Jaccard keyword overlap within the same domain.
    Primary = obligation with the longest obligation_text.
    Each merged obligation gains:
      merged_from_count: int
      source_documents: [{framework_name, section_reference, document_id, is_primary}]
    """
    if not obligations:
        return []

    n = len(obligations)
    kw_sets: List[set] = []
    for obl in obligations:
        raw_kw = obl.get("keywords", [])
        if not raw_kw:
            raw_kw = obl.get("obligation_text", "").lower().split()[:10]
        kw_sets.append(set(k.lower() for k in raw_kw))

    # Union-Find
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: int, y: int) -> None:
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[ry] = rx

    for i in range(n):
        for j in range(i + 1, n):
            if obligations[i].get("domain") != obligations[j].get("domain"):
                continue
            a, b = kw_sets[i], kw_sets[j]
            union_ab = a | b
            sim = len(a & b) / len(union_ab) if union_ab else 0.0
            if sim >= SIM_THRESHOLD_OBLIGATIONS:
                union(i, j)

    groups: Dict[int, List[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    merged: List[Dict] = []
    for members in groups.values():
        primary_idx = max(members, key=lambda i: len(obligations[i].get("obligation_text", "")))
        primary = dict(obligations[primary_idx])
        sources = [
            {
                "framework_name": obligations[i].get("framework_name", ""),
                "source_filename": obligations[i].get("source_filename", ""),
                "section_reference": obligations[i].get("section_reference", ""),
                "document_id": obligations[i].get("document_id", ""),
                "is_primary": i == primary_idx,
            }
            for i in members
        ]
        primary["merged_from_count"] = len(members)
        primary["source_documents"] = sources
        merged.append(primary)

    logger.info(f"[LIBRARY] Obligation deduplication: {n} raw → {len(merged)} merged")
    return merged


# ------------------------------------------------------------------
# GAP ANALYSIS REPORT GENERATION
# ------------------------------------------------------------------

def generate_library_gap_report(
    gap_data: Dict,
    docs_data: Dict,
    selected_model: str,
    kb_graph=None,
) -> str:
    """
    Use an LLM to generate a comprehensive markdown gap analysis report.

    Parameters
    ----------
    gap_data : dict with keys domain_coverage, similarities, differences,
               unique_by_doc, gap_summary
    docs_data : {doc_id: full_doc_dict} loaded from MongoDB
    selected_model : LLM model name (empty string = use GOOGLE_LLM_MODEL default)
    kb_graph : optional KnowledgeGraph — if provided, graph stats + domain
               nodes are included in the prompt as context

    Returns
    -------
    str — markdown report, or empty string if LLM call fails
    """
    import json

    try:
        # Build human-readable document summary
        doc_summaries = []
        for doc_id, doc in docs_data.items():
            doc_summaries.append({
                "framework_name": doc.get("framework_name", doc_id),
                "issuing_authority": doc.get("issuing_authority", ""),
                "source_filename": doc.get("source_filename", ""),
                "total_obligations": doc.get("total_obligations", 0),
                "domains_covered": list((doc.get("obligations_by_domain") or {}).keys()),
            })

        gap_summary = gap_data.get("gap_summary", {})
        shared_domains = gap_summary.get("shared_domains", [])
        differences = gap_data.get("differences", [])
        unique_by_doc = gap_data.get("unique_by_doc", {})

        # Build per-doc name map for readability
        doc_name_map = {
            doc_id: docs_data[doc_id].get("framework_name", doc_id)
            for doc_id in docs_data
        }

        # Build readable differences summary
        diff_summary = [
            {
                "domain": d["domain"],
                "coverage_pct": d["coverage_pct"],
                "present_in": [doc_name_map.get(i, i) for i in d["present_in"]],
                "absent_in": [doc_name_map.get(i, i) for i in d["absent_in"]],
            }
            for d in differences
        ]

        # Build readable unique summary
        unique_summary = {
            doc_name_map.get(doc_id, doc_id): {
                "unique_domains": u["unique_domains"],
                "unique_domain_count": u["unique_domain_count"],
                "unique_obligation_count": u["unique_obligation_count"],
            }
            for doc_id, u in unique_by_doc.items()
        }

        # Knowledge graph context
        graph_section = ""
        if kb_graph is not None:
            try:
                stats = kb_graph.get_graph_stats()
                domain_nodes = sorted([
                    n for n, d in kb_graph.graph.nodes(data=True)
                    if d.get("type") == "domain"
                ])
                graph_section = f"""
KNOWLEDGE GRAPH CONTEXT (built from all library documents):
- Total nodes: {stats.get('nodes', 0)} | Edges: {stats.get('edges', 0)}
- Chunk nodes: {stats.get('chunk_nodes', 0)} | Domain nodes: {stats.get('domain_nodes', 0)} | Standard nodes: {stats.get('standard_nodes', 0)}
- Domains indexed in graph: {json.dumps(domain_nodes[:30])}

Use this knowledge graph context to enrich your analysis with cross-document regulatory relationships.
"""
            except Exception:
                pass

        most_unique = doc_name_map.get(gap_summary.get("most_unique_doc", ""), gap_summary.get("most_unique_doc", "N/A"))
        best_covered = doc_name_map.get(gap_summary.get("best_covered_doc", ""), gap_summary.get("best_covered_doc", "N/A"))

        prompt = f"""You are a senior regulatory compliance expert generating a detailed gap analysis report.

Based on the analysis data below, write a comprehensive markdown report with these sections:

# Executive Summary
- What frameworks/regulations were compared
- Key finding: which document has the broadest coverage and which has the most gaps
- Overall compliance landscape snapshot

# Documents Analyzed
- For each document: framework name, issuing authority, total obligations, domains covered

# Domain Coverage Matrix
- Clearly explain shared domains (present in ALL documents) vs. partial domains (present in only SOME)
- State the total domain count and shared vs. partial split

# Shared Coverage (Domains in All Documents)
- List and explain the {len(shared_domains)} shared domain(s): {json.dumps(shared_domains)}
- What this overlap means for compliance

# Coverage Gaps (Partial Domains)
- For each partially-covered domain: which documents cover it and which don't
- Prioritize gaps by business impact

# Unique Coverage Per Document
- What each document uniquely contributes that others lack
- Whether these unique areas are critical

# Compliance Implications
- If an organization must comply with ALL selected frameworks, what are the combined requirements?
- Which gaps represent the highest risk?

# Strategic Recommendations
- Priority areas to address first
- For organizations subject to multiple frameworks, which framework provides better base coverage
- Practical next steps
{graph_section}
ANALYSIS DATA:
Documents: {json.dumps(doc_summaries, indent=2)}

Gap Summary:
- Total documents: {gap_summary.get('total_documents', 0)}
- Total domains found: {gap_summary.get('total_domains', 0)}
- Shared domains (all docs): {gap_summary.get('shared_domain_count', 0)} — {json.dumps(shared_domains)}
- Partially covered domains: {gap_summary.get('partial_coverage_domain_count', 0)}
- Best covered document: {best_covered}
- Most unique coverage: {most_unique}

Partial domain coverage:
{json.dumps(diff_summary, indent=2)}

Unique coverage per document:
{json.dumps(unique_summary, indent=2)}

Write a professional, detailed report in markdown format. Be specific — reference actual framework names, domain names, and obligation counts from the data. Avoid generic filler text."""

        model = selected_model or GOOGLE_LLM_MODEL
        llm = make_llm(model, temperature=0.1)
        report = llm.invoke(prompt)
        logger.info(f"[LIBRARY] Gap analysis report generated ({len(report)} chars)")
        return report

    except Exception as exc:
        logger.warning(f"[LIBRARY] Gap report LLM call failed (non-fatal): {exc}")
        return ""


def generate_gap_report_pdf(markdown_text: str, output_path: str) -> bool:
    """
    Convert a markdown gap analysis report to PDF using reportlab.

    Handles:
      # H1, ## H2, ### H3 headings
      - / * bullet points
      --- horizontal rules
      **bold** inline markup
      `code` inline markup
      Regular paragraphs

    Returns True on success, False on failure.
    """
    try:
        import re as _re
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.lib.enums import TA_LEFT, TA_CENTER
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
        )
        from reportlab.lib import colors

        styles = getSampleStyleSheet()

        # Custom styles
        h1_style = ParagraphStyle(
            "H1Gap", parent=styles["Heading1"],
            fontSize=18, spaceAfter=10, spaceBefore=16,
            textColor=colors.HexColor("#1a2e5a"),
        )
        h2_style = ParagraphStyle(
            "H2Gap", parent=styles["Heading2"],
            fontSize=14, spaceAfter=6, spaceBefore=12,
            textColor=colors.HexColor("#2d4a8a"),
        )
        h3_style = ParagraphStyle(
            "H3Gap", parent=styles["Heading3"],
            fontSize=12, spaceAfter=4, spaceBefore=8,
            textColor=colors.HexColor("#3d5fa0"),
        )
        body_style = ParagraphStyle(
            "BodyGap", parent=styles["Normal"],
            fontSize=10, spaceAfter=5, leading=14,
        )
        bullet_style = ParagraphStyle(
            "BulletGap", parent=styles["Normal"],
            fontSize=10, spaceAfter=3, leading=13,
            leftIndent=18, firstLineIndent=-10,
        )
        title_style = ParagraphStyle(
            "TitleGap", parent=styles["Title"],
            fontSize=22, spaceAfter=20, alignment=TA_CENTER,
            textColor=colors.HexColor("#1a2e5a"),
        )

        def _escape_xml(text: str) -> str:
            return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        def _apply_inline(text: str) -> str:
            """Convert markdown inline markup to reportlab XML."""
            text = _escape_xml(text)
            # **bold**
            text = _re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
            # *italic*
            text = _re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
            # `code`
            text = _re.sub(r"`(.+?)`", r"<font name='Courier'>\1</font>", text)
            return text

        story = []
        story.append(Paragraph("Regulatory Gap Analysis Report", title_style))
        story.append(Spacer(1, 0.1 * inch))

        lines = markdown_text.split("\n")
        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()

            if not stripped:
                story.append(Spacer(1, 0.06 * inch))
                i += 1
                continue

            if stripped.startswith("### "):
                story.append(Paragraph(_apply_inline(stripped[4:]), h3_style))
            elif stripped.startswith("## "):
                story.append(Paragraph(_apply_inline(stripped[3:]), h2_style))
            elif stripped.startswith("# "):
                story.append(Paragraph(_apply_inline(stripped[2:]), h1_style))
            elif stripped in ("---", "___", "***"):
                story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc"), spaceAfter=6, spaceBefore=6))
            elif stripped.startswith("- ") or stripped.startswith("* "):
                bullet_text = "• " + _apply_inline(stripped[2:])
                story.append(Paragraph(bullet_text, bullet_style))
            else:
                story.append(Paragraph(_apply_inline(stripped), body_style))

            i += 1

        doc = SimpleDocTemplate(
            output_path,
            pagesize=letter,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=0.9 * inch,
            bottomMargin=0.9 * inch,
        )
        doc.build(story)
        logger.info(f"[LIBRARY] Gap analysis PDF saved to {output_path}")
        return True

    except Exception as exc:
        logger.error(f"[LIBRARY] PDF generation failed: {exc}")
        return False
