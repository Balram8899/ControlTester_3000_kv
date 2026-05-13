from __future__ import annotations

import json


def build_workpaper_narrative_prompt(session: dict, control: dict) -> str:
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
            "test_steps": control.get("test_steps", []),
            "todi_results": control.get("todi_results", {}),
            "sample_results": control.get("sample_results", []),
            "exceptions": control.get("exceptions", []),
            "conclusions": control.get("conclusions", {}),
            "testing_methods": control.get("testing_methods", {}),
        },
    }

    return f"""You are preparing an audit workpaper narrative for a completed SOX ITGC control test.
Write concise, audit-ready statements based only on the testing results provided.

Return valid JSON only. Do not include prose outside the JSON object.

OUTPUT SCHEMA:
{{
  "testing_summary": "string",
  "d_and_i_statement": "string"
}}

DATA:
{json.dumps(data, indent=2)}"""
