from pydantic import BaseModel

from utils.sop_uplift.analysis_engine import generate_rule_based_suggestions
from utils.sop_uplift.case_chat import capture_context_from_message
from utils.sop_uplift.corpus_map import build_case_corpus_map
from utils.sop_uplift.extraction_router import plan_extraction
from utils.sop_uplift.extractors import extract_sop_structure
from utils.sop_uplift.markdown_ingestion import convert_bytes_to_markdown
from utils.sop_uplift.preview_renderer import build_preview_model
from utils.sop_uplift.retrieval import retrieve_context
from utils.sop_uplift.schema_validation import validate_payload
from utils.sop_uplift.tagging import suggest_document_tag
from utils.sop_uplift.task_store import InMemoryTaskStore


class DemoSchema(BaseModel):
    name: str


def test_planned_sop_uplift_modules_expose_deterministic_v1_behaviors():
    conversion = convert_bytes_to_markdown(b"# SOP\n\nOwner reviews access.", "access_sop.md")
    tag = suggest_document_tag({"filename": "access_sop.md", "bucket": "sops"}, conversion.markdown)
    extraction_plan = plan_extraction(tag["confirmed_tag"])
    sop = extract_sop_structure(conversion.markdown, anchors=[{"anchor_id": "a1", "text": "Owner reviews access."}])
    corpus = build_case_corpus_map(
        {"process_name": "Access reviews"},
        document_tags=[tag],
        controls=[],
        risks=[],
        requirements=[],
        evidence_items=[],
        issues_findings=[],
        diagram_references=[],
        case_chat_context=[],
    )
    retrieved = retrieve_context("owner access", [{"chunk_id": "c1", "content": "Owner reviews access quarterly.", "anchor_ids": ["a1"]}])
    suggestions = generate_rule_based_suggestions([{"anchor_id": "a1", "text": "Owner reviews access."}])
    preview = build_preview_model([{"document_id": "d1", "markdown": conversion.markdown}], [{"anchor_id": "a1", "text": "Owner reviews access."}], suggestions)
    captured = capture_context_from_message("Operations Risk reviews exceptions weekly.")
    validated = validate_payload({"name": "ok"}, DemoSchema)
    tasks = InMemoryTaskStore()
    task = tasks.create("case-1", "analysis")

    assert conversion.status == "converted"
    assert tag["confirmed_tag"] == "sop"
    assert extraction_plan["extractors"] == ["sop_structure", "procedure_steps"]
    assert sop["sections"][0]["anchor_id"] == "a1"
    assert corpus["primary_process"] == "Access reviews"
    assert retrieved[0]["chunk_id"] == "c1"
    assert suggestions[0]["anchor_id"] == "a1"
    assert preview["highlights"][0]["anchor_id"] == "a1"
    assert captured["type"] == "frequency"
    assert validated.name == "ok"
    assert tasks.get(task["task_id"])["status"] == "running"
