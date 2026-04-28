from __future__ import annotations

import uuid
from datetime import datetime


class InMemoryTaskStore:
    def __init__(self):
        self._tasks: dict[str, dict] = {}

    def create(self, case_id: str, stage: str) -> dict:
        task = {
            "task_id": str(uuid.uuid4()),
            "case_id": case_id,
            "stage": stage,
            "status": "running",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
        self._tasks[task["task_id"]] = task
        return task

    def update(self, task_id: str, **updates) -> dict | None:
        task = self._tasks.get(task_id)
        if not task:
            return None
        task.update(updates)
        task["updated_at"] = datetime.utcnow().isoformat()
        return task

    def get(self, task_id: str) -> dict | None:
        return self._tasks.get(task_id)
