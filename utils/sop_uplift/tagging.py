from __future__ import annotations

import re


def suggest_document_tag(file_metadata: dict, markdown: str = "") -> dict:
    filename = (file_metadata.get("filename") or "").lower()
    bucket = (file_metadata.get("bucket") or "").lower()
    text = f"{filename}\n{bucket}\n{markdown[:2000]}".lower()
    normalized_text = re.sub(r"[_\-/]+", " ", text)
    searchable_text = f"{text}\n{normalized_text}"

    if any(signal in searchable_text for signal in ("risk controls matrix", "risk control matrix", "risk/control", "risk_control", "controls matrix", "control matrix", "rcm")):
        tag = "risk_control_matrix"
    elif any(signal in searchable_text for signal in ("risk register", "risk event register", "risk inventory")) or bucket == "risk_registers":
        tag = "risk_register"
    elif any(signal in searchable_text for signal in ("control inventory", "control library", "control catalogue", "control catalog")) or bucket == "control_inventories":
        tag = "control_inventory"
    elif any(signal in searchable_text for signal in ("test evidence", "control evidence", "evidence pack", "evidence")) or bucket == "evidence":
        tag = "evidence"
    elif any(signal in searchable_text for signal in ("process diagram", "process flow", "swimlane", "flowchart", "diagram")) or bucket == "diagrams":
        tag = "process_diagram"
    elif any(signal in searchable_text for signal in ("audit report", "audit finding", "issue log", "finding")) or bucket == "audit_reports":
        tag = "audit_report"
    elif "policy" in filename or bucket == "procedures":
        tag = "policy"
    elif "sop" in filename or "procedure" in filename or bucket == "sops":
        tag = "sop"
    else:
        tag = "supporting_material"

    bucket_tag_map = {
        "sops": "sop",
        "procedures": "policy",
        "risk_control_matrices": "risk_control_matrix",
        "risk_registers": "risk_register",
        "control_inventories": "control_inventory",
        "evidence": "evidence",
        "diagrams": "process_diagram",
        "audit_reports": "audit_report",
    }
    confidence = "high" if bucket_tag_map.get(bucket) == tag else "medium"
    return {"file_id": file_metadata.get("file_id", ""), "suggested_tag": tag, "confirmed_tag": tag, "confidence": confidence}
