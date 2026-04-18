# api/routers/risk_assessment.py
from __future__ import annotations

import os
import re as _re
import uuid
import logging
from datetime import datetime
from typing import Any, Literal, Optional

import pymongo
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

from utils.assessment_questions import get_sections

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/risk-assessment", tags=["risk-assessment"])

StatusType = Literal["draft", "in_progress", "risks_identified", "controls_applied", "complete"]
RiskBand = Literal["Low", "Medium", "High", "Critical"]
AnswerType = Literal["yes", "no", "na"]


# ── Pydantic models ──────────────────────────────────────────────────────────

class AdHocApplication(BaseModel):
    id: str = ""
    name: str
    description: str = ""
    assessment_context: str = ""
    business_context: str = ""
    purpose: str = ""
    use: str = ""
    confidentiality: int = Field(default=3, ge=1, le=5)
    integrity: int = Field(default=3, ge=1, le=5)
    availability: int = Field(default=3, ge=1, le=5)
    hosting_type: Optional[str] = None
    support_type: Optional[str] = None
    owner: str = ""
    custodian: str = ""
    jurisdiction: str = ""
    classification: str = ""
    internet_exposure: bool = False
    data_sensitivity_summary: str = ""
    primary_users: str = ""
    key_integrations: str = ""


class RiskAssessmentCreate(BaseModel):
    title: str
    description: str
    asset_ids: list[str] = []
    ad_hoc_applications: list[AdHocApplication] = []

    @model_validator(mode="after")
    def _at_least_one_subject(self) -> "RiskAssessmentCreate":
        if not self.asset_ids and not self.ad_hoc_applications:
            raise ValueError("At least one asset_id or ad_hoc_application is required")
        return self


class ResponseSubmit(BaseModel):
    asset_id: str
    section_id: str
    question_id: str
    answer: AnswerType
    details: str = ""


class RiskOverride(BaseModel):
    asset_id: str
    title: str
    description: str
    risk_category: str
    likelihood_score: int
    impact_score: int
    human_rationale: str


class ControlApplication(BaseModel):
    risk_id: str
    control_id: str
    source: str
    human_rationale: str = ""


class RiskAssessment(BaseModel):
    id: str
    title: str
    description: str
    status: StatusType
    asset_ids: list[str]
    ad_hoc_applications: list[dict] = []
    responses: list[dict]
    risks: list[dict]
    applied_controls: list[dict]
    suggested_controls: list[dict] = []
    report_markdown: Optional[str] = None
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
        doc.setdefault("responses", [])
        doc.setdefault("risks", [])
        doc.setdefault("applied_controls", [])
        doc.setdefault("suggested_controls", [])
        doc.setdefault("report_markdown", None)
        doc.setdefault("ad_hoc_applications", [])
        doc.setdefault("asset_ids", [])
        return RiskAssessment(**doc)

    def create(self, data: RiskAssessmentCreate) -> RiskAssessment:
        now = datetime.utcnow().isoformat()
        # Assign generated IDs to ad hoc applications
        ad_hoc = []
        for app in data.ad_hoc_applications:
            d = app.model_dump()
            if not d.get("id"):
                d["id"] = str(uuid.uuid4())
            ad_hoc.append(d)
        # Merge ad hoc IDs into asset_ids so questionnaire loop covers them uniformly
        all_asset_ids = list(data.asset_ids) + [a["id"] for a in ad_hoc]
        doc: dict[str, Any] = {
            "_id": str(uuid.uuid4()),
            "title": data.title,
            "description": data.description,
            "status": "draft",
            "asset_ids": all_asset_ids,
            "ad_hoc_applications": ad_hoc,
            "responses": [],
            "risks": [],
            "applied_controls": [],
            "suggested_controls": [],
            "report_markdown": None,
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
            {"$push": {"risks": risk}, "$set": {"updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def add_control(self, ra_id: str, control: dict) -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$push": {"applied_controls": control},
             "$set": {"status": "controls_applied", "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def set_suggested_controls(self, ra_id: str, suggestions: list[dict]) -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$set": {"suggested_controls": suggestions, "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def set_report(self, ra_id: str, markdown: str) -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$set": {"report_markdown": markdown, "status": "complete", "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1


_store: MongoRiskAssessmentStore | None = None


def get_store() -> MongoRiskAssessmentStore:
    global _store
    if _store is None:
        _store = MongoRiskAssessmentStore()
    return _store


# ── Risk scoring helpers ─────────────────────────────────────────────────────

def _inherent_risk_band(score: float) -> str:
    if score <= 4:   return "Low"
    if score <= 9:   return "Medium"
    if score <= 16:  return "High"
    return "Critical"


def _rule_layer_scores(responses: list[dict]) -> tuple[int, int]:
    """Compute rule-based likelihood + impact from Exposure/Control answers."""
    section_map: dict[str, dict[str, str]] = {
        s["id"]: {q["id"]: q["question_type"] for q in s["questions"]}
        for s in get_sections()
    }
    exposure_yes = 0
    control_no = 0
    for r in responses:
        qtype = section_map.get(r.get("section_id", ""), {}).get(r.get("question_id", ""))
        if qtype == "Exposure" and r.get("answer") == "yes":
            exposure_yes += 1
        elif qtype == "Control" and r.get("answer") == "no":
            control_no += 1
    all_questions = [q for s in get_sections() for q in s["questions"]]
    exposure_total = max(1, sum(1 for q in all_questions if q["question_type"] == "Exposure"))
    control_total = max(1, sum(1 for q in all_questions if q["question_type"] == "Control"))
    likelihood = min(5, max(1, round(1 + (exposure_yes / exposure_total) * 4)))
    impact = min(5, max(1, round(1 + (control_no / control_total) * 4)))
    return likelihood, impact


# ── Route handlers ───────────────────────────────────────────────────────────

@router.get("/sections")
def get_assessment_sections():
    return {"sections": get_sections()}


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
        "section_id": body.section_id,
        "question_id": body.question_id,
        "answer": body.answer,
        "details": body.details,
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
        "effectiveness_score": 0.0,
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
        avg_eff = sum(c.get("effectiveness_score", 1.0) for c in applied) / len(applied) if applied else 0.0
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


@router.post("/{ra_id}/analyze")
def analyze_assessment(ra_id: str):
    """Hybrid rule-layer + LLM analysis (Persona 5: Technology Risk Assessor)."""
    from langchain.schema import HumanMessage
    from utils.llm_provider import get_llm
    import json as _json

    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    if not ra.responses:
        raise HTTPException(400, "No responses yet. Submit questionnaire responses first.")

    from api.routers.assets import get_store as get_asset_store
    asset_store = get_asset_store()

    by_asset: dict[str, list[dict]] = {}
    for resp in ra.responses:
        by_asset.setdefault(resp["asset_id"], []).append(resp)

    all_risks: list[dict] = []

    ad_hoc_map = {a["id"]: a for a in ra.ad_hoc_applications}

    for asset_id, asset_responses in by_asset.items():
        asset = asset_store.get(asset_id)
        ad_hoc = ad_hoc_map.get(asset_id)
        asset_name = (asset.name if asset else None) or (ad_hoc.get("name") if ad_hoc else None) or asset_id
        if asset:
            cia_total = asset.cia_total
            cia_band = asset.cia_band
        elif ad_hoc:
            cia_total = ad_hoc.get("confidentiality", 3) + ad_hoc.get("integrity", 3) + ad_hoc.get("availability", 3)
            cia_band = "High" if cia_total >= 12 else "Medium" if cia_total >= 7 else "Low"
        else:
            cia_total = 9
            cia_band = "Medium"

        rule_likelihood, rule_impact = _rule_layer_scores(asset_responses)

        qa_text = "\n".join(
            f"[{r['section_id']}] Q:{r['question_id']} | Answer:{r['answer']} | Details: {r.get('details', '')}"
            for r in asset_responses
        )

        prompt = f"""You are a cybersecurity risk analyst. Analyse the following assessment responses for an application and identify specific risks.

Application: {asset_name}
CIA Total: {cia_total}/15 (Band: {cia_band})
Rule-based pre-score — Likelihood: {rule_likelihood}/5, Impact: {rule_impact}/5

Assessment Responses (section | question | answer | details):
{qa_text}

Based on these responses, identify 2-4 specific, actionable risks for this application.
For each risk return a JSON object with:
- title: short risk title (max 10 words)
- description: 1-2 sentence description of the risk
- risk_category: one of [Operational, Regulatory, Privacy, Financial, Reputational, Technical]
- likelihood_score: integer 1-5 (calibrate from rule-based pre-score of {rule_likelihood})
- impact_score: integer 1-5 (calibrate from rule-based pre-score of {rule_impact})
- rationale: one sentence explaining the score

Return ONLY a valid JSON array, no markdown, no explanation.
Example: [{{"title":"Unauthorised data access","description":"...","risk_category":"Privacy","likelihood_score":3,"impact_score":4,"rationale":"..."}}]"""

        try:
            llm = get_llm()
            response = llm.invoke([HumanMessage(content=prompt)])
            content = response.content.strip()
            content = _re.sub(r"^```[a-zA-Z]*\n?", "", content)
            content = _re.sub(r"\n?```$", "", content).strip()
            llm_risks = _json.loads(content)
            if not isinstance(llm_risks, list):
                raise ValueError(f"Expected JSON array, got {type(llm_risks).__name__}")
        except Exception as e:
            logger.error(f"LLM analysis failed for asset {asset_id}: {e}")
            llm_risks = [{
                "title": f"{asset_name} — inherent risk",
                "description": "Risk derived from rule-layer scoring (LLM analysis unavailable).",
                "risk_category": "Operational",
                "likelihood_score": rule_likelihood,
                "impact_score": rule_impact,
                "rationale": "Derived from rule-based analysis of questionnaire responses.",
            }]

        for r in llm_risks:
            likelihood = int(r.get("likelihood_score", rule_likelihood))
            impact_val = int(r.get("impact_score", rule_impact))
            score = likelihood * impact_val
            all_risks.append({
                "id": str(uuid.uuid4()),
                "asset_id": asset_id,
                "title": r.get("title", "Unnamed Risk"),
                "description": r.get("description", ""),
                "risk_category": r.get("risk_category", "Operational"),
                "likelihood_score": likelihood,
                "impact_score": impact_val,
                "inherent_risk_score": score,
                "inherent_risk_band": _inherent_risk_band(score),
                "residual_risk_score": score,
                "residual_risk_band": _inherent_risk_band(score),
                "source": "llm_generated",
                "human_rationale": r.get("rationale", ""),
                "status": "identified",
            })

    get_store().set_risks(ra_id, all_risks)
    return {"assessment_id": ra_id, "risks_identified": len(all_risks), "risks": all_risks}


@router.post("/{ra_id}/suggest-controls")
def suggest_controls(ra_id: str):
    """Persona 6: Control Selector — rank library controls per risk finding."""
    from langchain.schema import HumanMessage
    from utils.llm_provider import get_llm
    from utils.controls_library import MongoControlsStore
    import json as _json

    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    if not ra.risks:
        raise HTTPException(400, "No risks yet. Run /analyze first.")

    ctrl_store = MongoControlsStore()
    all_controls = ctrl_store.list()
    controls_summary = "\n".join(
        f"- [{c.id}] {c.title} (domain: {getattr(c, 'domain', 'General')})"
        for c in all_controls[:100]
    )

    risk_summary = "\n".join(
        f"- [{r['id']}] {r['title']} | category: {r['risk_category']} | band: {r['inherent_risk_band']}"
        for r in ra.risks
    )

    prompt = f"""You are a control selection specialist for technology risk treatment.

Select and rank controls ONLY from the provided master controls library for each identified risk.
Do not recommend controls outside the provided library.

Risks identified:
{risk_summary}

Available controls library (id | title | domain):
{controls_summary}

For each risk, return up to 3 ranked control suggestions.
Return ONLY a valid JSON array, no markdown.
Each element: {{"risk_id": "...", "control_id": "...", "control_title": "...", "rationale": "...", "relevance_score": 1-5}}"""

    try:
        llm = get_llm()
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content.strip()
        content = _re.sub(r"^```[a-zA-Z]*\n?", "", content)
        content = _re.sub(r"\n?```$", "", content).strip()
        suggestions = _json.loads(content)
        if not isinstance(suggestions, list):
            raise ValueError(f"Expected JSON array, got {type(suggestions).__name__}")
    except Exception as e:
        logger.error(f"Control suggestion LLM failed for {ra_id}: {e}")
        suggestions = []

    get_store().set_suggested_controls(ra_id, suggestions)
    return {"assessment_id": ra_id, "suggestions": suggestions}


@router.post("/{ra_id}/generate-report")
def generate_report(ra_id: str):
    """Persona 7: Assessment Report Writer — 9-section risk assessment report."""
    from langchain.schema import HumanMessage
    from utils.llm_provider import get_llm
    from api.routers.assets import get_store as get_asset_store

    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    if not ra.risks:
        raise HTTPException(400, "No risks identified. Run /analyze first.")

    asset_store = get_asset_store()
    app_names = []
    for aid in ra.asset_ids:
        a = asset_store.get(aid)
        app_names.append(a.name if a else aid)

    risk_text = "\n".join(
        f"- {r['title']} | {r['risk_category']} | {r['inherent_risk_band']} | {r.get('human_rationale', '')}"
        for r in ra.risks
    )
    control_text = "\n".join(
        f"- Risk {s['risk_id']}: {s['control_title']} (relevance {s['relevance_score']}/5)"
        for s in (ra.suggested_controls or [])
    ) or "No control suggestions generated yet."

    prompt = f"""You are an assessment report writer for technology risk and audit audiences.

Produce a professional Risk Assessment Report using only the provided data.
Follow the required report structure exactly. Do not add extra sections.
Keep language professional, direct, and suitable for technology, information-security, and audit personnel.

Assessment: {ra.title}
Description: {ra.description}
Applications in scope: {', '.join(app_names)}
Total responses: {len(ra.responses)}
Risks identified: {len(ra.risks)}

Risk findings:
{risk_text}

Suggested controls:
{control_text}

Required report structure (produce each section as a markdown heading):
1. Report Header
2. Executive Summary
3. Assessment Scope
4. Assessment Method
5. Evidence Summary
6. Application-by-Application Findings
7. Cross-Application Risk Themes
8. Prioritized Remediation Themes
9. Issues Affecting Suggested Controls

Return the full report as markdown only."""

    try:
        llm = get_llm()
        response = llm.invoke([HumanMessage(content=prompt)])
        report_md = response.content.strip()
    except Exception as e:
        logger.error(f"Report generation failed for {ra_id}: {e}")
        report_md = f"# Risk Assessment Report\n\n**Report generation failed:** {e}\n\nPlease retry."

    get_store().set_report(ra_id, report_md)
    return {"assessment_id": ra_id, "report_markdown": report_md}


@router.get("/{ra_id}/report")
def get_report(ra_id: str):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    if not ra.report_markdown:
        raise HTTPException(404, "No report generated yet. Call POST /{ra_id}/generate-report first.")
    return {"assessment_id": ra_id, "report_markdown": ra.report_markdown}
