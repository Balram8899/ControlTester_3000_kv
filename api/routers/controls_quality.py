"""
5W1H Control Quality Analysis — backend persona.
Auto-triggered after control upload. Also callable directly via POST endpoint.
Results are cached in MongoDB so subsequent calls are instant.
"""
import asyncio
import logging
import time
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


BATCH_SIZE = 50


# ------------------------------------------------------------------
# MongoDB quality cache
# ------------------------------------------------------------------
class MongoQualityStore:
    """Lightweight cache for 5W1H quality results keyed by control_id."""

    def __init__(self):
        try:
            from pymongo import MongoClient
            import os

            uri = os.environ.get("MONGODB_URI", "mongodb://mongodb:27017")
            self._client = MongoClient(uri, serverSelectionTimeoutMS=5000)
            self._client.admin.command("ping")
            self._db = self._client["controltester"]
            self._col = self._db["control_quality"]
            self._col.create_index("control_id", unique=True)
            logger.info("MongoQualityStore connected")
        except Exception as exc:
            logger.error(f"MongoQualityStore connection failed: {exc}")
            self._client = None
            self._col = None

    @property
    def is_connected(self) -> bool:
        return self._col is not None

    def _require_connection(self):
        if not self.is_connected:
            raise RuntimeError("MongoQualityStore not connected")

    def get(self, control_id: str) -> dict[str, Any] | None:
        self._require_connection()
        doc = self._col.find_one({"control_id": control_id}, {"_id": 0})
        return doc

    def get_many(self, control_ids: list[str]) -> dict[str, dict[str, Any]]:
        self._require_connection()
        docs = list(self._col.find({"control_id": {"$in": control_ids}}, {"_id": 0}))
        return {d["control_id"]: d for d in docs}

    def save(self, control_id: str, result: dict[str, Any]) -> None:
        self._require_connection()
        doc = dict(result)
        doc["control_id"] = control_id
        doc["cached_at"] = time.time()
        self._col.replace_one({"control_id": control_id}, doc, upsert=True)

    def save_many(self, results: list[dict[str, Any]]) -> None:
        self._require_connection()
        for r in results:
            cid = r.get("control_id")
            if cid:
                self.save(cid, r)


# ------------------------------------------------------------------
# LLM helpers
# ------------------------------------------------------------------
def _extract_json_array(text: str) -> str:
    """Extract the first well-formed JSON array from LLM output."""
    import re as _re

    text = text.strip()
    # Remove markdown fences
    text = _re.sub(r"^```[a-zA-Z]*\n?", "", text)
    text = _re.sub(r"\n?```$", "", text).strip()

    # Find the first '[' and try to find its matching ']'
    start = text.find("[")
    if start == -1:
        raise ValueError("No JSON array found in response")

    depth = 0
    in_string = False
    escape = False
    for i, ch in enumerate(text[start:], start):
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"' and not in_string:
            in_string = True
        elif ch == '"' and in_string:
            in_string = False
        elif not in_string:
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]

    # Fallback to regex
    match = _re.search(r"\[.*\]", text, _re.DOTALL)
    if match:
        return match.group(0)

    raise ValueError("Could not find complete JSON array")


def _run_5w1h_llm(controls: list[ControlInput]) -> list[dict[str, Any]]:
    """Call LLM to evaluate 5W1H quality for a single batch of controls."""
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

    try:
        raw = _extract_json_array(raw)
        result = _json.loads(raw)
    except Exception as parse_err:
        # Try common repairs: trailing commas
        try:
            raw = _extract_json_array(raw)
            raw = _re.sub(r",\s*(\]|\})", r"\1", raw)
            result = _json.loads(raw)
        except Exception:
            raise parse_err

    return result if isinstance(result, list) else [result]


def _placeholder_result(c: ControlInput) -> dict[str, Any]:
    return {
        "control_id": c.control_id,
        "control_name": c.name,
        "what": False,
        "why": False,
        "who": False,
        "when": False,
        "where": False,
        "how": False,
        "score": 0,
        "rag": "red",
        "queue_finding": True,
        "rationale": {
            "what": "Analysis unavailable",
            "why": "Analysis unavailable",
            "who": "Analysis unavailable",
            "when": "Analysis unavailable",
            "where": "Analysis unavailable",
            "how": "Analysis unavailable",
        },
    }


def _run_5w1h_batched(inputs: list[ControlInput]) -> list[dict[str, Any]]:
    """Process controls in batches sequentially to avoid thread-pool deadlocks."""
    if not inputs:
        return []

    batches = [inputs[i : i + BATCH_SIZE] for i in range(0, len(inputs), BATCH_SIZE)]
    results: list[dict[str, Any]] = []

    for idx, batch in enumerate(batches, 1):
        logger.info(f"5W1H batch {idx}/{len(batches)} — {len(batch)} controls")
        try:
            batch_results = _run_5w1h_llm(batch)
            results.extend(batch_results)
        except Exception as e:
            logger.error(f"5W1H batch {idx} failed: {e}")
            for c in batch:
                results.append(_placeholder_result(c))

    return results


async def _run_5w1h_batched_async(inputs: list[ControlInput]) -> list[dict[str, Any]]:
    """Run all batches concurrently (up to 5 at a time) to avoid sequential API round-trips."""
    if not inputs:
        return []
    batches = [inputs[i : i + BATCH_SIZE] for i in range(0, len(inputs), BATCH_SIZE)]
    loop = asyncio.get_running_loop()
    sem = asyncio.Semaphore(10)

    async def _run_one(batch: list[ControlInput], idx: int) -> list[dict[str, Any]]:
        async with sem:
            logger.info(f"5W1H batch {idx}/{len(batches)} — {len(batch)} controls")
            try:
                return await loop.run_in_executor(None, _run_5w1h_llm, batch)
            except Exception as e:
                logger.error(f"5W1H batch {idx} failed: {e}")
                return [_placeholder_result(c) for c in batch]

    batch_results = await asyncio.gather(*[_run_one(b, i + 1) for i, b in enumerate(batches)])
    return [r for batch in batch_results for r in batch]


# ------------------------------------------------------------------
# Public helpers
# ------------------------------------------------------------------
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
    results = _run_5w1h_batched(inputs)
    # Persist to cache
    try:
        MongoQualityStore().save_many(results)
    except Exception as exc:
        logger.warning(f"Failed to cache 5W1H results: {exc}")
    return results


@router.post("/quality-analysis")
async def run_quality_analysis(body: QualityRequest):
    """Run 5W1H quality analysis on a batch of controls. Returns cached results when available."""
    store = MongoQualityStore()
    control_ids = [c.control_id for c in body.controls]

    # 1. Pull cached results
    cached: dict[str, dict[str, Any]] = {}
    if store.is_connected:
        try:
            cached = store.get_many(control_ids)
        except Exception as exc:
            logger.warning(f"Quality cache read failed: {exc}")

    # 2. Determine which controls still need analysis
    missing: list[ControlInput] = []
    for c in body.controls:
        if c.control_id not in cached:
            missing.append(c)

    results: list[dict[str, Any]] = list(cached.values())

    # 3. Run LLM only for missing controls
    if missing:
        logger.info(f"Quality analysis — {len(cached)} cached, {len(missing)} to analyse")
        try:
            fresh = await _run_5w1h_batched_async(missing)
            results.extend(fresh)
            # Persist new results
            if store.is_connected:
                try:
                    store.save_many(fresh)
                except Exception as exc:
                    logger.warning(f"Quality cache write failed: {exc}")
        except Exception as e:
            logger.error(f"5W1H analysis failed: {e}")
            raise HTTPException(500, f"Quality analysis failed: {str(e)}")
    else:
        logger.info(f"Quality analysis — all {len(results)} controls served from cache")

    # 4. Return in the same order as the request
    result_map = {r["control_id"]: r for r in results}
    ordered = [result_map.get(cid, _placeholder_result(ControlInput(control_id=cid, name=cid, description=""))) for cid in control_ids]

    return {"results": ordered, "total": len(ordered)}
