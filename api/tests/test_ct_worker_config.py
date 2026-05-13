from __future__ import annotations

import ast
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_ct_celery_app_config_is_declared():
    source_path = REPO_ROOT / "utils" / "control_assurance" / "celery_app.py"

    assert source_path.exists()
    source = source_path.read_text(encoding="utf-8")
    assert '"ct_pipeline"' in source
    assert '"utils.control_assurance.pipeline.stage1_parse"' in source
    assert '"utils.control_assurance.pipeline.stage2_review"' in source
    assert '"utils.control_assurance.pipeline.stage3_evidence"' in source
    assert '"utils.control_assurance.pipeline.stage4_testing"' in source
    assert '"utils.control_assurance.pipeline.stage5_workbook"' in source
    assert "task_acks_late=True" in source
    assert "task_reject_on_worker_lost=True" in source
    assert "task_track_started=True" in source


def test_ct_worker_compose_service_uses_ct_pipeline_queue():
    compose = yaml.safe_load((REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8"))

    service = compose["services"]["ct_worker"]
    assert service["container_name"] == "ct_worker_Trace_KV"
    assert service["command"] == [
        "celery",
        "-A",
        "utils.control_assurance.celery_app",
        "worker",
        "--loglevel=INFO",
        "-Q",
        "ct_pipeline",
        "--concurrency=2",
    ]
    assert "redis" in service["depends_on"]
    assert "mongodb" in service["depends_on"]

    env = set(service["environment"])
    assert "MONGO_URI=mongodb://mongodb:27017" in env
    assert "CELERY_BROKER_URL=${CELERY_BROKER_URL:-redis://redis:6379/0}" in env
    assert "CELERY_RESULT_BACKEND=${CELERY_RESULT_BACKEND:-redis://redis:6379/0}" in env
    assert "LLM_PROVIDER=${LLM_PROVIDER}" in env
    assert "GOOGLE_LLM_MODEL=${GOOGLE_LLM_MODEL}" in env


def test_no_pipeline_module_hardcodes_provider():
    pipeline_dir = REPO_ROOT / "utils" / "control_assurance" / "pipeline"
    for py_file in pipeline_dir.glob("*.py"):
        tree = ast.parse(py_file.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func_name = None
            if isinstance(node.func, ast.Name):
                func_name = node.func.id
            elif isinstance(node.func, ast.Attribute):
                func_name = node.func.attr
            if func_name == "get_llm":
                assert not node.args and not node.keywords, (
                    f"{py_file.name} calls get_llm() with arguments"
                )


def test_ct_task_decorators_request_resilient_delivery():
    pipeline_dir = REPO_ROOT / "utils" / "control_assurance" / "pipeline"
    task_files = [
        py_file
        for py_file in pipeline_dir.glob("*.py")
        if "@celery_app.task" in py_file.read_text(encoding="utf-8")
    ]
    assert task_files
    for py_file in task_files:
        source = py_file.read_text(encoding="utf-8")
        assert "acks_late=True" in source, f"{py_file.name} missing acks_late=True"
        assert "reject_on_worker_lost=True" in source, (
            f"{py_file.name} missing reject_on_worker_lost=True"
        )


def test_redis_aof_in_compose():
    compose = yaml.safe_load((REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
    redis_cmd = compose["services"]["redis"].get("command", "")
    assert "appendonly yes" in redis_cmd
