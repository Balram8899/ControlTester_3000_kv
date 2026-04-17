# utils/risk_scorer.py
"""
CIA scoring utilities.

New model (SP1): numeric 1-5 per dimension, total 3-15, banded.
compute_criticality kept as compatibility shim for risk_assessment.py until SP3.
"""

CIA_BAND_THRESHOLDS: list[tuple[int, int, str]] = [
    (3,  5,  "Low"),
    (6,  8,  "Medium"),
    (9,  11, "High"),
    (12, 15, "Critical"),
]

_CRITICALITY_BANDS: list[tuple[float, float, str]] = [
    (0.0,   2.222, "Low"),
    (2.222, 3.333, "Medium"),
    (3.333, 4.444, "High"),
    (4.444, 5.001, "Critical"),
]


def compute_cia_total(confidentiality: int, integrity: int, availability: int) -> int:
    """Sum three 1-5 CIA scores. Returns 3-15."""
    return confidentiality + integrity + availability


def compute_cia_band(total: int) -> str:
    """Map CIA total (3-15) to a band label."""
    for low, high, label in CIA_BAND_THRESHOLDS:
        if low <= total <= high:
            return label
    raise ValueError(f"CIA total {total} is out of valid range 3-15")


def compute_criticality(cia_score: float) -> str:
    """SP3 compatibility shim. Maps old 1-5 float score to a band. Remove in SP3."""
    for low, high, label in _CRITICALITY_BANDS:
        if low <= cia_score < high:
            return label
    return "Critical"
