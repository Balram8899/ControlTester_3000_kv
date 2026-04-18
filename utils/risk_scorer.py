CRITICALITY_BANDS: list[tuple[int, int, str]] = [
    (3,  5,  "Low"),
    (6,  8,  "Medium"),
    (9,  11, "High"),
    (12, 15, "Critical"),
]


def compute_cia_total(confidentiality: int, integrity: int, availability: int) -> int:
    """Sum CIA dimension scores (each 1–5) into a total (3–15)."""
    for name, val in (("confidentiality", confidentiality), ("integrity", integrity), ("availability", availability)):
        if not (1 <= val <= 5):
            raise ValueError(f"{name} must be 1–5, got {val}")
    return confidentiality + integrity + availability


def compute_criticality(cia_total: int) -> str:
    """Map CIA total (3–15) to a criticality band."""
    for low, high, label in CRITICALITY_BANDS:
        if low <= cia_total <= high:
            return label
    raise ValueError(f"CIA total {cia_total} is out of valid range 3–15")


SEVERITY_EFFECTIVENESS: dict[str, float] = {
    "Low":      0.75,
    "Medium":   0.50,
    "High":     0.25,
    "Critical": 0.00,
}


def compute_control_effectiveness(open_issue_severity: str | None) -> float:
    """Return control effectiveness factor (0.0–1.0) based on worst open issue severity.
    Pass None when there are no open issues (effectiveness = 1.0).
    """
    if open_issue_severity is None:
        return 1.00
    if open_issue_severity not in SEVERITY_EFFECTIVENESS:
        raise ValueError(f"Unknown severity '{open_issue_severity}'. Expected Low/Medium/High/Critical.")
    return SEVERITY_EFFECTIVENESS[open_issue_severity]
