"""
Graph-RAG module for Trace.

Provides a Knowledge Graph layer (NetworkX DiGraph) that sits alongside the
pure Knowledge Graph retrieval. All retrieval paths use entity-based
graph search with substring fallback.

Classes
-------
RegexEntityExtractor   – Deterministic regex/keyword extraction, no LLM needed.
KnowledgeGraph         – Wraps nx.DiGraph; builds, persists, and queries the graph.
GraphRAGRetriever      – Pure knowledge-graph retrieval with neighbor expansion.
RegulatoryControlGraph – Per-comparison graph used in regulatory_comparision.py.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx
import numpy as np
from langchain.schema import Document

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# CONTROL_DOMAINS – mirrors the dict in regulatory_comparision.py so we can
# import from a single source-of-truth without a circular import.
# ---------------------------------------------------------------------------
CONTROL_DOMAINS: Dict[str, List[str]] = {
    "governance": ["governance", "board", "committee", "oversight", "management", "ciso", "cio"],
    "third_party": ["third party", "vendor", "outsourcing", "service provider", "supply chain"],
    "change_management": ["change", "patch", "update", "deployment", "release"],
    "technology_refresh": ["end of support", "eos", "obsolete", "outdated", "lifecycle"],
    "access_control": ["access", "authentication", "authorization", "privilege", "mfa", "multi-factor"],
    "va_pt": ["vulnerability", "penetration", "testing", "assessment", "va", "pt"],
    "cryptography": ["cryptography", "encryption", "key management", "cipher", "crypto"],
    "data_security": ["data loss", "dlp", "data protection", "confidentiality", "data at rest"],
    "network_security": ["network", "firewall", "segmentation", "intrusion", "dmz"],
    "business_continuity": ["business continuity", "disaster recovery", "bcp", "dr", "rto", "rpo"],
    "incident_response": ["incident", "breach", "response", "forensic", "cyber incident"],
    "system_security": ["endpoint", "malware", "antivirus", "system hardening", "iot"],
    "cyber_operations": ["soc", "security operations", "threat intelligence", "monitoring"],
    "audit": ["audit", "assurance", "review", "compliance check"],
    "online_services": ["online banking", "digital", "mobile app", "api", "transaction"],
    "emerging_tech": ["api", "iot", "devops", "agile", "cloud", "virtualization"],
}

# Pre-compiled regex for speed
_REGULATION_RE = re.compile(
    r"\b("
    r"ISO\s*\d{4,6}(?:[:\-]\d+)?"
    r"|NIST\s+(?:SP\s*)?\d[\d\-\.]*"
    r"|PCI[\s\-]DSS"
    r"|SOC\s*[12]"
    r"|GDPR"
    r"|HIPAA"
    r"|CIS\s+(?:Benchmark|Control)\s*\d*"
    r"|COBIT\s*\d*"
    r"|MAS\s+TRM"
    r"|BNM\s+\w+"
    r"|Section\s+\d+(?:\.\d+)*"
    r")\b",
    re.IGNORECASE,
)
_OBLIGATION_RE = re.compile(
    r"\b(shall|must|is required to|are required to|should|is recommended|may)\b",
    re.IGNORECASE,
)
_METRIC_RE = re.compile(
    r"\b(\d+\s*(?:days?|months?|years?|hours?|minutes?|%|percent|times?))\b",
    re.IGNORECASE,
)


# ===========================================================================
# 1. RegexEntityExtractor
# ===========================================================================

class RegexEntityExtractor:
    """
    Stateless extractor.  All methods are pure functions operating on text.
    Called once per chunk during KB build — no network calls, no LLM.
    """

    @staticmethod
    def extract_domains(text: str) -> List[str]:
        text_lower = text.lower()
        matched = []
        for domain, keywords in CONTROL_DOMAINS.items():
            if any(kw in text_lower for kw in keywords):
                matched.append(domain)
        return matched

    @staticmethod
    def extract_standards(text: str) -> List[str]:
        raw = _REGULATION_RE.findall(text)
        # Normalise whitespace and deduplicate while preserving order
        seen: set = set()
        result = []
        for s in raw:
            norm = re.sub(r"\s+", " ", s).strip().upper()
            if norm not in seen:
                seen.add(norm)
                result.append(norm)
        return result

    @staticmethod
    def extract_obligations(text: str) -> List[str]:
        return list({m.lower() for m in _OBLIGATION_RE.findall(text)})

    @staticmethod
    def extract_metrics(text: str) -> List[str]:
        return list({m.lower() for m in _METRIC_RE.findall(text)})

    @classmethod
    def extract_all(cls, text: str) -> Dict[str, List[str]]:
        return {
            "domains": cls.extract_domains(text),
            "standards": cls.extract_standards(text),
            "obligations": cls.extract_obligations(text),
            "metrics": cls.extract_metrics(text),
        }


# ===========================================================================
# 2. KnowledgeGraph
# ===========================================================================

class KnowledgeGraph:
    """
    Wraps a NetworkX DiGraph for Knowledge-Graph-enhanced RAG.

    Node types (stored in node attribute ``type``):
      - ``"chunk"``    : one text chunk (id = first-12-chars of MD5 of text[:200])
      - ``"domain"``   : a control domain name
      - ``"standard"`` : a regulatory standard reference
      - ``"entity"``   : obligation verb / metric

    Edge types (stored in edge attribute ``rel``):
      - ``"belongs_to"`` : chunk → domain
      - ``"references"`` : chunk → standard
      - ``"related_to"`` : chunk ↔ chunk  (co-occurrence: same domain + shared standard)
    """

    _GRAPH_FILENAME = "graph.json"
    _MAX_CO_OCC_EDGES_PER_DOMAIN = 500  # safety cap against O(k²) explosion

    def __init__(self) -> None:
        self.graph: nx.DiGraph = nx.DiGraph()
        # Inverted indexes rebuilt from graph on load
        self._domain_index: Dict[str, List[str]] = defaultdict(list)   # domain → [chunk_ids]
        self._standard_index: Dict[str, List[str]] = defaultdict(list) # standard → [chunk_ids]

    # ------------------------------------------------------------------
    # Building
    # ------------------------------------------------------------------

    @staticmethod
    def _chunk_id(text: str) -> str:
        return hashlib.md5(text[:200].encode("utf-8", errors="replace")).hexdigest()[:12]

    def add_chunk(
        self,
        chunk_id: str,
        text: str,
        metadata: dict,
        domains: List[str],
        standards: List[str],
        obligations: List[str],
        metrics: List[str],
    ) -> None:
        self.graph.add_node(
            chunk_id,
            type="chunk",
            text_preview=text[:300],
            domains=domains,
            standards=standards,
            obligations=obligations,
            metrics=metrics,
            source=metadata.get("source", ""),
            file_name=metadata.get("file_name", metadata.get("source", "")),
        )

        for domain in domains:
            if not self.graph.has_node(domain):
                self.graph.add_node(domain, type="domain")
            self.graph.add_edge(chunk_id, domain, rel="belongs_to")
            self._domain_index[domain].append(chunk_id)

        for standard in standards:
            if not self.graph.has_node(standard):
                self.graph.add_node(standard, type="standard")
            self.graph.add_edge(chunk_id, standard, rel="references")
            self._standard_index[standard].append(chunk_id)

    def build_co_occurrence_edges(self) -> int:
        """
        Link chunk pairs in the same domain that share ≥1 standard reference.
        Returns the total number of edges added.
        Caps at ``_MAX_CO_OCC_EDGES_PER_DOMAIN`` per domain.
        """
        edges_added = 0
        for domain, chunk_ids in self._domain_index.items():
            if len(chunk_ids) < 2:
                continue
            domain_edges = 0
            for i, cid_a in enumerate(chunk_ids):
                if domain_edges >= self._MAX_CO_OCC_EDGES_PER_DOMAIN:
                    break
                node_a = self.graph.nodes.get(cid_a, {})
                standards_a = set(node_a.get("standards", []))
                if not standards_a:
                    continue
                for cid_b in chunk_ids[i + 1:]:
                    if domain_edges >= self._MAX_CO_OCC_EDGES_PER_DOMAIN:
                        break
                    node_b = self.graph.nodes.get(cid_b, {})
                    shared = standards_a & set(node_b.get("standards", []))
                    if shared:
                        self.graph.add_edge(cid_a, cid_b, rel="related_to", weight=len(shared))
                        self.graph.add_edge(cid_b, cid_a, rel="related_to", weight=len(shared))
                        domain_edges += 1
                        edges_added += 1
        return edges_added

    # ------------------------------------------------------------------
    # Querying
    # ------------------------------------------------------------------

    def get_neighbor_chunk_ids(self, chunk_id: str, depth: int = 1) -> List[str]:
        """Return chunk_ids reachable within ``depth`` hops (only chunk nodes)."""
        if chunk_id not in self.graph:
            return []
        try:
            ego = nx.ego_graph(self.graph, chunk_id, radius=depth)
        except Exception:
            return []
        return [
            n for n in ego.nodes
            if n != chunk_id and ego.nodes[n].get("type") == "chunk"
        ]

    def get_chunk_text_preview(self, chunk_id: str) -> Optional[str]:
        node = self.graph.nodes.get(chunk_id)
        return node.get("text_preview") if node else None

    def get_graph_stats(self) -> Dict[str, int]:
        def _count(t: str) -> int:
            return sum(1 for _, d in self.graph.nodes(data=True) if d.get("type") == t)

        return {
            "nodes": self.graph.number_of_nodes(),
            "edges": self.graph.number_of_edges(),
            "chunk_nodes": _count("chunk"),
            "domain_nodes": _count("domain"),
            "standard_nodes": _count("standard"),
        }

    def search(self, query: str, k: int = 5) -> List[Document]:
        """
        Entity-based retrieval without a vector store.

        Algorithm:
          1. Extract domains and standards from the query using RegexEntityExtractor.
          2. Score chunk nodes by how many entity categories they match
             (standards weighted higher than domains).
          3. If no entity matches, fall back to substring matching on text_preview.
          4. Return top-k chunks as LangChain Documents.
        """
        extractor = RegexEntityExtractor()
        entities = extractor.extract_all(query)

        scores: Dict[str, int] = {}

        for domain in entities.get("domains", []):
            for chunk_id in self._domain_index.get(domain, []):
                scores[chunk_id] = scores.get(chunk_id, 0) + 2

        for standard in entities.get("standards", []):
            for chunk_id in self._standard_index.get(standard, []):
                scores[chunk_id] = scores.get(chunk_id, 0) + 3

        # Fallback: substring match on stored text_preview
        if not scores:
            query_lower = query.lower()
            keywords = [w for w in query_lower.split() if len(w) > 3]
            for node_id, data in self.graph.nodes(data=True):
                if data.get("type") == "chunk":
                    preview = data.get("text_preview", "").lower()
                    hits = sum(1 for kw in keywords if kw in preview)
                    if hits:
                        scores[node_id] = hits

        top_chunks = sorted(scores, key=lambda c: scores[c], reverse=True)[:k]
        results = []
        for chunk_id in top_chunks:
            node_data = self.graph.nodes[chunk_id]
            results.append(Document(
                page_content=node_data.get("text_preview", ""),
                metadata={
                    "source": node_data.get("source", ""),
                    "file_name": node_data.get("file_name", ""),
                    "graph_chunk_id": chunk_id,
                },
            ))
        return results

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, dir_path: str) -> str:
        os.makedirs(dir_path, exist_ok=True)
        out_path = os.path.join(dir_path, self._GRAPH_FILENAME)
        data = nx.node_link_data(self.graph)
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, separators=(",", ":"))
        logger.info(f"KnowledgeGraph saved to {out_path} "
                    f"({self.graph.number_of_nodes()} nodes, "
                    f"{self.graph.number_of_edges()} edges)")
        return out_path

    @classmethod
    def load(cls, dir_path: str) -> "KnowledgeGraph":
        in_path = os.path.join(dir_path, cls._GRAPH_FILENAME)
        if not os.path.exists(in_path):
            raise FileNotFoundError(f"No graph file found at {in_path}")
        with open(in_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        kg = cls()
        kg.graph = nx.node_link_graph(data)
        # Rebuild inverted indexes
        for node, attrs in kg.graph.nodes(data=True):
            if attrs.get("type") == "chunk":
                for domain in attrs.get("domains", []):
                    kg._domain_index[domain].append(node)
                for standard in attrs.get("standards", []):
                    kg._standard_index[standard].append(node)
        logger.info(f"KnowledgeGraph loaded from {in_path}: {kg.get_graph_stats()}")
        return kg

    @classmethod
    def graph_path(cls, dir_path: str) -> str:
        return os.path.join(dir_path, cls._GRAPH_FILENAME)

    @classmethod
    def exists(cls, dir_path: str) -> bool:
        return os.path.exists(cls.graph_path(dir_path))


# ===========================================================================
# 3. GraphRAGRetriever
# ===========================================================================

class GraphRAGRetriever:
    """
    Pure Knowledge Graph retrieval — no vector store required.

    Algorithm (3 stages):
      1. Seed retrieval  – KnowledgeGraph.search(query, k=seed_k)
                           (entity-based scoring with substring fallback)
      2. Graph expansion – for each seed chunk_id, walk up to
                           ``expansion_depth`` hops to collect neighbor
                           chunk_ids and build Documents from stored text.
      3. Deduplication   – merge seed + expanded docs, return top ``final_k``.
    """

    def __init__(
        self,
        graph: KnowledgeGraph,
        seed_k: int = 5,
        expansion_depth: int = 1,
        final_k: int = 8,
    ) -> None:
        self.graph = graph
        self.seed_k = seed_k
        self.expansion_depth = expansion_depth
        self.final_k = final_k

    def retrieve(self, query: str) -> List[Document]:
        if self.graph is None:
            return []
        try:
            return self._graph_retrieve(query)
        except Exception as exc:
            logger.warning(f"GraphRAGRetriever failed ({exc}); returning empty context.")
            return []

    def _graph_retrieve(self, query: str) -> List[Document]:
        # Stage 1: seed retrieval via graph search
        seed_docs: List[Document] = self.graph.search(query, k=self.seed_k)

        # Stage 2: graph expansion
        seen_previews: set = set()
        all_docs: List[Document] = list(seed_docs)

        for doc in seed_docs:
            chunk_id = doc.metadata.get("graph_chunk_id")
            if not chunk_id:
                continue
            neighbor_ids = self.graph.get_neighbor_chunk_ids(
                chunk_id, depth=self.expansion_depth
            )
            for nid in neighbor_ids:
                preview = self.graph.get_chunk_text_preview(nid)
                if not preview or preview in seen_previews:
                    continue
                seen_previews.add(preview)
                node_data = self.graph.graph.nodes[nid]
                all_docs.append(Document(
                    page_content=preview,
                    metadata={
                        "source": node_data.get("source", ""),
                        "file_name": node_data.get("file_name", ""),
                        "graph_chunk_id": nid,
                    },
                ))

        # Stage 3: deduplicate by page_content prefix, preserve seed order
        final: List[Document] = []
        seen_content: set = set()
        for doc in all_docs:
            key = doc.page_content[:100]
            if key not in seen_content:
                seen_content.add(key)
                final.append(doc)
            if len(final) >= self.final_k:
                break

        return final[:self.final_k]


# ===========================================================================
# 4. RegulatoryControlGraph
# ===========================================================================

class RegulatoryControlGraph:
    """
    Per-comparison graph built from already-extracted control dicts
    (output of ControlExtractorAgent).  No additional LLM calls are needed
    — control dicts already contain all required fields.

    Node types:
      - ``"control"`` : one extracted control (id = ``"{source}::{control_id}::{idx}"``)
      - ``"domain"``  : control domain name

    Edge types:
      - ``"in_domain"``  : control → domain
      - ``"cross_doc"``  : control ↔ control  (across different source documents,
                           similarity ≥ threshold)
    """

    def __init__(self) -> None:
        self.graph: nx.DiGraph = nx.DiGraph()
        self._node_id_map: Dict[int, str] = {}  # python id(ctrl) → graph node id

    # ------------------------------------------------------------------
    # Building
    # ------------------------------------------------------------------

    def build_from_controls(self, controls: List[Dict]) -> None:
        for idx, ctrl in enumerate(controls):
            nid = f"{ctrl.get('source', 'unknown')}::{ctrl.get('control_id', idx)}::{idx}"
            self._node_id_map[id(ctrl)] = nid
            self.graph.add_node(
                nid,
                type="control",
                control_statement=ctrl.get("control_statement", ""),
                control_domain=ctrl.get("control_domain", "general"),
                risk_addressed=ctrl.get("risk_addressed", ""),
                enforcement_level=ctrl.get("enforcement_level", ""),
                source=ctrl.get("source", ""),
                stringency_scores=ctrl.get("stringency_scores", {}),
            )
            domain = ctrl.get("control_domain", "general")
            if not self.graph.has_node(domain):
                self.graph.add_node(domain, type="domain")
            self.graph.add_edge(nid, domain, rel="in_domain")

    def add_cross_document_links(
        self,
        controls: List[Dict],
        embedder: Any,
        sim_threshold: float = 0.68,
    ) -> int:
        """
        Embed control statements and add ``cross_doc`` edges between controls
        from *different* source documents whose cosine similarity ≥ threshold.

        This reuses the exact same embedder call that ``StringencyAnalyzerAgent.
        group_similar_controls()`` was already making — no extra cost.
        Returns the number of cross-document edges added.
        """
        from sklearn.metrics.pairwise import cosine_similarity as cos_sim  # local import

        if len(controls) < 2:
            return 0

        sources = [c.get("source", "") for c in controls]
        unique_sources = set(sources)
        if len(unique_sources) < 2:
            return 0  # nothing to cross-link if only one document

        statements = [c.get("control_statement", "") for c in controls]
        try:
            vecs = np.array(embedder.embed_documents(statements))
        except Exception as exc:
            logger.warning(f"RegulatoryControlGraph embedding failed: {exc}")
            return 0

        if vecs.ndim != 2 or vecs.shape[0] < 2:
            return 0

        sim_matrix = cos_sim(vecs)
        node_ids = [
            f"{controls[i].get('source', 'unknown')}::{controls[i].get('control_id', i)}::{i}"
            for i in range(len(controls))
        ]

        edges_added = 0
        for i in range(len(controls)):
            for j in range(i + 1, len(controls)):
                if sources[i] == sources[j]:
                    continue  # only cross-document
                if sim_matrix[i][j] >= sim_threshold:
                    self.graph.add_edge(
                        node_ids[i], node_ids[j],
                        rel="cross_doc",
                        similarity=float(sim_matrix[i][j]),
                    )
                    self.graph.add_edge(
                        node_ids[j], node_ids[i],
                        rel="cross_doc",
                        similarity=float(sim_matrix[i][j]),
                    )
                    edges_added += 1

        return edges_added

    # ------------------------------------------------------------------
    # Querying
    # ------------------------------------------------------------------

    def get_cross_doc_groups(self) -> List[List[Dict]]:
        """
        Return groups of controls linked via ``cross_doc`` edges.

        Uses ``nx.connected_components`` on the undirected projection of
        cross_doc edges — globally optimal grouping, unlike the greedy
        breadth-first scan it replaces.
        """
        undirected = nx.Graph()
        # Add all control nodes first so isolated ones appear as singletons
        for node, attrs in self.graph.nodes(data=True):
            if attrs.get("type") == "control":
                undirected.add_node(node, **attrs)

        # Add cross-doc edges
        for u, v, attrs in self.graph.edges(data=True):
            if attrs.get("rel") == "cross_doc":
                undirected.add_edge(u, v, **attrs)

        groups: List[List[Dict]] = []
        for component in nx.connected_components(undirected):
            group = []
            for nid in component:
                node_attrs = undirected.nodes.get(nid, {})
                if node_attrs.get("type") == "control":
                    group.append(dict(node_attrs))
            if group:
                groups.append(group)

        return groups

    def structural_similarity(
        self,
        source_a: str,
        source_b: str,
    ) -> Dict[str, float]:
        """
        Compare two regulatory documents structurally:
        - ``coverage``: fraction of domain nodes that *both* docs have controls in
        - ``cross_link_density``: cross_doc edges / (|controls_a| × |controls_b|)
        """
        controls_a = [
            n for n, d in self.graph.nodes(data=True)
            if d.get("type") == "control" and d.get("source") == source_a
        ]
        controls_b = [
            n for n, d in self.graph.nodes(data=True)
            if d.get("type") == "control" and d.get("source") == source_b
        ]

        def _domains_for(control_nodes: List[str]) -> set:
            ds: set = set()
            for n in control_nodes:
                for _, tgt, edata in self.graph.out_edges(n, data=True):
                    if edata.get("rel") == "in_domain":
                        ds.add(tgt)
            return ds

        domains_a = _domains_for(controls_a)
        domains_b = _domains_for(controls_b)
        all_domains = domains_a | domains_b
        shared_domains = domains_a & domains_b
        coverage = len(shared_domains) / len(all_domains) if all_domains else 0.0

        cross_edges = sum(
            1 for u, v, d in self.graph.edges(data=True)
            if d.get("rel") == "cross_doc"
            and self.graph.nodes[u].get("source") == source_a
            and self.graph.nodes[v].get("source") == source_b
        )
        denom = len(controls_a) * len(controls_b)
        cross_link_density = cross_edges / denom if denom else 0.0

        return {
            "coverage": round(coverage, 3),
            "cross_link_density": round(cross_link_density, 3),
            "shared_domains": len(shared_domains),
            "total_domains": len(all_domains),
            "cross_doc_links": cross_edges,
        }


# ===========================================================================
# 5. Convenience builder used by llm_chain.build_knowledge_base()
# ===========================================================================

def build_knowledge_graph_from_documents(
    all_documents: List[Document],
) -> KnowledgeGraph:
    """
    Build a KnowledgeGraph from a list of LangChain Documents.
    Injects ``graph_chunk_id`` back into each document's metadata so that
    GraphRAGRetriever can identify nodes by their chunk_id.
    """
    extractor = RegexEntityExtractor()
    kg = KnowledgeGraph()

    for doc in all_documents:
        text = doc.page_content
        chunk_id = KnowledgeGraph._chunk_id(text)
        entities = extractor.extract_all(text)
        kg.add_chunk(
            chunk_id=chunk_id,
            text=text,
            metadata=doc.metadata,
            domains=entities["domains"],
            standards=entities["standards"],
            obligations=entities["obligations"],
            metrics=entities["metrics"],
        )
        doc.metadata["graph_chunk_id"] = chunk_id

    edges_added = kg.build_co_occurrence_edges()
    stats = kg.get_graph_stats()
    logger.info(
        f"Knowledge graph built: {stats['nodes']} nodes, "
        f"{stats['edges']} edges ({edges_added} co-occurrence), "
        f"{stats['chunk_nodes']} chunk nodes."
    )
    return kg
