from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any


SAMPLING_MODE_MAP = {
    "walkthrough": "walkthrough",
    "sample": "sample",
    "sampling": "sample",
    "both": "both",
    "full": "full",
    "population": "full",
    "none": "none",
    "no sampling": "none",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def attribute_id(index: int) -> str:
    return f"TA-{index:03d}"


def empty_sampling(mode: str, additional_context: str = "") -> dict:
    return {
        "mode": normalize_sampling_mode(mode),
        "population_description": "",
        "population_file_id": None,
        "population_filename": None,
        "population_file_type": None,
        "population_count": 0,
        "adjusted_population_count": 0,
        "sample_period": "",
        "additional_context": additional_context,
        "llm_suggested_strategy": None,
        "llm_suggested_size": 0,
        "selection_strategy": None,
        "selected_size": 0,
        "selected_items": [],
        "population_support_files": [],
        "population_ca_verification": {
            "completeness_passed": None,
            "accuracy_passed": None,
            "issues": [],
            "overridden": False,
            "override_reason": None,
        },
    }


def empty_conclusions() -> dict:
    return {
        "d_and_i": None,
        "oe": None,
        "deficiencies_noted": False,
        "issues_log_refs": [],
        "rationale": "",
        "testing_summary": "",
    }


def empty_testing_methods() -> dict:
    return {
        "inquiry": False,
        "observation": False,
        "inspection": False,
        "reperformance": False,
    }


def normalize_sampling_mode(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return "sample"
    for key, mode in SAMPLING_MODE_MAP.items():
        if key in text:
            return mode
    return "sample"


def parse_bool(value: Any) -> bool:
    return str(value or "").strip().lower() in {"yes", "true", "1", "y"}


def normalize_header(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def first_value(data: dict, *keys: str) -> str:
    for key in keys:
        if key in data and data[key] is not None:
            value = str(data[key]).strip()
            if value:
                return value
    return ""


def split_test_steps(value: Any) -> list[str]:
    if isinstance(value, list):
        steps = []
        for item in value:
            if isinstance(item, dict):
                text = str(item.get("description") or item.get("test_procedure") or "").strip()
            else:
                text = str(item or "").strip()
            if text:
                steps.append(text)
        return steps

    text = re.sub(r"\s+", " ", str(value or "").strip())
    if not text:
        return []

    numbered = [part.strip(" .;") for part in re.split(r"(?:^|\s)\d+[\).]\s*", text) if part.strip(" .;")]
    if len(numbered) > 1:
        return numbered

    line_parts = [part.strip(" .;") for part in re.split(r"[\n;]+", str(value)) if part.strip(" .;")]
    return line_parts or [text]


def derive_test_attribute(description: str) -> str:
    text = str(description or "").strip(" .")
    text = re.sub(
        r"^(review|verify|inspect|confirm|compare|test|extract|obtain|examine)\s+(the\s+)?",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip(" .")
    if not text:
        return str(description or "").strip()
    return text[0].upper() + text[1:]


def derive_evidence_requirement(description: str) -> str:
    text = str(description or "").strip()
    cleaned = re.sub(
        r"^(review|verify|inspect|confirm|compare|test|extract|obtain|examine)\s+(the\s+)?",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip(" .")
    keyword_matches = list(
        re.finditer(
            r"screenshot|report|export|log|file|listing|configuration|settings",
            cleaned,
            flags=re.IGNORECASE,
        )
    )
    if keyword_matches:
        end = keyword_matches[-1].end()
        value = cleaned[:end].strip(" .")
        return value[:1].upper() + value[1:]

    patterns = [
        r"(?:review|inspect|obtain|extract|examine)\s+(?:the\s+)?(.{1,120}?(?:screenshot|report|export|log|file|listing|configuration|settings))",
        r"(.{1,120}?(?:screenshot|report|export|log|file|listing|configuration|settings))",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            value = match.group(1).strip(" .")
            value = re.sub(r"^(the\s+)", "", value, flags=re.IGNORECASE)
            return value[:1].upper() + value[1:]
    return ""


def _source_for(value: str) -> str:
    return "user_provided" if str(value or "").strip() else "missing"


def build_test_steps(test_steps: Any, evidence_requirements: str = "") -> tuple[list[dict], dict]:
    field_sources: dict[str, str] = {}
    steps: list[dict] = []

    if isinstance(test_steps, list) and all(isinstance(item, dict) for item in test_steps):
        source_items = test_steps
    else:
        source_items = [{"description": description} for description in split_test_steps(test_steps)]

    explicit_evidence = str(evidence_requirements or "").strip()
    for index, item in enumerate(source_items):
        description = str(item.get("description") or item.get("test_procedure") or "").strip()
        label = str(item.get("label") or item.get("attribute_id") or attribute_id(index + 1)).strip()
        step_attribute_id = str(item.get("attribute_id") or label or attribute_id(index + 1)).strip()
        test_attribute = str(item.get("test_attribute") or "").strip()
        evidence_required = str(item.get("evidence_required") or "").strip()

        if not test_attribute:
            test_attribute = derive_test_attribute(description)
            field_sources[f"test_steps.{index}.test_attribute"] = "llm_derived"
        else:
            field_sources[f"test_steps.{index}.test_attribute"] = "user_provided"

        if not evidence_required:
            evidence_required = explicit_evidence or derive_evidence_requirement(description)
            field_sources[f"test_steps.{index}.evidence_required"] = (
                "user_provided" if explicit_evidence else "llm_derived"
            )
        else:
            field_sources[f"test_steps.{index}.evidence_required"] = "user_provided"

        steps.append(
            {
                "step_id": str(item.get("step_id") or uuid.uuid4()),
                "attribute_id": step_attribute_id,
                "label": label,
                "test_attribute": test_attribute,
                "description": description,
                "evidence_required": evidence_required,
            }
        )

    return steps, field_sources


def build_control_doc(session_id: str, data: dict, *, now: str | None = None) -> dict:
    timestamp = now or now_iso()
    control_id = first_value(data, "control_id", "controlid", "controlnumber")
    control_name = first_value(data, "control_name", "control_title", "controlnametitle", "controlnamecontroltitle")
    control_type = first_value(data, "control_type", "controltype")
    risk = first_value(data, "risk", "risk_statement", "riskstatement")
    domain = first_value(data, "domain", "domain_category", "domaincategory")
    control_description = first_value(data, "control_description", "controldescription", "description")
    test_objectives = first_value(data, "test_objectives", "testobjectives")
    evidence_requirements = first_value(data, "evidence_requirements", "evidencerequirements")
    sampling_mode = first_value(data, "sampling_mode", "samplingmode")
    additional_context = first_value(
        data,
        "sampling_additional_context",
        "additional_sampling_context",
        "additionalsamplingguidance",
        "additionalcontext",
    )
    steps, step_sources = build_test_steps(data.get("test_steps") or data.get("teststeps"), evidence_requirements)

    field_sources = {
        "risk": _source_for(risk),
        "control_name": _source_for(control_name),
        "control_description": _source_for(control_description),
        "control_type": _source_for(control_type),
        "domain": _source_for(domain),
        "test_objectives": _source_for(test_objectives),
        "sampling.additional_context": _source_for(additional_context),
        **step_sources,
    }

    return {
        "_id": str(uuid.uuid4()),
        "session_id": session_id,
        "control_id": control_id,
        "control_name": control_name,
        "control_description": control_description,
        "control_type": control_type,
        "domain": domain,
        "framework_reference": first_value(data, "framework_reference", "frameworkreference"),
        "inherent_risk_rating": first_value(data, "inherent_risk_rating", "inherentriskrating") or "Medium",
        "control_owner": first_value(data, "control_owner", "controlowner"),
        "frequency": first_value(data, "frequency"),
        "prior_period_result": first_value(data, "prior_period_result", "priorperiodresult") or "N/A",
        "walkthrough_performed": parse_bool(first_value(data, "walkthrough_performed", "walkthroughperformed")),
        "risk": risk,
        "test_objectives": test_objectives,
        "test_steps": steps,
        "field_sources": field_sources,
        "controls_finalized": False,
        "finalized_at": None,
        "sampling": empty_sampling(sampling_mode, additional_context),
        "evidence_files": [],
        "sample_results": [],
        "todi_results": {},
        "exceptions": [],
        "conclusions": empty_conclusions(),
        "testing_methods": empty_testing_methods(),
        "workbook_output_id": None,
        "status": "pending",
        "created_at": timestamp,
        "updated_at": timestamp,
    }


def row_to_control_input(headers: list[Any], row: tuple[Any, ...]) -> dict:
    data: dict[str, str] = {}
    for header, value in zip(headers, row):
        key = normalize_header(header)
        if key:
            data[key] = "" if value is None else str(value).strip()
    return data
