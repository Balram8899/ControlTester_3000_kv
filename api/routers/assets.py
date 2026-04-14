import os, uuid, logging
from datetime import datetime, timedelta
from typing import Literal, Optional, Any

import pymongo
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.risk_scorer import compute_cia_score, compute_criticality, compute_periodicity

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assets", tags=["assets"])

CIALevel       = Literal["low", "medium", "high"]
AssetType      = Literal["IT", "Data", "Process", "Vendor"]
LocationType   = Literal["On-premise", "Cloud", "Hybrid"]
ClassType      = Literal["Public", "Internal", "Confidential", "Restricted"]
StatusType     = Literal["Active", "Retired", "Under Review"]
CriticalityType = Literal["Critical", "High", "Medium", "Low"]
PeriodicityType = Literal["Quarterly", "Semi-Annual", "Annual"]


class AssetCreate(BaseModel):
    name: str
    type: AssetType
    description: str
    confidentiality: CIALevel
    integrity: CIALevel
    availability: CIALevel
    owner: str
    custodian: str
    location: LocationType
    jurisdiction: str
    classification: ClassType
    status: StatusType = "Active"


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[AssetType] = None
    description: Optional[str] = None
    confidentiality: Optional[CIALevel] = None
    integrity: Optional[CIALevel] = None
    availability: Optional[CIALevel] = None
    owner: Optional[str] = None
    custodian: Optional[str] = None
    location: Optional[LocationType] = None
    jurisdiction: Optional[str] = None
    classification: Optional[ClassType] = None
    status: Optional[StatusType] = None


class Asset(AssetCreate):
    id: str
    cia_score: float
    criticality: CriticalityType
    assessment_periodicity: PeriodicityType
    next_assessment_due: Optional[str] = None
    last_assessment_id: Optional[str] = None
    created_at: str
    updated_at: str


class MongoAssetStore:
    def __init__(self, mongo_uri: str | None = None):
        uri = mongo_uri or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        self.client = pymongo.MongoClient(uri)
        self.db = self.client["trace_db"]
        self.col = self.db["assets"]
        self.col.create_index("name")
        self.col.create_index("type")
        self.col.create_index("criticality")

    def _enrich(self, d: dict) -> dict:
        score = compute_cia_score(d["confidentiality"], d["integrity"], d["availability"])
        criticality = compute_criticality(score)
        d["cia_score"] = round(score, 3)
        d["criticality"] = criticality
        d["assessment_periodicity"] = compute_periodicity(criticality)
        return d

    def _due_date(self, periodicity: str) -> str:
        days = {"Quarterly": 90, "Semi-Annual": 180, "Annual": 365}
        return (datetime.utcnow() + timedelta(days=days.get(periodicity, 365))).date().isoformat()

    def _to_asset(self, doc: dict) -> Asset:
        doc["id"] = str(doc.pop("_id"))
        return Asset(**doc)

    def create(self, data: AssetCreate) -> Asset:
        now = datetime.utcnow().isoformat()
        doc = self._enrich(data.model_dump())
        doc.update(id=str(uuid.uuid4()), created_at=now, updated_at=now,
                   last_assessment_id=None)
        doc["next_assessment_due"] = self._due_date(doc["assessment_periodicity"])
        self.col.insert_one({**doc, "_id": doc["id"]})
        return Asset(**doc)

    def list(self, type_f=None, crit_f=None, status_f=None) -> list[Asset]:
        q: dict[str, Any] = {}
        if type_f:   q["type"] = type_f
        if crit_f:   q["criticality"] = crit_f
        if status_f: q["status"] = status_f
        return [self._to_asset(d) for d in self.col.find(q)]

    def get(self, asset_id: str) -> Asset | None:
        doc = self.col.find_one({"_id": asset_id})
        return self._to_asset(doc) if doc else None

    def update(self, asset_id: str, data: AssetUpdate) -> Asset | None:
        existing = self.col.find_one({"_id": asset_id})
        if not existing: return None
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        merged = self._enrich({**existing, **updates})
        merged["updated_at"] = datetime.utcnow().isoformat()
        merged["next_assessment_due"] = self._due_date(merged["assessment_periodicity"])
        self.col.update_one({"_id": asset_id}, {"$set": merged})
        return self._to_asset(merged)

    def delete(self, asset_id: str) -> bool:
        return self.col.delete_one({"_id": asset_id}).deleted_count == 1


_store: MongoAssetStore | None = None

def get_store() -> MongoAssetStore:
    global _store
    if _store is None:
        _store = MongoAssetStore()
    return _store
