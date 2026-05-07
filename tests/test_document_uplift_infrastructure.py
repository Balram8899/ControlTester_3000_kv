from __future__ import annotations

from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def test_docker_compose_wires_redis_and_celery_worker() -> None:
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text())
    services = compose["services"]

    assert "redis" in services
    assert services["redis"]["image"].startswith("redis:")

    worker = services["celery_worker"]
    assert worker["build"]["dockerfile"] == "api/Dockerfile"
    assert "redis" in worker["depends_on"]
    assert any("CELERY_BROKER_URL=" in item for item in worker["environment"])
    assert any("CELERY_RESULT_BACKEND=" in item for item in worker["environment"])
    assert "celery" in " ".join(worker["command"]).lower()
    assert "utils.sop_processing.celery_app" in " ".join(worker["command"])


def test_api_requirements_include_celery_and_redis_client() -> None:
    requirements = (ROOT / "api" / "requirements.txt").read_text().lower()

    assert "celery" in requirements
    assert "redis" in requirements


def test_celery_app_declares_pipeline_and_service_routes() -> None:
    from utils.sop_processing import celery_app

    assert celery_app.TASK_ROUTES["document_uplift.run_pipeline"]["queue"] == "document_uplift"
    assert celery_app.TASK_ROUTES["svc.conversion.convert_document"]["queue"] == "conversion"
    assert celery_app.TASK_ROUTES["svc.excel.process_excel"]["queue"] == "excel"
    assert celery_app.TASK_ROUTES["svc.llm.call_llm"]["queue"] == "llm"
    assert celery_app.TASK_ROUTES["svc.analysis.analyze_documents"]["queue"] == "analysis"
    assert celery_app.TASK_ROUTES["svc.outputs.generate_outputs"]["queue"] == "outputs"
