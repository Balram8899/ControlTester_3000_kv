# tests/test_risk_scorer.py
import pytest
from utils.risk_scorer import compute_cia_score, compute_criticality, compute_periodicity

def test_cia_score_all_high():
    assert compute_cia_score("high", "high", "high") == pytest.approx(5.0)

def test_cia_score_all_low():
    assert compute_cia_score("low", "low", "low") == pytest.approx(1.667, abs=0.01)

def test_cia_score_mixed():
    # (3+2+1)/9*5 = 3.333
    assert compute_cia_score("high", "medium", "low") == pytest.approx(3.333, abs=0.01)

def test_criticality_critical():
    assert compute_criticality(4.5) == "Critical"

def test_criticality_high():
    assert compute_criticality(3.5) == "High"

def test_criticality_medium():
    assert compute_criticality(2.5) == "Medium"

def test_criticality_low():
    assert compute_criticality(1.5) == "Low"

def test_criticality_boundary():
    assert compute_criticality(4.0) == "High"  # 4.0 is High, not Critical

def test_periodicity_critical():
    assert compute_periodicity("Critical") == "Quarterly"

def test_periodicity_high():
    assert compute_periodicity("High") == "Semi-Annual"

def test_periodicity_medium_low():
    assert compute_periodicity("Medium") == "Annual"
    assert compute_periodicity("Low") == "Annual"
