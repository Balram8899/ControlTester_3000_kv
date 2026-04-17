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


def _run_5w1h_llm(controls: list[ControlInput]) -> list[dict[str, Any]]:
    """Call LLM to evaluate 5W1H quality for a batch of controls."""
    import json as _json
    import os
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain.schema import HumanMessage

    controls_text = "\n".join(
        f"- ID:{c.control_id} | Name:{c.name} | Description:{c.description}"
        for c in controls
    )
    prompt = W1H_PROMPT.format(controls_text=controls_text)

    llm = ChatGoogleGenerativeAI(
        model=os.environ.get("GOOGLE_LLM_MODEL", "gemini-2.0-flash"),
        google_api_key=os.environ.get("GOOGLE_API_KEY"),
    )
    response = llm.invoke([HumanMessage(content=prompt)])
    raw = response.content.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return _json.loads(raw)


@router.post("/quality-analysis")
def run_quality_analysis(body: QualityRequest):
    """Run 5W1H quality analysis on a batch of controls. Returns per-control results."""
    try:
        results = _run_5w1h_llm(body.controls)
    except Exception as e:
        logger.error(f"5W1H analysis failed: {e}")
        raise HTTPException(500, f"Quality analysis failed: {str(e)}")
    return {"results": results, "total": len(results)}
