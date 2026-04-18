# api/routers/control_testing.py
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime
from typing import Any, Literal, Optional

import pymongo
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/control-testing", tags=["control-testing"])

TestResultType = Literal["pass", "fail", "partial", "not_tested"]


class EvidenceReview(BaseModel):
    conclusion: str = ""
    explanation: str = ""
    confidence: str = ""
    gaps: str = ""


class TestedControl(BaseModel):
    id: str
    control_id: str
    control_name: str
    domain: str = ""
    test_result: TestResultType = "not_tested"
    evidence_text: str = ""
    evidence_review: EvidenceReview = EvidenceReview()
    tester_notes: str = ""


class TestingSession(BaseModel):
    id: str
    title: str
    description: str = ""
    status: Literal["draft", "in_progress", "complete"] = "draft"
    controls: list[TestedControl] = []
    report_markdown: Optional[str] = None
    created_at: str
    updated_at: str


class SessionCreate(BaseModel):
    title: str
    description: str = ""


class AddControlsBody(BaseModel):
    controls: list[dict]  # [{control_id, control_name, domain}]


class UpdateControlBody(BaseModel):
    test_result: Optional[TestResultType] = None
    tester_notes: Optional[str] = None
    evidence_text: Optional[str] = None


class ReviewEvidenceBody(BaseModel):
    evidence_text: str
    claim: str = ""


# ── MongoDB store ─────────────────────────────────────────────────────────────

class MongoControlTestingStore:
    def __init__(self, mongo_uri: str | None = None):
        uri = mongo_uri or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        client = pymongo.MongoClient(uri)
        db = client["trace_db"]
        self._col = db["control_testing_sessions"]
        self._col.create_index("status")
        self._col.create_index("created_at")

    def _to_session(self, doc: dict) -> TestingSession:
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id"))
        doc.setdefault("controls", [])
        doc.setdefault("report_markdown", None)
        doc.setdefault("description", "")
        controls = []
        for c in doc["controls"]:
            er = c.get("evidence_review", {})
            if isinstance(er, dict):
                c["evidence_review"] = EvidenceReview(**er)
            controls.append(TestedControl(**c))
        doc["controls"] = controls
        return TestingSession(**doc)

    def create(self, data: SessionCreate) -> TestingSession:
        now = datetime.utcnow().isoformat()
        doc: dict[str, Any] = {
            "_id": str(uuid.uuid4()),
            "title": data.title,
            "description": data.description,
            "status": "draft",
            "controls": [],
            "report_markdown": None,
            "created_at": now,
            "updated_at": now,
        }
        self._col.insert_one(doc)
        return self._to_session(dict(doc))

    def list(self) -> list[TestingSession]:
        return [self._to_session(d) for d in self._col.find({}).sort("created_at", -1)]

    def get(self, session_id: str) -> TestingSession | None:
        doc = self._col.find_one({"_id": session_id})
        return self._to_session(doc) if doc else None

    def delete(self, session_id: str) -> bool:
        result = self._col.delete_one({"_id": session_id})
        return result.deleted_count == 1

    def add_controls(self, session_id: str, controls: list[dict]) -> bool:
        result = self._col.update_one(
            {"_id": session_id},
            {"$push": {"controls": {"$each": controls}},
             "$set": {"status": "in_progress", "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def update_control(self, session_id: str, control_id: str, fields: dict) -> bool:
        set_fields = {f"controls.$.{k}": v for k, v in fields.items()}
        set_fields["updated_at"] = datetime.utcnow().isoformat()
        result = self._col.update_one(
            {"_id": session_id, "controls.id": control_id},
            {"$set": set_fields},
        )
        return result.modified_count == 1

    def set_report(self, session_id: str, markdown: str) -> bool:
        result = self._col.update_one(
            {"_id": session_id},
            {"$set": {"report_markdown": markdown, "status": "complete",
                      "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1


_store: MongoControlTestingStore | None = None


def get_store() -> MongoControlTestingStore:
    global _store
    if _store is None:
        _store = MongoControlTestingStore()
    return _store


# ── Route handlers ────────────────────────────────────────────────────────────

@router.get("/library-controls")
def list_library_controls():
    """Return all controls from the controls library for session setup."""
    from utils.controls_library import MongoControlsStore
    try:
        store = MongoControlsStore()
        all_ctrls = store.all_controls()
        return [
            {
                "control_id": c.get("control_id", ""),
                "control_name": c.get("control_name", c.get("name", "")),
                "domain": c.get("domain", "General"),
            }
            for c in all_ctrls
            if c.get("control_id")
        ]
    except Exception as e:
        logger.error(f"Failed to fetch library controls: {e}")
        return []


@router.post("", status_code=201, response_model=TestingSession)
def create_session(body: SessionCreate):
    return get_store().create(body)


@router.get("", response_model=list[TestingSession])
def list_sessions():
    return get_store().list()


@router.get("/{session_id}", response_model=TestingSession)
def get_session(session_id: str):
    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: str):
    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    get_store().delete(session_id)


@router.post("/{session_id}/controls", status_code=201)
def add_controls(session_id: str, body: AddControlsBody):
    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    controls_to_add = [
        {
            "id": str(uuid.uuid4()),
            "control_id": c.get("control_id", ""),
            "control_name": c.get("control_name", ""),
            "domain": c.get("domain", "General"),
            "test_result": "not_tested",
            "evidence_text": "",
            "evidence_review": {"conclusion": "", "explanation": "", "confidence": "", "gaps": ""},
            "tester_notes": "",
        }
        for c in body.controls
    ]
    get_store().add_controls(session_id, controls_to_add)
    return {"ok": True, "added": len(controls_to_add)}


@router.patch("/{session_id}/controls/{control_id}")
def update_control(session_id: str, control_id: str, body: UpdateControlBody):
    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    fields: dict = {}
    if body.test_result is not None:
        fields["test_result"] = body.test_result
    if body.tester_notes is not None:
        fields["tester_notes"] = body.tester_notes
    if body.evidence_text is not None:
        fields["evidence_text"] = body.evidence_text
    if not fields:
        raise HTTPException(400, "No fields to update")
    get_store().update_control(session_id, control_id, fields)
    return {"ok": True}


@router.post("/{session_id}/controls/{control_id}/review-evidence")
def review_evidence(session_id: str, control_id: str, body: ReviewEvidenceBody):
    """Persona 4: Evidence Reviewer — assess evidence against a control claim."""
    import re as _re
    import json as _json
    from langchain.schema import HumanMessage
    from utils.llm_provider import get_llm

    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")

    ctrl = next((c for c in s.controls if c.id == control_id), None)
    if not ctrl:
        raise HTTPException(404, "Control not found in session")

    claim = body.claim or f"The control '{ctrl.control_name}' is operating effectively"
    evidence_text = body.evidence_text or ctrl.evidence_text

    prompt = f"""You are an evidence reviewer for audit, risk, and security assessments.

Your task is to review uploaded evidence in the specific context provided.
You must evaluate whether the evidence:
- supports the claim
- partially supports the claim
- contradicts the claim
- is insufficient or irrelevant

Always apply the review from the perspective of the current module and objective.
Do not assess evidence generically.
If the same file would mean different things in different contexts, use only the context provided for this task.

Context:
- Control: {ctrl.control_name}
- Domain: {ctrl.domain}
- Claim under review: {claim}

Evidence provided:
{evidence_text}

Return a JSON object with exactly these fields:
{{
  "conclusion": "supports" | "partially supports" | "contradicts" | "insufficient/irrelevant",
  "explanation": "short explanation (2-3 sentences)",
  "confidence": "high" | "medium" | "low",
  "gaps": "description of any material gaps or contradictions, or 'None identified'"
}}

Return ONLY the JSON object, no markdown."""

    try:
        llm = get_llm()
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content.strip()
        content = _re.sub(r"^```[a-zA-Z]*\n?", "", content)
        content = _re.sub(r"\n?```$", "", content).strip()
        review_data = _json.loads(content)
    except Exception as e:
        logger.error(f"Evidence review LLM failed for {session_id}/{control_id}: {e}")
        review_data = {
            "conclusion": "insufficient/irrelevant",
            "explanation": f"Evidence review failed: {e}",
            "confidence": "low",
            "gaps": "LLM unavailable — manual review required.",
        }

    review_fields = {
        "evidence_review.conclusion": review_data.get("conclusion", ""),
        "evidence_review.explanation": review_data.get("explanation", ""),
        "evidence_review.confidence": review_data.get("confidence", ""),
        "evidence_review.gaps": review_data.get("gaps", ""),
    }
    if body.evidence_text:
        review_fields["evidence_text"] = body.evidence_text

    get_store().update_control(session_id, control_id, review_fields)
    return {"ok": True, "review": review_data}


@router.post("/{session_id}/generate-report")
def generate_report(session_id: str):
    """Control Testing Report Writer — domain-grouped final report."""
    from langchain.schema import HumanMessage
    from utils.llm_provider import get_llm

    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    if not s.controls:
        raise HTTPException(400, "No controls in session. Add controls first.")

    by_domain: dict[str, list[TestedControl]] = {}
    for c in s.controls:
        by_domain.setdefault(c.domain or "General", []).append(c)

    domain_text = ""
    for domain, ctrls in by_domain.items():
        domain_text += f"\n### Domain: {domain}\n"
        for c in ctrls:
            result_label = c.test_result.replace("_", " ").title()
            review_summary = c.evidence_review.conclusion or "No evidence review performed"
            domain_text += (
                f"- **{c.control_name}** [{result_label}]\n"
                f"  Evidence review: {review_summary}. "
                f"Confidence: {c.evidence_review.confidence or 'N/A'}. "
                f"Gaps: {c.evidence_review.gaps or 'None identified'}.\n"
                f"  Tester notes: {c.tester_notes or 'None.'}\n"
            )

    pass_count = sum(1 for c in s.controls if c.test_result == "pass")
    fail_count = sum(1 for c in s.controls if c.test_result == "fail")
    partial_count = sum(1 for c in s.controls if c.test_result == "partial")
    not_tested = sum(1 for c in s.controls if c.test_result == "not_tested")

    prompt = f"""You are a control testing report writer for audit and information security audiences.

Produce a professional Control Testing Report using only the provided data.
Follow the required report structure exactly. Do not add extra sections.
Group findings by control domain. Keep language professional and suitable for audit personnel.
Do not invent conclusions not supported by the test data.

Session: {s.title}
Description: {s.description}
Total controls: {len(s.controls)}
Pass: {pass_count} | Fail: {fail_count} | Partial: {partial_count} | Not Tested: {not_tested}

Control findings by domain:
{domain_text}

Required report structure (produce each section as a markdown heading):
1. Report Header
2. Executive Summary
3. Scope and Controls Tested
4. Domain-by-Domain Findings
5. Evidence Quality Summary
6. Issues and Gaps
7. Overall Conclusion

Return the full report as markdown only."""

    try:
        llm = get_llm()
        response = llm.invoke([HumanMessage(content=prompt)])
        report_md = response.content.strip()
    except Exception as e:
        logger.error(f"Report generation failed for {session_id}: {e}")
        report_md = f"# Control Testing Report\n\n**Report generation failed:** {e}\n\nPlease retry."

    get_store().set_report(session_id, report_md)
    return {"session_id": session_id, "report_markdown": report_md}


@router.get("/{session_id}/report")
def get_report(session_id: str):
    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    if not s.report_markdown:
        raise HTTPException(404, "No report generated yet.")
    return {"session_id": session_id, "report_markdown": s.report_markdown}
