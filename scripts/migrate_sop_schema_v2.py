from __future__ import annotations

import argparse
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any


MAX_CASE_BYTES = 500 * 1024
CONTENT_FIELDS = ("markdown_documents", "anchors", "chunks")


def utc_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def schema_version(case: dict[str, Any]) -> int:
    try:
        return int(case.get("schema_version") or 1)
    except (TypeError, ValueError):
        return 1


def case_size_bytes(case: dict[str, Any]) -> int:
    try:
        from bson import BSON

        return len(BSON.encode(case))
    except Exception:
        return len(json.dumps(case, default=str).encode("utf-8"))


def migrate_case(db: Any, case: dict[str, Any]) -> dict[str, Any]:
    case_id = case.get("case_id")
    if not case_id:
        return {"case_id": "", "status": "failed", "errors": ["case_id missing"]}
    if schema_version(case) >= 2:
        return {"case_id": case_id, "status": "skipped", "errors": []}

    try:
        _write_split_content(db, case_id, case)
    except Exception as exc:
        return {"case_id": case_id, "status": "failed", "errors": [str(exc)]}

    now = utc_now()
    try:
        db["sop_uplift_cases"].update_one(
            {"case_id": case_id},
            {
                "$set": {
                    "schema_version": 2,
                    "schema_migrated_at": now,
                    "updated_at": now,
                },
                "$unset": {field: "" for field in CONTENT_FIELDS},
            },
        )
    except Exception as exc:
        return {"case_id": case_id, "status": "failed", "errors": [str(exc)]}

    validation = validate_migrated_case(db, case_id)
    return {
        "case_id": case_id,
        "status": "migrated" if validation["status"] == "passed" else "failed",
        "errors": validation["errors"],
        "case_size_bytes": validation.get("case_size_bytes", 0),
    }


def _write_split_content(db: Any, case_id: str, case: dict[str, Any]) -> None:
    now = utc_now()
    markdown_documents = [
        {**document, "case_id": case_id, "updated_at": now}
        for document in case.get("markdown_documents", [])
    ]
    db["sop_markdown"].delete_many({"case_id": case_id})
    if markdown_documents:
        db["sop_markdown"].insert_many(markdown_documents)
    db["sop_anchors"].update_one(
        {"case_id": case_id},
        {"$set": {"case_id": case_id, "anchors": case.get("anchors", []), "updated_at": now}},
        upsert=True,
    )
    db["sop_chunks"].update_one(
        {"case_id": case_id},
        {"$set": {"case_id": case_id, "chunks": case.get("chunks", []), "updated_at": now}},
        upsert=True,
    )


def validate_migrated_case(db: Any, case_id: str, max_case_bytes: int = MAX_CASE_BYTES) -> dict[str, Any]:
    errors: list[str] = []
    case = db["sop_uplift_cases"].find_one({"case_id": case_id})
    if not case:
        return {"case_id": case_id, "status": "failed", "errors": ["case missing"], "case_size_bytes": 0}
    if schema_version(case) != 2:
        errors.append("schema_version is not 2")
    if not db["sop_markdown"].find_one({"case_id": case_id}):
        errors.append("sop_markdown missing")
    if not db["sop_anchors"].find_one({"case_id": case_id}):
        errors.append("sop_anchors missing")
    if not db["sop_chunks"].find_one({"case_id": case_id}):
        errors.append("sop_chunks missing")
    size_bytes = case_size_bytes(case)
    if size_bytes >= max_case_bytes:
        errors.append(f"case document size {size_bytes} bytes exceeds {max_case_bytes}")
    return {
        "case_id": case_id,
        "status": "failed" if errors else "passed",
        "errors": errors,
        "case_size_bytes": size_bytes,
    }


def migrate_all(db: Any, dry_run: bool = False) -> dict[str, Any]:
    query = {"$or": [{"schema_version": {"$exists": False}}, {"schema_version": 1}]}
    results: list[dict[str, Any]] = []
    for case in db["sop_uplift_cases"].find(query):
        if dry_run:
            results.append({"case_id": case.get("case_id", ""), "status": "would_migrate", "errors": []})
        else:
            results.append(migrate_case(db, case))
    return {
        "total": len(results),
        "migrated": sum(1 for item in results if item["status"] == "migrated"),
        "failed": sum(1 for item in results if item["status"] == "failed"),
        "skipped": sum(1 for item in results if item["status"] == "skipped"),
        "dry_run": dry_run,
        "results": results,
    }


def write_report(report: dict[str, Any], report_path: str | Path) -> None:
    path = Path(report_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Migrate SOP Uplift cases from schema v1 to schema v2 split content storage.")
    parser.add_argument("--mongo-uri", default=os.getenv("MONGO_URI", "mongodb://localhost:27017"))
    parser.add_argument("--db-name", default=os.getenv("SOP_UPLIFT_MONGO_DB", "trace_db"))
    parser.add_argument("--report", default="docs/sop_schema_v2_migration_report.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    import pymongo

    client = pymongo.MongoClient(args.mongo_uri)
    db = client[args.db_name]
    report = migrate_all(db, dry_run=args.dry_run)
    write_report(report, args.report)
    print(json.dumps({key: report[key] for key in ("total", "migrated", "failed", "skipped", "dry_run")}, indent=2))
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
