import pytest
from api.routers.assets import AssetCreate, Asset
from utils.risk_scorer import compute_cia_total, compute_criticality


def test_asset_create_valid():
    a = AssetCreate(
        name="Customer DB", type="IT", description="Primary customer database",
        confidentiality=5, integrity=5, availability=3,
        owner="Alice", custodian="Bob", location="Cloud",
        jurisdiction="EU", classification="Confidential",
    )
    assert a.name == "Customer DB"
    assert a.confidentiality == 5


def test_cia_total_for_asset():
    total = compute_cia_total(5, 5, 3)
    assert total == 13
    assert compute_criticality(total) == "Critical"
