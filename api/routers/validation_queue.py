import os, uuid, logging
from datetime import datetime
from typing import Literal, Optional, Any

import pymongo
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/validation-queue", tags=["validation-queue"])

SeverityType    = Literal["Low", "Medium", "High", "Critical"]
QueueStatusType = Literal["Pending", "Accepted", "Dismissed"]


class ValidationQueueCreate(BaseModel):
    title: str
    description: str
    severity: SeverityType
    source_module: Optional[str] = None
    asset_ids: list[str] = []
    control_ids: list[str] = []


class AcceptRequest(BaseModel):
    raised_by: str
    owner: str
    checker: str
    notes: Optional[str] = None


class ValidationQueueItem(ValidationQueueCreate):
    id: str
    queue_status: QueueStatusType = "Pending"
    accepted_issue_id: Optional[str] = None
    created_at: str
    updated_at: str


class MongoValidationQueueStore:
    def __init__(self, mongo_uri: str | None = None):
        uri = mongo_uri or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        self.client = pymongo.MongoClient(uri)
        self.db = self.client["trace_db"]
        self.col = self.db["validation_queue"]
        self.col.create_index("queue_status")
        self.col.create_index("source_module")

    def _to_item(self, doc: dict) -> ValidationQueueItem:
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id"))
        return ValidationQueueItem(**doc)

    def create(self, data: ValidationQueueCreate) -> ValidationQueueItem:
        now = datetime.utcnow().isoformat()
        doc = data.model_dump()
        doc.update(
            id=str(uuid.uuid4()),
            queue_status="Pending",
            accepted_issue_id=None,
            created_at=now,
            updated_at=now,
        )
        self.col.insert_one({**doc, "_id": doc["id"]})
        return ValidationQueueItem(**doc)

    def list(self, queue_status_f: Optional[QueueStatusType] = None, source_module_f: Optional[str] = None) -> list[ValidationQueueItem]:
        q: dict[str, Any] = {}
        if queue_status_f:  q["queue_status"]  = queue_status_f
        if source_module_f: q["source_module"] = source_module_f
        return [self._to_item(d) for d in self.col.find(q)]

    def get(self, item_id: str) -> ValidationQueueItem | None:
        doc = self.col.find_one({"_id": item_id})
        return self._to_item(doc) if doc else None

    def accept(self, item_id: str, issue_id: str) -> ValidationQueueItem | None:
        now = datetime.utcnow().isoformat()
        self.col.update_one(
            {"_id": item_id},
            {"$set": {"queue_status": "Accepted", "accepted_issue_id": issue_id, "updated_at": now}},
        )
        return self.get(item_id)

    def dismiss(self, item_id: str) -> ValidationQueueItem | None:
        now = datetime.utcnow().isoformat()
        self.col.update_one(
            {"_id": item_id},
            {"$set": {"queue_status": "Dismissed", "updated_at": now}},
        )
        return self.get(item_id)


_store: MongoValidationQueueStore | None = None


def get_store() -> MongoValidationQueueStore:
    global _store
    if _store is None:
        _store = MongoValidationQueueStore()
    return _store


@router.post("", status_code=201, response_model=ValidationQueueItem)
def add_to_queue(body: ValidationQueueCreate):
    return get_store().create(body)


@router.get("", response_model=list[ValidationQueueItem])
def list_queue(
    queue_status: Optional[QueueStatusType] = None,
    source_module: Optional[str] = None,
):
    return get_store().list(queue_status_f=queue_status, source_module_f=source_module)


@router.get("/{item_id}", response_model=ValidationQueueItem)
def get_queue_item(item_id: str):
    item = get_store().get(item_id)
    if not item:
        raise HTTPException(404, "Queue item not found")
    return item


@router.post("/{item_id}/accept", response_model=ValidationQueueItem)
def accept_queue_item(item_id: str, body: AcceptRequest):
    from api.routers.issues import IssueCreate, get_store as get_issue_store
    item = get_store().get(item_id)
    if not item:
        raise HTTPException(404, "Queue item not found")
    if item.queue_status != "Pending":
        raise HTTPException(400, f"Queue item is already '{item.queue_status}'")
    issue_data = IssueCreate(
        title=item.title,
        description=item.description,
        severity=item.severity,
        source_module=item.source_module,
        asset_ids=item.asset_ids,
        control_ids=item.control_ids,
        raised_by=body.raised_by,
        owner=body.owner,
        checker=body.checker,
    )
    issue = get_issue_store().create(issue_data)
    result = get_store().accept(item_id, issue.id)
    if not result:
        raise HTTPException(500, "Failed to accept queue item")
    return result


@router.post("/{item_id}/dismiss", response_model=ValidationQueueItem)
def dismiss_queue_item(item_id: str):
    item = get_store().get(item_id)
    if not item:
        raise HTTPException(404, "Queue item not found")
    if item.queue_status != "Pending":
        raise HTTPException(400, f"Queue item is already '{item.queue_status}'")
    result = get_store().dismiss(item_id)
    if not result:
        raise HTTPException(500, "Failed to dismiss queue item")
    return result
