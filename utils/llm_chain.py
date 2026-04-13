import time
from utils.file_handlers import save_and_load_files
from utils.assessment_schema import Assessment
from concurrent.futures import ThreadPoolExecutor, as_completed
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.output_parsers import StrOutputParser
import logging
from langchain.schema import Document
from langchain.prompts import PromptTemplate
import re
from langchain.output_parsers import PydanticOutputParser
from pydantic import ValidationError
import os
import warnings
import json
import io
from PIL import Image, ImageDraw, ImageFont
from typing import Optional

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

GOOGLE_LLM_MODEL = os.getenv('GOOGLE_LLM_MODEL', 'gemini-3-flash-preview')
GOOGLE_EMBEDDING_MODEL = os.getenv('GOOGLE_EMBEDDING_MODEL', 'gemini-embedding-001')

# Maps Gemini LLM model names to their corresponding embedding model.
# Gemini chat models don't support embedContent, so we map them to a
# dedicated embedding model from the same generation.
_LLM_TO_EMBEDDING: dict[str, str] = {
    "gemini-2.0-flash":        "gemini-embedding-001",
    "gemini-2.0-flash-lite":   "gemini-embedding-001",
    "gemini-3-flash-preview":  "gemini-embedding-001",
    "gemini-1.5-pro":          "gemini-embedding-001",
    "gemini-1.5-flash":        "gemini-embedding-001",
}


def _resolve_embedding_model(selected_model: str | None) -> str:
    """Return the embedding model to use for a given LLM selection."""
    if selected_model:
        # If the caller passed an actual embedding model name, use it directly.
        if "embed" in selected_model.lower():
            return selected_model
        # Otherwise map the LLM model to its embedding counterpart.
        return _LLM_TO_EMBEDDING.get(selected_model, GOOGLE_EMBEDDING_MODEL)
    return GOOGLE_EMBEDDING_MODEL


def _make_llm(model: str | None = None, temperature: float = 0.1):
    """Return a string-producing LLM (drop-in for OllamaLLM)."""
    return ChatGoogleGenerativeAI(
        model=model or GOOGLE_LLM_MODEL,
        google_api_key=os.getenv("GOOGLE_API_KEY"),
        temperature=temperature,
    ) | StrOutputParser()


def _make_embeddings(model: str | None = None):
    """Return GoogleGenerativeAIEmbeddings (drop-in for OllamaEmbeddings)."""
    return GoogleGenerativeAIEmbeddings(
        model=model or GOOGLE_EMBEDDING_MODEL,
        google_api_key=os.getenv("GOOGLE_API_KEY"),
    )

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)


def initialize(selected_model: str, embedding_model: str | None = None):
    """
    Initialize LLM (and optionally embeddings) using provided models.
    """
    global llm
    global embeddings
    llm = _make_llm(selected_model)
    embeddings = _make_embeddings(embedding_model or _resolve_embedding_model(selected_model))


text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,
    chunk_overlap=100,
    length_function=len,
    add_start_index=True,
    separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""]
)


# ─────────────────────────────────────────────────────────────────────────────
# KNOWLEDGE BASE BUILDER
# ─────────────────────────────────────────────────────────────────────────────

def enrich_chunk_with_metadata(text: str, metadata: dict) -> str:
    header = f"""
    [DOCUMENT METADATA]
    File Name: {metadata.get("file_name", metadata.get("source", "Unknown"))}
    File Type: {metadata.get("file_type", "Unknown")}
    Document Category: {metadata.get("doc_category", "Unknown")}
    Source: {metadata.get("source", "Unknown")}
    Control Domain: {metadata.get("control_domain", "N/A")}
    System / Technology: {metadata.get("system", "N/A")}
    Section: {metadata.get("section", "Unknown")}
    Effective Date: {metadata.get("effective_date", "Unknown")}
    Confidentiality Level: {metadata.get("confidentiality", "Unknown")}
    ---
    """
    return header.strip() + "\n\n[CONTENT]\n" + text.strip()


def build_knowledge_base(
    files,
    source,
    selected_model=None,
    **kwargs,
):
    """Build a KnowledgeGraph from uploaded files.

    Returns the KnowledgeGraph, or None if no valid content was found.
    """
    start = time.time()
    all_documents = []

    docs = save_and_load_files(files, source)

    for i, doc in enumerate(docs):
        try:
            if not doc.page_content.strip():
                continue
            splits = text_splitter.split_text(doc.page_content)
            meta = getattr(doc, "metadata", {}) if hasattr(doc, "metadata") else {}

            for split in splits:
                enriched_text = enrich_chunk_with_metadata(split, meta)
                all_documents.append(
                    Document(page_content=enriched_text, metadata=meta)
                )
        except Exception as e:
            logger.error(f"Error processing document {i}: {e}")

    if not all_documents:
        raise ValueError("No valid content found in input documents.")

    logger.info(f"Building knowledge graph from {len(all_documents)} document chunks.")

    try:
        from utils.graph_rag import build_knowledge_graph_from_documents
        knowledge_graph = build_knowledge_graph_from_documents(all_documents)
    except Exception as graph_exc:
        logger.warning(f"Knowledge graph build failed: {graph_exc}")
        return None

    total_time = time.time() - start
    logger.info(f"Knowledge base built in {total_time:.2f} seconds.")
    return knowledge_graph


# ─────────────────────────────────────────────────────────────────────────────
# EVIDENCE ASSESSMENT
# ─────────────────────────────────────────────────────────────────────────────

def extract_and_validate_json(text):
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if not match:
        raise ValueError("No JSON object found in LLM output.")
    json_str = match.group(0)
    json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
    json_str = json_str.replace("'", '"')
    try:
        return json.loads(json_str)
    except Exception as e:
        raise ValueError(f"Could not parse JSON after cleaning: {e}")


def _retrieve_controls_from_graph(
    evid_text: str,
    controls_lib_graph,
    max_results: int = 8,
) -> str:
    """
    Query the Controls Library knowledge graph directly (no FAISS) to find
    relevant controls based on domain and standard matching with evidence text.
    Returns a newline-joined string of control text previews, or "" if none found.
    """
    try:
        from utils.graph_rag import RegexEntityExtractor
        extractor = RegexEntityExtractor()
        domains = extractor.extract_domains(evid_text)
        standards = extractor.extract_standards(evid_text)

        chunk_ids: set = set()
        for domain in domains:
            chunk_ids.update(controls_lib_graph._domain_index.get(domain, []))
        for standard in standards:
            chunk_ids.update(controls_lib_graph._standard_index.get(standard, []))

        # If no domain/standard match, sample all chunk nodes (limited)
        if not chunk_ids:
            chunk_ids = {
                nid for nid, data in controls_lib_graph.graph.nodes(data=True)
                if data.get("type") == "chunk"
            }

        # BFS expansion — collect neighbors (depth=1)
        expanded: set = set(chunk_ids)
        for cid in list(chunk_ids):
            expanded.update(
                controls_lib_graph.get_neighbor_chunk_ids(cid, depth=1)
            )

        texts = []
        for cid in list(expanded)[:max_results]:
            preview = controls_lib_graph.get_chunk_text_preview(cid)
            if preview:
                texts.append(preview)

        return "\n\n".join(texts)
    except Exception as exc:
        logger.warning(f"Controls library graph retrieval failed (non-fatal): {exc}")
        return ""


def _assess_single_evidence(
    evid_text: str,
    selected_model: str,
    chunk_index: int = 0,
    doc_index: int = 0,
    filename: str = "N/A",
    evidence_context: str | None = None,
    kb_graph=None,
    company_kb_graph=None,
    controls_lib_graph=None,
):
    """
    Assess a single evidence chunk against the knowledge bases using
    pure knowledge-graph retrieval (no vector store).
    """
    initialize(selected_model)

    try:
        parser = PydanticOutputParser(pydantic_object=Assessment)

        from utils.graph_rag import GraphRAGRetriever

        if kb_graph is not None:
            retriever = GraphRAGRetriever(kb_graph, seed_k=5, final_k=8)
            base_contexts = retriever.retrieve(evid_text)
            knowledge_base_context = "\n\n".join(
                getattr(c, "page_content", str(c)) for c in base_contexts
            )
        else:
            knowledge_base_context = "Global policy knowledge base not available."

        if company_kb_graph is not None:
            company_retriever = GraphRAGRetriever(company_kb_graph, seed_k=5, final_k=8)
            company_contexts = company_retriever.retrieve(evid_text)
            company_knowledge_base_context = "\n\n".join(
                getattr(c, "page_content", str(c)) for c in company_contexts
            )
        else:
            company_knowledge_base_context = "Company-specific knowledge base not available."

        # ── Controls Library graph retrieval (pure graph, no FAISS) ────────
        controls_library_section = ""
        if controls_lib_graph is not None:
            cl_context = _retrieve_controls_from_graph(evid_text, controls_lib_graph)
            if cl_context:
                controls_library_section = (
                    "### CONTROLS LIBRARY (Internal Controls Reference)\n"
                    "The following controls are from the organization's Controls Library. "
                    "Use them to anchor your assessment to known internal control objectives "
                    "and identify whether the evidence satisfies them:\n\n"
                    f"{cl_context}\n\n"
                    "---\n"
                )

        # ── BUG 1 FIX: build control-context section when available ────────
        control_context_section = ""
        if evidence_context:
            control_context_section = f"""
            ### CONTROL BEING TESTED
            The following control definition describes exactly what you must assess.
            Map your findings directly to this control's objectives and evidence requirements.

            {evidence_context}

            ---
            """

        prompt = PromptTemplate(
            template="""
            You are a cybersecurity audit analyst responsible for creating audit workbooks
            and performing evidence-based risk and control assessments.

            You have access to the following context sources:

            ### GLOBAL RISK AND CONTROL STANDARDS
            {knowledge_base_context}

            ### COMPANY-SPECIFIC RISK AND CONTROL STANDARDS (CRI PROFILE)
            {company_knowledge_base_context}

            {controls_library_section}

            {control_context_section}

            You must assess the following evidence snippet:

            ### EVIDENCE SNIPPET
            {evid_text}

            ---

            ## INSTRUCTIONS

            ### 1. CONTROL FRAMEWORK ALIGNMENT
            - Compare global standards with company-specific controls.
            - Identify gaps, overlaps, or conflicts.
            - Prioritize based on criticality and regulatory impact.
            - Create a unified control testing matrix.

            ### 2. EVIDENCE ANALYSIS
            - Categorize the evidence by control domain
              (e.g., access control, data protection).
            - Map evidence to specific control objectives.
            - Assess completeness, implementation, and effectiveness.
            - Highlight any missing or insufficient documentation.

            ### 3. LOG ANALYSIS FOCUS
            - Identify relevant control testing statements from the
              COMPANY-SPECIFIC RISK AND CONTROL STANDARDS (CRI PROFILE).
            - Evaluate whether the relevant policies are being enforced effectively.
            - Match log entries to expected behaviours based on standards.
            - Determine compliance status and associated risk.
            - Provide a clear rationale and suggest improvements.

            ### 4. CONTROL TESTING METHODOLOGY
            - Design Adequacy: Does the policy/control meet expectations?
            - Implementation: Has it been applied correctly?
            - Effectiveness: Is it working consistently?
            - Compensating Controls: If gaps exist, what alternatives are in place?

            ### 5. RISK ASSESSMENT STRATEGY
            - Use quantitative metrics if available.
            - Apply qualitative judgment where metrics are missing.
            - Consider interdependent risks and the current threat landscape.

            ### 6. WHEN FACED WITH CONFLICT OR INSUFFICIENT EVIDENCE
            - Prefer regulatory/global standards over internal policy.
            - Escalate major interpretation issues.
            - Document limitations if evidence is incomplete.
            - Suggest additional evidence or compensating controls.

            ---

            ## OUTPUT FORMAT (REQUIRED)

            Return your answer strictly as a JSON object matching the schema:

            {format_instructions}

            ### FIELD-BY-FIELD OUTPUT EXPECTATIONS

            **1. CONTROL STATEMENT**
            - Extract the exact control statement (verbatim) from the
              COMPANY-SPECIFIC RISK AND CONTROL STANDARDS (CRI PROFILE)
              most relevant to the evidence.
              If the control being tested is provided above, use that.

            **2. ASSESSMENT RESULT**
            - Compliance Status: COMPLIANT | NON-COMPLIANT | PARTIALLY COMPLIANT
            - Risk Level: CRITICAL | HIGH | MEDIUM | LOW

            **3. LOG EVIDENCE**
            - Source File: Name of the evidence file being assessed.
            - Relevant Log Entries: Log lines (with timestamps) supporting the
              assessment.

            **4. ASSESSMENT RATIONALE**
            - For NON-COMPLIANT: provide Why_it_failed, Gap_analysis, Impact.
            - For COMPLIANT: provide Evidence_of_compliance and
              Effectiveness_assessment.

            **5. IMPROVEMENT RECOMMENDATIONS**
            - Mandatory Improvements (if non-compliant): corrective actions with
              references and timelines.
            - Enhancement Opportunities: optional improvements even if compliant,
              referencing global best practices.

            ---

            ### IMPORTANT:
            - Respond ONLY with a valid JSON object matching the schema exactly.
            - Do NOT include explanations, markdown, or commentary.
            - Use "" for any missing string and [] for any missing list.
            - Ensure the object can be parsed directly into the Pydantic model.

            Perform an exhaustive and comprehensive assessment.
            """,
            input_variables=[
                "knowledge_base_context",
                "company_knowledge_base_context",
                "controls_library_section",
                "evid_text",
                "control_context_section",   # ← new variable (BUG 1 fix)
            ],
            partial_variables={"format_instructions": parser.get_format_instructions()},
        )

        formatted_prompt = prompt.format(
            knowledge_base_context=knowledge_base_context,
            company_knowledge_base_context=company_knowledge_base_context,
            controls_library_section=controls_library_section,
            evid_text=evid_text,
            control_context_section=control_context_section,   # ← BUG 1 fix
        )

        response = llm.invoke(formatted_prompt)
        parsed = parser.parse(response)

        return {"assessment": parsed.json()}

    except ValidationError as ve:
        logging.error(f"Validation failed for chunk {chunk_index} (doc {doc_index}): {ve}")
        return {"assessment": f"ValidationError: {ve}"}
    except Exception as e:
        logging.error(f"Assessment failed for chunk {chunk_index} (doc {doc_index}): {e}")
        return {"assessment": f"Error: {e}"}


def render_text_to_image(evidence_docs, font_size=14, width=1200, bg_color="white", text_color="black"):
    evidence_docs_content = "\n\n".join(
        f"Doc {i}:\n{getattr(doc, 'page_content', str(doc))[:2000]}"
        for i, doc in enumerate(evidence_docs)
    )

    try:
        font = ImageFont.truetype("DejaVuSansMono.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()

    lines = evidence_docs_content.splitlines()
    bbox = font.getbbox("A")
    line_height = (bbox[3] - bbox[1]) + 2
    img_height = line_height * (len(lines) + 2)
    img = Image.new("RGB", (width, img_height), color=bg_color)
    draw = ImageDraw.Draw(img)
    y = 5
    for line in lines:
        draw.text((5, y), line, font=font, fill=text_color)
        y += line_height
    return img


def assess_evidence_with_kb(
    evidence_files,
    selected_model: str,
    max_workers: int = 4,
    evidence_context: str | None = None,
    kb_graph=None,
    company_kb_graph=None,
    controls_lib_graph=None,
):
    """Split evidence files into chunks and assess each against the knowledge graphs."""
    start = time.time()
    evid_texts, chunk_origin = [], []

    evidence_docs = save_and_load_files(evidence_files, "Evidence Assessment result")
    for i, doc in enumerate(evidence_docs):
        try:
            if not doc.page_content.strip():
                logger.warning(f"Evidence document {i} is empty and skipped.")
                continue
            splits = text_splitter.split_text(doc.page_content)
            evid_texts.extend(splits)
            chunk_origin.extend([i] * len(splits))
            logger.info(f"Evidence document {i} split into {len(splits)} chunks.")
        except Exception as e:
            logger.error(f"Error splitting evidence document {i}: {e}")

    if not evid_texts:
        logger.warning("No valid evidence found.")
        return []

    logger.info(f"Assessing {len(evid_texts)} evidence chunks using {max_workers} threads…")

    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(
                _assess_single_evidence,
                evid_texts[i],      # evid_text
                selected_model,     # selected_model
                i,                  # chunk_index
                chunk_origin[i],    # doc_index
                "N/A",              # filename
                evidence_context,   # evidence_context
                kb_graph,           # kb_graph
                company_kb_graph,   # company_kb_graph
                controls_lib_graph, # controls_lib_graph
            )
            for i in range(len(evid_texts))
        ]
        for future in as_completed(futures):
            results.append(future.result())

    logger.info(f"Assessment completed in {time.time() - start:.2f} seconds.")
    return results


# ─────────────────────────────────────────────────────────────────────────────
# EXECUTIVE SUMMARY
# ─────────────────────────────────────────────────────────────────────────────

def generate_executive_summary(assessments, selected_model):
    all_text = "\n\n".join(
        json.dumps(a["assessment"], indent=2)
        if isinstance(a["assessment"], dict)
        else str(a["assessment"])
        for a in assessments
        if "assessment" in a
    )
    initialize(selected_model)
    prompt = f"""
You are a cybersecurity audit assistant. Given the following detailed control
assessments, produce an Executive Summary section for an audit report.
Your summary must include:
- Overall risk assessment and control maturity rating
- Key findings summary with high/medium/low risk classifications
- Critical recommendations requiring immediate attention

Assessments:
{all_text}

Write the summary in clear, professional language.
Do not include your thought statements.
"""
    summary = llm.invoke(prompt)
    return {"executive_summary": summary}