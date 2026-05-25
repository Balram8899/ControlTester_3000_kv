from __future__ import annotations

import json


def build_control_testing_prompt(session: dict, control: dict) -> str:
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
            "frequency": control.get("frequency", ""),
            "inherent_risk_rating": control.get("inherent_risk_rating", ""),
            "prior_period_result": control.get("prior_period_result", ""),
            "walkthrough_performed": control.get("walkthrough_performed", False),
            "test_steps": control.get("test_steps", []),
            "sampling": control.get("sampling", {}),
            "population_files": control.get("population_files", []),
            "evidence_files": control.get("evidence_files", []),
            "ca_answers": control.get("ca_answers", {}),
        },
    }

    return f"""You are a senior SOX ITGC auditor performing control testing.
Assess design and implementation (D&I) and operating effectiveness (OE) using the supplied control, samples, test steps, and mapped evidence.

Apply these rules:
- Use only the canonical JSON schema below.
- Use sample_results[].sample_num for the sample number.
- Use sample_results[].application for the application/system tested.
- Use sample_results[].item_reference for the sampled record, ticket, user, change, job, or policy reference.
- For each sample, produce step_results for every test step label or attribute_id.
- Prefer dynamic test attribute labels such as TA-001, TA-002, and TA-003. Do not assume A-I is the limit.
- Use PASS for no exception. Use X1, X2, X3, etc. for exceptions.
- Every X tickmark in sample_results[].step_results must have a matching exceptions[].ref.
- Reuse the same exception ref for repeated failures with the same root cause.
- Each exception must include ref, sample_num, description, root_cause, auditor_disposition, and issues_log_ref.
- If more than 20 percent of tested samples have exceptions, OE must be Ineffective and deficiencies_noted must be true.
- Return valid JSON only. Do not include prose outside the JSON object.

OUTPUT SCHEMA:
{{
  "todi_results": {{
    "design": {{"conclusion": "Effective|Ineffective", "rationale": "string"}},
    "implementation": {{"conclusion": "Effective|Ineffective", "rationale": "string"}}
  }},
  "sample_results": [{{
    "sample_num": 1,
    "application": "string",
    "item_reference": "string",
    "step_results": [{{
      "label": "TA-001",
      "tickmark": "PASS|X1",
      "notes": "string"
    }}]
  }}],
  "exceptions": [{{
    "ref": "X1",
    "sample_num": 1,
    "description": "string",
    "root_cause": "string",
    "auditor_disposition": "Issue drafted|No issue|Management response required",
    "issues_log_ref": null
  }}],
  "conclusions": {{
    "d_and_i": "Effective|Ineffective",
    "oe": "Effective|Ineffective",
    "deficiencies_noted": false,
    "rationale": "string",
    "issues_log_refs": []
  }},
  "testing_methods": {{
    "inquiry": false,
    "observation": false,
    "inspection": true,
    "reperformance": false
  }}
}}

DATA:
{json.dumps(data, indent=2)}"""
