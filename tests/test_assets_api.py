# tests/test_assets_api.py
import pytest
from api.routers.assets import AssetCreate, Asset
from utils.risk_scorer import compute_cia_total, compute_cia_band


def test_asset_create_application_gets_default_hosting_type():
    a = AssetCreate(
        name="Payments API", description="Handles payment transactions",
        use="Process card payments", asset_type="Application",
        support_type="Vendor", owner="Alice", custodian="Bob",
        location="Cloud", jurisdiction="EU",
        classification="Confidential",
        confidentiality_score=5, integrity_score=5, availability_score=4,
    )
    assert a.hosting_type == "Unspecified"


def test_asset_create_non_application_hosting_type_nulled():
    a = AssetCreate(
        name="Core Switch", description="Network switch",
        use="Route internal traffic", asset_type="Hardware",
        support_type="Company", owner="Alice", custodian="Bob",
        location="HQ DC", jurisdiction="India",
        classification="Internal",
        confidentiality_score=2, integrity_score=3, availability_score=5,
        hosting_type="PaaS",
    )
    assert a.hosting_type is None


def test_asset_create_explicit_hosting_type_kept():
    a = AssetCreate(
        name="CRM App", description="Customer CRM",
        use="Manage customer relationships", asset_type="Application",
        support_type="Vendor", owner="Alice", custodian="Bob",
        location="Cloud", jurisdiction="EU",
        classification="Confidential",
        confidentiality_score=3, integrity_score=3, availability_score=3,
        hosting_type="SaaS",
    )
    assert a.hosting_type == "SaaS"


def test_asset_create_cia_score_out_of_range():
    with pytest.raises(Exception):
        AssetCreate(
            name="Test", description="desc", use="use",
            asset_type="Database", support_type="Company",
            owner="A", custodian="B", location="DC",
            jurisdiction="US", classification="Internal",
            confidentiality_score=6, integrity_score=1, availability_score=1,
        )


def test_cia_total_and_band_computed_correctly():
    total = compute_cia_total(5, 5, 4)
    assert total == 14
    assert compute_cia_band(total) == "Critical"

    total2 = compute_cia_total(2, 2, 2)
    assert total2 == 6
    assert compute_cia_band(total2) == "Medium"
