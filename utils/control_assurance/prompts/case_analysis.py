from __future__ import annotations

import json


def build_case_analysis_prompt(session: dict, controls: list[dict]) -> str:
    data = {
        "assessment": {
            "title": session["title"],
            "entity": session["entity"],
            "testing_period": session["testing_period"],
            "framework": session["framework"],
        },
        "controls": [
            {
                "control_id": control["control_id"],
                "name": control["name"],
                "type": control["type"],
                "risk": control.get("risk", ""),
                "domain": control.get("domain", ""),
                "frequency": control.get("frequency", ""),
                "inherent_risk_rating": control.get("inherent_risk_rating", ""),
                "prior_period_result": control.get("prior_period_result", ""),
                "walkthrough_performed": control.get("walkthrough_performed", False),
                "sampling_mode": control.get("sampling_mode", "sample"),
                "test_steps": [
                    {"label": step["label"], "description": step["description"]}
                    for step in control.get("test_steps", [])
                ],
            }
            for control in controls
        ],
    }
    return f"""You are a senior IT audit manager reviewing a controls testing engagement before testing begins.
Your role is to:
1. Identify test coverage gaps or methodological concerns across the case.
2. Surface clarifying questions that need answering before testing starts.
3. Flag per-control concerns about sampling mode, evidence requirements, or step completeness.

Focus only on testing adequacy, not control design quality. Control design improvement is out of scope.

Return valid JSON only. Do not include prose outside the JSON object.

OUTPUT SCHEMA:
{{
  "case_questions": [{{"question_id": "uuid", "question": "string"}}],
  "controls": [{{
    "control_id": "string",
    "suggestions": [{{"suggestion_id": "uuid", "text": "string"}}],
    "questions": [{{"question_id": "uuid", "question": "string"}}]
  }}]
}}

DATA:
{json.dumps(data, indent=2)}"""
