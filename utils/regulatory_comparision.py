import os
import json
import re
import numpy as np
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from collections import defaultdict
from datetime import datetime

from langchain_community.llms import Ollama
from langchain_community.embeddings import OllamaEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from sklearn.metrics.pairwise import cosine_similarity


# ------------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------------
SIM_THRESHOLD = 0.68  # Lowered slightly for better grouping
CHUNK_SIZE = 3000     # Increased for better context
CHUNK_OVERLAP = 600   # Increased overlap
OLLAMA_BASE_URL = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
OLLAMA_EMBEDDING_MODEL = os.getenv('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest')

# Control domain taxonomy - expanded to match analysis
CONTROL_DOMAINS = {
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
    "emerging_tech": ["api", "iot", "devops", "agile", "cloud", "virtualization"]
}


# ------------------------------------------------------------------
# UTILITY FUNCTIONS
# ------------------------------------------------------------------
def safe_json_loads(llm_output: str, default=None):
    """Safely extract JSON from LLM output."""
    if not llm_output or not llm_output.strip():
        return default

    llm_output = llm_output.strip()

    # Strip Qwen3 / DeepSeek thinking tokens (<think>...</think>)
    llm_output = re.sub(r"<think>.*?</think>", "", llm_output, flags=re.DOTALL | re.IGNORECASE).strip()

    llm_output = re.sub(r"```json|```", "", llm_output, flags=re.IGNORECASE).strip()

    # Try direct parse
    try:
        return json.loads(llm_output)
    except json.JSONDecodeError:
        pass

    # Try extracting first JSON object/array
    match = re.search(r"[\[{].*[\]}]", llm_output, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return default


def classify_domain(text: str) -> str:
    """Classify control into domain based on keywords."""
    text_lower = text.lower()
    scores = defaultdict(int)
    
    for domain, keywords in CONTROL_DOMAINS.items():
        for keyword in keywords:
            if keyword in text_lower:
                scores[domain] += 1
    
    if not scores:
        return "general"
    
    return max(scores.items(), key=lambda x: x[1])[0]


# ------------------------------------------------------------------
# ENHANCED AGENTS
# ------------------------------------------------------------------
class DocumentAnalyzerAgent:
    """Analyzes document structure and regulatory framework."""
    
    def __init__(self, model: str):
        self.llm = Ollama(model=model, base_url=OLLAMA_BASE_URL, temperature=0.1)

    def run(self, chunks: List, filenames: List[str]) -> Dict:
        # Sample chunks from each document
        doc_samples = defaultdict(list)
        for chunk in chunks[:50]:  # First 50 chunks for overview
            doc_samples[chunk.metadata["source"]].append(chunk.page_content[:500])
        
        analyses = {}
        for filename, samples in doc_samples.items():
            combined_text = "\n\n".join(samples[:5])
            
            prompt = f"""Analyze this regulatory document excerpt and return ONLY a JSON object with these exact fields:

{{
  "framework_name": "Official name of the framework",
  "issuing_authority": "Authority that issued it",
  "target_industry": "Primary industry (e.g., financial services, banking)",
  "regulatory_approach": "rules-based or principles-based",
  "key_focus_areas": ["area1", "area2", "area3"],
  "governance_model": "governance structure required",
  "enforcement_style": "prescriptive or flexible",
  "date_issued": "date if mentioned"
}}

Document: {filename}

Excerpt:
{combined_text}

Return ONLY the JSON object, no other text."""

            raw = self.llm.invoke(prompt)
            parsed = safe_json_loads(raw, default={
                "framework_name": filename,
                "issuing_authority": "Unknown",
                "target_industry": "Financial Services",
                "regulatory_approach": "Unknown",
                "key_focus_areas": [],
                "governance_model": "Not specified",
                "enforcement_style": "Unknown",
                "date_issued": "Unknown"
            })
            analyses[filename] = parsed
        
        return analyses


class ControlExtractorAgent:
    """Extracts risk controls with enhanced metadata, optionally enriched by KB context."""

    def __init__(self, model: str, kb_vectorstore=None, kb_graph=None):
        self.llm = Ollama(model=model, base_url=OLLAMA_BASE_URL, temperature=0.1)
        self.batch_size = 3  # Process multiple chunks together for context
        self.kb_vectorstore = kb_vectorstore
        self.kb_graph = kb_graph

    def _get_kb_context(self, batch_text: str) -> str:
        """Retrieve relevant KB context for a batch of text. Returns empty string on failure."""
        if self.kb_vectorstore is None:
            return ""
        try:
            from utils.graph_rag import GraphRAGRetriever
            retriever = GraphRAGRetriever(
                self.kb_vectorstore, self.kb_graph, seed_k=3, final_k=4
            )
            docs = retriever.retrieve(batch_text[:500])  # use first 500 chars as query
            if not docs:
                return ""
            snippets = [d.page_content[:300] for d in docs]
            return "\n---\n".join(snippets)
        except Exception as exc:
            print(f"[WARNING] KB context retrieval failed (non-fatal): {exc}")
            return ""

    def run(self, chunks: List) -> List[Dict]:
        controls = []

        # Process in batches for better context
        for i in range(0, len(chunks), self.batch_size):
            batch = chunks[i:i + self.batch_size]
            batch_text = "\n\n---CHUNK---\n\n".join([c.page_content for c in batch])

            # Fetch KB context to enrich the extraction prompt
            kb_context = self._get_kb_context(batch_text)
            kb_section = ""
            if kb_context:
                kb_section = f"""KNOWLEDGE BASE CONTEXT (relevant risk/control standards to guide classification):
{kb_context}

Use the above context to better identify and classify controls in the text below.

"""

            prompt = f"""{kb_section}Extract ALL cybersecurity and IT risk control requirements from this text.

For EACH control, return a JSON object with:
- control_id: sequential number
- control_statement: exact requirement (keep original wording)
- control_domain: one of [governance, access_control, cryptography, network_security, data_security, business_continuity, incident_response, third_party, change_management, audit, online_services, emerging_tech, va_pt, system_security, cyber_operations, technology_refresh]
- risk_addressed: what risk this mitigates
- enforcement_level: "mandatory", "recommended", or "optional"
- mandatory_keywords: list of words like ["shall", "must", "should", "may"]
- specificity_level: "specific" (has numbers/frequencies/metrics) or "general"
- implementation_guidance: "detailed" or "principle-based"
- frequency_specified: "yes" or "no"
- metric_specified: "yes" or "no"

Return a JSON array of controls. If no controls found, return [].

TEXT:
{batch_text}

Return ONLY the JSON array."""

            try:
                raw = self.llm.invoke(prompt)
                parsed = safe_json_loads(raw, default=[])

                if not isinstance(parsed, list):
                    parsed = []

                # Add metadata
                for control in parsed:
                    control["source"] = batch[0].metadata["source"]
                    control["chunk_index"] = i

                    # Auto-classify domain if not properly set
                    if control.get("control_domain") == "general" or not control.get("control_domain"):
                        control["control_domain"] = classify_domain(control.get("control_statement", ""))

                    controls.append(control)

            except Exception as e:
                print(f"Error processing batch {i}: {e}")
                continue

        return controls


class StringencyAnalyzerAgent:
    """Enhanced stringency analysis with multiple dimensions."""
    
    def __init__(self, embed_model=OLLAMA_EMBEDDING_MODEL):
        self.embedder = OllamaEmbeddings(
            model=embed_model,
            base_url=OLLAMA_BASE_URL
        )

    def calculate_stringency(self, control: Dict) -> Dict[str, float]:
        """Calculate multi-dimensional stringency score."""
        scores = {
            "prescriptiveness": 0.0,
            "measurability": 0.0,
            "enforcement": 0.0,
            "scope": 0.0,
            "independence": 0.0
        }
        
        statement = control.get("control_statement", "").lower()
        keywords = control.get("mandatory_keywords", [])
        
        # 1. Prescriptiveness (0-100)
        if "shall" in keywords or "must" in keywords:
            scores["prescriptiveness"] = 90
        elif "should" in keywords:
            scores["prescriptiveness"] = 60
        elif "may" in keywords or "recommended" in statement:
            scores["prescriptiveness"] = 30
        else:
            scores["prescriptiveness"] = 50
        
        # Boost for specific requirements
        if control.get("specificity_level") == "specific":
            scores["prescriptiveness"] += 10
        
        # 2. Measurability (0-100)
        if control.get("frequency_specified") == "yes":
            scores["measurability"] += 40
        if control.get("metric_specified") == "yes":
            scores["measurability"] += 40
        
        # Look for specific numbers
        if re.search(r'\d+\s*(months?|years?|days?|hours?|%|percent)', statement):
            scores["measurability"] += 20
        
        # 3. Enforcement (0-100)
        enforcement_map = {
            "mandatory": 100,
            "recommended": 60,
            "optional": 30
        }
        scores["enforcement"] = enforcement_map.get(
            control.get("enforcement_level", "").lower(), 50
        )
        
        # 4. Scope (0-100)
        statement_length = len(control.get("control_statement", ""))
        if statement_length > 200:
            scores["scope"] = 80
        elif statement_length > 100:
            scores["scope"] = 60
        else:
            scores["scope"] = 40
        
        # Boost for implementation guidance
        if control.get("implementation_guidance") == "detailed":
            scores["scope"] += 20
        
        # 5. Independence (0-100) - governance specific
        if control.get("control_domain") == "governance":
            independence_keywords = ["independent", "separate", "does not report", "no reporting"]
            if any(kw in statement for kw in independence_keywords):
                scores["independence"] = 90
            else:
                scores["independence"] = 50
        else:
            scores["independence"] = 50  # N/A for non-governance
        
        # Cap all scores at 100
        for key in scores:
            scores[key] = min(scores[key], 100)
        
        # Calculate weighted overall score
        weights = {
            "prescriptiveness": 0.25,
            "measurability": 0.25,
            "enforcement": 0.25,
            "scope": 0.15,
            "independence": 0.10
        }
        
        overall = sum(scores[k] * weights[k] for k in scores)
        scores["overall"] = round(overall, 2)
        
        return scores


    def group_similar_controls(self, controls: List[Dict]) -> List[List[Dict]]:
        """Group similar controls using embeddings."""
        if not controls or len(controls) < 2:
            return [[c] for c in controls]
        
        # Create embeddings
        statements = [c.get("control_statement", "") for c in controls]
        embeddings = np.array(self.embedder.embed_documents(statements))
        
        if embeddings.ndim != 2 or embeddings.shape[0] < 2:
            return [[c] for c in controls]
        
        # Calculate similarity
        sim_matrix = cosine_similarity(embeddings)
        
        # Group by domain first, then by similarity
        domain_groups = defaultdict(list)
        for i, control in enumerate(controls):
            domain = control.get("control_domain", "general")
            domain_groups[domain].append((i, control))
        
        final_groups = []
        
        for domain, items in domain_groups.items():
            if len(items) == 1:
                final_groups.append([items[0][1]])
                continue
            
            indices = [i for i, _ in items]
            visited = set()
            
            for idx in indices:
                if idx in visited:
                    continue
                    
                group = [controls[idx]]
                visited.add(idx)
                
                for other_idx in indices:
                    if other_idx not in visited and sim_matrix[idx][other_idx] >= SIM_THRESHOLD:
                        group.append(controls[other_idx])
                        visited.add(other_idx)
                
                if len(group) > 0:
                    final_groups.append(group)
        
        return final_groups


    def run(self, controls: List[Dict], reg_graph=None) -> Dict:
        """Run complete stringency analysis.

        Parameters
        ----------
        controls : list of control dicts (output of ControlExtractorAgent)
        reg_graph : optional RegulatoryControlGraph
            When provided, uses graph-based connected-components grouping
            (more accurate than the greedy cosine scan).  Falls back to
            ``group_similar_controls`` if reg_graph is None.
        """
        if not controls:
            return {
                "domain_analysis": {},
                "control_groups": [],
                "overall_stringency": {}
            }

        # Calculate stringency for each control
        for control in controls:
            control["stringency_scores"] = self.calculate_stringency(control)

        # Group controls – prefer graph-based grouping when available
        if reg_graph is not None:
            try:
                raw_groups = reg_graph.get_cross_doc_groups()
                # Each item in raw_groups is a list of node-attribute dicts.
                # We need to re-attach stringency_scores (already on the
                # control dicts, but graph nodes may have stale copies).
                # Build a lookup from control_statement[:100] → full control dict.
                stmt_lookup = {c.get("control_statement", "")[:100]: c for c in controls}
                groups = []
                for raw_group in raw_groups:
                    group = []
                    for node_attrs in raw_group:
                        key = node_attrs.get("control_statement", "")[:100]
                        matched = stmt_lookup.get(key)
                        if matched:
                            group.append(matched)
                        else:
                            # fallback: use node attrs directly
                            group.append(node_attrs)
                    if group:
                        groups.append(group)
            except Exception as exc:
                print(f"[WARNING] Graph grouping failed ({exc}), falling back to cosine grouping.")
                groups = self.group_similar_controls(controls)
        else:
            groups = self.group_similar_controls(controls)

        # Analyze each group
        analyzed_groups = []
        for group in groups:
            if not group:
                continue

            # Find most stringent control in group
            strongest = max(group, key=lambda x: x.get("stringency_scores", {}).get("overall", 0))
            strongest_overall = strongest.get("stringency_scores", {}).get("overall", 1) or 1

            # Calculate compliance percentages
            comparisons = []
            for ctrl in group:
                compliance_pct = min(
                    (ctrl.get("stringency_scores", {}).get("overall", 0) /
                     strongest_overall) * 100,
                    100
                )

                comparisons.append({
                    "source": ctrl.get("source", ""),
                    "control_statement": ctrl.get("control_statement", "")[:200] + "...",
                    "stringency_scores": ctrl.get("stringency_scores", {}),
                    "compliance_percentage": round(compliance_pct, 1)
                })

            analyzed_groups.append({
                "control_domain": strongest.get("control_domain", "general"),
                "risk_addressed": strongest.get("risk_addressed", "Not specified"),
                "most_stringent_source": strongest.get("source", ""),
                "most_stringent_control": strongest.get("control_statement", "")[:200] + "...",
                "baseline_stringency": strongest.get("stringency_scores", {}),
                "comparisons": comparisons,
                "group_size": len(group)
            })

        # Domain-level aggregation
        domain_analysis = self._analyze_by_domain(controls, analyzed_groups)

        # Overall stringency by source
        overall_stringency = self._calculate_overall_stringency(controls)

        result = {
            "domain_analysis": domain_analysis,
            "control_groups": analyzed_groups,
            "overall_stringency": overall_stringency,
            "total_controls": len(controls),
            "total_groups": len(analyzed_groups)
        }

        # Attach structural graph metrics when available
        if reg_graph is not None:
            try:
                sources = list({c.get("source", "") for c in controls if c.get("source")})
                if len(sources) >= 2:
                    result["graph_metrics"] = reg_graph.structural_similarity(
                        sources[0], sources[1]
                    )
            except Exception:
                pass

        return result


    def _analyze_by_domain(self, controls: List[Dict], groups: List[Dict]) -> Dict:
        """Aggregate stringency by domain."""
        domain_data = defaultdict(lambda: {
            "sources": defaultdict(list),
            "group_count": 0
        })
        
        for group in groups:
            domain = group["control_domain"]
            domain_data[domain]["group_count"] += 1
            
            for comparison in group["comparisons"]:
                source = comparison["source"]
                score = comparison["stringency_scores"]["overall"]
                domain_data[domain]["sources"][source].append(score)
        
        # Calculate averages
        result = {}
        for domain, data in domain_data.items():
            source_avgs = {}
            for source, scores in data["sources"].items():
                source_avgs[source] = round(np.mean(scores), 2)
            
            # Determine winner
            if source_avgs:
                winner = max(source_avgs.items(), key=lambda x: x[1])
                result[domain] = {
                    "control_groups": data["group_count"],
                    "source_scores": source_avgs,
                    "most_stringent": winner[0],
                    "winner_score": winner[1]
                }
        
        return result


    def _calculate_overall_stringency(self, controls: List[Dict]) -> Dict:
        """Calculate overall stringency by source."""
        source_scores = defaultdict(list)
        
        for ctrl in controls:
            source = ctrl["source"]
            overall_score = ctrl["stringency_scores"]["overall"]
            source_scores[source].append(overall_score)
        
        result = {}
        for source, scores in source_scores.items():
            result[source] = {
                "average_stringency": round(np.mean(scores), 2),
                "median_stringency": round(np.median(scores), 2),
                "control_count": len(scores),
                "score_distribution": {
                    "high (80-100)": sum(1 for s in scores if s >= 80),
                    "medium (60-79)": sum(1 for s in scores if 60 <= s < 80),
                    "low (0-59)": sum(1 for s in scores if s < 60)
                }
            }
        
        return result


class ReportGeneratorAgent:
    """Generates comprehensive comparison report."""
    
    def __init__(self, model: str):
        self.llm = Ollama(model=model, base_url=OLLAMA_BASE_URL, temperature=0.3)

    def run(self,
            document_analyses: Dict,
            stringency_analysis: Dict,
            filenames: List[str],
            gap_analysis: Optional[Dict] = None) -> str:

        # Create structured summary for LLM
        summary = {
            "documents_analyzed": filenames,
            "framework_characteristics": document_analyses,
            "stringency_findings": {
                "overall_scores": stringency_analysis.get("overall_stringency", {}),
                "domain_winners": {
                    domain: data.get("most_stringent")
                    for domain, data in stringency_analysis.get("domain_analysis", {}).items()
                },
                "total_control_groups": stringency_analysis.get("total_groups", 0)
            }
        }

        # Build gap analysis section for the prompt
        gap_section = ""
        if gap_analysis:
            gap_summary = gap_analysis.get("gap_summary", {})
            doc_gaps = gap_analysis.get("document_gaps", {})
            domain_cov = gap_analysis.get("domain_coverage", {})

            # Summarise per-doc missing domains
            missing_by_doc = {
                doc: info.get("missing_domains", [])
                for doc, info in doc_gaps.items()
                if info.get("missing_domains")
            }
            # Domains absent from at least one doc
            partial_domains = {
                d: info for d, info in domain_cov.items() if info.get("absent_in")
            }
            gap_section = f"""
GAP ANALYSIS DATA:
- Most gaps in: {gap_summary.get('most_gaps_in', 'N/A')}
- Best covered document: {gap_summary.get('best_covered', 'N/A')}
- Domains with universal coverage (all docs): {gap_summary.get('domains_with_universal_coverage', [])}
- Total domains identified: {gap_summary.get('total_domains_found', 0)}
- Shared control groups (present in every doc): {gap_summary.get('shared_control_groups', 0)}

Per-document missing domains:
{json.dumps(missing_by_doc, indent=2)}

Domains absent from at least one document:
{json.dumps({d: info['absent_in'] for d, info in partial_domains.items()}, indent=2)}
"""

        prompt = f"""You are a Chief Information Security Officer creating a regulatory comparison report.

Based on the analysis below, create a comprehensive report with these sections:

# Executive Summary
- Brief overview of frameworks compared
- Key finding: which framework is more stringent overall and by what percentage
- Critical differences highlighted

# Framework Overview
- Brief description of each framework
- Regulatory approach (rules-based vs principles-based)
- Target audience and scope

# Domain-by-Domain Comparison
For each domain, state:
- Which framework is more stringent
- By what margin
- Key differences
- Reasoning

# Commonalities
- Controls that are similar across frameworks
- Areas of alignment

# Differences
- Unique requirements in each framework
- Coverage gaps

# Compliance Gap Analysis
Use the gap analysis data below to be specific about:
- Which domains are covered by all documents vs. only some
- Per-document: which domains are missing entirely
- If complying with Framework A, what % compliance with Framework B (and vice versa)
- The most critical gaps to address

# Strategic Recommendations
- For organizations subject to both
- For organizations subject to only one
- Prioritization guidance based on identified gaps

# Conclusion
- Summary of key insights
- Best practice recommendation

ANALYSIS DATA:
{json.dumps(summary, indent=2)}

STRINGENCY DETAILS:
{json.dumps(stringency_analysis.get("domain_analysis", {}), indent=2)}
{gap_section}
Create a professional, detailed report in markdown format. Be specific with percentages and scores. Reference actual domain names and document names from the data. Provide reasoning for assessments."""

        report = self.llm.invoke(prompt)
        return report


class GapAnalyzerAgent:
    """Produces structured gap analysis from grouped controls."""

    def run(self, control_groups: List[Dict], filenames: List[str]) -> Dict:
        """
        Parameters
        ----------
        control_groups : output of StringencyAnalyzerAgent.run()["control_groups"]
        filenames      : list of source document names

        Returns
        -------
        dict with keys:
          domain_coverage  – per-domain presence/absence per doc
          document_gaps    – per-doc coverage summary and unique controls
          shared_controls  – groups where every doc is represented
          gap_summary      – high-level stats
        """
        all_domains: set = set()
        # domain -> set of docs that have at least one control in it
        domain_to_docs: Dict[str, set] = defaultdict(set)
        # doc -> set of domains covered
        doc_to_domains: Dict[str, set] = defaultdict(set)
        # doc -> list of control groups unique to it (only that doc present)
        doc_unique_groups: Dict[str, list] = defaultdict(list)
        # groups where all docs are present
        shared_groups: list = []

        for group in control_groups:
            domain = group.get("control_domain", "general")
            all_domains.add(domain)
            docs_in_group = {comp["source"] for comp in group.get("comparisons", [])}

            for doc in docs_in_group:
                domain_to_docs[domain].add(doc)
                doc_to_domains[doc].add(domain)

            if docs_in_group == set(filenames):
                shared_groups.append({
                    "domain": domain,
                    "group_size": group.get("group_size", len(docs_in_group)),
                    "docs_present": sorted(docs_in_group),
                    "representative_statement": group.get("most_stringent_control", "")
                })
            elif len(docs_in_group) == 1:
                sole_doc = next(iter(docs_in_group))
                doc_unique_groups[sole_doc].append({
                    "domain": domain,
                    "control_statement": group.get("most_stringent_control", ""),
                    "risk_addressed": group.get("risk_addressed", "")
                })

        # Build domain_coverage
        domain_coverage: Dict = {}
        for domain in sorted(all_domains):
            present = sorted(domain_to_docs[domain])
            absent = sorted(set(filenames) - domain_to_docs[domain])
            domain_coverage[domain] = {
                "present_in": present,
                "absent_in": absent,
                "coverage_pct": round(len(present) / len(filenames) * 100, 1) if filenames else 0.0
            }

        # Build document_gaps
        document_gaps: Dict = {}
        for doc in filenames:
            covered = sorted(doc_to_domains.get(doc, set()))
            missing = sorted(all_domains - doc_to_domains.get(doc, set()))
            document_gaps[doc] = {
                "covered_domains": covered,
                "missing_domains": missing,
                "domain_coverage_pct": round(len(covered) / len(all_domains) * 100, 1) if all_domains else 0.0,
                "unique_controls": doc_unique_groups.get(doc, [])
            }

        # gap_summary
        gap_counts = {doc: len(v["missing_domains"]) for doc, v in document_gaps.items()}
        coverage_pcts = {doc: v["domain_coverage_pct"] for doc, v in document_gaps.items()}
        universal_domains = [d for d, info in domain_coverage.items() if not info["absent_in"]]

        gap_summary = {
            "most_gaps_in": max(gap_counts, key=gap_counts.get) if gap_counts else None,
            "best_covered": max(coverage_pcts, key=coverage_pcts.get) if coverage_pcts else None,
            "domains_with_universal_coverage": universal_domains,
            "total_domains_found": len(all_domains),
            "shared_control_groups": len(shared_groups),
        }

        return {
            "domain_coverage": domain_coverage,
            "document_gaps": document_gaps,
            "shared_controls": shared_groups,
            "gap_summary": gap_summary,
        }


# ------------------------------------------------------------------
# ENHANCED PIPELINE
# ------------------------------------------------------------------
def compare_regulatory_documents(
    file_paths: List[str],
    filenames: List[str],
    selected_model: str,
    kb_vectorstore=None,
    kb_graph=None,
) -> Dict:
    """
    Enhanced regulatory comparison pipeline.

    Parameters
    ----------
    kb_vectorstore : optional pre-loaded global FAISS vectorstore
        When provided, used by ControlExtractorAgent to enrich extraction with
        relevant risk/control knowledge base context.
    kb_graph : optional pre-loaded KnowledgeGraph
        Passed alongside kb_vectorstore for graph-augmented retrieval.
    """
    print(f"[INFO] Starting analysis with model: {selected_model}")
    print(f"[INFO] Documents: {filenames}")
    if kb_vectorstore is not None:
        print("[INFO] Global KB vectorstore available — will enrich control extraction")
    else:
        print("[INFO] No global KB loaded — running without KB enrichment")

    # 1. Load documents
    docs = []
    for path, name in zip(file_paths, filenames):
        try:
            loader = PyPDFLoader(path) if path.endswith(".pdf") else TextLoader(path)
            loaded = loader.load()
            for d in loaded:
                d.metadata["source"] = name
            docs.extend(loaded)
            print(f"[INFO] Loaded {len(loaded)} pages from {name}")
        except Exception as e:
            print(f"[ERROR] Failed to load {name}: {e}")
            continue

    if not docs:
        return {
            "success": False,
            "error": "Failed to load any documents"
        }

    # 2. Split documents
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    chunks = splitter.split_documents(docs)
    print(f"[INFO] Created {len(chunks)} chunks")

    # 3. Initialize agents
    doc_analyzer = DocumentAnalyzerAgent(selected_model)
    control_extractor = ControlExtractorAgent(selected_model, kb_vectorstore=kb_vectorstore, kb_graph=kb_graph)
    stringency_analyzer = StringencyAnalyzerAgent()
    report_generator = ReportGeneratorAgent(selected_model)
    gap_analyzer = GapAnalyzerAgent()

    # 4. Analyze documents
    print("[INFO] Analyzing document frameworks...")
    document_analyses = doc_analyzer.run(chunks, filenames)

    # 5. Extract controls (KB-enriched when available)
    print("[INFO] Extracting risk controls...")
    controls = control_extractor.run(chunks)
    print(f"[INFO] Extracted {len(controls)} controls")
    
    if len(controls) < 5:
        print("[WARNING] Very few controls extracted, results may be limited")

    # 5.5 Build regulatory control graph (no extra LLM calls)
    reg_graph = None
    try:
        from utils.graph_rag import RegulatoryControlGraph
        print("[INFO] Building regulatory control graph...")
        reg_graph = RegulatoryControlGraph()
        reg_graph.build_from_controls(controls)
        n_cross_links = reg_graph.add_cross_document_links(
            controls, stringency_analyzer.embedder, sim_threshold=SIM_THRESHOLD
        )
        print(
            f"[INFO] Control graph built: {reg_graph.graph.number_of_nodes()} nodes, "
            f"{reg_graph.graph.number_of_edges()} edges, {n_cross_links} cross-doc links"
        )
    except Exception as graph_exc:
        print(f"[WARNING] Regulatory graph build failed ({graph_exc}), using cosine grouping.")
        reg_graph = None

    # 6. Analyze stringency (graph-enhanced when reg_graph is available)
    print("[INFO] Analyzing stringency...")
    stringency_analysis = stringency_analyzer.run(controls, reg_graph=reg_graph)

    # 6.5 Gap analysis
    print("[INFO] Running gap analysis...")
    gap_analysis = gap_analyzer.run(stringency_analysis.get("control_groups", []), filenames)
    print(
        f"[INFO] Gap analysis: {gap_analysis['gap_summary'].get('total_domains_found', 0)} domains found, "
        f"{len(gap_analysis['gap_summary'].get('domains_with_universal_coverage', []))} universally covered"
    )

    # 7. Generate report
    print("[INFO] Generating comprehensive report...")
    final_report = report_generator.run(
        document_analyses,
        stringency_analysis,
        filenames,
        gap_analysis=gap_analysis,
    )
    
    # 8. Compile results
    graph_metrics: Dict = {}
    if reg_graph is not None:
        try:
            sources = list({c.get("source", "") for c in controls if c.get("source")})
            graph_metrics = {
                "control_nodes": sum(
                    1 for _, d in reg_graph.graph.nodes(data=True)
                    if d.get("type") == "control"
                ),
                "total_nodes": reg_graph.graph.number_of_nodes(),
                "total_edges": reg_graph.graph.number_of_edges(),
                "cross_doc_links": sum(
                    1 for _, _, d in reg_graph.graph.edges(data=True)
                    if d.get("rel") == "cross_doc"
                ) // 2,  # undirected count (edges are bidirectional)
            }
            if len(sources) >= 2:
                graph_metrics["structural_similarity"] = reg_graph.structural_similarity(
                    sources[0], sources[1]
                )
        except Exception:
            graph_metrics = {}

    result = {
        "success": True,
        "analysis_timestamp": datetime.now().isoformat(),
        "model_used": selected_model,
        "documents": filenames,
        "document_analyses": document_analyses,
        "extracted_controls": len(controls),
        "control_groups": stringency_analysis.get("total_groups", 0),
        "stringency_analysis": stringency_analysis,
        "gap_analysis": gap_analysis,
        "final_report": final_report,
        "graph_metrics": graph_metrics,
        "metadata": {
            "chunks_processed": len(chunks),
            "pages_analyzed": len(docs),
            "similarity_threshold": SIM_THRESHOLD,
            "graph_enhanced": reg_graph is not None,
            "kb_enriched": kb_vectorstore is not None,
        }
    }

    print("[INFO] Analysis complete")
    return result


# ------------------------------------------------------------------
# OPTIONAL: Generate structured output files
# ------------------------------------------------------------------
def save_analysis_artifacts(result: Dict, output_dir: str = "./analysis_output"):
    """Save analysis results as structured files."""
    os.makedirs(output_dir, exist_ok=True)
    
    # Save full JSON
    with open(f"{output_dir}/full_analysis.json", "w") as f:
        json.dump(result, f, indent=2)
    
    # Save markdown report
    with open(f"{output_dir}/comparison_report.md", "w") as f:
        f.write(result.get("final_report", "No report generated"))
    
    # Save stringency summary
    stringency = result.get("stringency_analysis", {})
    with open(f"{output_dir}/stringency_summary.json", "w") as f:
        json.dump({
            "overall": stringency.get("overall_stringency", {}),
            "by_domain": stringency.get("domain_analysis", {})
        }, f, indent=2)
    
    print(f"[INFO] Analysis artifacts saved to {output_dir}")