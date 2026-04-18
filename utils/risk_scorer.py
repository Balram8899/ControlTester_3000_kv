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
