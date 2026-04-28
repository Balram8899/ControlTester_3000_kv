from __future__ import annotations


def plan_extraction(document_tag: str) -> dict:
    routes = {
        "sop": ["sop_structure", "procedure_steps"],
        "procedure": ["sop_structure", "procedure_steps"],
        "policy_procedure": ["policy_requirements", "procedure_steps"],
        "risk_control_matrix": ["controls", "risks"],
        "risk_register": ["risks", "risk_events"],
        "control_inventory": ["controls"],
        "evidence": ["evidence"],
        "audit_report": ["issues_findings"],
        "process_diagram": ["diagram_references"],
    }
    return {"document_tag": document_tag, "extractors": routes.get(document_tag, ["general_context"])}
