import pytest
from api.routers.assets import AssetCreate, Asset
from utils.risk_scorer import compute_cia_score, compute_criticality


def test_asset_create_valid():
    a = AssetCreate(
        name="Customer DB", type="IT", description="Primary customer database",
        confidentiality="high", integrity="high", availability="medium",
        owner="Alice", custodian="Bob", location="Cloud",
        jurisdiction="EU", classification="Confidential",
    )
    assert a.name == "Customer DB"
    assert a.confidentiality == "high"


def test_cia_score_for_asset():
    score = compute_cia_score("high", "high", "medium")
    # (3+3+2)/9*5 = 4.444
    assert score == pytest.approx(4.444, abs=0.01)
    assert compute_criticality(score) == "Critical"
