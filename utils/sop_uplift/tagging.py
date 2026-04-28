from __future__ import annotations


def suggest_document_tag(file_metadata: dict, markdown: str = "") -> dict:
    filename = (file_metadata.get("filename") or "").lower()
    bucket = (file_metadata.get("bucket") or "").lower()
    text = markdown[:1000].lower()
    if "sop" in filename or "procedure" in filename or bucket in {"sops", "procedures"}:
        tag = "sop"
    elif "rcm" in filename or "risk/control" in text or "risk_control" in bucket:
        tag = "risk_control_matrix"
    elif "risk" in filename or "risk register" in text:
        tag = "risk_register"
    elif "control inventory" in text or "control" in filename:
        tag = "control_inventory"
    elif "evidence" in filename or "evidence" in bucket:
        tag = "evidence"
    elif "diagram" in filename or "process flow" in text:
        tag = "process_diagram"
    elif "audit" in filename or "finding" in text:
        tag = "audit_report"
    else:
        tag = "supporting_material"
    return {"file_id": file_metadata.get("file_id", ""), "suggested_tag": tag, "confirmed_tag": tag, "confidence": "high"}
