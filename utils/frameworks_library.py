"""
Frameworks Library — framework element extraction, deduplication, and knowledge graph persistence.

Extracts structured elements (controls, risk information) from uploaded quality/risk
framework documents (5W1H, ECOTM, etc.), stores them in MongoDB, and builds a
per-library knowledge graph saved to disk for GraphRAG enrichment.
"""

import os
import uuid
import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import List, Dict, Optional, Any, Tuple

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document

from utils.document_ingestion import DocumentLoadError, load_documents
from utils.regulatory_comparision import (
    safe_json_loads,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    DocumentAnalyzerAgent,
)
from utils.llm_factory import make_llm

logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "Trace_db"
COLLECTION_NAME = "frameworks_library"

LIBRARY_GRAPH_DIR = "data/library_graphs/frameworks"

SIM_THRESHOLD = 0.35  # Jaccard threshold for grouping similar elements

RISK_CATEGORIES = [
    "operational",
    "strategic",
    "compliance",
    "financial",
    "reputational",
    "technology",
    "people",
    "process",
    "quality_assurance",
    "methodology",
]


# ------------------------------------------------------------------
# FRAMEWORK ELEMENT EXTRACTOR AGENT
# ------------------------------------------------------------------
class FrameworkElementExtractorAgent:
    """Extracts framework elements (controls and risk information) from document chunks."""

    MAX_WORKERS = 4
    BATCH_SIZE = 5
    MIN_CHUNK_CHARS = 80

    def __init__(self, model: str, kb_vectorstore=None, kb_graph=None):
        self.model = model
        self.kb_vectorstore = kb_vectorstore
        self.kb_graph = kb_graph

    def _make_llm(self):
        return make_llm(self.model, temperature=0.1)

    def _get_kb_context(self, batch_text: str) -> str:
        """Retrieve relevant KB context using knowledge graph search."""
        if self.kb_graph is None:
            return ""
        try:
            from utils.graph_rag import GraphRAGRetriever
            retriever = GraphRAGRetriever(self.kb_graph, seed_k=3, final_k=4)
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
            f"Use the above context STRICTLY to improve risk classification and identify control intent.\n\n"
        ) if kb_context else ""

        risk_categories_str = ", ".join(RISK_CATEGORIES)

        return f"""{kb_section}You are a quality and risk management expert extracting structured framework elements from methodology documents.

FRAMEWORK CONTEXT: These documents describe quality management or risk frameworks (e.g., 5W1H, ECOTM, PDCA, FMEA, root cause analysis methodologies, lean/six sigma frameworks). Extract each distinct element, principle, step, or criterion described.

STRICT EXTRACTION RULES:
- Extract ONLY concrete, distinct framework elements (methodology steps, analytical dimensions, quality criteria, risk factors)
- DO NOT extract: general introductions, scope statements, or marketing language
- Each element should represent a distinct analytical lens or action dimension

For EACH element, return a JSON object with EXACTLY these fields:

- element_name: short, clear name of the framework element (e.g., "Who", "Why", "Eliminate", "Root Cause")

- description: what this element means in the context of the framework

- risk_category: one of [{risk_categories_str}]

- control_implications: how this element translates to controls or risk mitigation actions
  (e.g., "Defines accountability boundaries — maps to access control and RACI matrices")

- applicability: when and where this element should be applied
  (e.g., "Applied during incident investigation to identify responsible parties")

- keywords: list of 3–6 key terms characterising this element

- specificity_level:
  "specific" → the element has a clearly defined scope or measurable outcome
  "general" → high-level conceptual element

OUTPUT FORMAT:
- Return a JSON array of element objects
- If NO elements found → return []

DOCUMENT TEXT:
{batch_text}

Return ONLY the JSON array.
"""

    def _process_batch(self, batch_idx: int, batch_text: str, total_batches: int) -> Tuple[int, List[Dict]]:
        logger.info(f"[FRAMEWORKS] Batch {batch_idx + 1}/{total_batches} — LLM call started")
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
            for elem in parsed:
                if not elem.get("element_name") or not elem.get("description"):
                    continue
                # Normalize risk_category
                rc = elem.get("risk_category", "").lower().strip()
                if rc not in RISK_CATEGORIES:
                    rc = "operational"
                elem["risk_category"] = rc
                elem.setdefault("control_implications", "")
                elem.setdefault("applicability", "")
                elem.setdefault("keywords", [])
                elem.setdefault("specificity_level", "general")
                valid.append(elem)
            logger.info(f"[FRAMEWORKS] Batch {batch_idx + 1}/{total_batches} — {len(valid)} elements extracted")
            return batch_idx, valid
        except Exception as exc:
            logger.warning(f"[FRAMEWORKS] Batch {batch_idx + 1}/{total_batches} failed: {exc}")
            return batch_idx, []

    def run(self, chunks: List) -> List[Dict]:
        useful_chunks = [c for c in chunks if len(c.page_content.strip()) >= self.MIN_CHUNK_CHARS]
        logger.info(f"[FRAMEWORKS] {len(useful_chunks)}/{len(chunks)} chunks pass minimum-length filter")

        batches: List[Tuple[int, str]] = []
        for i in range(0, len(useful_chunks), self.BATCH_SIZE):
            batch = useful_chunks[i: i + self.BATCH_SIZE]
            batch_text = "\n\n---CHUNK---\n\n".join(c.page_content for c in batch)
            batches.append((len(batches), batch_text))

        total_batches = len(batches)
        logger.info(f"[FRAMEWORKS] Processing {total_batches} batches with up to {self.MAX_WORKERS} parallel workers")

        results: Dict[int, List[Dict]] = {}
        with ThreadPoolExecutor(max_workers=self.MAX_WORKERS) as pool:
            futures = {
                pool.submit(self._process_batch, idx, text, total_batches): idx
                for idx, text in batches
            }
            for fut in as_completed(futures):
                batch_idx, elems = fut.result()
                results[batch_idx] = elems

        # Reassemble in original order
        elements: List[Dict] = []
        for idx in sorted(results):
            elements.extend(results[idx])

        # Assign globally unique IDs
        for elem in elements:
            elem["element_id"] = "FWK-" + uuid.uuid4().hex[:12].upper()

        logger.info(f"[FRAMEWORKS] Total elements extracted: {len(elements)}")
        return elements


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


def merge_similar_framework_elements(elements: List[Dict]) -> List[Dict]:
    """
    Group similar framework elements using Jaccard keyword similarity
    (threshold = SIM_THRESHOLD), within the same risk_category.
    Primary = element with longest description.
    """
    if not elements:
        return []

    n = len(elements)
    kw_sets = []
    for elem in elements:
        raw_kw = elem.get("keywords", [])
        if not raw_kw:
            raw_kw = elem.get("element_name", "").lower().split()
        kw_sets.append(set(k.lower() for k in raw_kw))

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

    for i in range(n):
        for j in range(i + 1, n):
            if elements[i].get("risk_category") != elements[j].get("risk_category"):
                continue
            sim = _jaccard(kw_sets[i], kw_sets[j])
            if sim >= SIM_THRESHOLD:
                union(i, j)

    groups: Dict[int, List[int]] = {}
    for i in range(n):
        root = find(i)
        groups.setdefault(root, []).append(i)

    merged: List[Dict] = []
    for root, members in groups.items():
        if len(members) == 1:
            elem = dict(elements[members[0]])
            elem["merged_from_count"] = 1
            elem["source_documents"] = [
                {
                    "filename": elem.pop("_source_filename", ""),
                    "framework_name": elem.get("_framework_name", ""),
                    "is_primary": True,
                }
            ]
            elem.pop("_framework_name", None)
            merged.append(elem)
        else:
            primary_idx = max(members, key=lambda i: len(elements[i].get("description", "")))
            primary = dict(elements[primary_idx])
            sources = []
            for i in members:
                sources.append({
                    "filename": elements[i].get("_source_filename", ""),
                    "framework_name": elements[i].get("_framework_name", ""),
                    "is_primary": i == primary_idx,
                })
            primary["merged_from_count"] = len(members)
            primary["source_documents"] = sources
            primary.pop("_source_filename", None)
            primary.pop("_framework_name", None)
            merged.append(primary)

    logger.info(f"[FRAMEWORKS] Deduplication: {n} raw → {len(merged)} merged elements")
    return merged


# ------------------------------------------------------------------
# KNOWLEDGE GRAPH
# ------------------------------------------------------------------
def build_and_save_library_graph(store: "MongoFrameworksStore", graph_dir: str) -> Dict:
    """
    Rebuild the combined library knowledge graph from all stored framework documents
    and save it to graph_dir/graph.json. Returns graph stats dict.
    """
    try:
        from utils.graph_rag import build_knowledge_graph_from_documents, KnowledgeGraph

        all_elements = store.all_elements()
        if not all_elements:
            logger.info("[FRAMEWORKS] No elements in store — skipping graph build")
            return {"nodes": 0, "edges": 0, "graph_saved": False}

        # Convert elements to LangChain Documents
        documents = []
        for elem in all_elements:
            text = (
                f"{elem.get('element_name', '')}: {elem.get('description', '')} "
                f"{elem.get('control_implications', '')} {elem.get('applicability', '')}"
            ).strip()
            if len(text) < 30:
                continue
            doc = Document(
                page_content=text,
                metadata={
                    "element_id": elem.get("element_id", ""),
                    "risk_category": elem.get("risk_category", ""),
                    "source": elem.get("_source_filename", ""),
                    "framework_name": elem.get("_framework_name", ""),
                },
            )
            documents.append(doc)

        if not documents:
            return {"nodes": 0, "edges": 0, "graph_saved": False}

        graph = build_knowledge_graph_from_documents(documents)
        os.makedirs(graph_dir, exist_ok=True)
        graph.save(graph_dir)
        stats = graph.get_graph_stats()
        logger.info(f"[FRAMEWORKS] Library graph saved to {graph_dir}: {stats}")
        return {**stats, "graph_saved": True, "graph_path": os.path.join(graph_dir, "graph.json")}
    except Exception as exc:
        logger.warning(f"[FRAMEWORKS] Library graph build failed (non-fatal): {exc}")
        return {"nodes": 0, "edges": 0, "graph_saved": False, "error": str(exc)}


def load_library_graph(graph_dir: str) -> Optional[Any]:
    """Load the saved library knowledge graph if it exists."""
    try:
        from utils.graph_rag import KnowledgeGraph
        if KnowledgeGraph.exists(graph_dir):
            graph = KnowledgeGraph.load(graph_dir)
            logger.info(f"[FRAMEWORKS] Loaded library graph from {graph_dir}")
            return graph
    except Exception as exc:
        logger.warning(f"[FRAMEWORKS] Failed to load library graph (non-fatal): {exc}")
    return None


# ------------------------------------------------------------------
# MONGODB FRAMEWORKS STORE
# ------------------------------------------------------------------
class MongoFrameworksStore:
    """Thin MongoDB wrapper for the frameworks library collection."""

    def __init__(self):
        try:
            from pymongo import MongoClient
            self._client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
            self._client.admin.command("ping")
            self._db = self._client[DB_NAME]
            self._col = self._db[COLLECTION_NAME]
            self._col.create_index("document_id", unique=True)
            self._col.create_index("source_filename")
            logger.info(f"MongoFrameworksStore connected to {MONGO_URI}")
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
        logger.info(f"Saved frameworks document {doc_id} ({doc.get('source_filename')})")
        return doc_id

    def list_documents(self) -> List[Dict]:
        self._require_connection()
        cursor = self._col.find(
            {},
            {
                "_id": 0,
                "document_id": 1,
                "framework_name": 1,
                "framework_type": 1,
                "source_filename": 1,
                "upload_timestamp": 1,
                "model_used": 1,
                "total_elements": 1,
                "elements_by_category": 1,
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
        self._require_connection()
        result = self._col.delete_many({})
        logger.info(f"Deleted all {result.deleted_count} frameworks library documents")
        return result.deleted_count

    def all_elements(self) -> List[Dict]:
        """Return all elements across all documents (with _source_filename and _framework_name injected)."""
        self._require_connection()
        docs = list(self._col.find({}, {"_id": 0}))
        elements = []
        for doc in docs:
            fname = doc.get("source_filename", "")
            fname_fw = doc.get("framework_name", "")
            for elem in doc.get("elements", []):
                elem = dict(elem)
                elem["_source_filename"] = fname
                elem["_framework_name"] = fname_fw
                elem["_document_id"] = doc.get("document_id", "")
                elements.append(elem)
        return elements


# ------------------------------------------------------------------
# TOP-LEVEL INGEST FUNCTION
# ------------------------------------------------------------------
def ingest_framework_document(
    file_path: str,
    filename: str,
    selected_model: str,
    kb_vectorstore: Optional[Any] = None,
    kb_graph: Optional[Any] = None,
) -> Dict:
    """
    Full ingest pipeline for a single framework document.

    Returns a result dict with keys:
        success, document_id, source_filename, framework_name, total_elements,
        elements_by_category, mongo_saved, graph_saved, error
    """
    logger.info(f"[FRAMEWORKS] Ingesting: {filename} | model: {selected_model}")

    # Load existing library graph for context enrichment of this new doc
    if kb_graph is None:
        kb_graph = load_library_graph(LIBRARY_GRAPH_DIR)

    # 1. Load document
    try:
        docs = load_documents(file_path, filename)
        logger.info(f"[FRAMEWORKS] Loaded {len(docs)} pages from {filename}")
    except DocumentLoadError as exc:
        logger.error(f"[FRAMEWORKS] Failed to load {filename}: {exc}")
        return {"success": False, "source_filename": filename, "error": str(exc)}
    except Exception as exc:
        logger.error(f"[FRAMEWORKS] Failed to load {filename}: {exc}")
        return {"success": False, "source_filename": filename, "error": str(exc)}

    # 2. Chunk
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(docs)
    logger.info(f"[FRAMEWORKS] {len(chunks)} chunks from {filename}")

    # 3. Detect framework name and type
    try:
        analyzer = DocumentAnalyzerAgent(model=selected_model)
        doc_meta = analyzer.run(chunks[:10])
        framework_name = doc_meta.get("framework_name") or doc_meta.get("title") or filename
        framework_type = doc_meta.get("issuing_authority") or "quality_management"
    except Exception as exc:
        logger.warning(f"[FRAMEWORKS] Document analysis failed (non-fatal): {exc}")
        framework_name = filename
        framework_type = "quality_management"

    # 4. Extract framework elements
    extractor = FrameworkElementExtractorAgent(selected_model, kb_vectorstore=kb_vectorstore, kb_graph=kb_graph)
    elements = extractor.run(chunks)

    # 5. Per-category summary
    elements_by_category: Dict[str, int] = {}
    for elem in elements:
        cat = elem.get("risk_category", "operational")
        elements_by_category[cat] = elements_by_category.get(cat, 0) + 1

    # 6. Deterministic document_id
    document_id = hashlib.md5(f"{filename}:{selected_model}".encode()).hexdigest()[:16]

    # 7. Save to MongoDB
    store_doc = {
        "document_id": document_id,
        "framework_name": framework_name,
        "framework_type": framework_type,
        "source_filename": filename,
        "upload_timestamp": datetime.utcnow().isoformat(),
        "model_used": selected_model,
        "total_elements": len(elements),
        "elements_by_category": elements_by_category,
        "elements": elements,
    }

    mongo_ok = False
    store = None
    try:
        store = MongoFrameworksStore()
        store.save_document(store_doc)
        mongo_ok = True
    except Exception as exc:
        logger.error(f"[FRAMEWORKS] MongoDB save failed for {filename}: {exc}")

    # 8. Rebuild and save library knowledge graph
    graph_result = {"graph_saved": False}
    if mongo_ok and store is not None:
        graph_result = build_and_save_library_graph(store, LIBRARY_GRAPH_DIR)

    return {
        "success": True,
        "document_id": document_id,
        "framework_name": framework_name,
        "framework_type": framework_type,
        "source_filename": filename,
        "total_elements": len(elements),
        "elements_by_category": elements_by_category,
        "mongo_saved": mongo_ok,
        **{k: v for k, v in graph_result.items()},
    }
