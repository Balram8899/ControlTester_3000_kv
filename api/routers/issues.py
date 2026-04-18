import os, uuid, logging
from datetime import datetime
from typing import Literal, Optional, Any

import pymongo
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from utils.risk_scorer import compute_control_effectiveness

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/issues", tags=["issues"])

SeverityType    = Literal["Low", "Medium", "High", "Critical"]
IssueStatusType = Literal["Open", "In Remediation", "Pending Sign-off", "Closed"]


class IssueCreate(BaseModel):
    title: str
    description: str
    severity: SeverityType
    asset_id: Optional[str] = None
    control_id: Optional[str] = None
    risk_assessment_id: Optional[str] = None
    raised_by: str
    assigned_to: str
    approver: str
    remediation_plan: Optional[str] = None
    target_date: Optional[str] = None


class IssueUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[SeverityType] = None
    assigned_to: Optional[str] = None
    approver: Optional[str] = None
    remediation_plan: Optional[str] = None
    target_date: Optional[str] = None


class ApproveRequest(BaseModel):
    decision: Literal["approved", "rejected"]
    notes: Optional[str] = None


class Issue(IssueCreate):
    id: str
    status: IssueStatusType = "Open"
    evidences: list[dict] = []
    approvals: list[dict] = []
    created_at: str
    updated_at: str


class MongoIssueStore:
    def __init__(self, mongo_uri: str | None = None):
        uri = mongo_uri or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        self.client = pymongo.MongoClient(uri)
        self.db = self.client["trace_db"]
        self.col = self.db["issues"]
        self.col.create_index("severity")
        self.col.create_index("status")
        self.col.create_index("asset_id")
        self.col.create_index("control_id")

    def _to_issue(self, doc: dict) -> Issue:
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id"))
        return Issue(**doc)

    def create(self, data: IssueCreate) -> Issue:
        now = datetime.utcnow().isoformat()
        doc = data.model_dump()
        doc.update(
            id=str(uuid.uuid4()),
            status="Open",
            evidences=[],
            approvals=[],
            created_at=now,
            updated_at=now,
        )
        self.col.insert_one({**doc, "_id": doc["id"]})
        return Issue(**doc)

    def list(
        self,
        severity_f: Optional[SeverityType] = None,
        status_f: Optional[IssueStatusType] = None,
        asset_id_f: Optional[str] = None,
        control_id_f: Optional[str] = None,
    ) -> list[Issue]:
        q: dict[str, Any] = {}
        if severity_f:   q["severity"]   = severity_f
        if status_f:     q["status"]     = status_f
        if asset_id_f:   q["asset_id"]   = asset_id_f
        if control_id_f: q["control_id"] = control_id_f
        return [self._to_issue(d) for d in self.col.find(q)]

    def get(self, issue_id: str) -> Issue | None:
        doc = self.col.find_one({"_id": issue_id})
        return self._to_issue(doc) if doc else None

    def update(self, issue_id: str, data: IssueUpdate) -> Issue | None:
        existing = self.col.find_one({"_id": issue_id})
        if not existing:
            return None
        updates = data.model_dump(exclude_unset=True)
        merged = {**existing, **updates}
        merged["updated_at"] = datetime.utcnow().isoformat()
        if (
            merged.get("remediation_plan")
            and existing.get("status") == "Open"
        ):
            merged["status"] = "In Remediation"
        set_payload = {k: v for k, v in merged.items() if k != "_id"}
        self.col.update_one({"_id": issue_id}, {"$set": set_payload})
        return self._to_issue(merged)

    def delete(self, issue_id: str) -> bool:
        return self.col.delete_one({"_id": issue_id}).deleted_count == 1

    def transition(self, issue_id: str, new_status: IssueStatusType) -> Issue | None:
        now = datetime.utcnow().isoformat()
        self.col.update_one(
            {"_id": issue_id},
            {"$set": {"status": new_status, "updated_at": now}},
        )
        return self.get(issue_id)

    def add_evidence(self, issue_id: str, filename: str, content_b64: str, uploaded_by: str) -> Issue | None:
        now = datetime.utcnow().isoformat()
        evidence = {
            "id": str(uuid.uuid4()),
            "filename": filename,
            "content_b64": content_b64,
            "uploaded_by": uploaded_by,
            "uploaded_at": now,
        }
        self.col.update_one(
            {"_id": issue_id},
            {"$push": {"evidences": evidence}, "$set": {"updated_at": now}},
        )
        return self.get(issue_id)

    def add_approval(self, issue_id: str, decision: str, notes: Optional[str], approver: str, new_status: IssueStatusType) -> Issue | None:
        now = datetime.utcnow().isoformat()
        approval = {
            "id": str(uuid.uuid4()),
            "stage": 1,
            "approver": approver,
            "decision": decision,
            "notes": notes,
            "decided_at": now,
        }
        self.col.update_one(
            {"_id": issue_id},
            {"$push": {"approvals": approval}, "$set": {"status": new_status, "updated_at": now}},
        )
        return self.get(issue_id)


_store: MongoIssueStore | None = None


def get_store() -> MongoIssueStore:
    global _store
    if _store is None:
        _store = MongoIssueStore()
    return _store


@router.post("", status_code=201, response_model=Issue)
def create_issue(body: IssueCreate):
    return get_store().create(body)


@router.get("", response_model=list[Issue])
def list_issues(
    severity: Optional[SeverityType] = None,
    status: Optional[IssueStatusType] = None,
    asset_id: Optional[str] = None,
    control_id: Optional[str] = None,
):
    return get_store().list(
        severity_f=severity,
        status_f=status,
        asset_id_f=asset_id,
        control_id_f=control_id,
    )


@router.get("/{issue_id}/impact")
def get_issue_impact(issue_id: str):
    issue = get_store().get(issue_id)
    if not issue:
        raise HTTPException(404, "Issue not found")
    active_severity = issue.severity if issue.status != "Closed" else None
    effectiveness = compute_control_effectiveness(active_severity)
    return {
        "issue_id": issue_id,
        "severity": issue.severity,
        "status": issue.status,
        "control_effectiveness": effectiveness,
        "note": "Residual risk impact will be populated in Sub-Project 3 (Risk Assessment)",
    }


@router.post("/{issue_id}/evidence", response_model=Issue)
async def upload_evidence(
    issue_id: str,
    file: UploadFile = File(...),
    uploaded_by: str = Form(""),
):
    import base64
    issue = get_store().get(issue_id)
    if not issue:
        raise HTTPException(404, "Issue not found")
    content = await file.read()
    content_b64 = base64.b64encode(content).decode()
    result = get_store().add_evidence(issue_id, file.filename or "upload", content_b64, uploaded_by)
    if not result:
        raise HTTPException(500, "Failed to attach evidence")
    return result


@router.post("/{issue_id}/submit", response_model=Issue)
def submit_issue(issue_id: str):
    issue = get_store().get(issue_id)
    if not issue:
        raise HTTPException(404, "Issue not found")
    if issue.status not in ("Open", "In Remediation"):
        raise HTTPException(400, f"Cannot submit issue with status '{issue.status}'")
    result = get_store().transition(issue_id, "Pending Sign-off")
    if not result:
        raise HTTPException(500, "Transition failed")
    return result


@router.post("/{issue_id}/approve", response_model=Issue)
def approve_issue(issue_id: str, body: ApproveRequest):
    issue = get_store().get(issue_id)
    if not issue:
        raise HTTPException(404, "Issue not found")
    if issue.status != "Pending Sign-off":
        raise HTTPException(400, "Issue is not pending sign-off")
    new_status: IssueStatusType = "Closed" if body.decision == "approved" else "In Remediation"
    result = get_store().add_approval(
        issue_id,
        decision=body.decision,
        notes=body.notes,
        approver=issue.approver,
        new_status=new_status,
    )
    if not result:
        raise HTTPException(500, "Approval failed")
    return result


@router.get("/{issue_id}", response_model=Issue)
def get_issue(issue_id: str):
    issue = get_store().get(issue_id)
    if not issue:
        raise HTTPException(404, "Issue not found")
    return issue


@router.put("/{issue_id}", response_model=Issue)
def update_issue(issue_id: str, body: IssueUpdate):
    issue = get_store().update(issue_id, body)
    if not issue:
        raise HTTPException(404, "Issue not found")
    return issue


@router.delete("/{issue_id}", status_code=204)
def delete_issue(issue_id: str):
    if not get_store().delete(issue_id):
        raise HTTPException(404, "Issue not found")
