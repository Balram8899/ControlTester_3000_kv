from __future__ import annotations

import json


def build_sampling_prompt(control: dict, population: dict, user_mode: str | None) -> str:
    data = {"control": control, "population": population, "user_stated_mode": user_mode}
    return f"""You are an IT audit sampling specialist advising on the appropriate sampling methodology.
The auditor's stated preference takes precedence. Only flag a conflict if there is a material professional concern.

Consider:
- Inherent risk: high risk -> larger sample, prefer random.
- Frequency: continuous or daily -> larger population, statistical sampling preferred.
- Prior period: prior ineffective result -> increase sample size.
- Population size below 52 -> consider full population for annual controls.
- Additional sampling context may include auditor-approved exclusions. Treat the adjusted population count as the sampling base when supplied.

Return valid JSON only. Do not include prose outside the JSON object.

OUTPUT SCHEMA:
{{
  "recommended_strategy": "random|full|user_selected",
  "recommended_size": 25,
  "rationale": "string",
  "conflicts_with_user_input": false,
  "conflict_reason": "string|null"
}}

DATA:
{json.dumps(data, indent=2)}"""
