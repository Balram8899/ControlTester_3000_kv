"""
5W1H Control Quality Analysis — backend persona.
Auto-triggered after control upload. Also callable directly via POST endpoint.
"""
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/controls-library", tags=["controls-quality"])

W1H_PROMPT = """You are a control quality evaluator using a 5W1H test for operational clarity and testability.

Assess each control against these six dimensions:
- What: Is the control activity clearly stated?
- Why: Is the control objective or risk intent clear?
- Who: Is a responsible actor or owner clear?
- When: Is the timing, cadence, or trigger clear?
- Where: Is the scope or operating context clear?
- How: Is the method or mechanism clear enough to understand how the control operates or would be evidenced?

For each dimension return only true (present) or false (absent).
Also provide:
- A short rationale (one sentence) for each dimension
- An overall quality score out of 6 (count of true dimensions)
- A RAG rating: green (5-6), amber (3-4), red (0-2)
- queue_finding: true if score <= 3 (should be raised as a quality issue)

Return a JSON array. One object per control. Each object:
{
  "control_id": "<id>",
  "control_name": "<name>",
  "what": true/false,
  "why": true/false,
  "who": true/false,
  "when": true/false,
  "where": true/false,
  "how": true/false,
  "score": 0-6,
  "rag": "green"|"amber"|"red",
  "rationale": {"what": "...", "why": "...", "who": "...", "when": "...", "where": "...", "how": "..."},
  "queue_finding": true/false
}

Controls to evaluate:
{controls_text}

Return ONLY the JSON array, no explanation."""


class ControlInput(BaseModel):
    control_id: str
    name: str
    description: str


class QualityRequest(BaseModel):
    controls: list[ControlInput]

    @field_validator("controls")
    @classmethod
    def at_least_one(cls, v: list) -> list:
        if not v:
            raise ValueError("controls list must not be empty")
        return v


BATCH_SIZE = 10


def _run_5w1h_llm(controls: list[ControlInput]) -> list[dict[str, Any]]:
    """Call LLM to evaluate 5W1H quality for a single batch of controls (max BATCH_SIZE)."""
    import json as _json
    import re as _re
    from langchain.schema import HumanMessage
    from utils.llm_provider import get_llm

    controls_text = "\n".join(
        f"- ID:{c.control_id} | Name:{c.name} | Description:{c.description}"
        for c in controls
    )
    prompt = W1H_PROMPT.replace("{controls_text}", controls_text)
    llm = get_llm()
    response = llm.invoke([HumanMessage(content=prompt)])
    raw = response.content.strip()
    # Strip markdown fences
    raw = _re.sub(r"^```[a-zA-Z]*\n?", "", raw)
    raw = _re.sub(r"\n?```$", "", raw).strip()
    # Extract JSON array even if LLM prepended explanation text
    match = _re.search(r"\[.*\]", raw, _re.DOTALL)
    if match:
        raw = match.group(0)
    result = _json.loads(raw)
    return result if isinstance(result, list) else [result]


def _run_5w1h_batched(inputs: list[ControlInput]) -> list[dict[str, Any]]:
    """Process controls in batches to avoid LLM context limits."""
    results: list[dict[str, Any]] = []
    for i in range(0, len(inputs), BATCH_SIZE):
        batch = inputs[i: i + BATCH_SIZE]
        try:
            results.extend(_run_5w1h_llm(batch))
        except Exception as e:
            logger.error(f"5W1H batch {i//BATCH_SIZE + 1} failed: {e}")
            # Emit placeholder entries so the caller still has all control IDs
            for c in batch:
                results.append({"control_id": c.control_id, "control_name": c.name,
                                 "what": False, "why": False, "who": False,
                                 "when": False, "where": False, "how": False,
                                 "score": 0, "rag": "red", "queue_finding": True,
                                 "rationale": {"what": "Analysis unavailable", "why": "Analysis unavailable",
                                               "who": "Analysis unavailable", "when": "Analysis unavailable",
                                               "where": "Analysis unavailable", "how": "Analysis unavailable"}})
    return results


def run_5w1h_for_controls(raw_controls: list[dict]) -> list[dict[str, Any]]:
    """Auto-trigger helper: accepts raw MongoDB control dicts, returns 5W1H results."""
    if not raw_controls:
        return []
    inputs = [
        ControlInput(
            control_id=c.get("control_id", str(c.get("_id", ""))),
            name=c.get("control_name", c.get("name", "")),
            description=c.get("description", ""),
        )
        for c in raw_controls
        if c.get("control_id") or c.get("_id")
    ]
    if not inputs:
        return []
    return _run_5w1h_batched(inputs)


@router.post("/quality-analysis")
def run_quality_analysis(body: QualityRequest):
    """Run 5W1H quality analysis on a batch of controls. Returns per-control results."""
    try:
        results = _run_5w1h_batched(body.controls)
    except Exception as e:
        logger.error(f"5W1H analysis failed: {e}")
        raise HTTPException(500, f"Quality analysis failed: {str(e)}")
    return {"results": results, "total": len(results)}
