import pytest
from utils.risk_scorer import compute_cia_total, compute_criticality

def test_cia_total_max():
    assert compute_cia_total(5, 5, 5) == 15

def test_cia_total_min():
    assert compute_cia_total(1, 1, 1) == 3

def test_cia_total_mixed():
    assert compute_cia_total(5, 3, 1) == 9

def test_criticality_critical_low():
    assert compute_criticality(12) == "Critical"

def test_criticality_critical_high():
    assert compute_criticality(15) == "Critical"

def test_criticality_high_low():
    assert compute_criticality(9) == "High"

def test_criticality_high_top():
    assert compute_criticality(11) == "High"

def test_criticality_medium_low():
    assert compute_criticality(6) == "Medium"

def test_criticality_medium_top():
    assert compute_criticality(8) == "Medium"

def test_criticality_low_min():
    assert compute_criticality(3) == "Low"

def test_criticality_low_top():
    assert compute_criticality(5) == "Low"
