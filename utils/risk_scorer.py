CRITICALITY_BANDS: list[tuple[int, int, str]] = [
    (3,  5,  "Low"),
    (6,  8,  "Medium"),
    (9,  11, "High"),
    (12, 15, "Critical"),
]


def compute_cia_total(confidentiality: int, integrity: int, availability: int) -> int:
    """Sum CIA dimension scores (each 1–5) into a total (3–15)."""
    return confidentiality + integrity + availability


def compute_criticality(cia_total: int) -> str:
    """Map CIA total (3–15) to a criticality band."""
    for low, high, label in CRITICALITY_BANDS:
        if low <= cia_total <= high:
            return label
    return "Critical"
