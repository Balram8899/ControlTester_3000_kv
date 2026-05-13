from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel

from utils.control_assurance.celery_app import celery_app
from utils.control_assurance.ct_db import _get_db
from utils.control_assurance.ct_gridfs import download_from_gridfs, upload_to_gridfs
from utils.control_assurance.pipeline.llm_json import invoke_json_with_retry
from utils.control_assurance.prompts.workpaper_narrative import build_workpaper_narrative_prompt
from utils.control_assurance.workbook_builder import build_control_workbook
from utils.llm_provider import get_llm


class NarrativeResponse(BaseModel):
    testing_summary: str = ""
    d_and_i_statement: str = ""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_filename(value: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in value.strip())
    return cleaned or "control"


def _evidence_blobs(control: dict) -> dict[str, bytes]:
    blobs: dict[str, bytes] = {}
    for evidence in control.get("evidence_files", []):
        gridfs_id = evidence.get("gridfs_id")
        if not gridfs_id:
            continue
        try:
            blobs[gridfs_id] = download_from_gridfs(gridfs_id)
        except Exception:
            blobs[gridfs_id] = b""
        for support in evidence.get("support_files", []):
            support_gridfs_id = support.get("gridfs_id")
            if not support_gridfs_id:
                continue
            try:
                blobs[support_gridfs_id] = download_from_gridfs(support_gridfs_id)
            except Exception:
                blobs[support_gridfs_id] = b""
    return blobs


def _generate_workbooks(session_id: str) -> None:
    db = _get_db()
    session = db.ct_sessions.find_one({"_id": session_id})
    if not session:
        raise ValueError(f"CT session not found: {session_id}")

    controls = list(db.ct_controls.find({"session_id": session_id, "status": "complete"}))
    llm = get_llm()
    generated_ids: list[str] = []

    for control in controls:
        narrative = invoke_json_with_retry(
            llm=llm,
            prompt=build_workpaper_narrative_prompt(session, control),
            db=db,
            session_id=session_id,
            stage="workpaper_narrative",
            response_model=NarrativeResponse,
        )
        conclusions = dict(control.get("conclusions", {}))
        conclusions["testing_summary"] = narrative.testing_summary
        conclusions["d_and_i_statement"] = narrative.d_and_i_statement
        control["conclusions"] = conclusions

        filename = f"{_safe_filename(control.get('control_id', 'control'))}_Testing_Workpaper.xlsx"
        content = build_control_workbook(session, control, _evidence_blobs(control))
        workbook_id = upload_to_gridfs(
            content,
            filename,
            {
                "type": "workbook_output",
                "session_id": session_id,
                "control_id": control["_id"],
                "filename": filename,
            },
        )
        db.ct_controls.update_one(
            {"_id": control["_id"]},
            {
                "$set": {
                    "conclusions": conclusions,
                    "workbook_output_id": workbook_id,
                    "updated_at": _now(),
                }
            },
        )
        generated_ids.append(control["_id"])

    db.ct_sessions.update_one(
        {"_id": session_id},
        {
            "$set": {
                "stage": "complete",
                "stage_checkpoint": {
                    "stage": "workbook",
                    "step": "complete",
                    "generated_control_ids": generated_ids,
                    "updated_at": _now(),
                },
                "updated_at": _now(),
            }
        },
    )


@celery_app.task(
    name="ct.generate_workbooks",
    queue="ct_pipeline",
    acks_late=True,
    reject_on_worker_lost=True,
)
def generate_workbooks(session_id: str) -> dict:
    try:
        _generate_workbooks(session_id)
        return {"status": "ok", "session_id": session_id}
    except Exception as exc:
        _get_db().ct_sessions.update_one(
            {"_id": session_id},
            {
                "$set": {
                    "stage": "failed",
                    "stage_checkpoint": {
                        "stage": "workbook",
                        "step": "failed",
                        "error": str(exc),
                        "updated_at": _now(),
                    },
                    "updated_at": _now(),
                }
            },
        )
        raise
