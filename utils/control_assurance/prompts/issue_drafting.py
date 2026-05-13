from __future__ import annotations

import json


def build_issue_drafting_prompt(session: dict, control: dict, exceptions: list[dict]) -> str:
    data = {
        "assessment": {
            "title": session.get("title", ""),
            "entity": session.get("entity", ""),
            "testing_period": session.get("testing_period", {}),
            "framework": session.get("framework", ""),
        },
        "control": {
            "control_id": control.get("control_id", ""),
            "control_name": control.get("control_name") or control.get("name", ""),
            "control_type": control.get("control_type") or control.get("type", ""),
            "domain": control.get("domain", ""),
        },
        "exceptions": exceptions,
    }

    return f"""You are drafting audit issues from confirmed SOX ITGC testing exceptions.
Group exceptions by root cause where appropriate, and draft issues that can later be pushed into the TRACE Issues module.

Use only these issue fields:
- title
- severity
- summary
- detail
- root_cause
- recommendation
- issues_log_ref
- exception_refs

Return valid JSON only. Do not include prose outside the JSON object.

OUTPUT SCHEMA:
{{
  "issues": [{{
    "title": "string",
    "severity": "Low|Medium|High|Critical",
    "summary": "string",
    "detail": "string",
    "root_cause": "string",
    "recommendation": "string",
    "issues_log_ref": "CTI-001",
    "exception_refs": ["X1"]
  }}]
}}

DATA:
{json.dumps(data, indent=2)}"""
