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

def test_cia_total_invalid_dimension_zero():
    with pytest.raises(ValueError):
        compute_cia_total(0, 3, 3)

def test_cia_total_invalid_dimension_six():
    with pytest.raises(ValueError):
        compute_cia_total(3, 6, 3)

def test_criticality_invalid_out_of_range():
    with pytest.raises(ValueError):
        compute_criticality(2)


from utils.risk_scorer import compute_control_effectiveness

def test_effectiveness_no_issues():
    assert compute_control_effectiveness(None) == 1.00

def test_effectiveness_low():
    assert compute_control_effectiveness("Low") == 0.75

def test_effectiveness_medium():
    assert compute_control_effectiveness("Medium") == 0.50

def test_effectiveness_high():
    assert compute_control_effectiveness("High") == 0.25

def test_effectiveness_critical():
    assert compute_control_effectiveness("Critical") == 0.00
