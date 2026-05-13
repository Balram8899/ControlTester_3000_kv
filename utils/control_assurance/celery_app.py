from __future__ import annotations

import os

try:
    from celery import Celery
except ModuleNotFoundError:
    class _LocalAsyncResult:
        def __init__(self, task_id: str):
            self.id = task_id

    class _LocalTask:
        def __init__(self, func, name: str | None = None):
            self.func = func
            self.id = None
            self.name = name or func.__name__

        def __call__(self, *args, **kwargs):
            return self.func(*args, **kwargs)

        def apply_async(self, args=None, kwargs=None, queue=None):
            import uuid

            self.id = str(uuid.uuid4())
            return _LocalAsyncResult(self.id)

    class _LocalConf:
        def update(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

    class Celery:
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs
            self.conf = _LocalConf()

        def task(self, *dargs, **dkwargs):
            def decorate(func):
                return _LocalTask(func, dkwargs.get("name"))

            if dargs and callable(dargs[0]):
                return decorate(dargs[0])
            return decorate


BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")

celery_app = Celery(
    "ct_pipeline",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=[
        "utils.control_assurance.pipeline.stage1_parse",
        "utils.control_assurance.pipeline.stage2_review",
        "utils.control_assurance.pipeline.stage3_evidence",
        "utils.control_assurance.pipeline.stage4_testing",
        "utils.control_assurance.pipeline.stage5_workbook",
    ],
)

celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
)
