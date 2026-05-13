from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from utils.control_assurance.celery_app import celery_app
from utils.control_assurance.ct_db import _get_db
from utils.control_assurance.pipeline.llm_json import invoke_json_with_retry
from utils.control_assurance.prompts.control_testing import build_control_testing_prompt
from utils.control_assurance.prompts.issue_drafting import build_issue_drafting_prompt
from utils.llm_provider import get_llm


class TodiSection(BaseModel):
    conclusion: str = ""
    rationale: str = ""


class TodiResults(BaseModel):
    design: TodiSection = Field(default_factory=TodiSection)
    implementation: TodiSection = Field(default_factory=TodiSection)


class StepResult(BaseModel):
    label: str
    tickmark: str = "PASS"
    notes: str = ""


class SampleResult(BaseModel):
    sample_num: int
    application: str = ""
    item_reference: str = ""
    step_results: list[StepResult] = Field(default_factory=list)


class ExceptionResult(BaseModel):
    ref: str
    sample_num: int | None = None
    description: str = ""
    root_cause: str = ""
    auditor_disposition: str = "Issue drafted"
    issues_log_ref: str | None = None


class Conclusions(BaseModel):
    d_and_i: str | None = None
    oe: str | None = None
    deficiencies_noted: bool = False
    rationale: str = ""
    issues_log_refs: list[str] = Field(default_factory=list)


class TestingMethods(BaseModel):
    inquiry: bool = False
    observation: bool = False
    inspection: bool = False
    reperformance: bool = False


class ControlTestingResponse(BaseModel):
    todi_results: TodiResults = Field(default_factory=TodiResults)
    sample_results: list[SampleResult] = Field(default_factory=list)
    exceptions: list[ExceptionResult] = Field(default_factory=list)
    conclusions: Conclusions = Field(default_factory=Conclusions)
    testing_methods: TestingMethods = Field(default_factory=TestingMethods)


class IssueDraft(BaseModel):
    title: str = ""
    severity: str = "Medium"
    summary: str = ""
    detail: str = ""
    root_cause: str = ""
    recommendation: str = ""
    issues_log_ref: str = ""
    exception_refs: list[str] = Field(default_factory=list)


class IssueDraftResponse(BaseModel):
    issues: list[IssueDraft] = Field(default_factory=list)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_exception_tickmark(tickmark: str) -> bool:
    return tickmark.strip().upper().startswith("X")


def _sample_exception_refs(samples: list[dict]) -> dict[str, int | None]:
    refs: dict[str, int | None] = {}
    for sample in samples:
        sample_num = sample.get("sample_num")
        for step in sample.get("step_results", []):
            tickmark = str(step.get("tickmark", ""))
            if _is_exception_tickmark(tickmark):
                refs.setdefault(tickmark.strip().upper(), sample_num)
    return refs


def _ensure_exception_records(samples: list[dict], exceptions: list[dict]) -> list[dict]:
    by_ref = {str(exc.get("ref", "")).strip().upper(): exc for exc in exceptions if exc.get("ref")}
    for ref, sample_num in _sample_exception_refs(samples).items():
        if ref not in by_ref:
            exceptions.append(
                {
                    "ref": ref,
                    "sample_num": sample_num,
                    "description": f"Exception {ref} noted in sample {sample_num}.",
                    "root_cause": "Root cause pending auditor review.",
                    "auditor_disposition": "Issue drafted",
                    "issues_log_ref": None,
                }
            )
    return exceptions


def _normalize_sample_tickmarks(samples: list[dict]) -> None:
    for sample in samples:
        for step in sample.get("step_results", []):
            tickmark = str(step.get("tickmark", "")).strip().upper()
            if tickmark == "W":
                step["tickmark"] = "PASS"
                notes = step.get("notes", "").strip()
                step["notes"] = f"{notes} Walkthrough tickmark normalized to PASS for sample testing.".strip()


def _exception_rate(samples: list[dict], exceptions: list[dict]) -> float:
    total_samples = len(samples)
    if total_samples == 0:
        return 0.0

    failed_samples = {
        exc.get("sample_num")
        for exc in exceptions
        if exc.get("sample_num") is not None
    }
    for sample in samples:
        if any(_is_exception_tickmark(str(step.get("tickmark", ""))) for step in sample.get("step_results", [])):
            failed_samples.add(sample.get("sample_num"))

    return len(failed_samples) / total_samples


def _apply_exception_threshold(control: dict, result: dict) -> None:
    rate = _exception_rate(result["sample_results"], result["exceptions"])
    if rate <= 0.20:
        return

    conclusions = result.setdefault("conclusions", {})
    conclusions["oe"] = "Ineffective"
    conclusions["deficiencies_noted"] = True
    rationale = conclusions.get("rationale", "").strip()
    threshold_note = (
        f"Exception rate is {rate:.0%}, which exceeds the 20% tolerance; "
        "operating effectiveness is Ineffective."
    )
    conclusions["rationale"] = f"{rationale} {threshold_note}".strip()


def _next_issue_ref(db, session_id: str, offset: int = 1) -> str:
    existing_count = db.ct_issues.count_documents({"session_id": session_id})
    return f"CTI-{existing_count + offset:03d}"


def _draft_ct_issues(db, session: dict, control: dict, exceptions: list[dict], llm) -> list[dict]:
    if not exceptions:
        return []

    issue_result = invoke_json_with_retry(
        llm=llm,
        prompt=build_issue_drafting_prompt(session, control, exceptions),
        db=db,
        session_id=session["_id"],
        stage="issue_drafting",
        response_model=IssueDraftResponse,
    )

    now = _now()
    issue_docs: list[dict] = []
    for index, issue in enumerate(issue_result.issues, start=1):
        doc = issue.model_dump()
        issue_ref = doc.get("issues_log_ref") or _next_issue_ref(db, session["_id"], index)
        doc.update(
            {
                "_id": str(uuid.uuid4()),
                "session_id": session["_id"],
                "control_id": control["_id"],
                "control_external_id": control.get("control_id", ""),
                "control_name": control.get("control_name", ""),
                "issues_log_ref": issue_ref,
                "pushed_to_issues": False,
                "issues_module_id": None,
                "created_at": now,
                "updated_at": now,
            }
        )
        issue_docs.append(doc)

    if issue_docs:
        db.ct_issues.insert_many(issue_docs)
    return issue_docs


def _link_issues_to_exceptions(result: dict, issue_docs: list[dict]) -> None:
    refs_by_exception: dict[str, str] = {}
    for issue in issue_docs:
        issue_ref = issue.get("issues_log_ref")
        if not issue_ref:
            continue
        for exception_ref in issue.get("exception_refs", []):
            refs_by_exception[str(exception_ref).strip().upper()] = issue_ref

    issues_log_refs: list[str] = []
    for exception in result.get("exceptions", []):
        exception_ref = str(exception.get("ref", "")).strip().upper()
        issue_ref = refs_by_exception.get(exception_ref)
        if issue_ref:
            exception["issues_log_ref"] = issue_ref
            if issue_ref not in issues_log_refs:
                issues_log_refs.append(issue_ref)

    result.setdefault("conclusions", {})["issues_log_refs"] = issues_log_refs


def _run_testing(session_id: str) -> None:
    db = _get_db()
    session = db.ct_sessions.find_one({"_id": session_id})
    if not session:
        raise ValueError(f"CT session not found: {session_id}")

    controls = list(db.ct_controls.find({"session_id": session_id, "status": {"$ne": "complete"}}))
    llm = get_llm()
    completed_ids: list[str] = []

    for control in controls:
        db.ct_sessions.update_one(
            {"_id": session_id},
            {
                "$set": {
                    "stage_checkpoint": {
                        "stage": "testing",
                        "step": f"processing_{control['_id']}",
                        "updated_at": _now(),
                    },
                    "updated_at": _now(),
                }
            },
        )
        testing_result = invoke_json_with_retry(
            llm=llm,
            prompt=build_control_testing_prompt(session, control),
            db=db,
            session_id=session_id,
            stage="control_testing",
            response_model=ControlTestingResponse,
        ).model_dump()

        _normalize_sample_tickmarks(testing_result["sample_results"])
        testing_result["exceptions"] = _ensure_exception_records(
            testing_result["sample_results"],
            testing_result["exceptions"],
        )
        _apply_exception_threshold(control, testing_result)
        issue_docs = _draft_ct_issues(db, session, control, testing_result["exceptions"], llm)
        _link_issues_to_exceptions(testing_result, issue_docs)

        db.ct_controls.update_one(
            {"_id": control["_id"]},
            {
                "$set": {
                    "todi_results": testing_result["todi_results"],
                    "sample_results": testing_result["sample_results"],
                    "exceptions": testing_result["exceptions"],
                    "conclusions": testing_result["conclusions"],
                    "testing_methods": testing_result["testing_methods"],
                    "status": "complete",
                    "updated_at": _now(),
                }
            },
        )
        completed_ids.append(control["_id"])

    db.ct_sessions.update_one(
        {"_id": session_id},
        {
            "$set": {
                "stage": "workbook",
                "stage_checkpoint": {
                    "stage": "testing",
                    "step": "complete",
                    "completed_control_ids": completed_ids,
                    "updated_at": _now(),
                },
                "updated_at": _now(),
            }
        },
    )


@celery_app.task(
    name="ct.run_testing",
    queue="ct_pipeline",
    acks_late=True,
    reject_on_worker_lost=True,
)
def run_testing(session_id: str) -> dict:
    try:
        _run_testing(session_id)
        from utils.control_assurance.pipeline.stage5_workbook import generate_workbooks

        task = generate_workbooks.apply_async(args=[session_id], queue="ct_pipeline")
        _get_db().ct_sessions.update_one(
            {"_id": session_id},
            {"$set": {"celery_task_id": task.id, "updated_at": _now()}},
        )
        return {"status": "ok", "session_id": session_id, "next_task": task.id}
    except Exception as exc:
        _get_db().ct_sessions.update_one(
            {"_id": session_id},
            {
                "$set": {
                    "stage": "failed",
                    "stage_checkpoint": {
                        "stage": "testing",
                        "step": "failed",
                        "error": str(exc),
                        "updated_at": _now(),
                    },
                    "updated_at": _now(),
                }
            },
        )
        raise
