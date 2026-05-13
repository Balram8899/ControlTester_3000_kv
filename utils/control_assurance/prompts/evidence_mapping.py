from __future__ import annotations

import json


def build_evidence_mapping_prompt(control: dict, steps: list[dict], file_meta: dict) -> str:
    data = {"control": control, "test_steps": steps, "file": file_meta}
    return f"""You are an IT audit evidence analyst. Determine which test steps the evidence supports and identify the specific region to annotate.

For each mapped step provide:
- The step label.
- The supporting value found in the evidence.
- annotation_type: bbox for image/PDF pixel regions, cell for Excel row/column, or text_highlight for text substrings.
- Location in the format appropriate to annotation_type:
  bbox: {{"x": 0, "y": 0, "w": 0, "h": 0}} pixels from top-left.
  cell: {{"row": 0, "col": 0}} using zero-indexed coordinates.
  text_offset: {{"start": 0, "end": 0}} character positions.

Return valid JSON only. If a step cannot be matched, omit it from per_step.

OUTPUT SCHEMA:
{{
  "mapped_steps": ["A", "B"],
  "confidence": "high|medium|low",
  "per_step": [{{
    "step_label": "A",
    "supporting_value": "string",
    "annotation_type": "bbox|cell|text_highlight",
    "bbox": {{"x": 0, "y": 0, "w": 0, "h": 0}},
    "cell": {{"row": 0, "col": 0}},
    "text_offset": {{"start": 0, "end": 0}}
  }}]
}}

DATA:
{json.dumps(data, indent=2)}"""
