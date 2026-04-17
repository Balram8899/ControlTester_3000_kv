# api/routers/assets.py
import os
import uuid
import logging
from datetime import datetime
from typing import Any, Literal, Optional

import pymongo
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, model_validator

from utils.risk_scorer import compute_cia_total, compute_cia_band
from utils.controls_library import MongoControlsStore
from utils.regulatory_library import MongoLibraryStore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assets", tags=["assets"])

# ── Enum literals ─────────────────────────────────────────────────────────

AssetType = Literal[
    "Application", "Hardware", "Database", "Interface/API",
    "Network Component", "Desktop/Client Software", "Other",
]
HostingType = Literal[
    "PaaS", "IaaS", "SaaS", "Internally Hosted",
    "Desktop/Client Software", "Not Hosted", "Unspecified",
]
SupportType = Literal["Company", "Vendor", "Business"]
StatusType = Literal[
    "Operational", "Build in Progress", "Planned Decommissioning",
    "Decommissioned", "Archived",
]
ClassType = Literal["Public", "Internal", "Confidential", "Restricted"]
CIABand = Literal["Low", "Medium", "High", "Critical"]


# ── Pydantic models ───────────────────────────────────────────────────────

class AssetCreate(BaseModel):
    name: str
    description: str
    use: str
    asset_type: AssetType
    hosting_type: Optional[HostingType] = None
    support_type: SupportType
    status: StatusType = "Operational"
    owner: str
    custodian: str
    location: str
    jurisdiction: str
    classification: ClassType
    confidentiality_score: int  # 1-5
    integrity_score: int        # 1-5
    availability_score: int     # 1-5

    @model_validator(mode="after")
    def _validate_fields(self) -> "AssetCreate":
        for field in ("confidentiality_score", "integrity_score", "availability_score"):
            v = getattr(self, field)
            if not (1 <= v <= 5):
                raise ValueError(f"{field} must be between 1 and 5, got {v}")
        if self.asset_type == "Application":
            if self.hosting_type is None:
                self.hosting_type = "Unspecified"
        else:
            self.hosting_type = None
        return self


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    use: Optional[str] = None
    asset_type: Optional[AssetType] = None
    hosting_type: Optional[HostingType] = None
    support_type: Optional[SupportType] = None
    status: Optional[StatusType] = None
    owner: Optional[str] = None
    custodian: Optional[str] = None
    location: Optional[str] = None
    jurisdiction: Optional[str] = None
    classification: Optional[ClassType] = None
    confidentiality_score: Optional[int] = None
    integrity_score: Optional[int] = None
    availability_score: Optional[int] = None

    @model_validator(mode="after")
    def _validate_cia(self) -> "AssetUpdate":
        for field in ("confidentiality_score", "integrity_score", "availability_score"):
            v = getattr(self, field)
            if v is not None and not (1 <= v <= 5):
                raise ValueError(f"{field} must be between 1 and 5, got {v}")
        return self


class Asset(AssetCreate):
    id: str
    cia_total: int
    cia_band: CIABand
    created_at: str
    updated_at: str


# ── MongoDB store ─────────────────────────────────────────────────────────

class MongoAssetStore:
    def __init__(self, mongo_uri: str | None = None):
        uri = mongo_uri or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        self.client = pymongo.MongoClient(uri)
        self.db = self.client["trace_db"]
        self.col = self.db["assets"]
        self.col.create_index("name")
        self.col.create_index("asset_type")
        self.col.create_index("cia_band")
        self.col.create_index("status")

    def _enrich(self, d: dict) -> dict:
        total = compute_cia_total(
            d["confidentiality_score"], d["integrity_score"], d["availability_score"]
        )
        d["cia_total"] = total
        d["cia_band"] = compute_cia_band(total)
        return d

    def _to_asset(self, doc: dict) -> Asset:
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id"))
        return Asset(**doc)

    def create(self, data: AssetCreate) -> Asset:
        now = datetime.utcnow().isoformat()
        doc = self._enrich(data.model_dump())
        doc.update(id=str(uuid.uuid4()), created_at=now, updated_at=now)
        self.col.insert_one({**doc, "_id": doc["id"]})
        return Asset(**doc)

    def list(
        self,
        asset_type_f: str | None = None,
        band_f: str | None = None,
        status_f: str | None = None,
    ) -> list[Asset]:
        q: dict[str, Any] = {}
        if asset_type_f:
            q["asset_type"] = asset_type_f
        if band_f:
            q["cia_band"] = band_f
        if status_f:
            q["status"] = status_f
        return [self._to_asset(d) for d in self.col.find(q)]

    def get(self, asset_id: str) -> Asset | None:
        doc = self.col.find_one({"_id": asset_id})
        return self._to_asset(doc) if doc else None

    def update(self, asset_id: str, data: AssetUpdate) -> Asset | None:
        existing = self.col.find_one({"_id": asset_id})
        if not existing:
            return None
        merged = dict(existing)
        for k, v in data.model_dump().items():
            if v is not None:
                merged[k] = v
        if merged.get("asset_type") != "Application":
            merged["hosting_type"] = None
        elif merged.get("hosting_type") is None:
            merged["hosting_type"] = "Unspecified"
        merged = self._enrich(merged)
        merged["updated_at"] = datetime.utcnow().isoformat()
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
