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
