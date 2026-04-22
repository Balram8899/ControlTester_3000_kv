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
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import List, Dict, Optional, Any, Tuple

from langchain.text_splitter import RecursiveCharacterTextSplitter

from utils.document_ingestion import DocumentLoadError, load_documents
from utils.regulatory_comparision import (
    safe_json_loads,
    classify_domain,
    CONTROL_DOMAINS,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
)
from utils.llm_factory import make_llm

logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "trace_db"
COLLECTION_NAME = "controls_library"

LIBRARY_GRAPH_DIR = "data/library_graphs/controls"

SIM_THRESHOLD_CONTROLS = 0.35  # Jaccard threshold for grouping similar controls
MIN_MEANINGFUL_MAPPING_SCORE = 0.12
STOPWORD_TOKENS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "their", "there",
    "shall", "should", "must", "may", "can", "will", "are", "is", "was", "were",
    "been", "being", "have", "has", "had", "not", "only", "also", "such", "than",
    "then", "them", "they", "which", "who", "what", "when", "where", "while",
    "into", "onto", "upon", "within", "through", "about", "under", "over", "each",
    "all", "any", "both", "more", "most", "less", "least", "very", "much", "many",
    "basis", "based", "place", "ensure", "using", "used", "include", "includes",
    "including", "maintain", "maintained", "implement", "implemented", "review",
    "reviewed", "require", "required", "procedure", "procedures", "process", "processes",
    "policy", "policies", "control", "controls", "system", "systems", "technology",
    "information", "resource", "resources", "organization", "organisations", "organization's",
    "company", "formal", "necessary", "appropriate", "documented", "defined", "deployed",
    "management", "function", "functions", "committee", "board", "meeting", "meet",
    "quarterly", "annual", "annually", "periodic", "periodically",
}

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


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    normalized = re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()
    return re.sub(r"\s+", " ", normalized)


def _tokenize_values(*values: Any) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        if value is None:
            continue
        if isinstance(value, (list, tuple, set)):
            for item in value:
                tokens.update(_tokenize_values(item))
            continue
        normalized = _normalize_text(value)
        for token in normalized.split():
            if len(token) < 3 or token in STOPWORD_TOKENS:
                continue
            tokens.add(token)
    return tokens


def _extract_phrases(*values: Any) -> set[str]:
    phrases: set[str] = set()
    for value in values:
        if value is None:
            continue
        if isinstance(value, (list, tuple, set)):
            for item in value:
                phrases.update(_extract_phrases(item))
            continue
        normalized = _normalize_text(value)
        if len(normalized.split()) >= 2:
            phrases.add(normalized)
    return phrases


def _score_obligation_match(control: Dict[str, Any], obligation: Dict[str, Any]) -> float:
    control_name = control.get("control_name") or control.get("name") or ""
    control_description = control.get("description") or ""
    control_keywords = control.get("keywords", [])
    obligation_text = obligation.get("obligation_text") or ""
    obligation_keywords = obligation.get("keywords", [])

    control_tokens = _tokenize_values(control_name, control_description, control_keywords)
    obligation_tokens = _tokenize_values(obligation_text, obligation_keywords)
    if not control_tokens or not obligation_tokens:
        return 0.0

    token_overlap = control_tokens & obligation_tokens
    control_keyword_tokens = _tokenize_values(control_keywords)
    obligation_keyword_tokens = _tokenize_values(obligation_keywords)
    keyword_overlap = control_keyword_tokens & obligation_keyword_tokens

    control_phrases = _extract_phrases(control_name, control_keywords)
    obligation_phrases = _extract_phrases(obligation_text, obligation_keywords)
    normalized_control_text = _normalize_text(f"{control_name} {control_description}")
    normalized_obligation_text = _normalize_text(obligation_text)

    phrase_matches = {
        phrase
        for phrase in control_phrases
        if phrase in obligation_phrases or phrase in normalized_obligation_text
    }
    phrase_matches.update(
        phrase
        for phrase in obligation_phrases
        if phrase in normalized_control_text
    )

    if len(token_overlap) < 2 and not keyword_overlap and not phrase_matches:
        return 0.0

    token_score = len(token_overlap) / len(control_tokens | obligation_tokens)
    keyword_union = control_keyword_tokens | obligation_keyword_tokens
    keyword_score = len(keyword_overlap) / len(keyword_union) if keyword_union else 0.0
    phrase_score = min(len(phrase_matches), 2) * 0.25

    return round(token_score + (keyword_score * 0.35) + phrase_score, 3)


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
    all_candidates: Optional[List[Dict[str, Any]]] = None
    domain_cache: Dict[str, List[Dict[str, Any]]] = {}

    for ctrl in controls:
        domain = str(ctrl.get("domain", "") or "").strip()

        if domain not in domain_cache:
            try:
                domain_cache[domain] = regulatory_store.search_obligations(domain=domain) if domain else []
            except Exception as exc:
                logger.warning(f"[CONTROLS] Obligation lookup failed for domain={domain}: {exc}")
                domain_cache[domain] = []

        scored = [
            (_score_obligation_match(ctrl, obligation), obligation)
            for obligation in domain_cache[domain]
        ]
        meaningful = [item for item in scored if item[0] >= MIN_MEANINGFUL_MAPPING_SCORE]

        if not meaningful:
            if all_candidates is None:
                try:
                    all_candidates = regulatory_store.search_obligations()
                except Exception as exc:
                    logger.warning(f"[CONTROLS] Global obligation lookup failed: {exc}")
                    all_candidates = []

            scored = [
                (_score_obligation_match(ctrl, obligation), obligation)
                for obligation in all_candidates
            ]
            meaningful = [item for item in scored if item[0] >= MIN_MEANINGFUL_MAPPING_SCORE]

        meaningful.sort(
            key=lambda item: (item[0], item[1].get("domain") == domain),
            reverse=True,
        )

        top: List[Tuple[float, Dict[str, Any]]] = []
        seen_obligation_ids: set[str] = set()
        for score, obligation in meaningful:
            obligation_id = str(obligation.get("obligation_id") or "")
            if obligation_id and obligation_id in seen_obligation_ids:
                continue
            if obligation_id:
                seen_obligation_ids.add(obligation_id)
            top.append((score, obligation))
            if len(top) >= top_k:
                break

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
# LIBRARY KNOWLEDGE GRAPH
# ------------------------------------------------------------------
def build_and_save_library_graph(store: "MongoControlsStore", graph_dir: str) -> Dict:
    """
    Rebuild the combined controls library knowledge graph from all stored controls
    and save it to graph_dir/graph.json. Returns graph stats dict.
    """
    try:
        from langchain.schema import Document
        from utils.graph_rag import build_knowledge_graph_from_documents

        all_ctrls = store.all_controls()
        if not all_ctrls:
            logger.info("[CONTROLS] No controls in store — skipping graph build")
            return {"nodes": 0, "edges": 0, "graph_saved": False}

        documents = []
        for ctrl in all_ctrls:
            text = (
                f"{ctrl.get('control_name', '')}: {ctrl.get('description', '')}"
            ).strip()
            if len(text) < 30:
                continue
            doc = Document(
                page_content=text,
                metadata={
                    "control_id": ctrl.get("control_id", ""),
                    "domain": ctrl.get("domain", ""),
                    "control_type": ctrl.get("control_type", ""),
                    "source": ctrl.get("_source_filename", ""),
                },
            )
            documents.append(doc)

        if not documents:
            return {"nodes": 0, "edges": 0, "graph_saved": False}

        graph = build_knowledge_graph_from_documents(documents)
        os.makedirs(graph_dir, exist_ok=True)
        graph.save(graph_dir)
        stats = graph.get_graph_stats()
        logger.info(f"[CONTROLS] Controls library graph saved to {graph_dir}: {stats}")
        return {**stats, "graph_saved": True, "graph_path": os.path.join(graph_dir, "graph.json")}
    except Exception as exc:
        logger.warning(f"[CONTROLS] Library graph build failed (non-fatal): {exc}")
        return {"nodes": 0, "edges": 0, "graph_saved": False, "error": str(exc)}


# ------------------------------------------------------------------
# DIRECT RCM EXCEL INGEST (bypasses LLM extraction)
# ------------------------------------------------------------------
_KNOWN_DOMAINS = {
    "governance", "third_party", "change_management", "technology_refresh",
    "access_control", "Vulnerability Mgmt.", "cryptography", "data_security", "network_security",
    "business_continuity", "incident_response", "system_security", "cyber_operations",
    "audit", "online_services", "emerging_tech",
}

def _normalize_excel_domain(raw: str) -> str:
    """Map free-text Excel domain to our internal domain key, or classify by keywords."""
    if not raw:
        return "governance"
    normalized = raw.lower().strip().replace(" ", "_").replace("-", "_")
    if normalized in _KNOWN_DOMAINS:
        return normalized
    # Try classify_domain on raw text as fallback
    try:
        guessed = classify_domain(raw)
        if guessed and guessed in _KNOWN_DOMAINS:
            return guessed
    except Exception:
        pass
    return "governance"


def _ingest_rcm_excel_direct(
    file_path: str,
    filename: str,
    selected_model: str,
    regulatory_store: Optional[Any] = None,
) -> Dict:
    """
    Directly ingest an RCM Excel file without LLM extraction.
    Uses the Excel 'Control Reference' column as the control_id.
    Handles duplicates by appending ' (n)' suffixes.
    """
    logger.info(f"[CONTROLS] Direct Excel ingest: {filename}")
    try:
        from utils.rcm_compliance_analyzer import parse_rcm_excel
        rcm_data = parse_rcm_excel(file_path)
    except Exception as exc:
        logger.error(f"[CONTROLS] Failed to parse Excel {filename}: {exc}")
        return {"success": False, "source_filename": filename, "error": str(exc)}

    # Collect existing control IDs from MongoDB (non-fatal if unavailable)
    existing_ids: set = set()
    try:
        _store = MongoControlsStore()
        if _store.is_connected:
            for ctrl in _store.all_controls():
                cid = ctrl.get("control_id", "")
                if cid:
                    existing_ids.add(cid)
    except Exception:
        pass

    controls: List[Dict] = []
    seen_in_file: set = set()  # track IDs assigned within this upload

    for sheet_name, rows in rcm_data.items():
        for row_data in rows:
            ref = (row_data.get("reference") or "").strip()
            title = (row_data.get("title") or "").strip()
            desc = (row_data.get("description") or "").strip()
            domain_raw = (row_data.get("domain") or "").strip()
            subdomain = (row_data.get("subdomain") or "").strip()
            row_num = row_data.get("row", "")

            # Skip rows that have no meaningful content
            if not (ref or title or desc):
                continue

            # Determine unique control_id
            base_id = ref if ref else "CTL-" + uuid.uuid4().hex[:12].upper()
            final_id = base_id
            if base_id in existing_ids or base_id in seen_in_file:
                counter = 1
                while f"{base_id} ({counter})" in existing_ids or f"{base_id} ({counter})" in seen_in_file:
                    counter += 1
                final_id = f"{base_id} ({counter})"
            seen_in_file.add(final_id)

            # Build citation reference
            ref_parts = []
            if sheet_name:
                ref_parts.append(f"Sheet: {sheet_name}")
            if row_num:
                ref_parts.append(f"Row: {row_num}")
            doc_reference = ", ".join(ref_parts) if ref_parts else ""

            # Domain classification
            combined_text = f"{title} {desc} {domain_raw} {subdomain}"
            domain = _normalize_excel_domain(domain_raw) if domain_raw else classify_domain(combined_text)

            ctrl: Dict = {
                "control_id": final_id,
                "control_name": title or f"Control {final_id}",
                "description": desc or title,
                "document_reference": doc_reference,
                "domain": domain,
                "control_type": "preventive",
                "keywords": [w for w in (title or desc).lower().split() if len(w) > 4][:6],
                "specificity_level": "specific",
                "mapped_obligations": [],
            }
            controls.append(ctrl)

    logger.info(f"[CONTROLS] Direct Excel: {len(controls)} controls from {filename}")

    # Obligation mapping
    if regulatory_store is not None and controls:
        try:
            controls = map_controls_to_obligations(controls, regulatory_store)
        except Exception as exc:
            logger.warning(f"[CONTROLS] Obligation mapping failed (non-fatal): {exc}")
            for ctrl in controls:
                ctrl.setdefault("mapped_obligations", [])
    else:
        for ctrl in controls:
            ctrl.setdefault("mapped_obligations", [])

    # Per-domain summary
    controls_by_domain: Dict[str, int] = {}
    for ctrl in controls:
        d = ctrl.get("domain", "governance")
        controls_by_domain[d] = controls_by_domain.get(d, 0) + 1

    document_id = hashlib.md5(f"{filename}:{selected_model}".encode()).hexdigest()[:16]
    store_doc = {
        "document_id": document_id,
        "source_filename": filename,
        "upload_timestamp": datetime.utcnow().isoformat(),
        "model_used": selected_model,
        "total_controls": len(controls),
        "controls_by_domain": controls_by_domain,
        "controls": controls,
    }

    mongo_ok = False
    try:
        store = MongoControlsStore()
        store.save_document(store_doc)
        mongo_ok = True
    except Exception as exc:
        logger.error(f"[CONTROLS] MongoDB save failed for {filename}: {exc}")

    return {
        "success": True,
        "document_id": document_id,
        "source_filename": filename,
        "total_controls": len(controls),
        "controls_by_domain": controls_by_domain,
        "mongo_saved": mongo_ok,
    }


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
        fp_lower = file_path.lower()
        if fp_lower.endswith((".xlsx", ".xls")):
            # Structured Excel — bypass LLM, use Excel reference IDs directly
            return _ingest_rcm_excel_direct(file_path, filename, selected_model, regulatory_store)
        else:
            docs = load_documents(file_path, filename)
        logger.info(f"[CONTROLS] Loaded {len(docs)} pages from {filename}")
    except DocumentLoadError as exc:
        logger.error(f"[CONTROLS] Failed to load {filename}: {exc}")
        return {"success": False, "source_filename": filename, "error": str(exc)}
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

    store = None
    mongo_ok = False
    try:
        store = MongoControlsStore()
        store.save_document(store_doc)
        mongo_ok = True
    except Exception as exc:
        logger.error(f"[CONTROLS] MongoDB save failed for {filename}: {exc}")

    # 8. Rebuild and save library knowledge graph (non-fatal)
    graph_result: Dict = {"graph_saved": False}
    if mongo_ok and store is not None:
        try:
            graph_result = build_and_save_library_graph(store, LIBRARY_GRAPH_DIR)
        except Exception as exc:
            logger.warning(f"[CONTROLS] Library graph save failed (non-fatal): {exc}")

    return {
        "success": True,
        "document_id": document_id,
        "source_filename": filename,
        "total_controls": len(controls),
        "controls_by_domain": controls_by_domain,
        "mongo_saved": mongo_ok,
        **{k: v for k, v in graph_result.items()},
    }
