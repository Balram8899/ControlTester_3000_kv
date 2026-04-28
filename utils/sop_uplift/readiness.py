from __future__ import annotations

from typing import Any

SOP_TAGS = {"sop", "procedure", "policy_procedure"}
CONTROL_TAGS = {"risk_control_matrix", "control_inventory", "control_data"}
RISK_TAGS = {"risk_register", "risk_event_data", "issue_log", "audit_report", "rcm_risk_data"}
EVIDENCE_TAGS = {"evidence", "control_test_evidence"}
DIAGRAM_TAGS = {"process_diagram", "diagram_reference"}

RECOMMENDED_INPUTS = [
    "risk_control_matrix",
    "risk_register",
    "control_inventory",
    "evidence",
    "process_diagram",
]


def _normalized_tags(document_tags: list[dict[str, Any]]) -> set[str]:
    tags: set[str] = set()
    for item in document_tags:
        tag = item.get("confirmed_tag") or item.get("suggested_tag") or item.get("tag")
        if isinstance(tag, str) and tag.strip():
            tags.add(tag.strip().lower())
    return tags


def _converted_files(uploaded_files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    converted = []
    for file in uploaded_files:
        conversion = file.get("conversion") or {}
        status = conversion.get("status") or file.get("conversion_status")
        if status in (None, "converted", "success"):
            converted.append(file)
    return converted


def compute_readiness(
    uploaded_files: list[dict[str, Any]] | None = None,
    document_tags: list[dict[str, Any]] | None = None,
    warnings: list[str] | None = None,
    unresolved_questions: int = 0,
) -> dict[str, Any]:
    uploaded_files = uploaded_files or []
    document_tags = document_tags or []
    warnings = list(warnings or [])

    tags = _normalized_tags(document_tags)
    converted_files = _converted_files(uploaded_files)
    converted_file_ids = {item.get("file_id") for item in converted_files if item.get("file_id")}

    if not tags and converted_files:
        bucket_tag_map = {
            "sops": "sop",
            "policies": "policy_procedure",
            "policies_and_procedures": "policy_procedure",
            "risk_control_matrices": "risk_control_matrix",
            "risk_registers": "risk_register",
            "control_inventories": "control_inventory",
            "evidence": "evidence",
            "diagrams": "process_diagram",
            "audit_reports": "audit_report",
        }
        tags = {
            bucket_tag_map[file.get("bucket")]
            for file in converted_files
            if bucket_tag_map.get(file.get("bucket"))
        }
    elif converted_file_ids:
        tags = {
            (item.get("confirmed_tag") or item.get("suggested_tag") or item.get("tag") or "").strip().lower()
            for item in document_tags
            if item.get("file_id") in converted_file_ids
        }
        tags.discard("")

    has_sop = bool(tags & SOP_TAGS)
    has_controls = bool(tags & CONTROL_TAGS)
    has_risks = bool(tags & RISK_TAGS)
    has_evidence_or_diagram = bool(tags & (EVIDENCE_TAGS | DIAGRAM_TAGS))

    failed_files = [
        file.get("filename") or file.get("file_id")
        for file in uploaded_files
        if (file.get("conversion") or {}).get("status") == "failed"
    ]
    if failed_files:
        warnings.append(f"{len(failed_files)} file conversion failed.")
    if unresolved_questions:
        warnings.append(f"{unresolved_questions} clarification question(s) remain unresolved.")

    missing = []
    if not has_controls:
        missing.extend(["risk_control_matrix", "control_inventory"])
    if not has_risks:
        missing.append("risk_register")
    if not bool(tags & EVIDENCE_TAGS):
        missing.append("evidence")
    if not bool(tags & DIAGRAM_TAGS):
        missing.append("process_diagram")
    missing = [item for item in RECOMMENDED_INPUTS if item in set(missing)]

    if not has_sop:
        return {
            "status": "not_ready",
            "can_analyze": False,
            "analysis_modes": [],
            "missing_recommended_inputs": missing,
            "warnings": warnings,
            "message": "Upload at least one SOP or procedure document before running SOP Uplift analysis.",
        }

    analysis_modes = ["sop_clarity", "testability", "ownership_frequency_evidence"]
    status = "minimum_ready"
    message = "SOP-only analysis is available. Add control and risk documents for deeper coverage."

    if has_controls:
        status = "control_ready"
        analysis_modes.extend(["control_alignment", "missing_control_review"])
        message = "SOP and control analysis is available. Add risk and evidence material for fuller coverage."
    if has_risks:
        status = "risk_ready"
        analysis_modes.extend(["risk_coverage", "control_gap_review"])
        message = "SOP and risk analysis is available. Add control, evidence, and diagram inputs for fuller coverage."
    if has_controls and has_risks and has_evidence_or_diagram:
        status = "full_ready"
        analysis_modes.extend(["evidence_coverage", "diagram_generation"])
        message = "Full SOP Uplift analysis is available for the uploaded case corpus."
    if warnings and status != "not_ready":
        status = "ready_with_warnings"

    return {
        "status": status,
        "can_analyze": True,
        "analysis_modes": sorted(set(analysis_modes)),
        "missing_recommended_inputs": missing,
        "warnings": warnings,
        "message": message,
    }

