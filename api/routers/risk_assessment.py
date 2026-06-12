# api/routers/risk_assessment.py
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re as _re
import tempfile
import uuid
import logging
from collections import Counter
from datetime import datetime
from typing import Any, Literal, Optional

import pymongo
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator, model_validator

from utils.assessment_questions import get_sections
from utils.risk_scorer import compute_cia_total, compute_criticality

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


class RiskAssessmentContextProfile(BaseModel):
    project_context: str = ""
    business_impact: str = ""
    overall_project_summary: str = ""
    regulatory_context: str = ""
    security_requirements: str = ""
    jira_context: str = ""
    free_text_context: str = ""


class RiskAssessmentContextUpdate(BaseModel):
    context_profile: RiskAssessmentContextProfile


class SuggestedQuestion(BaseModel):
    question_id: str
    section_id: str = "dynamic_context"
    section_title: str = "Context Driven Questions"
    text: str
    question_type: Literal["Exposure", "Control", "Context"] = "Context"
    priority: Literal["low", "medium", "high"] = "medium"
    source: str = "context"
    rationale: str = ""
    status: Literal["suggested", "answered"] = "suggested"
    answer: Optional[Literal["yes", "no", "na"]] = None
    details: str = ""


class SuggestedQuestionAnswer(BaseModel):
    answer: Literal["yes", "no", "na"]
    details: str = ""


class RiskAssessmentCreate(BaseModel):
    title: str
    description: str
    asset_ids: list[str] = []
    ad_hoc_applications: list[AdHocApplication] = []
    context_profile: RiskAssessmentContextProfile = Field(default_factory=RiskAssessmentContextProfile)
    project_context: str = ""
    business_impact: str = ""
    overall_project_summary: str = ""
    regulatory_context: str = ""
    security_requirements: str = ""
    jira_context: str = ""
    free_text_context: str = ""

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


class ResponseBatch(BaseModel):
    responses: list[ResponseSubmit]


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
    suggested_questions: list[dict] = []
    context_profile: dict = {}
    context_sources: list[dict] = []
    historical_matches: list[dict] = []
    report_markdown: Optional[str] = None
    created_at: str
    updated_at: str


# ── MongoDB store ────────────────────────────────────────────────────────────

def _context_profile_from_create(data: RiskAssessmentCreate) -> dict[str, str]:
    profile = data.context_profile.model_dump()
    for key in (
        "project_context",
        "business_impact",
        "overall_project_summary",
        "regulatory_context",
        "security_requirements",
        "jira_context",
        "free_text_context",
    ):
        value = str(getattr(data, key, "") or "").strip()
        if value:
            profile[key] = value
    return profile


class MongoRiskAssessmentStore:
    def __init__(self, mongo_uri: str | None = None):
        uri = mongo_uri or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        client = pymongo.MongoClient(uri)
        db = client["trace_db"]
        self._col = db["risk_assessments"]
        self._context_chunks = db["risk_assessment_context_chunks"]
        self._col.create_index("status")
        self._col.create_index("created_at")
        self._col.create_index("context_profile.regulatory_context")
        self._col.create_index("context_profile.security_requirements")
        self._context_chunks.create_index("ra_id")
        self._context_chunks.create_index("source_id")

    def _to_ra(self, doc: dict) -> RiskAssessment:
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id"))
        doc.setdefault("responses", [])
        doc.setdefault("risks", [])
        doc.setdefault("applied_controls", [])
        doc.setdefault("suggested_controls", [])
        doc.setdefault("suggested_questions", [])
        doc.setdefault("context_profile", {})
        doc.setdefault("context_sources", [])
        doc.setdefault("historical_matches", [])
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
            "suggested_questions": [],
            "context_profile": _context_profile_from_create(data),
            "context_sources": [],
            "historical_matches": [],
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

    def update_context_profile(self, ra_id: str, context_profile: dict) -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$set": {"context_profile": context_profile, "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def add_context_source(self, ra_id: str, source: dict, chunks: list[dict]) -> bool:
        now = datetime.utcnow().isoformat()
        source = {**source, "uploaded_at": now}
        if chunks:
            self._context_chunks.insert_many([
                {**chunk, "ra_id": ra_id, "source_id": source["id"], "created_at": now}
                for chunk in chunks
            ])
        result = self._col.update_one(
            {"_id": ra_id},
            {"$push": {"context_sources": source}, "$set": {"updated_at": now}},
        )
        return result.modified_count == 1

    def get_context_chunks(self, ra_id: str, limit: int = 30) -> list[dict]:
        return list(self._context_chunks.find({"ra_id": ra_id}, {"_id": 0}).limit(limit))

    def set_suggested_questions(self, ra_id: str, questions: list[dict]) -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$set": {"suggested_questions": questions, "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def set_historical_matches(self, ra_id: str, matches: list[dict]) -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$set": {"historical_matches": matches, "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def answer_suggested_question(self, ra_id: str, question_id: str, answer: str, details: str = "") -> bool:
        ra = self.get(ra_id)
        if not ra:
            return False
        questions: list[dict] = []
        changed = False
        for question in ra.suggested_questions:
            item = dict(question)
            if item.get("question_id") == question_id:
                item["answer"] = answer
                item["details"] = details
                item["status"] = "answered"
                changed = True
            questions.append(item)
        if not changed:
            return False
        return self.set_suggested_questions(ra_id, questions)

    def find_similar_assessments(self, ra: RiskAssessment, limit: int = 5) -> list[dict]:
        query_text = " ".join([
            ra.title,
            ra.description,
            json.dumps(ra.context_profile, sort_keys=True),
            json.dumps(ra.ad_hoc_applications, sort_keys=True),
        ])
        query_tokens = _tokenize_match_text(query_text)
        if not query_tokens:
            return []

        matches: list[dict] = []
        cursor = self._col.find({"_id": {"$ne": ra.id}}).sort("created_at", -1).limit(100)
        for doc in cursor:
            candidate_text = " ".join([
                str(doc.get("title", "")),
                str(doc.get("description", "")),
                json.dumps(doc.get("context_profile", {}), sort_keys=True),
                json.dumps(doc.get("ad_hoc_applications", []), sort_keys=True),
                json.dumps(doc.get("risks", []), sort_keys=True),
                json.dumps(doc.get("suggested_questions", []), sort_keys=True),
            ])
            candidate_tokens = _tokenize_match_text(candidate_text)
            if not candidate_tokens:
                continue
            overlap = query_tokens.intersection(candidate_tokens)
            score = len(overlap) / max(len(query_tokens), 1)
            if score <= 0:
                continue
            matches.append({
                "ra_id": str(doc.get("_id")),
                "title": doc.get("title", ""),
                "similarity_score": round(score, 3),
                "matched_terms": sorted(overlap)[:20],
                "prior_risks": doc.get("risks", [])[:5],
                "prior_questions": doc.get("suggested_questions", [])[:10],
            })

        return sorted(matches, key=lambda item: item["similarity_score"], reverse=True)[:limit]

    def add_responses_batch(self, ra_id: str, asset_id: str, new_responses: list[dict]) -> bool:
        ra = self.get(ra_id)
        if not ra:
            return False
        existing_other = [r for r in ra.responses if r.get("asset_id") != asset_id]
        all_responses = existing_other + new_responses
        result = self._col.update_one(
            {"_id": ra_id},
            {"$set": {"responses": all_responses, "status": "in_progress",
                      "updated_at": datetime.utcnow().isoformat()}},
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


def _format_calendar_date(value: str | datetime | None) -> str:
    if isinstance(value, str):
        try:
            value = dt.datetime.fromisoformat(value)
        except ValueError:
            return value
    try:
        return value.strftime("%B %d, %Y").replace(" 0", " ")
    except Exception:
        return "Unknown"


def _cia_band_from_values(confidentiality: int, integrity: int, availability: int) -> tuple[int, str]:
    total = compute_cia_total(confidentiality, integrity, availability)
    return total, compute_criticality(total)


def _resolve_subject_profile(asset_store: Any, asset_id: str, ad_hoc_map: dict[str, dict]) -> dict[str, Any]:
    asset = asset_store.get(asset_id)
    ad_hoc = ad_hoc_map.get(asset_id)
    if asset:
        return {
            "id": asset_id,
            "name": asset.name,
            "description": getattr(asset, "description", ""),
            "type": getattr(asset, "type", "Registered Asset"),
            "owner": getattr(asset, "owner", ""),
            "support_type": getattr(asset, "support_type", None),
            "hosting_type": getattr(asset, "hosting_type", None),
            "classification": getattr(asset, "classification", ""),
            "jurisdiction": getattr(asset, "jurisdiction", ""),
            "confidentiality": getattr(asset, "confidentiality", 0),
            "integrity": getattr(asset, "integrity", 0),
            "availability": getattr(asset, "availability", 0),
            "cia_total": getattr(asset, "cia_total", 0),
            "criticality": getattr(asset, "criticality", "Unknown"),
        }
    if ad_hoc:
        cia_total, criticality = _cia_band_from_values(
            ad_hoc.get("confidentiality", 3),
            ad_hoc.get("integrity", 3),
            ad_hoc.get("availability", 3),
        )
        return {
            "id": asset_id,
            "name": ad_hoc.get("name", asset_id),
            "description": ad_hoc.get("description", ""),
            "type": "Ad hoc application",
            "owner": ad_hoc.get("owner", ""),
            "support_type": ad_hoc.get("support_type", None),
            "hosting_type": ad_hoc.get("hosting_type", None),
            "classification": ad_hoc.get("classification", ""),
            "jurisdiction": ad_hoc.get("jurisdiction", ""),
            "confidentiality": ad_hoc.get("confidentiality", 3),
            "integrity": ad_hoc.get("integrity", 3),
            "availability": ad_hoc.get("availability", 3),
            "cia_total": cia_total,
            "criticality": criticality,
        }
    return {
        "id": asset_id,
        "name": asset_id,
        "description": "",
        "type": "Unknown subject",
        "owner": "",
        "support_type": None,
        "hosting_type": None,
        "classification": "",
        "jurisdiction": "",
        "confidentiality": 0,
        "integrity": 0,
        "availability": 0,
        "cia_total": 0,
        "criticality": "Unknown",
    }


def _clean_report_text(value: str) -> str:
    replacements = {
        "â€”": "-",
        "â€“": "-",
        "—": "-",
        "–": "-",
        "â€™": "'",
        "’": "'",
        "â€œ": '"',
        "â€\x9d": '"',
        "“": '"',
        "”": '"',
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


_RISK_CATEGORY_DOMAIN_HINTS: dict[str, list[str]] = {
    "Operational": ["access_control", "system_security", "cyber_operations", "business_continuity", "governance"],
    "Technical": ["system_security", "network_security", "application_security", "access_control", "cyber_operations"],
    "Privacy": ["data_security", "access_control", "cryptography", "online_services"],
    "Regulatory": ["governance", "audit", "third_party", "data_security"],
    "Financial": ["governance", "third_party", "business_continuity", "access_control"],
    "Reputational": ["governance", "incident_response", "third_party", "cyber_operations"],
}

_RISK_KEYWORD_DOMAIN_HINTS: dict[str, list[str]] = {
    "access": ["access_control"],
    "identity": ["access_control"],
    "authentication": ["access_control"],
    "authorization": ["access_control"],
    "privileged": ["access_control"],
    "mfa": ["access_control"],
    "monitoring": ["cyber_operations", "audit"],
    "logging": ["cyber_operations", "audit"],
    "incident": ["incident_response", "cyber_operations"],
    "backup": ["business_continuity"],
    "recovery": ["business_continuity"],
    "availability": ["business_continuity"],
    "encryption": ["cryptography", "data_security"],
    "data": ["data_security"],
    "network": ["network_security"],
    "vulnerability": ["Vuln. Mgmt", "system_security"],
    "patch": ["system_security", "change_management"],
    "change": ["change_management"],
    "vendor": ["third_party"],
    "third": ["third_party"],
    "party": ["third_party"],
}


def _tokenize_match_text(text: str) -> set[str]:
    cleaned = _clean_report_text(str(text or "")).lower()
    return {token for token in _re.findall(r"[a-z0-9]+", cleaned) if len(token) > 2}


def _extract_context_text(filename: str, content: bytes, source_type: str = "document") -> tuple[str, dict]:
    """Convert uploaded document bytes to plain text using the best available extractor.

    Priority:
    1. convert_document() from utils.services.conversion — tested against large PDFs, Excel,
       DOCX and produces clean markdown. Used for pdf/docx/xlsx/xls/txt/md.
    2. utils.document_ingestion.load_documents — handles images (OCR), CSV, and other types.
    3. UTF-8 decode fallback.
    """
    suffix = os.path.splitext(filename.lower())[1]
    clean_suffix = suffix.lstrip(".").lower()

    # Primary: use the battle-tested convert_document service for supported binary formats
    if clean_suffix in {"pdf", "docx", "doc", "xlsx", "xls"}:
        try:
            from utils.services.conversion import convert_document
            result = convert_document(content, filename, str(uuid.uuid4()), "risk_data")
            if result.status in ("success", "partial") and result.markdown:
                return result.markdown, {
                    "extractor": "convert_document",
                    "suffix": suffix,
                    "page_count": result.page_count,
                    "looks_corrupt": result.looks_corrupt,
                }
        except Exception as exc:
            logger.warning(f"convert_document failed for {filename}: {exc}")

    # Plain text / markdown — decode directly
    if clean_suffix in {"txt", "md", "log", "json"}:
        return content.decode("utf-8", errors="ignore"), {"extractor": "utf-8", "suffix": suffix}

    # Fallback: document_ingestion handles images (OCR), CSV, and anything else
    try:
        from utils.document_ingestion import load_documents

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        try:
            docs = load_documents(
                tmp_path,
                filename=filename,
                extra_metadata={"risk_assessment_source_type": source_type},
            )
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        return "\n\n".join(doc.page_content for doc in docs), {
            "extractor": "utils.document_ingestion",
            "suffix": suffix,
            "documents": len(docs),
        }
    except Exception as exc:
        logger.warning(f"Context extraction failed for {filename}: {exc}")
        return content.decode("utf-8", errors="ignore"), {
            "extractor": "utf-8-fallback",
            "suffix": suffix,
            "warning": str(exc),
        }


def _llm_extract_context_from_document(markdown: str) -> dict:
    """Extract context profile fields AND structured document metadata from document text.

    Returns a combined dict. Callers use:
      - _CONTEXT_PROFILE_FIELDS keys → context_profile auto-fill
      - _DOC_METADATA_FIELDS keys    → source["doc_metadata"] storage
    """
    from langchain.schema import HumanMessage
    from utils.llm_provider import get_llm

    doc_excerpt = markdown[:10000]

    prompt = f"""You are a senior security risk assessor. Analyse this document and extract structured information for a risk assessment.

Document content:
{doc_excerpt}

Return ONLY a valid JSON object with ALL of these exact fields:
{{
  "project_context": "Technical description: what the project/system is, its architecture, tech stack, deployment environment, and in-scope components",
  "business_impact": "Business criticality, data sensitivity, types of users affected, and financial/reputational impact of a breach or outage",
  "overall_project_summary": "2-3 sentence executive summary of this project suitable for a risk assessment header",
  "regulatory_context": "Applicable regulations, compliance frameworks, or standards detected (e.g. GDPR, DPDP Act 2023, RBI PA Guidelines, PCI-DSS, ISO 27001, SOC 2, HIPAA)",
  "security_requirements": "Key security requirements, constraints, or controls explicitly mentioned or strongly implied",
  "document_type": "One of: architecture_doc | security_policy | vapt_report | data_flow_diagram | jira_export | compliance_doc | vendor_assessment | threat_model | sow | incident_report | other",
  "technologies": ["List every specific technology, service, tool, or platform explicitly named, e.g. AWS S3, PostgreSQL 14, OAuth 2.0, Kubernetes, React, Nginx, Redis"],
  "regulations": ["List every regulation, standard, or clause explicitly named, e.g. GDPR Art.32, PCI-DSS Req 6.3.3, ISO 27001 A.8.24, RBI PA Guidelines Sec 3, DPDP Act S.8"],
  "data_types": ["List every category of data processed, stored, or transmitted, e.g. PII, financial records, health records, API keys, session tokens, card data, biometric data"],
  "third_parties": ["List every external vendor, SaaS tool, cloud provider, or integration mentioned, e.g. Stripe, Twilio, SendGrid, AWS, Salesforce"],
  "risk_flags": ["List specific risk concerns, control gaps, or vulnerabilities identified — be precise, e.g. no MFA for admin console, S3 bucket public-read, TLS 1.0 still supported, secrets in environment variables, no WAF, missing DSAR process"]
}}

Rules:
- Use "" for string fields where the document has no evidence
- Use [] for list fields where nothing was found
- Do NOT invent items not present or strongly implied in the document
- Be specific — generic phrases like 'web technologies' or 'standard security' are not useful"""

    try:
        llm = get_llm()
        response = llm.invoke([HumanMessage(content=prompt)])
        raw = response.content.strip()
        raw = _re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = _re.sub(r"\n?```$", "", raw).strip()
        extracted = json.loads(raw)
        if not isinstance(extracted, dict):
            return {}
        return extracted
    except Exception as exc:
        logger.warning(f"LLM document extraction failed: {exc}")
        return {}


_CONTEXT_PROFILE_FIELDS = frozenset({"project_context", "business_impact", "overall_project_summary", "regulatory_context", "security_requirements"})
_DOC_METADATA_FIELDS = frozenset({"document_type", "technologies", "regulations", "data_types", "third_parties", "risk_flags"})


def _chunk_context_text(text: str, chunk_size: int = 2500) -> list[str]:
    clean = _clean_report_text(text or "").strip()
    if not clean:
        return []
    return [
        clean[index:index + chunk_size]
        for index in range(0, len(clean), chunk_size)
        if clean[index:index + chunk_size].strip()
    ]


def _build_ra_context_pack(ra: RiskAssessment, chunks: list[dict]) -> str:
    """Build a rich context pack for LLM prompts.

    Priority order for document content:
    1. full_text stored on the source record (first 12 KB of extracted markdown)
    2. doc_metadata (structured entities — technologies, regulations, risk flags, etc.)
    3. Stored text chunks (supplement/fallback for multi-sheet Excel, image OCR, etc.)
    """
    context_profile = json.dumps(ra.context_profile or {}, indent=2, sort_keys=True)

    # Per-document blocks: metadata + full extracted text
    doc_sections: list[str] = []
    covered_chunk_ids: set[str] = set()
    for source in (ra.context_sources or [])[:5]:
        meta = source.get("doc_metadata") or {}
        src_id = source.get("id", "")
        lines = [f"=== {source.get('filename', 'document')} (type: {meta.get('document_type', 'unknown')}) ==="]
        if meta.get("technologies"):
            lines.append(f"  Technologies/services: {', '.join(meta['technologies'])}")
        if meta.get("regulations"):
            lines.append(f"  Regulations & standards: {', '.join(meta['regulations'])}")
        if meta.get("data_types"):
            lines.append(f"  Data categories: {', '.join(meta['data_types'])}")
        if meta.get("third_parties"):
            lines.append(f"  Third parties/integrations: {', '.join(meta['third_parties'])}")
        if meta.get("risk_flags"):
            lines.append(f"  RISK FLAGS — specific gaps found: {'; '.join(meta['risk_flags'])}")
        full_text = source.get("full_text", "").strip()
        if full_text:
            lines.append(f"  Extracted content:\n{full_text[:4000]}")
            # Mark chunks from this source as covered so we don't duplicate them below
            for chunk in chunks:
                if chunk.get("source_id") == src_id:
                    covered_chunk_ids.add(chunk.get("id", ""))
        elif source.get("summary"):
            lines.append(f"  Summary: {source['summary'][:400]}")
        doc_sections.append("\n".join(lines))

    docs_block = "\n\n".join(doc_sections) if doc_sections else "No documents uploaded yet."

    # Supplementary chunk content for documents without full_text (legacy sources, images, multi-sheet Excel)
    extra_chunks = [c for c in chunks if c.get("id", "") not in covered_chunk_ids]
    chunk_supplement = "\n".join(
        f"- {str(chunk.get('text', ''))[:1500]}"
        for chunk in extra_chunks[:15]
    )

    historical_summary = "\n".join(
        f"- {match.get('title', '')} ({match.get('similarity_score', 0)}): {', '.join(match.get('matched_terms', [])[:8])}"
        for match in (ra.historical_matches or [])[:5]
    )
    supplement_block = (
        "\n=== ADDITIONAL DOCUMENT EXCERPTS (supplementary) ===\n" + chunk_supplement
        if chunk_supplement.strip() else ""
    )
    return f"""=== CONTEXT PROFILE (AI-extracted + user-edited) ===
{context_profile}

=== UPLOADED DOCUMENTS ===
{docs_block}
{supplement_block}
=== SIMILAR HISTORICAL ASSESSMENTS ===
{historical_summary or "None"}""".strip()


def _fallback_suggested_questions(ra: RiskAssessment, chunks: list[dict]) -> list[dict]:
    context_text = " ".join([
        ra.title,
        ra.description,
        json.dumps(ra.context_profile or {}, sort_keys=True),
        " ".join(str(chunk.get("text", "")) for chunk in chunks[:10]),
    ]).lower()
    questions: list[dict] = []

    def add(question_id: str, section_id: str, text: str, question_type: str, priority: str, rationale: str) -> None:
        questions.append({
            "question_id": question_id,
            "section_id": section_id,
            "section_title": "Context Driven Questions",
            "text": text,
            "question_type": question_type,
            "priority": priority,
            "source": "context_rule",
            "rationale": rationale,
            "status": "suggested",
        })

    if any(term in context_text for term in ["gdpr", "personal data", "pii", "data subject", "privacy"]):
        add("dyn_gdpr_001", "privacy_regulatory", "Does the project process personal data for EU or UK data subjects?", "Exposure", "high", "Privacy or GDPR context was detected.")
        add("dyn_gdpr_002", "privacy_regulatory", "Has the lawful basis for personal data processing been documented?", "Control", "high", "GDPR requires a documented lawful basis.")
        add("dyn_gdpr_003", "privacy_regulatory", "Are data retention, subprocessors, and cross-border transfers documented?", "Control", "high", "GDPR obligations may apply to retention and third-party processing.")

    if any(term in context_text for term in ["jira", "ticket", "defect", "bug", "incident", "backlog"]):
        add("dyn_jira_001", "delivery_risk", "Are unresolved high-priority Jira items relevant to security, privacy, or availability?", "Exposure", "medium", "Jira or delivery issue context was detected.")
        add("dyn_jira_002", "delivery_risk", "Are owners and due dates assigned for open remediation or security tickets?", "Control", "medium", "Open delivery items may affect the current risk posture.")

    if any(term in context_text for term in ["mfa", "encryption", "logging", "vulnerability", "secrets", "iam", "authentication"]):
        add("dyn_sec_001", "security_requirements", "Are explicit security requirements mapped to implemented controls and evidence?", "Control", "high", "Security requirements were detected in the context.")
        add("dyn_sec_002", "security_requirements", "Are logging, monitoring, encryption, secrets management, and access controls covered by the design?", "Control", "high", "Core security-control topics were detected.")

    if not questions:
        add("dyn_context_001", "business_context", "What business outcome would be impacted if this project or application failed?", "Context", "medium", "Additional impact context improves risk scoring.")
        add("dyn_context_002", "business_context", "Are there regulatory, privacy, security, or contractual requirements that must be considered?", "Context", "medium", "No specific compliance trigger was detected yet.")

    return questions


def _normalize_controls_for_suggestion(raw_controls: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    seen_ids: set[str] = set()
    for control in raw_controls:
        control_id = str(control.get("control_id") or control.get("id") or "").strip()
        control_title = str(
            control.get("control_title")
            or control.get("control_name")
            or control.get("title")
            or control.get("name")
            or ""
        ).strip()
        if not control_id or not control_title or control_id in seen_ids:
            continue
        seen_ids.add(control_id)
        normalized.append({
            "control_id": control_id,
            "control_title": _clean_report_text(control_title),
            "description": _clean_report_text(str(control.get("description") or "")),
            "domain": str(control.get("domain") or "General"),
            "keywords": [str(keyword) for keyword in control.get("keywords", [])],
        })
    return normalized


def _preferred_control_domains_for_risk(risk: dict) -> list[str]:
    domains = list(_RISK_CATEGORY_DOMAIN_HINTS.get(str(risk.get("risk_category") or ""), []))
    risk_text = " ".join([
        str(risk.get("title") or ""),
        str(risk.get("description") or ""),
        str(risk.get("human_rationale") or ""),
    ])
    for token in _tokenize_match_text(risk_text):
        domains.extend(_RISK_KEYWORD_DOMAIN_HINTS.get(token, []))
    seen: set[str] = set()
    ordered: list[str] = []
    for domain in domains:
        if domain and domain not in seen:
            seen.add(domain)
            ordered.append(domain)
    return ordered


def _score_control_for_risk(risk: dict, control: dict) -> tuple[int, list[str]]:
    risk_tokens = _tokenize_match_text(
        " ".join([
            str(risk.get("title") or ""),
            str(risk.get("description") or ""),
            str(risk.get("human_rationale") or ""),
            str(risk.get("risk_category") or ""),
        ])
    )
    title_tokens = _tokenize_match_text(control.get("control_title", ""))
    description_tokens = _tokenize_match_text(control.get("description", ""))
    keyword_tokens = _tokenize_match_text(" ".join(control.get("keywords", [])))
    control_tokens = title_tokens | description_tokens | keyword_tokens
    shared_tokens = sorted(risk_tokens & control_tokens)
    preferred_domains = _preferred_control_domains_for_risk(risk)

    score = len(shared_tokens) + (2 * len(risk_tokens & title_tokens))
    reasons: list[str] = []
    if shared_tokens:
        reasons.append(f"Shared terms: {', '.join(shared_tokens[:3])}")
    if control.get("domain") in preferred_domains:
        score += 2
        reasons.append(f"Matches {control['domain']} control domain")
        if preferred_domains and control.get("domain") == preferred_domains[0]:
            score += 1
    return score, reasons


def _fallback_control_suggestions(risks: list[dict], controls: list[dict]) -> list[dict]:
    suggestions: list[dict] = []
    for risk in risks:
        scored: list[tuple[int, dict, list[str]]] = []
        for control in controls:
            score, reasons = _score_control_for_risk(risk, control)
            if score > 0:
                scored.append((score, control, reasons))

        if not scored:
            preferred_domains = _preferred_control_domains_for_risk(risk)
            for control in controls:
                if control.get("domain") in preferred_domains:
                    scored.append((1, control, [f"Matches {control['domain']} control domain"]))

        if not scored:
            scored = [(1, control, ["Selected as a baseline control-library safeguard for manual review."]) for control in controls[:3]]

        ranked_controls = sorted(
            scored,
            key=lambda item: (-item[0], item[1].get("control_title", "")),
        )[:3]

        for score, control, reasons in ranked_controls:
            suggestions.append({
                "risk_id": risk["id"],
                "control_id": control["control_id"],
                "control_title": control["control_title"],
                "rationale": "; ".join(reasons) if reasons else "Selected from the controls library for this risk.",
                "relevance_score": max(1, min(5, score)),
            })
    return suggestions


def _normalize_llm_suggestions(raw_suggestions: list[dict], risks: list[dict], controls: list[dict]) -> list[dict]:
    controls_by_id = {control["control_id"]: control for control in controls}
    valid_risk_ids = {risk["id"] for risk in risks}
    default_risk_id = risks[0]["id"] if len(risks) == 1 else None
    normalized: list[dict] = []
    seen_pairs: set[tuple[str, str]] = set()

    for item in raw_suggestions:
        if not isinstance(item, dict):
            continue
        control_id = str(item.get("control_id") or "").strip()
        if control_id not in controls_by_id:
            continue
        risk_id = str(item.get("risk_id") or "").strip()
        if risk_id not in valid_risk_ids:
            if default_risk_id is None:
                continue
            risk_id = default_risk_id
        pair = (risk_id, control_id)
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        try:
            relevance_score = int(item.get("relevance_score", 3))
        except (TypeError, ValueError):
            relevance_score = 3
        control = controls_by_id[control_id]
        normalized.append({
            "risk_id": risk_id,
            "control_id": control_id,
            "control_title": _clean_report_text(str(item.get("control_title") or control["control_title"])),
            "rationale": _clean_report_text(str(item.get("rationale") or "Selected from the controls library.")),
            "relevance_score": max(1, min(5, relevance_score)),
        })
    return normalized


def _build_risk_assessment_report(ra: RiskAssessment, asset_store: Any, generated_at: datetime | None = None) -> str:
    generated_at = generated_at or datetime.utcnow()
    ad_hoc_map = {a["id"]: a for a in ra.ad_hoc_applications}
    responses_by_asset: dict[str, list[dict]] = {}
    for response in ra.responses:
        responses_by_asset.setdefault(response["asset_id"], []).append(response)

    risks_by_asset: dict[str, list[dict]] = {}
    for risk in ra.risks:
        risks_by_asset.setdefault(risk["asset_id"], []).append(risk)

    controls_by_risk: dict[str, list[str]] = {}
    for control in ra.applied_controls:
        controls_by_risk.setdefault(control["risk_id"], []).append(control["control_id"])

    suggestions_by_risk: dict[str, list[dict]] = {}
    for suggestion in (ra.suggested_controls or []):
        suggestions_by_risk.setdefault(suggestion["risk_id"], []).append(suggestion)

    sections = get_sections()
    sections_total = len(sections)
    question_count = sum(len(section["questions"]) for section in sections)
    answer_counts = Counter((response.get("answer") or "").lower() for response in ra.responses)
    risk_band_counts = Counter(risk.get("inherent_risk_band", "Unknown") for risk in ra.risks)
    risk_category_counts = Counter(risk.get("risk_category", "Uncategorised") for risk in ra.risks)
    subject_profiles = [
        _resolve_subject_profile(asset_store, asset_id, ad_hoc_map)
        for asset_id in ra.asset_ids
    ]
    ranked_risks = sorted(
        ra.risks,
        key=lambda risk: (-risk.get("inherent_risk_score", 0), risk.get("title", "")),
    )
    missing_suggestions = [risk for risk in ra.risks if not suggestions_by_risk.get(risk["id"])]

    lines = [
        "# Report Header",
        f"Assessment Name: {ra.title}",
        f"Assessment Description: {ra.description or 'Not provided'}",
        f"Date of Report: {_format_calendar_date(generated_at)}",
        f"Assessment Created: {_format_calendar_date(ra.created_at)}",
        f"Assessment Updated: {_format_calendar_date(ra.updated_at)}",
        f"Assessment Status: {ra.status.replace('_', ' ').title()}",
        f"Applications in Scope: {len(subject_profiles)}",
        "",
        "# Executive Summary",
    ]

    summary = [
        f"This assessment covers {len(subject_profiles)} application(s)",
        f"with {len(ra.responses)} questionnaire response(s)",
        f"and {len(ra.risks)} identified risk(s).",
    ]
    if ra.risks:
        summary.append(
            "Risk distribution by band is "
            + ", ".join(f"{band}: {count}" for band, count in sorted(risk_band_counts.items()))
            + "."
        )
    if ra.applied_controls:
        summary.append(f"{len(ra.applied_controls)} control(s) have been applied to the recorded risks.")
    else:
        summary.append("No controls have been applied yet.")
    if ra.suggested_controls:
        summary.append(f"{len(ra.suggested_controls)} suggested control option(s) are available for review.")
    else:
        summary.append("No control suggestions have been generated yet, so remediation planning still requires manual review.")
    lines.append(" ".join(summary))

    lines.extend([
        "",
        "# Assessment Scope",
        "Applications reviewed in this assessment:",
    ])
    for profile in subject_profiles:
        lines.append(
            f"- {profile['name']} ({profile['type']}) | CIA {profile['confidentiality']}/{profile['integrity']}/{profile['availability']} "
            f"(total {profile['cia_total']}, criticality {profile['criticality']})"
        )
        if profile["description"]:
            lines.append(f"  Description: {profile['description']}")
        if profile["hosting_type"] or profile["support_type"]:
            lines.append(
                f"  Hosting: {profile['hosting_type'] or 'Unspecified'} | Support: {profile['support_type'] or 'Unspecified'}"
            )
        if profile["classification"] or profile["jurisdiction"]:
            lines.append(
                f"  Classification: {profile['classification'] or 'Unspecified'} | Jurisdiction: {profile['jurisdiction'] or 'Unspecified'}"
            )

    lines.extend([
        "",
        "# Assessment Method",
        "The report is generated directly from stored assessment data to keep dates, counts, and application details exact.",
        f"The questionnaire contains {sections_total} section(s) and {question_count} total question(s) per application.",
        "Inherent risks are derived from the completed questionnaire responses and recorded risk entries.",
        "Residual risk values are based on the controls currently applied to each recorded risk.",
        "",
        "# Evidence Summary",
        f"Total Responses Recorded: {len(ra.responses)}",
        "Response Breakdown",
        f"- Yes: {answer_counts.get('yes', 0)}",
        f"- No: {answer_counts.get('no', 0)}",
        f"- N/A: {answer_counts.get('na', 0)}",
        f"- Responses with analyst notes: {sum(1 for response in ra.responses if response.get('details', '').strip())}",
        "",
        "# Application-by-Application Findings",
    ])

    for profile in subject_profiles:
        asset_id = profile["id"]
        asset_responses = responses_by_asset.get(asset_id, [])
        asset_risks = risks_by_asset.get(asset_id, [])
        asset_answer_counts = Counter((response.get("answer") or "").lower() for response in asset_responses)
        sections_answered = len({response.get("section_id") for response in asset_responses if response.get("section_id")})
        notable_details = [response.get("details", "").strip() for response in asset_responses if response.get("details", "").strip()]

        lines.extend([
            f"## {profile['name']}",
            f"Application Type: {profile['type']}",
            f"Application Identifier: {asset_id}",
            f"CIA Profile: C {profile['confidentiality']} | I {profile['integrity']} | A {profile['availability']} | Total {profile['cia_total']} ({profile['criticality']})",
            f"Responses Recorded: {len(asset_responses)}",
            "Response Breakdown",
            f"- Yes: {asset_answer_counts.get('yes', 0)}",
            f"- No: {asset_answer_counts.get('no', 0)}",
            f"- N/A: {asset_answer_counts.get('na', 0)}",
            f"- Sections Answered: {sections_answered} of {sections_total}",
        ])
        if notable_details:
            lines.append("Key Analyst Notes")
            for detail in notable_details[:5]:
                lines.append(f"- {detail}")
        lines.append("Risk Findings")
        if asset_risks:
            for risk in sorted(asset_risks, key=lambda item: (-item.get("inherent_risk_score", 0), item.get("title", ""))):
                lines.append(
                    f"- {risk['title']} | {risk['risk_category']} | Inherent {risk['inherent_risk_band']} "
                    f"({risk['inherent_risk_score']}) | Residual {risk.get('residual_risk_band', 'Unknown')} "
                    f"({risk.get('residual_risk_score', 0)})"
                )
                if risk.get("description"):
                    lines.append(f"  Description: {risk['description']}")
                if risk.get("human_rationale"):
                    lines.append(f"  Rationale: {risk['human_rationale']}")
                applied_controls = controls_by_risk.get(risk["id"], [])
                if applied_controls:
                    lines.append(f"  Applied Controls: {', '.join(applied_controls)}")
                suggested_controls = suggestions_by_risk.get(risk["id"], [])
                if suggested_controls:
                    lines.append("  Suggested Controls:")
                    for suggestion in suggested_controls[:3]:
                        lines.append(
                            f"  - {suggestion.get('control_title', suggestion.get('control_id', 'Unknown control'))} "
                            f"(relevance {suggestion.get('relevance_score', 'n/a')}/5)"
                        )
                else:
                    lines.append("  Suggested Controls: None generated")
        else:
            lines.append("- No risks recorded for this application.")
        lines.append("")

    lines.append("# Cross-Application Risk Themes")
    if not ra.risks:
        lines.append("No risk themes are available because no risks have been recorded.")
    else:
        lines.append("Risk themes observed across the assessment:")
        for category, count in sorted(risk_category_counts.items()):
            lines.append(f"- {category}: {count} risk(s)")
        lines.append("Risk severity distribution:")
        for band, count in sorted(risk_band_counts.items()):
            lines.append(f"- {band}: {count}")

    lines.extend([
        "",
        "# Prioritized Remediation Themes",
    ])
    if not ranked_risks:
        lines.append("No remediation themes are available because no risks have been identified.")
    else:
        for index, risk in enumerate(ranked_risks, start=1):
            lines.append(
                f"{index}. {risk['title']} | {risk['risk_category']} | Inherent score {risk['inherent_risk_score']} ({risk['inherent_risk_band']})"
            )
            if suggestions_by_risk.get(risk["id"]):
                top_suggestion = suggestions_by_risk[risk["id"]][0]
                lines.append(
                    f"   Recommended next control: {top_suggestion.get('control_title', top_suggestion.get('control_id', 'Unknown control'))}"
                )
            else:
                lines.append("   Recommended next control: Manual control selection required.")

    lines.extend([
        "",
        "# Issues Affecting Suggested Controls",
    ])
    if not ra.suggested_controls:
        lines.append("No suggested controls have been generated for this assessment, so remediation planning remains incomplete.")
    elif missing_suggestions:
        lines.append("The following risks do not yet have suggested controls:")
        for risk in missing_suggestions:
            lines.append(f"- {risk['title']}")
    else:
        lines.append("Suggested controls are available for every recorded risk.")
    if not ra.applied_controls:
        lines.append("No controls have been applied yet, so residual risk reduction has not been demonstrated in the report data.")

    return _clean_report_text("\n".join(lines).strip())


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


@router.put("/{ra_id}/context", response_model=RiskAssessment)
def update_assessment_context(ra_id: str, body: RiskAssessmentContextUpdate):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    get_store().update_context_profile(ra_id, body.context_profile.model_dump())
    updated = get_store().get(ra_id)
    if not updated:
        raise HTTPException(404, "Assessment not found")
    return updated


@router.post("/{ra_id}/context-files", status_code=201)
async def upload_assessment_context_file(
    ra_id: str,
    file: UploadFile = File(...),
    source_type: str = Form("document"),
):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")

    content = await file.read()
    if not content:
        raise HTTPException(400, "Uploaded file is empty")

    filename = file.filename or "context-upload"
    text, metadata = _extract_context_text(filename, content, source_type=source_type)
    chunks = [
        {
            "id": str(uuid.uuid4()),
            "chunk_index": index,
            "text": chunk,
            "metadata": metadata,
        }
        for index, chunk in enumerate(_chunk_context_text(text))
    ]

    # Run LLM extraction once — captures both context profile fields and document metadata
    doc_metadata: dict = {}
    if text.strip():
        extracted = _llm_extract_context_from_document(text)
        if extracted:
            # Split: string fields → context_profile merge; list/type fields → doc_metadata
            doc_metadata = {k: extracted[k] for k in _DOC_METADATA_FIELDS if k in extracted}

            existing = ra.context_profile or {}
            existing_dict = existing if isinstance(existing, dict) else (existing.model_dump() if hasattr(existing, "model_dump") else dict(existing))
            merged = {
                **existing_dict,
                **{k: extracted[k] for k in _CONTEXT_PROFILE_FIELDS if k in extracted and isinstance(extracted[k], str) and extracted[k].strip() and not str(existing_dict.get(k, "")).strip()},
            }
            get_store().update_context_profile(ra_id, merged)

    source = {
        "id": str(uuid.uuid4()),
        "filename": filename,
        "content_type": file.content_type,
        "source_type": source_type,
        "sha256": hashlib.sha256(content).hexdigest(),
        "summary": _clean_report_text(text)[:500],
        "metadata": metadata,
        # Store the full document text (capped) so question generation can reference actual content
        "full_text": text[:12000],
        # Structured entities extracted from the document for targeted question generation
        "doc_metadata": doc_metadata,
    }
    get_store().add_context_source(ra_id, source, chunks)

    updated = get_store().get(ra_id)
    return {"ok": True, "source": source, "chunks_created": len(chunks), "assessment": updated}


@router.post("/{ra_id}/historical-context")
def refresh_historical_context(ra_id: str):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    matches = get_store().find_similar_assessments(ra)
    get_store().set_historical_matches(ra_id, matches)
    return {"assessment_id": ra_id, "matches": matches}


@router.post("/{ra_id}/suggest-questions")
def suggest_context_questions(ra_id: str):
    from langchain.schema import HumanMessage
    from utils.llm_provider import get_llm
    import json as _json

    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")

    matches = get_store().find_similar_assessments(ra)
    get_store().set_historical_matches(ra_id, matches)
    ra = get_store().get(ra_id) or ra
    chunks = get_store().get_context_chunks(ra_id)
    context_pack = _build_ra_context_pack(ra, chunks)

    # Count and list uploaded document types for the prompt header
    sources = ra.context_sources or []
    doc_inventory = ", ".join(
        f"{s.get('filename', 'file')} ({(s.get('doc_metadata') or {}).get('document_type', 'document')})"
        for s in sources[:5]
    ) if sources else "no documents uploaded"

    prompt = f"""You are a senior technology risk assessor conducting a formal risk assessment.

The assessor has uploaded the following documents: {doc_inventory}

YOUR TASK: Generate highly specific, document-derived evidence-request questions.

CRITICAL RULES — failure to follow these makes the questions useless:
1. Every question MUST be grounded in something specific found in the uploaded documents — a named technology, a stated regulation, a detected risk flag, a mentioned data type, or a named third party. DO NOT write generic questions.
2. Name the specific thing from the document in the question text (e.g. "Given that the architecture document references AWS S3 for document storage..." or "The VAPT report flagged TLS 1.0 as still supported on the API gateway...").
3. Ask for a concrete, named artefact as evidence: VAPT report, KMS policy screenshot, IAM role export, DSAR process document, penetration test sign-off, architecture diagram with annotations, etc.
4. In the rationale, cite BOTH (a) the specific document finding and (b) the applicable regulation/standard/risk framework clause.
5. Cover different risk areas — do not generate 5 questions all about the same topic.

{context_pack}

Return ONLY a valid JSON array of up to 15 questions. Each item must follow this exact schema:
{{
  "question_id": "dyn_<short_snake_case_id>",
  "section_id": "access_control|data_protection|vulnerability_management|incident_response|third_party_risk|delivery_risk|architecture|compliance|cloud_security|identity_management",
  "section_title": "Human-readable section name",
  "text": "Given that [specific finding from the document], please provide [named artefact/evidence] demonstrating [control or requirement]. The evidence should confirm [what it must show].",
  "question_type": "Exposure|Control|Context",
  "priority": "low|medium|high",
  "source": "llm_context",
  "rationale": "[Document filename + specific finding] — [applicable regulation or standard clause] requires this because [concise reason].",
  "status": "suggested"
}}

If no documents were uploaded and only a context profile is available, generate questions based on the stated technologies, data types, and business context — but still be specific, not generic."""

    try:
        llm = get_llm()
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content.strip()
        content = _re.sub(r"^```[a-zA-Z]*\n?", "", content)
        content = _re.sub(r"\n?```$", "", content).strip()
        raw_questions = _json.loads(content)
        if not isinstance(raw_questions, list):
            raise ValueError(f"Expected JSON array, got {type(raw_questions).__name__}")
    except Exception as exc:
        logger.error(f"Question suggestion failed for {ra_id}: {exc}")
        raw_questions = _fallback_suggested_questions(ra, chunks)

    normalized: list[dict] = []
    seen_ids: set[str] = set()
    for index, item in enumerate(raw_questions[:25], start=1):
        if not isinstance(item, dict):
            continue
        candidate = dict(item)
        candidate.setdefault("question_id", f"dyn_context_{index:03d}")
        candidate.setdefault("text", "")
        if not str(candidate.get("text", "")).strip():
            continue
        candidate["question_id"] = str(candidate["question_id"]).strip() or f"dyn_context_{index:03d}"
        if candidate["question_id"] in seen_ids:
            candidate["question_id"] = f"{candidate['question_id']}_{index}"
        seen_ids.add(candidate["question_id"])
        normalized.append(SuggestedQuestion(**candidate).model_dump())

    get_store().set_suggested_questions(ra_id, normalized)
    return {"assessment_id": ra_id, "suggested_questions": normalized}


@router.post("/{ra_id}/suggest-questions/{question_id}/respond", status_code=201)
def answer_context_question(ra_id: str, question_id: str, body: SuggestedQuestionAnswer):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    ok = get_store().answer_suggested_question(ra_id, question_id, body.answer, body.details)
    if not ok:
        raise HTTPException(404, "Suggested question not found")
    updated = get_store().get(ra_id)
    return {"ok": True, "suggested_questions": updated.suggested_questions if updated else []}


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


@router.post("/{ra_id}/respond-batch", status_code=200)
def submit_response_batch(ra_id: str, body: ResponseBatch):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    if not body.responses:
        raise HTTPException(400, "No responses provided")
    now = datetime.utcnow().isoformat()
    asset_id = body.responses[0].asset_id
    new_responses = [
        {
            "id": str(uuid.uuid4()),
            "asset_id": r.asset_id,
            "section_id": r.section_id,
            "question_id": r.question_id,
            "answer": r.answer,
            "details": r.details,
            "submitted_at": now,
        }
        for r in body.responses
    ]
    get_store().add_responses_batch(ra_id, asset_id, new_responses)
    updated = get_store().get(ra_id)
    return updated


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
        logger.warning(f"[{ra_id}] analyse called with no responses — proceeding with CIA-only scoring")

    from api.routers.assets import get_store as get_asset_store
    asset_store = get_asset_store()

    by_asset: dict[str, list[dict]] = {}
    for resp in ra.responses:
        by_asset.setdefault(resp["asset_id"], []).append(resp)

    all_risks: list[dict] = []

    ad_hoc_map = {a["id"]: a for a in ra.ad_hoc_applications}
    context_chunks = get_store().get_context_chunks(ra_id)
    if not ra.historical_matches:
        get_store().set_historical_matches(ra_id, get_store().find_similar_assessments(ra))
        ra = get_store().get(ra_id) or ra
    context_pack = _build_ra_context_pack(ra, context_chunks)

    for asset_id, asset_responses in by_asset.items():
        asset = asset_store.get(asset_id)
        ad_hoc = ad_hoc_map.get(asset_id)
        asset_name = (asset.name if asset else None) or (ad_hoc.get("name") if ad_hoc else None) or asset_id
        if asset:
            cia_total = asset.cia_total
            cia_band = compute_criticality(cia_total)
        elif ad_hoc:
            cia_total, cia_band = _cia_band_from_values(
                ad_hoc.get("confidentiality", 3),
                ad_hoc.get("integrity", 3),
                ad_hoc.get("availability", 3),
            )
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

Additional Risk Assessment Context:
{context_pack}

Context-Driven Question Responses (section | question | answer | details):
{chr(10).join(
    f"{q.get('section_id','')} | {q.get('text','')} | {q.get('answer','')} | {q.get('details','')}"
    for q in (ra.suggested_questions or [])
    if q.get("answer")
) or "None provided"}

Assessment Responses (section | question | answer | details):
{qa_text}

Based on these responses and the CIA profile, identify 2-4 specific, actionable risks for this application.
Score based on the CIA band: Critical=high scores (4-5), High=moderate-high (3-4), Medium=moderate (2-3), Low=lower (1-2).
For each risk return a JSON object with:
- title: short risk title (max 10 words)
- description: 1-2 sentence description of the risk
- risk_category: one of [Operational, Regulatory, Privacy, Financial, Reputational, Technical]
- likelihood_score: integer 1-5 (score independently based on application profile and answers)
- impact_score: integer 1-5 (score independently based on application profile and answers)
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
    raw_controls = ctrl_store.all_controls() if hasattr(ctrl_store, "all_controls") else ctrl_store.list()
    all_controls = _normalize_controls_for_suggestion(raw_controls)
    if not all_controls:
        get_store().set_suggested_controls(ra_id, [])
        return {"assessment_id": ra_id, "suggestions": []}
    controls_summary = "\n".join(
        f"- [{c['control_id']}] {c['control_title']} (domain: {c.get('domain', 'General')})"
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
        raw_suggestions = _json.loads(content)
        if not isinstance(raw_suggestions, list):
            raise ValueError(f"Expected JSON array, got {type(raw_suggestions).__name__}")
        suggestions = _normalize_llm_suggestions(raw_suggestions, ra.risks, all_controls)
        if not suggestions:
            raise ValueError("LLM returned no usable control suggestions")
    except Exception as e:
        logger.error(f"Control suggestion LLM failed for {ra_id}: {e}")
        suggestions = _fallback_control_suggestions(ra.risks, all_controls)

    get_store().set_suggested_controls(ra_id, suggestions)
    return {"assessment_id": ra_id, "suggestions": suggestions}


@router.post("/{ra_id}/generate-report")
def generate_report(ra_id: str):
    """Persona 7: Assessment Report Writer — 9-section risk assessment report."""
    from api.routers.assets import get_store as get_asset_store

    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    if not ra.risks:
        raise HTTPException(400, "No risks identified. Run /analyze first.")

    asset_store = get_asset_store()
    try:
        report_md = _build_risk_assessment_report(ra, asset_store, generated_at=datetime.utcnow())
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
