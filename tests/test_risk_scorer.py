# tests/test_risk_scorer.py
import pytest
from utils.risk_scorer import compute_cia_total, compute_cia_band, compute_criticality


def test_cia_total_max():
    assert compute_cia_total(5, 5, 5) == 15

def test_cia_total_min():
    assert compute_cia_total(1, 1, 1) == 3

def test_cia_total_mixed():
    assert compute_cia_total(5, 3, 2) == 10

def test_cia_total_is_simple_sum():
    assert compute_cia_total(2, 4, 3) == 9

def test_cia_band_low_boundaries():
    assert compute_cia_band(3) == "Low"
    assert compute_cia_band(5) == "Low"

def test_cia_band_medium_boundaries():
    assert compute_cia_band(6) == "Medium"
    assert compute_cia_band(8) == "Medium"

def test_cia_band_high_boundaries():
    assert compute_cia_band(9) == "High"
    assert compute_cia_band(11) == "High"

def test_cia_band_critical_boundaries():
    assert compute_cia_band(12) == "Critical"
    assert compute_cia_band(15) == "Critical"

def test_cia_band_out_of_range_high():
    with pytest.raises(ValueError):
        compute_cia_band(16)

def test_cia_band_out_of_range_low():
    with pytest.raises(ValueError):
        compute_cia_band(2)

def test_compute_criticality_shim_still_works():
    assert compute_criticality(4.5) == "Critical"
    assert compute_criticality(3.5) == "High"
    assert compute_criticality(2.5) == "Medium"
    assert compute_criticality(1.5) == "Low"
