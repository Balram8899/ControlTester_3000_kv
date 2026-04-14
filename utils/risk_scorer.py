# utils/risk_scorer.py
CIA_NUMERIC: dict[str, int] = {"low": 1, "medium": 2, "high": 3}

CRITICALITY_BANDS: list[tuple[float, float, str]] = [
    (0.0,   2.222, "Low"),
    (2.222, 3.333, "Medium"),
    (3.333, 4.444, "High"),
    (4.444, 5.001, "Critical"),
]

PERIODICITY_MAP: dict[str, str] = {
    "Critical": "Quarterly",
    "High":     "Semi-Annual",
    "Medium":   "Annual",
    "Low":      "Annual",
}


def compute_cia_score(confidentiality: str, integrity: str, availability: str) -> float:
    """Compute CIA composite score on a 1–5 scale."""
    c = CIA_NUMERIC[confidentiality.lower()]
    i = CIA_NUMERIC[integrity.lower()]
    a = CIA_NUMERIC[availability.lower()]
    return (c + i + a) / 9 * 5


def compute_criticality(cia_score: float) -> str:
    """Map CIA score (1–5) to a criticality band."""
    for low, high, label in CRITICALITY_BANDS:
        if low <= cia_score < high:
            return label
    return "Critical"


def compute_periodicity(criticality: str) -> str:
    """Return recommended assessment periodicity for a criticality level."""
    return PERIODICITY_MAP.get(criticality, "Annual")
