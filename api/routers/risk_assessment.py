# api/routers/risk_assessment.py
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime
from typing import Any, Literal, Optional

import pymongo
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.risk_scorer import compute_criticality

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/risk-assessment", tags=["risk-assessment"])

StatusType = Literal["draft", "in_progress", "risks_identified", "controls_applied", "complete"]
RiskBand = Literal["Low", "Medium", "High", "Critical"]
AssessmentType = Literal["BIA", "LEGAL", "PIA"]


# ── Pydantic models ──────────────────────────────────────────────────────────

class RiskAssessmentCreate(BaseModel):
    title: str
    description: str
    asset_ids: list[str]
    initial_inherent_ratings: dict[str, str]  # asset_id -> band


class ResponseSubmit(BaseModel):
    asset_id: str
    assessment_type: AssessmentType
    question_id: str
    response_text: str


class RiskOverride(BaseModel):
    asset_id: str
    title: str
    description: str
    risk_category: str
    likelihood_score: int   # 1-5
    impact_score: int       # 1-5
    human_rationale: str


class ControlApplication(BaseModel):
    risk_id: str
    control_id: str
    source: str             # controls_library | regulatory_testing | human_added
    human_rationale: str = ""


class RiskAssessment(BaseModel):
    id: str
    title: str
    description: str
    status: StatusType
    asset_ids: list[str]
    initial_inherent_ratings: dict[str, str]
    responses: list[dict]
    risks: list[dict]
    applied_controls: list[dict]
    created_at: str
    updated_at: str


# ── MongoDB store ────────────────────────────────────────────────────────────

class MongoRiskAssessmentStore:
    def __init__(self, mongo_uri: str | None = None):
        uri = mongo_uri or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        client = pymongo.MongoClient(uri)
        db = client["trace_db"]
        self._col = db["risk_assessments"]
        self._col.create_index("status")
        self._col.create_index("created_at")

    def _to_ra(self, doc: dict) -> RiskAssessment:
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id"))
        return RiskAssessment(**doc)

    def create(self, data: RiskAssessmentCreate) -> RiskAssessment:
        now = datetime.utcnow().isoformat()
        doc: dict[str, Any] = {
            "_id": str(uuid.uuid4()),
            "title": data.title,
            "description": data.description,
            "status": "draft",
            "asset_ids": data.asset_ids,
            "initial_inherent_ratings": data.initial_inherent_ratings,
            "responses": [],
            "risks": [],
            "applied_controls": [],
            "created_at": now,
            "updated_at": now,
        }
        self._col.insert_one(doc)
        return self._to_ra(dict(doc))

    def list(self, status_f: str | None = None) -> list[RiskAssessment]:
        q: dict = {}
        if status_f:
            q["status"] = status_f
        return [self._to_ra(d) for d in self._col.find(q).sort("created_at", -1)]

    def get(self, ra_id: str) -> RiskAssessment | None:
        doc = self._col.find_one({"_id": ra_id})
        return self._to_ra(doc) if doc else None

    def add_response(self, ra_id: str, response: dict) -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$push": {"responses": response},
             "$set": {"status": "in_progress", "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def set_risks(self, ra_id: str, risks: list[dict], status: str = "risks_identified") -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$set": {"risks": risks, "status": status, "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def add_risk(self, ra_id: str, risk: dict) -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$push": {"risks": risk},
             "$set": {"updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def add_control(self, ra_id: str, control: dict) -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$push": {"applied_controls": control},
             "$set": {"status": "controls_applied", "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1


_store: MongoRiskAssessmentStore | None = None

def get_store() -> MongoRiskAssessmentStore:
    global _store
    if _store is None:
        _store = MongoRiskAssessmentStore()
    return _store


# ── Risk scoring helpers ─────────────────────────────────────────────────────

def _inherent_risk_score(likelihood: float, impact: float) -> float:
    return round(likelihood * impact, 2)

def _inherent_risk_band(score: float) -> str:
    if score <= 4:   return "Low"
    if score <= 9:   return "Medium"
    if score <= 16:  return "High"
    return "Critical"

def _control_effectiveness(open_issue_severity: str | None) -> float:
    mapping = {"Low": 0.75, "Medium": 0.50, "High": 0.25, "Critical": 0.00}
    return mapping.get(open_issue_severity or "", 1.00)


# ── CRUD route handlers ──────────────────────────────────────────────────────

@router.post("", status_code=201, response_model=RiskAssessment)
def create_assessment(body: RiskAssessmentCreate):
    return get_store().create(body)


@router.get("", response_model=list[RiskAssessment])
def list_assessments(status: str | None = None):
    return get_store().list(status)


@router.get("/{ra_id}", response_model=RiskAssessment)
def get_assessment(ra_id: str):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    return ra


@router.post("/{ra_id}/respond", status_code=201)
def submit_response(ra_id: str, body: ResponseSubmit):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    response = {
        "id": str(uuid.uuid4()),
        "asset_id": body.asset_id,
        "assessment_type": body.assessment_type,
        "question_id": body.question_id,
        "response_text": body.response_text,
        "submitted_at": datetime.utcnow().isoformat(),
    }
    get_store().add_response(ra_id, response)
    return {"ok": True, "response_id": response["id"]}


@router.get("/{ra_id}/risks")
def get_risks(ra_id: str):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    return {"assessment_id": ra_id, "risks": ra.risks}


@router.post("/{ra_id}/risks", status_code=201)
def add_human_risk(ra_id: str, body: RiskOverride):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    score = body.likelihood_score * body.impact_score
    risk = {
        "id": str(uuid.uuid4()),
        "asset_id": body.asset_id,
        "title": body.title,
        "description": body.description,
        "risk_category": body.risk_category,
        "likelihood_score": body.likelihood_score,
        "impact_score": body.impact_score,
        "inherent_risk_score": score,
        "inherent_risk_band": _inherent_risk_band(score),
        "residual_risk_score": score,
        "residual_risk_band": _inherent_risk_band(score),
        "source": "human_added",
        "human_rationale": body.human_rationale,
        "status": "identified",
    }
    get_store().add_risk(ra_id, risk)
    return {"ok": True, "risk": risk}


@router.post("/{ra_id}/controls", status_code=201)
def apply_control(ra_id: str, body: ControlApplication):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    control = {
        "id": str(uuid.uuid4()),
        "risk_id": body.risk_id,
        "control_id": body.control_id,
        "source": body.source,
        "human_rationale": body.human_rationale,
        "effectiveness_score": 1.0,
        "applied_at": datetime.utcnow().isoformat(),
    }
    get_store().add_control(ra_id, control)
    return {"ok": True, "control": control}


@router.get("/{ra_id}/residual")
def get_residual(ra_id: str):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")

    results = []
    for risk in ra.risks:
        risk_id = risk["id"]
        applied = [c for c in ra.applied_controls if c["risk_id"] == risk_id]
        if applied:
            avg_eff = sum(c.get("effectiveness_score", 1.0) for c in applied) / len(applied)
        else:
            avg_eff = 0.0  # no controls = no reduction
        inherent = risk.get("inherent_risk_score", 0)
        residual = round(inherent * (1 - avg_eff), 2)
        results.append({
            "risk_id": risk_id,
            "risk_title": risk.get("title", ""),
            "asset_id": risk.get("asset_id", ""),
            "inherent_risk_score": inherent,
            "inherent_risk_band": risk.get("inherent_risk_band", ""),
            "controls_applied": len(applied),
            "avg_effectiveness": round(avg_eff, 2),
            "residual_risk_score": residual,
            "residual_risk_band": _inherent_risk_band(residual) if residual > 0 else "Low",
        })

    return {"assessment_id": ra_id, "residual_risks": results}
