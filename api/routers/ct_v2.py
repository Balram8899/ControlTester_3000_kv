from __future__ import annotations

import random
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import StreamingResponse

from utils.control_assurance import ct_db
from utils.control_assurance.control_setup import build_control_doc, build_test_steps, now_iso
from utils.control_assurance.ct_gridfs import (
    delete_from_gridfs,
    stream_from_gridfs,
    upload_to_gridfs,
)
from utils.control_assurance.ct_models import CreateControlRequest, CreateSessionRequest

TEMPLATE_PATH = Path(__file__).parent.parent / "templates" / "CT_Input_Template.xlsx"

router = APIRouter(prefix="/ct", tags=["control-testing-v2"])


def _now() -> str:
    return now_iso()


def _session_to_response(doc: dict) -> dict:
    return {**doc, "id": doc["_id"]}


def _control_to_response(doc: dict) -> dict:
    return {**doc, "id": doc["_id"]}


def _ct_issue_to_response(doc: dict) -> dict:
    return {**doc, "id": doc["_id"]}


def _classify_file_type(ext: str) -> str:
    normalized = ext.lower().lstrip(".")
    if normalized in {"jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp"}:
        return "image"
    if normalized == "pdf":
        return "pdf"
    if normalized in {"xlsx", "xls"}:
        return "excel"
    if normalized == "csv":
        return "csv"
    if normalized == "docx":
        return "docx"
    if normalized in {"txt", "conf"}:
        return "txt"
    if normalized == "zip":
        return "zip"
    return "other"


def _parse_unique_key_columns(value: str = "") -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def _support_file_entry(
    *,
    gridfs_id: str,
    filename: str,
    file_type: str,
    support_type: str,
    comments: str,
    unique_key_columns: str,
    expected_count: int | None,
) -> dict:
    return {
        "gridfs_id": gridfs_id,
        "filename": filename,
        "file_type": file_type,
        "support_type": support_type,
        "comments": comments,
        "reconciliation": {
            "unique_key_columns": _parse_unique_key_columns(unique_key_columns),
            "expected_count": expected_count,
        },
        "created_at": _now(),
    }


@router.post("/sessions", status_code=201)
def create_session(body: CreateSessionRequest) -> dict:
    now = _now()
    doc = {
        "_id": str(uuid.uuid4()),
        "title": body.title,
        "description": body.description,
        "entity": body.entity,
        "testing_period": body.testing_period.model_dump(by_alias=True),
        "framework": body.framework,
        "stage": "input",
        "stage_checkpoint": None,
        "celery_task_id": None,
        "llm_suggestions": [],
        "llm_questions": [],
        "sign_off": {
            "preparer": {"name": body.preparer, "initials": "", "date": None},
            "reviewer": {"name": "", "initials": "", "date": None},
            "manager": {"name": "", "initials": "", "date": None},
        },
        "override_log": [],
        "created_at": now,
        "updated_at": now,
    }
    ct_db._get_db().ct_sessions.insert_one(doc)
    return _session_to_response(doc)


@router.get("/sessions")
def list_sessions() -> list:
    db = ct_db._get_db()
    docs = list(db.ct_sessions.find({}, sort=[("created_at", -1)]))
    result = []
    for doc in docs:
        result.append(
            {
                "id": doc["_id"],
                "title": doc["title"],
                "entity": doc["entity"],
                "framework": doc.get("framework", "Controls Assurance"),
                "stage": doc["stage"],
                "control_count": db.ct_controls.count_documents({"session_id": doc["_id"]}),
                "created_at": doc["created_at"],
                "updated_at": doc["updated_at"],
            }
        )
    return result


@router.get("/sessions/{session_id}")
def get_session(session_id: str) -> dict:
    db = ct_db._get_db()
    doc = db.ct_sessions.find_one({"_id": session_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    controls = list(db.ct_controls.find({"session_id": session_id}))
    result = _session_to_response(doc)
    result["controls"] = [_control_to_response(c) for c in controls]
    return result


@router.delete("/sessions/{session_id}", status_code=204, response_class=Response)
def delete_session(session_id: str):
    db = ct_db._get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")

    for control in db.ct_controls.find({"session_id": session_id}):
        for ev in control.get("evidence_files", []):
            try:
                delete_from_gridfs(ev["gridfs_id"])
            except Exception:
                pass
            for support in ev.get("support_files", []):
                try:
                    delete_from_gridfs(support["gridfs_id"])
                except Exception:
                    pass
        pop_id = control.get("sampling", {}).get("population_file_id")
        if pop_id:
            try:
                delete_from_gridfs(pop_id)
            except Exception:
                pass
        for support in control.get("sampling", {}).get("population_support_files", []):
            try:
                delete_from_gridfs(support["gridfs_id"])
            except Exception:
                pass
        wb_id = control.get("workbook_output_id")
        if wb_id:
            try:
                delete_from_gridfs(wb_id)
            except Exception:
                pass

    db.ct_controls.delete_many({"session_id": session_id})
    db.ct_issues.delete_many({"session_id": session_id})
    db.ct_sessions.delete_one({"_id": session_id})


@router.get("/sessions/{session_id}/status")
def session_status(session_id: str) -> dict:
    doc = ct_db._get_db().ct_sessions.find_one(
        {"_id": session_id},
        {"stage": 1, "stage_checkpoint": 1, "celery_task_id": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": session_id,
        "stage": doc["stage"],
        "stage_checkpoint": doc.get("stage_checkpoint"),
        "celery_task_id": doc.get("celery_task_id"),
    }


@router.post("/sessions/{session_id}/controls", status_code=201)
def add_controls(session_id: str, controls: list[CreateControlRequest]) -> list:
    db = ct_db._get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")

    now = _now()
    created = []
    for body in controls:
        doc = build_control_doc(session_id, body.model_dump(), now=now)
        db.ct_controls.insert_one(doc)
        created.append(_control_to_response(doc))

    db.ct_sessions.update_one({"_id": session_id}, {"$set": {"updated_at": now}})
    return created


@router.get("/sessions/{session_id}/controls")
def list_controls(session_id: str) -> dict:
    db = ct_db._get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")
    controls = list(db.ct_controls.find({"session_id": session_id}))
    return {"controls": [_control_to_response(control) for control in controls]}


@router.post("/sessions/{session_id}/controls/parse", status_code=201)
def parse_controls_from_screen(session_id: str, controls: list[dict]) -> list:
    db = ct_db._get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")

    now = _now()
    created = []
    for payload in controls:
        doc = build_control_doc(session_id, payload, now=now)
        db.ct_controls.insert_one(doc)
        created.append(_control_to_response(doc))

    db.ct_sessions.update_one(
        {"_id": session_id},
        {
            "$set": {
                "stage": "control_review",
                "controls_finalized": False,
                "stage_checkpoint": {
                    "stage": "control_setup",
                    "step": "awaiting_control_finalization",
                    "updated_at": _now(),
                },
                "updated_at": _now(),
            }
        },
    )
    return created


@router.get("/sessions/{session_id}/controls/{control_id}")
def get_control(session_id: str, control_id: str) -> dict:
    control = ct_db._get_db().ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    return _control_to_response(control)


@router.patch("/sessions/{session_id}/controls/{control_id}")
def update_control(session_id: str, control_id: str, body: dict) -> dict:
    db = ct_db._get_db()
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    editable_fields = {
        "control_id",
        "control_name",
        "control_description",
        "control_type",
        "domain",
        "framework_reference",
        "inherent_risk_rating",
        "control_owner",
        "frequency",
        "prior_period_result",
        "walkthrough_performed",
        "risk",
        "test_objectives",
    }
    updates = {}
    field_sources = dict(control.get("field_sources", {}))
    for field in editable_fields:
        if field in body:
            updates[field] = body[field]
            field_sources[field] = "user_edited"

    if "test_steps" in body:
        steps, _ = build_test_steps(body["test_steps"])
        updates["test_steps"] = steps
        for index, _ in enumerate(steps):
            field_sources[f"test_steps.{index}.test_attribute"] = "user_edited"
            field_sources[f"test_steps.{index}.evidence_required"] = "user_edited"

    additional_context = body.get("sampling_additional_context", body.get("additional_sampling_context"))
    if additional_context is not None:
        updates["sampling.additional_context"] = additional_context
        field_sources["sampling.additional_context"] = "user_edited"

    if not updates:
        raise HTTPException(status_code=422, detail="No editable control fields supplied")

    updates["field_sources"] = field_sources
    updates["updated_at"] = _now()
    db.ct_controls.update_one({"_id": control_id}, {"$set": updates})
    updated = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    return _control_to_response(updated)


@router.post("/sessions/{session_id}/finalize-controls")
def finalize_controls(session_id: str) -> dict:
    db = ct_db._get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")
    if db.ct_controls.count_documents({"session_id": session_id}) == 0:
        raise HTTPException(status_code=409, detail="No controls available to finalize")

    now = _now()
    db.ct_controls.update_many(
        {"session_id": session_id},
        {
            "$set": {
                "controls_finalized": True,
                "finalized_at": now,
                "updated_at": now,
            }
        },
    )
    db.ct_sessions.update_one(
        {"_id": session_id},
        {
            "$set": {
                "stage": "population",
                "controls_finalized": True,
                "controls_finalized_at": now,
                "stage_checkpoint": {
                    "stage": "control_review",
                    "step": "controls_finalized",
                    "updated_at": now,
                },
                "updated_at": now,
            }
        },
    )
    return {"status": "controls_finalized", "stage": "population"}


@router.post("/sessions/{session_id}/controls/{control_id}/population", status_code=201)
async def upload_population(
    session_id: str,
    control_id: str,
    file: UploadFile = File(...),
) -> dict:
    db = ct_db._get_db()
    if not db.ct_controls.find_one({"_id": control_id, "session_id": session_id}):
        raise HTTPException(status_code=404, detail="Control not found")

    filename = file.filename or "population"
    ext = Path(filename).suffix.lower().lstrip(".")
    file_type = _classify_file_type(ext)
    content = await file.read()
    gridfs_id = upload_to_gridfs(
        content,
        filename,
        {"type": "population", "session_id": session_id, "control_id": control_id},
    )
    db.ct_controls.update_one(
        {"_id": control_id},
        {
            "$set": {
                "sampling.population_file_id": gridfs_id,
                "sampling.population_filename": filename,
                "sampling.population_file_type": file_type,
                "sampling.population_ca_verification.completeness_passed": None,
                "sampling.population_ca_verification.accuracy_passed": None,
                "sampling.population_ca_verification.issues": [],
                "updated_at": _now(),
            }
        },
    )
    from utils.control_assurance.pipeline.stage3_evidence import verify_population_ca
    verify_population_ca.apply_async(args=[session_id, control_id], queue="ct_pipeline")
    return {"gridfs_id": gridfs_id, "filename": filename, "file_type": file_type, "status": "uploaded"}


@router.post("/sessions/{session_id}/controls/{control_id}/population/support-files", status_code=201)
async def upload_population_support_files(
    session_id: str,
    control_id: str,
    files: list[UploadFile] = File(...),
    support_type: str = Form("source_support"),
    comments: str = Form(""),
    unique_key_columns: str = Form(""),
    expected_count: int | None = Form(None),
) -> list:
    db = ct_db._get_db()
    if not db.ct_controls.find_one({"_id": control_id, "session_id": session_id}):
        raise HTTPException(status_code=404, detail="Control not found")

    uploaded = []
    for file in files:
        filename = file.filename or "population_support"
        file_type = _classify_file_type(Path(filename).suffix.lower().lstrip("."))
        content = await file.read()
        gridfs_id = upload_to_gridfs(
            content,
            filename,
            {
                "type": "population_support",
                "session_id": session_id,
                "control_id": control_id,
                "support_type": support_type,
            },
        )
        entry = _support_file_entry(
            gridfs_id=gridfs_id,
            filename=filename,
            file_type=file_type,
            support_type=support_type,
            comments=comments,
            unique_key_columns=unique_key_columns,
            expected_count=expected_count,
        )
        db.ct_controls.update_one(
            {"_id": control_id},
            {
                "$push": {"sampling.population_support_files": entry},
                "$set": {"updated_at": _now()},
            },
        )
        uploaded.append(entry)

    return uploaded


@router.post("/sessions/{session_id}/upload-template", status_code=202)
async def upload_template(session_id: str, file: UploadFile = File(...)) -> dict:
    db = ct_db._get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")

    filename = file.filename or ""
    if not filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=422, detail="Only .xlsx files accepted")

    content = await file.read()
    gridfs_id = upload_to_gridfs(
        content,
        filename,
        {"type": "input_template", "session_id": session_id},
    )
    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {"input_template_gridfs_id": gridfs_id, "updated_at": _now()}},
    )

    from utils.control_assurance.pipeline.stage1_parse import parse_template

    task = parse_template.apply_async(args=[session_id, gridfs_id], queue="ct_pipeline")
    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {"celery_task_id": task.id, "updated_at": _now()}},
    )
    return {"gridfs_id": gridfs_id, "celery_task_id": task.id, "status": "parsing"}


@router.post("/sessions/{session_id}/controls/{control_id}/evidence", status_code=201)
async def upload_evidence(
    session_id: str,
    control_id: str,
    files: list[UploadFile] = File(...),
) -> list:
    db = ct_db._get_db()
    if not db.ct_controls.find_one({"_id": control_id, "session_id": session_id}):
        raise HTTPException(status_code=404, detail="Control not found")

    uploaded = []
    for file in files:
        filename = file.filename or "evidence"
        ext = Path(filename).suffix.lower().lstrip(".")
        file_type = _classify_file_type(ext)
        content = await file.read()
        gridfs_id = upload_to_gridfs(
            content,
            filename,
            {"type": "evidence", "session_id": session_id, "control_id": control_id},
        )
        evidence_entry = {
            "gridfs_id": gridfs_id,
            "filename": filename,
            "file_type": file_type,
            "mapped_step_labels": [],
            "identified_value": "",
            "annotation_regions": [],
            "support_files": [],
            "ca_verification": {
                "completeness_passed": None,
                "accuracy_passed": None,
                "issues": [],
                "overridden": False,
                "override_reason": None,
            },
        }
        db.ct_controls.update_one(
            {"_id": control_id},
            {"$push": {"evidence_files": evidence_entry}, "$set": {"updated_at": _now()}},
        )
        from utils.control_assurance.pipeline.stage3_evidence import verify_evidence_ca
        verify_evidence_ca.apply_async(args=[session_id, control_id, gridfs_id], queue="ct_pipeline")
        uploaded.append(
            {"gridfs_id": gridfs_id, "filename": filename, "file_type": file_type}
        )

    return uploaded


@router.post("/sessions/{session_id}/controls/{control_id}/evidence/{gridfs_id}/support-files", status_code=201)
async def upload_evidence_support_files(
    session_id: str,
    control_id: str,
    gridfs_id: str,
    files: list[UploadFile] = File(...),
    support_type: str = Form("source_support"),
    comments: str = Form(""),
    unique_key_columns: str = Form(""),
    expected_count: int | None = Form(None),
) -> list:
    db = ct_db._get_db()
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    if not any(evidence.get("gridfs_id") == gridfs_id for evidence in control.get("evidence_files", [])):
        raise HTTPException(status_code=404, detail="Evidence file not found")

    uploaded = []
    for file in files:
        filename = file.filename or "evidence_support"
        file_type = _classify_file_type(Path(filename).suffix.lower().lstrip("."))
        content = await file.read()
        support_gridfs_id = upload_to_gridfs(
            content,
            filename,
            {
                "type": "evidence_support",
                "session_id": session_id,
                "control_id": control_id,
                "evidence_gridfs_id": gridfs_id,
                "support_type": support_type,
            },
        )
        entry = _support_file_entry(
            gridfs_id=support_gridfs_id,
            filename=filename,
            file_type=file_type,
            support_type=support_type,
            comments=comments,
            unique_key_columns=unique_key_columns,
            expected_count=expected_count,
        )
        evidence_files = control.get("evidence_files", [])
        for evidence in evidence_files:
            if evidence.get("gridfs_id") == gridfs_id:
                evidence.setdefault("support_files", []).append(entry)
                break
        db.ct_controls.update_one(
            {"_id": control_id},
            {"$set": {"evidence_files": evidence_files, "updated_at": _now()}},
        )
        uploaded.append(entry)

    return uploaded


@router.delete(
    "/sessions/{session_id}/controls/{control_id}/evidence/{gridfs_id}",
    status_code=204,
    response_class=Response,
)
def delete_evidence(session_id: str, control_id: str, gridfs_id: str):
    db = ct_db._get_db()
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    evidence = next((ev for ev in control.get("evidence_files", []) if ev.get("gridfs_id") == gridfs_id), None)
    if evidence:
        for support in evidence.get("support_files", []):
            try:
                delete_from_gridfs(support["gridfs_id"])
            except Exception:
                pass

    try:
        delete_from_gridfs(gridfs_id)
    except Exception:
        pass

    db.ct_controls.update_one(
        {"_id": control_id},
        {
            "$pull": {"evidence_files": {"gridfs_id": gridfs_id}},
            "$set": {"updated_at": _now()},
        },
    )


@router.get("/sessions/{session_id}/controls/{control_id}/workbook")
def download_workbook(session_id: str, control_id: str) -> StreamingResponse:
    db = ct_db._get_db()
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    workbook_id = control.get("workbook_output_id")
    if not workbook_id:
        raise HTTPException(status_code=404, detail="Workbook not yet generated")

    safe_name = control["control_name"].replace(" ", "_")[:40]
    filename = f"workpaper_{control['control_id']}_{safe_name}.xlsx"
    return StreamingResponse(
        stream_from_gridfs(workbook_id),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/template/download")
def download_template() -> StreamingResponse:
    if not TEMPLATE_PATH.exists():
        raise HTTPException(status_code=404, detail="Template file not found on server")

    def iter_file():
        with open(TEMPLATE_PATH, "rb") as handle:
            while chunk := handle.read(65536):
                yield chunk

    return StreamingResponse(
        iter_file(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="CT_Input_Template.xlsx"'},
    )


@router.post("/sessions/{session_id}/begin-analysis", status_code=202)
def begin_analysis(session_id: str) -> dict:
    db = ct_db._get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")
    if db.ct_controls.count_documents({"session_id": session_id}) == 0:
        raise HTTPException(status_code=409, detail="No controls available for analysis")

    from utils.control_assurance.pipeline.stage2_review import llm_review

    task = llm_review.apply_async(args=[session_id], queue="ct_pipeline")
    db.ct_sessions.update_one(
        {"_id": session_id},
        {
            "$set": {
                "stage": "analysing",
                "celery_task_id": task.id,
                "stage_checkpoint": {
                    "stage": "manual_input",
                    "step": "queued_llm_review",
                    "updated_at": _now(),
                },
                "updated_at": _now(),
            }
        },
    )
    return {"celery_task_id": task.id, "status": "analysis_queued"}


@router.get("/sessions/{session_id}/suggestions")
def get_suggestions(session_id: str) -> dict:
    doc = ct_db._get_db().ct_sessions.find_one(
        {"_id": session_id},
        {"llm_suggestions": 1, "llm_questions": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "suggestions": doc.get("llm_suggestions", []),
        "questions": doc.get("llm_questions", []),
    }


@router.patch("/sessions/{session_id}/suggestions/{suggestion_id}")
def update_suggestion(session_id: str, suggestion_id: str, body: dict) -> dict:
    status = body.get("status")
    if status not in {"accepted", "dismissed"}:
        raise HTTPException(status_code=422, detail="status must be 'accepted' or 'dismissed'")

    result = ct_db._get_db().ct_sessions.update_one(
        {"_id": session_id, "llm_suggestions.suggestion_id": suggestion_id},
        {"$set": {"llm_suggestions.$.status": status, "updated_at": _now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return {"suggestion_id": suggestion_id, "status": status}


@router.post("/sessions/{session_id}/questions/{question_id}/answer")
def answer_question(session_id: str, question_id: str, body: dict) -> dict:
    db = ct_db._get_db()
    answer = str(body.get("answer") or "").strip()
    if not answer:
        raise HTTPException(status_code=422, detail="Answer is required")
    result = db.ct_sessions.update_one(
        {"_id": session_id, "llm_questions.question_id": question_id},
        {
            "$set": {
                "llm_questions.$.answer": answer,
                "llm_questions.$.answered": True,
                "updated_at": _now(),
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"question_id": question_id, "answered": True}


@router.post("/sessions/{session_id}/confirm-review", status_code=202)
def confirm_review(session_id: str) -> dict:
    db = ct_db._get_db()
    session = db.ct_sessions.find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    unanswered = [q for q in session.get("llm_questions", []) if not q.get("answered")]
    if unanswered:
        raise HTTPException(
            status_code=409,
            detail=f"{len(unanswered)} question(s) still unanswered. Answer all questions before proceeding.",
        )
    pending_suggestions = [s for s in session.get("llm_suggestions", []) if s.get("status") == "pending"]
    if pending_suggestions:
        raise HTTPException(
            status_code=409,
            detail=f"{len(pending_suggestions)} suggestion(s) still pending. Accept or dismiss all suggestions before proceeding.",
        )
    if session.get("controls_finalized") is False:
        raise HTTPException(
            status_code=409,
            detail="Finalize control setup before proceeding to population and evidence setup.",
        )

    from utils.control_assurance.pipeline.stage3_evidence import evidence_mapping

    task = evidence_mapping.apply_async(args=[session_id], queue="ct_pipeline")
    db.ct_sessions.update_one(
        {"_id": session_id},
        {
            "$set": {
                "stage": "population",
                "celery_task_id": task.id,
                "stage_checkpoint": {
                    "stage": "review",
                    "step": "confirmed",
                    "updated_at": _now(),
                },
                "updated_at": _now(),
            }
        },
    )
    return {"celery_task_id": task.id, "status": "evidence_mapping_queued"}


@router.get("/sessions/{session_id}/controls/{control_id}/mapping")
def get_mapping(session_id: str, control_id: str) -> dict:
    control = ct_db._get_db().ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    return {
        "evidence_files": control.get("evidence_files", []),
        "sampling": control.get("sampling", {}),
    }


@router.patch("/sessions/{session_id}/controls/{control_id}/mapping")
def override_mapping(session_id: str, control_id: str, body: dict) -> dict:
    db = ct_db._get_db()
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    gridfs_id = body.get("file_gridfs_id")
    new_steps = body.get("mapped_step_labels", [])
    evidence = next((ev for ev in control.get("evidence_files", []) if ev["gridfs_id"] == gridfs_id), None)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence file not found")

    original = evidence.get("mapped_step_labels", [])
    db.ct_controls.update_one(
        {"_id": control_id, "evidence_files.gridfs_id": gridfs_id},
        {"$set": {"evidence_files.$.mapped_step_labels": new_steps, "updated_at": _now()}},
    )
    db.ct_sessions.update_one(
        {"_id": session_id},
        {
            "$push": {
                "override_log": {
                    "timestamp": _now(),
                    "override_type": "evidence_mapping",
                    "control_id": control_id,
                    "evidence_filename": evidence.get("filename", ""),
                    "original_value": str(original),
                    "override_value": str(new_steps),
                    "reason": body.get("reason", ""),
                }
            }
        },
    )
    return {"updated": True}


@router.patch("/sessions/{session_id}/controls/{control_id}/ca-override")
def ca_override(session_id: str, control_id: str, body: dict) -> dict:
    db = ct_db._get_db()
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    reason = str(body.get("reason", "")).strip()
    if len(reason) < 10:
        raise HTTPException(status_code=422, detail="Override reason must be at least 10 characters")

    evidence_filename = None
    if body.get("population"):
        original_issues = control.get("sampling", {}).get("population_ca_verification", {}).get("issues", [])
        db.ct_controls.update_one(
            {"_id": control_id},
            {
                "$set": {
                    "sampling.population_ca_verification.overridden": True,
                    "sampling.population_ca_verification.override_reason": reason,
                    "updated_at": _now(),
                }
            },
        )
    else:
        gridfs_id = body.get("file_gridfs_id")
        if not gridfs_id:
            raise HTTPException(status_code=422, detail="file_gridfs_id required")
        evidence = next((ev for ev in control.get("evidence_files", []) if ev["gridfs_id"] == gridfs_id), None)
        if not evidence:
            raise HTTPException(status_code=404, detail="Evidence file not found")
        original_issues = evidence.get("ca_verification", {}).get("issues", [])
        evidence_filename = evidence.get("filename")
        db.ct_controls.update_one(
            {"_id": control_id, "evidence_files.gridfs_id": gridfs_id},
            {
                "$set": {
                    "evidence_files.$.ca_verification.overridden": True,
                    "evidence_files.$.ca_verification.override_reason": reason,
                    "updated_at": _now(),
                }
            },
        )

    db.ct_sessions.update_one(
        {"_id": session_id},
        {
            "$push": {
                "override_log": {
                    "timestamp": _now(),
                    "override_type": "ca_check",
                    "control_id": control_id,
                    "evidence_filename": evidence_filename,
                    "original_value": str([issue.get("finding", "") for issue in original_issues]),
                    "override_value": "accepted",
                    "reason": reason,
                }
            }
        },
    )
    return {"overridden": True}


def _selected_items(strategy: str, selected_size: int, population_count: int, current_items: list) -> list:
    if strategy == "user_selected":
        return current_items[:selected_size]
    if strategy == "full":
        return list(range(1, population_count + 1))
    sample_size = min(max(selected_size, 0), max(population_count, 0))
    if sample_size == 0:
        return []
    return sorted(random.sample(range(1, population_count + 1), sample_size))


@router.patch("/sessions/{session_id}/controls/{control_id}/sampling")
def update_sampling(session_id: str, control_id: str, body: dict) -> dict:
    db = ct_db._get_db()
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    sampling = control.get("sampling", {})
    updates = {}
    for field in (
        "population_description",
        "sample_period",
        "selected_size",
        "selected_items",
        "additional_context",
        "adjusted_population_count",
    ):
        if field in body:
            updates[f"sampling.{field}"] = body[field]

    if "selection_strategy" in body:
        strategy = body["selection_strategy"]
        updates["sampling.selection_strategy"] = strategy
        selected_size = int(body.get("selected_size", sampling.get("selected_size", 0) or 0))
        current_items = body.get("selected_items", sampling.get("selected_items", []))
        population_count = int(sampling.get("population_count", 0) or 0)
        updates["sampling.selected_items"] = _selected_items(
            strategy, selected_size, population_count, current_items
        )
        updates["sampling.selected_size"] = (
            len(updates["sampling.selected_items"]) if population_count > 0 else selected_size
        )

        original = sampling.get("selection_strategy")
        reason = body.get("reason", "")
        if original and original != strategy and reason:
            db.ct_sessions.update_one(
                {"_id": session_id},
                {
                    "$push": {
                        "override_log": {
                            "timestamp": _now(),
                            "override_type": "sampling_methodology",
                            "control_id": control_id,
                            "evidence_filename": None,
                            "original_value": str(original),
                            "override_value": str(strategy),
                            "reason": reason,
                        }
                    }
                },
            )

    updates["updated_at"] = _now()
    db.ct_controls.update_one({"_id": control_id}, {"$set": updates})
    return {"updated": True}


def _ca_resolved(ca: dict) -> bool:
    return ca.get("overridden") is True or (
        ca.get("completeness_passed") is True and ca.get("accuracy_passed") is True
    )


@router.post("/sessions/{session_id}/confirm-mapping", status_code=202)
def confirm_mapping(session_id: str) -> dict:
    db = ct_db._get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")

    unresolved = []
    for control in db.ct_controls.find({"session_id": session_id}):
        control_issues = []
        sampling = control.get("sampling", {})
        if sampling.get("mode", "none") in {"sample", "both"}:
            if not _ca_resolved(sampling.get("population_ca_verification", {})):
                control_issues.append("Population C&A not resolved")

        evidence_files = control.get("evidence_files", [])
        if not evidence_files:
            control_issues.append("No evidence files uploaded")
        for evidence in evidence_files:
            if not _ca_resolved(evidence.get("ca_verification", {})):
                control_issues.append(f"Evidence '{evidence.get('filename', '')}' C&A not resolved")

        if control_issues:
            unresolved.append(
                {
                    "control_id": control["_id"],
                    "control_name": control.get("control_name", ""),
                    "unresolved_files": [{"filename": issue} for issue in control_issues],
                }
            )

    if unresolved:
        raise HTTPException(
            status_code=409,
            detail={
                "blocked": True,
                "reason": "C&A verification gate not cleared",
                "unresolved": unresolved,
            },
        )

    from utils.control_assurance.pipeline.stage4_testing import run_testing

    task = run_testing.apply_async(args=[session_id], queue="ct_pipeline")
    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {"stage": "testing", "celery_task_id": task.id, "updated_at": _now()}},
    )
    return {"celery_task_id": task.id, "status": "testing_queued"}


@router.get("/sessions/{session_id}/issues")
def list_ct_issues(session_id: str) -> dict:
    db = ct_db._get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")
    issues = list(db.ct_issues.find({"session_id": session_id}))
    return {"issues": [_ct_issue_to_response(issue) for issue in issues]}


def _push_ct_issue(db, session_id: str, issue_id: str) -> dict:
    issue = db.ct_issues.find_one({"_id": issue_id, "session_id": session_id})
    if not issue:
        raise HTTPException(status_code=404, detail="CT issue not found")

    if issue.get("pushed_to_issues") and issue.get("issues_module_id"):
        return _ct_issue_to_response(issue)

    now = _now()
    main_issue_id = str(uuid.uuid4())
    description_parts = [
        issue.get("summary", ""),
        issue.get("detail", ""),
        f"Root cause: {issue.get('root_cause', '')}",
        f"Recommendation: {issue.get('recommendation', '')}",
        f"CT issue reference: {issue.get('issues_log_ref', '')}",
    ]
    main_issue = {
        "_id": main_issue_id,
        "title": issue.get("title", ""),
        "description": "\n\n".join(part for part in description_parts if part),
        "severity": issue.get("severity", "Medium"),
        "source_module": "control_testing",
        "asset_ids": [],
        "control_ids": [issue.get("control_external_id") or issue.get("control_id", "")],
        "risk_assessment_id": None,
        "raised_by": "Control Testing V2",
        "owner": "",
        "checker": "",
        "remediation_plan": issue.get("recommendation", ""),
        "target_date": None,
        "review_notes": None,
        "closure_notes": None,
        "status": "Open",
        "evidences": [],
        "approvals": [],
        "ct_session_id": session_id,
        "ct_issue_id": issue_id,
        "issues_log_ref": issue.get("issues_log_ref", ""),
        "created_at": now,
        "updated_at": now,
    }
    db.issues.insert_one(main_issue)
    db.ct_issues.update_one(
        {"_id": issue_id},
        {
            "$set": {
                "pushed_to_issues": True,
                "issues_module_id": main_issue_id,
                "updated_at": now,
            }
        },
    )
    updated = db.ct_issues.find_one({"_id": issue_id})
    return _ct_issue_to_response(updated)


@router.post("/sessions/{session_id}/issues/push-all")
def push_all_ct_issues(session_id: str) -> dict:
    db = ct_db._get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")

    pushed = []
    for issue in db.ct_issues.find({"session_id": session_id, "pushed_to_issues": {"$ne": True}}):
        pushed.append(_push_ct_issue(db, session_id, issue["_id"]))
    return {"pushed_count": len(pushed), "issues": pushed}


@router.get("/sessions/{session_id}/issues/{issue_id}")
def get_ct_issue(session_id: str, issue_id: str) -> dict:
    issue = ct_db._get_db().ct_issues.find_one({"_id": issue_id, "session_id": session_id})
    if not issue:
        raise HTTPException(status_code=404, detail="CT issue not found")
    return _ct_issue_to_response(issue)


@router.patch("/sessions/{session_id}/issues/{issue_id}")
def update_ct_issue(session_id: str, issue_id: str, body: dict) -> dict:
    db = ct_db._get_db()
    if not db.ct_issues.find_one({"_id": issue_id, "session_id": session_id}):
        raise HTTPException(status_code=404, detail="CT issue not found")

    allowed = {
        "title",
        "severity",
        "summary",
        "detail",
        "root_cause",
        "recommendation",
        "auditor_disposition",
        "exception_refs",
    }
    updates = {field: body[field] for field in allowed if field in body}
    if not updates:
        raise HTTPException(status_code=422, detail="No valid issue fields provided")
    updates["updated_at"] = _now()
    db.ct_issues.update_one({"_id": issue_id}, {"$set": updates})
    return _ct_issue_to_response(db.ct_issues.find_one({"_id": issue_id}))


@router.post("/sessions/{session_id}/issues/{issue_id}/push")
def push_ct_issue(session_id: str, issue_id: str) -> dict:
    db = ct_db._get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")
    return _push_ct_issue(db, session_id, issue_id)


@router.patch("/sessions/{session_id}/sign-off")
def update_sign_off(session_id: str, body: dict) -> dict:
    db = ct_db._get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")

    updates = {}
    for role in ("preparer", "reviewer", "manager"):
        entry = body.get(role)
        if not isinstance(entry, dict):
            continue
        for field in ("name", "initials", "date"):
            if field in entry:
                updates[f"sign_off.{role}.{field}"] = entry[field]

    if not updates:
        raise HTTPException(status_code=422, detail="No valid sign-off fields provided")

    updates["updated_at"] = _now()
    db.ct_sessions.update_one({"_id": session_id}, {"$set": updates})
    return {"updated": True}
