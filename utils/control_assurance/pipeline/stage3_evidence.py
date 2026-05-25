from __future__ import annotations

import io
import random
import csv
from datetime import datetime, timezone

import openpyxl
from pydantic import BaseModel, Field

from utils.control_assurance.celery_app import celery_app
from utils.control_assurance.ct_db import _get_db
from utils.control_assurance.ct_gridfs import download_from_gridfs
from utils.control_assurance.evidence_extractor import extract_file_content
from utils.control_assurance.pipeline.llm_json import invoke_json_with_retry
from utils.control_assurance.prompts.ca_verification import (
    build_evidence_ca_prompt,
    build_population_ca_prompt,
)
from utils.control_assurance.prompts.evidence_mapping import build_evidence_mapping_prompt
from utils.control_assurance.prompts.sampling import build_sampling_prompt
from utils.llm_provider import get_llm


class CaIssue(BaseModel):
    check: str = ""
    finding: str = ""
    severity: str = "low"


class EvidenceCaResponse(BaseModel):
    completeness_passed: bool | None = None
    accuracy_passed: bool | None = None
    issues: list[CaIssue] = Field(default_factory=list)
    identified_value: str = ""
    annotation_hint: str = ""


class PopulationCaResponse(BaseModel):
    completeness_passed: bool | None = None
    accuracy_passed: bool | None = None
    issues: list[CaIssue] = Field(default_factory=list)
    summary: str = ""


class SamplingResponse(BaseModel):
    recommended_strategy: str = "random"
    recommended_size: int = 0
    rationale: str = ""
    conflicts_with_user_input: bool = False
    conflict_reason: str | None = None


class EvidenceMappingResponse(BaseModel):
    mapped_steps: list[str] = Field(default_factory=list)
    confidence: str = "low"
    per_step: list[dict] = Field(default_factory=list)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _issues_dump(issues: list[CaIssue]) -> list[dict]:
    return [issue.model_dump() for issue in issues]


def _control_summary(control: dict) -> dict:
    return {
        "name": control["control_name"],
        "type": control["control_type"],
        "domain": control.get("domain", ""),
    }


def _set_evidence_fields(db, control_id: str, gridfs_id: str, fields: dict) -> None:
    control = db.ct_controls.find_one({"_id": control_id})
    if not control:
        return
    evidence_files = control.get("evidence_files", [])
    for evidence in evidence_files:
        if evidence.get("gridfs_id") == gridfs_id:
            for dotted_key, value in fields.items():
                target = evidence
                parts = dotted_key.split(".")
                for part in parts[:-1]:
                    target = target.setdefault(part, {})
                target[parts[-1]] = value
            break
    db.ct_controls.update_one(
        {"_id": control_id},
        {"$set": {"evidence_files": evidence_files, "updated_at": _now()}},
    )


def _is_ca_passed_or_overridden(ca: dict) -> bool:
    if ca.get("overridden"):
        return True
    return ca.get("completeness_passed") is True and ca.get("accuracy_passed") is True


def _normalise_column_names(columns: list[str]) -> dict[str, int]:
    return {column.strip().lower(): index for index, column in enumerate(columns)}


def _tabular_metadata(content: bytes, file_type: str, unique_key_columns: list[str] | None = None) -> dict:
    columns: list[str] = []
    data_rows: list[list[str]] = []
    try:
        if file_type == "excel":
            workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            worksheet = workbook.active
            rows = list(worksheet.iter_rows(values_only=True))
            if rows:
                columns = [str(value or "") for value in rows[0]]
                data_rows = [[str(value or "") for value in row] for row in rows[1:]]
        elif file_type == "csv":
            text = content.decode("utf-8", errors="replace")
            rows = list(csv.reader(text.splitlines()))
            if rows:
                columns = [str(value or "") for value in rows[0]]
                data_rows = [[str(value or "") for value in row] for row in rows[1:]]
    except Exception:
        columns = []
        data_rows = []

    key_columns = unique_key_columns or []
    column_index = _normalise_column_names(columns)
    unique_counts = {}
    if key_columns:
        indexes = [column_index.get(key.strip().lower()) for key in key_columns]
        if all(index is not None for index in indexes):
            values = {
                tuple(row[index] if index < len(row) else "" for index in indexes if index is not None)
                for row in data_rows
            }
            values.discard(tuple("" for _ in indexes))
            unique_counts[",".join(key_columns)] = len(values)

    return {
        "columns": columns,
        "row_count": len(data_rows),
        "sample_rows": data_rows[:5],
        "unique_counts": unique_counts,
        "date_range_found": {"min": "", "max": ""},
    }


def _primary_reconciliation(support_files: list[dict]) -> dict:
    for support in support_files:
        reconciliation = support.get("reconciliation", {})
        if reconciliation.get("unique_key_columns") or reconciliation.get("expected_count") is not None:
            return reconciliation
    return {"unique_key_columns": [], "expected_count": None}


def _extract_support_files(support_files: list[dict]) -> list[dict]:
    extracted = []
    for support in support_files:
        gridfs_id = support.get("gridfs_id")
        if not gridfs_id:
            continue
        content = download_from_gridfs(gridfs_id)
        text, metadata = extract_file_content(
            content,
            support.get("file_type", "txt"),
            support.get("filename", "support_file"),
        )
        extracted.append(
            {
                "filename": support.get("filename", ""),
                "file_type": support.get("file_type", ""),
                "support_type": support.get("support_type", ""),
                "comments": support.get("comments", ""),
                "reconciliation": support.get("reconciliation", {}),
                "extracted_text": text,
                "metadata": metadata,
            }
        )
    return extracted


def _verify_evidence_ca(session_id: str, control_id: str, gridfs_id: str) -> None:
    db = _get_db()
    session = db.ct_sessions.find_one({"_id": session_id})
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not session or not control:
        return

    evidence = next((item for item in control.get("evidence_files", []) if item["gridfs_id"] == gridfs_id), None)
    if not evidence:
        return

    content = download_from_gridfs(gridfs_id)
    extracted_text, metadata = extract_file_content(content, evidence["file_type"], evidence["filename"])
    support_files = evidence.get("support_files", [])
    reconciliation = _primary_reconciliation(support_files)
    tabular_meta = _tabular_metadata(
        content,
        evidence["file_type"],
        reconciliation.get("unique_key_columns") or [],
    )
    file_meta = {
        "filename": evidence["filename"],
        "file_type": evidence["file_type"],
        "file_modified_date": metadata.get("modDate", metadata.get("modified", "")),
        "extracted_text": extracted_text,
        "metadata": metadata,
        "supporting_files": _extract_support_files(support_files),
        "reconciliation": reconciliation,
        **tabular_meta,
    }
    steps = control.get("test_steps", [])
    prompt = build_evidence_ca_prompt(
        _control_summary(control),
        session["testing_period"],
        steps,
        file_meta,
    )
    result = invoke_json_with_retry(
        llm=get_llm(),
        prompt=prompt,
        db=db,
        session_id=session_id,
        stage="evidence_ca",
        response_model=EvidenceCaResponse,
    )

    _set_evidence_fields(
        db,
        control_id,
        gridfs_id,
        {
            "ca_verification.completeness_passed": result.completeness_passed,
            "ca_verification.accuracy_passed": result.accuracy_passed,
            "ca_verification.issues": _issues_dump(result.issues),
            "identified_value": result.identified_value,
        },
    )

    if result.completeness_passed is True and result.accuracy_passed is True:
        _map_evidence_to_steps(session_id, control_id, gridfs_id, extracted_text, metadata, control, steps)


def _map_evidence_to_steps(
    session_id: str,
    control_id: str,
    gridfs_id: str,
    extracted_text: str,
    metadata: dict,
    control: dict,
    steps: list[dict],
) -> None:
    db = _get_db()
    evidence = next((item for item in control.get("evidence_files", []) if item["gridfs_id"] == gridfs_id), {})
    file_meta = {
        "filename": evidence.get("filename", ""),
        "file_type": evidence.get("file_type", ""),
        "extracted_text": extracted_text,
        "metadata": metadata,
    }
    prompt = build_evidence_mapping_prompt(
        {"name": control["control_name"], "type": control["control_type"]},
        steps,
        file_meta,
    )
    result = invoke_json_with_retry(
        llm=get_llm(),
        prompt=prompt,
        db=db,
        session_id=session_id,
        stage="evidence_mapping",
        response_model=EvidenceMappingResponse,
    )
    _set_evidence_fields(
        db,
        control_id,
        gridfs_id,
        {
            "mapped_step_labels": result.mapped_steps,
            "annotation_regions": result.per_step,
        },
    )


def _process_population(session_id: str, control_id: str) -> None:
    db = _get_db()
    session = db.ct_sessions.find_one({"_id": session_id})
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not session or not control:
        return

    sampling = control.get("sampling", {})
    population_file_id = sampling.get("population_file_id")
    if not population_file_id:
        return

    filename = sampling.get("population_filename") or "population.xlsx"
    file_type = sampling.get("population_file_type") or "excel"
    support_files = sampling.get("population_support_files", [])
    reconciliation = _primary_reconciliation(support_files)
    content = download_from_gridfs(population_file_id)
    extracted_text, metadata = extract_file_content(content, file_type, filename)
    population_meta = _tabular_metadata(
        content,
        file_type,
        reconciliation.get("unique_key_columns") or [],
    )
    file_meta = {
        "filename": filename,
        "file_type": file_type,
        "file_modified_date": metadata.get("modDate", metadata.get("modified", "")),
        "extracted_text": extracted_text,
        "metadata": metadata,
        "supporting_files": _extract_support_files(support_files),
        "reconciliation": reconciliation,
        **population_meta,
    }
    prompt = build_population_ca_prompt(_control_summary(control), session["testing_period"], file_meta)
    result = invoke_json_with_retry(
        llm=get_llm(),
        prompt=prompt,
        db=db,
        session_id=session_id,
        stage="population_ca",
        response_model=PopulationCaResponse,
    )

    db.ct_controls.update_one(
        {"_id": control_id},
        {
            "$set": {
                "sampling.population_count": population_meta["row_count"],
                "sampling.population_ca_verification.completeness_passed": result.completeness_passed,
                "sampling.population_ca_verification.accuracy_passed": result.accuracy_passed,
                "sampling.population_ca_verification.issues": _issues_dump(result.issues),
                "updated_at": _now(),
            }
        },
    )

    if result.completeness_passed is True and result.accuracy_passed is True:
        effective_population_count = int(
            sampling.get("adjusted_population_count") or population_meta["row_count"]
        )
        _recommend_sampling(session_id, control_id, effective_population_count, sampling)


def _select_sample_items(strategy: str, size: int, population_count: int, user_items: list | None = None) -> list:
    if strategy == "user_selected" and user_items:
        return user_items[:size]
    if strategy == "full":
        return list(range(1, population_count + 1))
    sample_size = max(0, min(size, population_count))
    if sample_size == 0:
        return []
    return sorted(random.sample(range(1, population_count + 1), sample_size))


def _recommend_sampling(session_id: str, control_id: str, population_count: int, sampling: dict) -> None:
    db = _get_db()
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        return

    prompt = build_sampling_prompt(
        {
            "name": control["control_name"],
            "type": control["control_type"],
            "frequency": control.get("frequency", ""),
            "inherent_risk_rating": control.get("inherent_risk_rating", "Medium"),
            "prior_period_result": control.get("prior_period_result", "N/A"),
        },
        {
            "count": population_count,
            "description": sampling.get("population_description", ""),
            "sample_period": sampling.get("sample_period", ""),
            "additional_context": sampling.get("additional_context", ""),
            "original_population_count": sampling.get("population_count", population_count),
            "adjusted_population_count": sampling.get("adjusted_population_count") or population_count,
        },
        sampling.get("mode"),
    )
    result = invoke_json_with_retry(
        llm=get_llm(),
        prompt=prompt,
        db=db,
        session_id=session_id,
        stage="sampling",
        response_model=SamplingResponse,
    )
    strategy = result.recommended_strategy
    selected_items = _select_sample_items(strategy, result.recommended_size, population_count, sampling.get("selected_items"))
    db.ct_controls.update_one(
        {"_id": control_id},
        {
            "$set": {
                "sampling.llm_suggested_strategy": strategy,
                "sampling.llm_suggested_size": result.recommended_size,
                "sampling.selection_strategy": strategy,
                "sampling.selected_size": len(selected_items),
                "sampling.selected_items": selected_items,
                "sampling.sampling_rationale": result.rationale,
                "sampling.conflicts_with_user_input": result.conflicts_with_user_input,
                "sampling.conflict_reason": result.conflict_reason,
                "updated_at": _now(),
            }
        },
    )


def _run_evidence_mapping(session_id: str) -> None:
    db = _get_db()
    controls = list(db.ct_controls.find({"session_id": session_id}))
    for control in controls:
        control_id = control["_id"]
        db.ct_sessions.update_one(
            {"_id": session_id},
            {
                "$set": {
                    "stage_checkpoint": {
                        "stage": "evidence_mapping",
                        "step": f"processing_{control_id}",
                        "updated_at": _now(),
                    }
                }
            },
        )

        sampling = control.get("sampling", {})
        if sampling.get("mode", "sample") in {"sample", "both"} and sampling.get("population_file_id"):
            _process_population(session_id, control_id)

        latest_control = db.ct_controls.find_one({"_id": control_id})
        for evidence in latest_control.get("evidence_files", []):
            _verify_evidence_ca(session_id, control_id, evidence["gridfs_id"])

    db.ct_sessions.update_one(
        {"_id": session_id},
        {
            "$set": {
                "stage": "evidence",
                "stage_checkpoint": {
                    "stage": "evidence_mapping",
                    "step": "complete",
                    "updated_at": _now(),
                },
                "updated_at": _now(),
            }
        },
    )


@celery_app.task(
    name="ct.evidence_mapping",
    queue="ct_pipeline",
    acks_late=True,
    reject_on_worker_lost=True,
)
def evidence_mapping(session_id: str) -> dict:
    try:
        _run_evidence_mapping(session_id)
        return {"status": "ok", "session_id": session_id}
    except Exception as exc:
        _get_db().ct_sessions.update_one(
            {"_id": session_id},
            {
                "$set": {
                    "stage": "failed",
                    "stage_checkpoint": {"error": str(exc), "updated_at": _now()},
                }
            },
        )
        raise
