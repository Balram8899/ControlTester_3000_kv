from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from utils.control_assurance.celery_app import celery_app
from utils.control_assurance.ct_db import _get_db
from utils.control_assurance.pipeline.llm_json import invoke_json_with_retry
from utils.control_assurance.prompts.case_analysis import build_case_analysis_prompt
from utils.llm_provider import get_llm


class CaseQuestion(BaseModel):
    question_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    question: str


class ControlSuggestion(BaseModel):
    suggestion_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str


class ControlQuestion(BaseModel):
    question_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    question: str


class ControlReview(BaseModel):
    control_id: str
    suggestions: list[ControlSuggestion] = Field(default_factory=list)
    questions: list[ControlQuestion] = Field(default_factory=list)


class CaseReviewResponse(BaseModel):
    case_questions: list[CaseQuestion] = Field(default_factory=list)
    controls: list[ControlReview] = Field(default_factory=list)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _control_for_prompt(control: dict) -> dict:
    return {
        "control_id": control["control_id"],
        "name": control["control_name"],
        "type": control["control_type"],
        "risk": control.get("risk", ""),
        "domain": control.get("domain", ""),
        "frequency": control.get("frequency", ""),
        "inherent_risk_rating": control.get("inherent_risk_rating", ""),
        "prior_period_result": control.get("prior_period_result", ""),
        "walkthrough_performed": control.get("walkthrough_performed", False),
        "sampling_mode": control.get("sampling", {}).get("mode", "sample"),
        "test_steps": control.get("test_steps", []),
    }


def _run_llm_review(session_id: str) -> None:
    db = _get_db()
    db.ct_sessions.update_one(
        {"_id": session_id},
        {
            "$set": {
                "stage_checkpoint": {
                    "stage": "llm_review",
                    "step": "calling_llm",
                    "updated_at": _now(),
                }
            }
        },
    )

    session = db.ct_sessions.find_one({"_id": session_id})
    if not session:
        raise ValueError(f"Session not found: {session_id}")

    controls = list(db.ct_controls.find({"session_id": session_id}))
    prompt = build_case_analysis_prompt(session, [_control_for_prompt(control) for control in controls])
    llm = get_llm()
    data = invoke_json_with_retry(
        llm=llm,
        prompt=prompt,
        db=db,
        session_id=session_id,
        stage="llm_review",
        response_model=CaseReviewResponse,
    )

    suggestions = []
    questions = []
    control_id_to_mongo_id = {control["control_id"]: control["_id"] for control in controls}

    for case_question in data.case_questions:
        questions.append(
            {
                "question_id": case_question.question_id,
                "level": "case",
                "control_id": None,
                "question": case_question.question,
                "answer": "",
                "answered": False,
            }
        )

    for control_review in data.controls:
        control_mongo_id = control_id_to_mongo_id.get(control_review.control_id)
        for suggestion in control_review.suggestions:
            suggestions.append(
                {
                    "suggestion_id": suggestion.suggestion_id,
                    "control_id": control_mongo_id,
                    "text": suggestion.text,
                    "status": "pending",
                }
            )
        for question in control_review.questions:
            questions.append(
                {
                    "question_id": question.question_id,
                    "level": "control",
                    "control_id": control_mongo_id,
                    "question": question.question,
                    "answer": "",
                    "answered": False,
                }
            )

    db.ct_sessions.update_one(
        {"_id": session_id},
        {
            "$set": {
                "llm_suggestions": suggestions,
                "llm_questions": questions,
                "stage_checkpoint": {
                    "stage": "llm_review",
                    "step": "awaiting_review",
                    "updated_at": _now(),
                },
                "updated_at": _now(),
            }
        },
    )


@celery_app.task(
    name="ct.llm_review",
    queue="ct_pipeline",
    acks_late=True,
    reject_on_worker_lost=True,
)
def llm_review(session_id: str) -> dict:
    try:
        _run_llm_review(session_id)
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
