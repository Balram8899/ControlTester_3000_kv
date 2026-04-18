import os, uuid, logging
from datetime import datetime
from typing import Literal, Optional, Any

import pymongo
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from utils.risk_scorer import compute_cia_total, compute_criticality
from utils.llm_provider import get_llm

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assets", tags=["assets"])

AssetType       = Literal["Application", "Hardware", "Database", "Interface/API", "Network Component", "Desktop/Client Software", "Other"]
HostingType     = Literal["PaaS", "IaaS", "SaaS", "Internally Hosted", "Desktop/Client Software", "Not Hosted", "Unspecified"]
SupportType     = Literal["Company", "Vendor", "Business"]
LocationType    = Literal["On-premise", "Cloud", "Hybrid"]
ClassType       = Literal["Public", "Internal", "Confidential", "Restricted"]
StatusType      = Literal["Operational", "Build in Progress", "Planned Decommissioning", "Decommissioned", "Archived"]
CriticalityType = Literal["Critical", "High", "Medium", "Low"]


class AssetCreate(BaseModel):
    name: str
    type: AssetType
    description: str
    use: str = ""
    hosting_type: Optional[HostingType] = None
    support_type: Optional[SupportType] = None
    confidentiality: int = Field(ge=1, le=5)
    integrity: int = Field(ge=1, le=5)
    availability: int = Field(ge=1, le=5)
    owner: str
    custodian: str
    location: LocationType
    jurisdiction: str
    classification: ClassType
    status: StatusType = "Operational"


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[AssetType] = None
    description: Optional[str] = None
    use: Optional[str] = None
    hosting_type: Optional[HostingType] = None
    support_type: Optional[SupportType] = None
    confidentiality: Optional[int] = Field(default=None, ge=1, le=5)
    integrity: Optional[int] = Field(default=None, ge=1, le=5)
    availability: Optional[int] = Field(default=None, ge=1, le=5)
    owner: Optional[str] = None
    custodian: Optional[str] = None
    location: Optional[LocationType] = None
    jurisdiction: Optional[str] = None
    classification: Optional[ClassType] = None
    status: Optional[StatusType] = None


class Asset(AssetCreate):
    id: str
    cia_total: int
    criticality: CriticalityType
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
        total = compute_cia_total(d["confidentiality"], d["integrity"], d["availability"])
        d["cia_total"] = total
        d["criticality"] = compute_criticality(total)
        return d

    def _to_asset(self, doc: dict) -> Asset:
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id"))
        doc.setdefault("use", "")
        doc.setdefault("hosting_type", None)
        doc.setdefault("support_type", None)
        return Asset(**doc)

    def create(self, data: AssetCreate) -> Asset:
        now = datetime.utcnow().isoformat()
        doc = self._enrich(data.model_dump())
        doc.update(id=str(uuid.uuid4()), created_at=now, updated_at=now,
                   last_assessment_id=None)
        self.col.insert_one({**doc, "_id": doc["id"]})
        return Asset(**doc)

    def list(self, type_f: Optional[AssetType] = None, crit_f: Optional[CriticalityType] = None, status_f: Optional[StatusType] = None) -> list[Asset]:
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
        updates = data.model_dump(exclude_unset=True)
        merged = self._enrich({**existing, **updates})
        merged["updated_at"] = datetime.utcnow().isoformat()
        set_payload = {k: v for k, v in merged.items() if k != "_id"}
        self.col.update_one({"_id": asset_id}, {"$set": set_payload})
        return self._to_asset(merged)

    def delete(self, asset_id: str) -> bool:
        return self.col.delete_one({"_id": asset_id}).deleted_count == 1


_store: MongoAssetStore | None = None

def get_store() -> MongoAssetStore:
    global _store
    if _store is None:
        _store = MongoAssetStore()
    return _store


def _suggest_controls_llm(asset: Asset) -> list[dict]:
    """Suggest controls using the configured LLM (Ollama by default)."""
    from langchain.schema import HumanMessage
    import json as _json

    all_controls: list[dict] = []

    try:
        from utils.controls_library import MongoControlsStore
        store = MongoControlsStore()
        for c in store._col.find(
            {}, {"_id": 1, "name": 1, "description": 1}
        ).limit(80):
            all_controls.append({
                "control_id": str(c["_id"]),
                "name": c.get("name", ""),
                "description": c.get("description", ""),
                "source": "controls_library",
            })
    except Exception as e:
        logger.warning(f"controls_library fetch failed: {e}")

    try:
        from utils.regulatory_library import MongoLibraryStore
        reg_store = MongoLibraryStore()
        for r in reg_store._col.find(
            {}, {"_id": 1, "obligation": 1, "domain": 1, "framework_name": 1}
        ).limit(80):
            all_controls.append({
                "control_id": str(r["_id"]),
                "name": r.get("obligation", ""),
                "description": f"{r.get('framework_name', '')} — {r.get('domain', '')}",
                "source": "regulatory_testing",
            })
    except Exception as e:
        logger.warning(f"regulatory_library fetch failed: {e}")

    if not all_controls:
        return []

    controls_text = "\n".join(
        f"- ID:{c['control_id']} | {c['name']} | {c['description']} | source:{c['source']}"
        for c in all_controls[:60]
    )

    prompt = f"""You are a cybersecurity risk expert. Select the most relevant controls for this asset.

Asset: {asset.name} | Type: {asset.type} | C:{asset.confidentiality}/5 I:{asset.integrity}/5 A:{asset.availability}/5 | CIA Total:{asset.cia_total}/15
Description: {asset.description}
Jurisdiction: {asset.jurisdiction} | Classification: {asset.classification}

Controls:
{controls_text}

Return a JSON array of up to 10 controls:
[{{"control_id": "...", "name": "...", "source": "...", "rationale": "one sentence"}}]
Return ONLY valid JSON. No markdown, no explanation."""

    llm = get_llm(temperature=0.2)
    response = llm.invoke([HumanMessage(content=prompt)])
    try:
        return _json.loads(response.content)
    except _json.JSONDecodeError:
        logger.warning("LLM returned non-JSON response; returning empty suggestions")
        return []


@router.post("", status_code=201, response_model=Asset)
def create_asset(body: AssetCreate):
    return get_store().create(body)


@router.get("", response_model=list[Asset])
def list_assets(
    type: Optional[AssetType] = None,
    criticality: Optional[CriticalityType] = None,
    status: Optional[StatusType] = None,
):
    return get_store().list(type_f=type, crit_f=criticality, status_f=status)


@router.get("/{asset_id}/assessment-history")
def asset_assessment_history(asset_id: str):
    if not get_store().get(asset_id):
        raise HTTPException(404, "Asset not found")
    return {"asset_id": asset_id, "assessments": []}


@router.post("/{asset_id}/suggest-controls")
def suggest_controls(asset_id: str):
    asset = get_store().get(asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    try:
        suggestions = _suggest_controls_llm(asset)
    except Exception as e:
        logger.error(f"Control suggestion failed: {e}")
        raise HTTPException(500, f"LLM suggestion failed: {str(e)}")
    return {"asset_id": asset_id, "suggestions": suggestions}


@router.get("/{asset_id}", response_model=Asset)
def get_asset(asset_id: str):
    asset = get_store().get(asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    return asset


@router.put("/{asset_id}", response_model=Asset)
def update_asset(asset_id: str, body: AssetUpdate):
    asset = get_store().update(asset_id, body)
    if not asset:
        raise HTTPException(404, "Asset not found")
    return asset


@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: str):
    if not get_store().delete(asset_id):
        raise HTTPException(404, "Asset not found")
