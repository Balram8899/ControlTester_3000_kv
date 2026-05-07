from __future__ import annotations

import pytest


class FakeCursor:
    def __init__(self, docs: list[dict]):
        self.docs = docs

    def __iter__(self):
        return iter(self.docs)


class FakeCollection:
    def __init__(self, name: str, operations: list[str], fail_insert: bool = False):
        self.name = name
        self.operations = operations
        self.fail_insert = fail_insert
        self.docs: list[dict] = []

    def find(self, query=None, *_args, **_kwargs):
        query = query or {}
        return FakeCursor([doc for doc in self.docs if _matches(doc, query)])

    def find_one(self, query):
        return next((doc for doc in self.docs if _matches(doc, query)), None)

    def insert_one(self, doc):
        self.docs.append(dict(doc))

    def insert_many(self, docs):
        self.operations.append(f"{self.name}.insert_many")
        if self.fail_insert:
            raise RuntimeError("split write failed")
        self.docs.extend(dict(doc) for doc in docs)

    def delete_many(self, query):
        self.operations.append(f"{self.name}.delete_many")
        self.docs = [doc for doc in self.docs if not _matches(doc, query)]

    def update_one(self, query, update, upsert=False):
        self.operations.append(f"{self.name}.update_one")
        doc = self.find_one(query)
        if doc is None and upsert:
            doc = dict(query)
            self.docs.append(doc)
        if doc is None:
            return
        for key, value in update.get("$set", {}).items():
            doc[key] = value
        for key in update.get("$unset", {}):
            doc.pop(key, None)


class FakeDb:
    def __init__(self, fail_markdown_insert: bool = False):
        self.operations: list[str] = []
        self.collections = {
            "sop_uplift_cases": FakeCollection("sop_uplift_cases", self.operations),
            "sop_markdown": FakeCollection("sop_markdown", self.operations, fail_insert=fail_markdown_insert),
            "sop_anchors": FakeCollection("sop_anchors", self.operations),
            "sop_chunks": FakeCollection("sop_chunks", self.operations),
        }

    def __getitem__(self, name: str):
        return self.collections[name]


def _matches(doc: dict, query: dict) -> bool:
    for key, value in query.items():
        if isinstance(value, dict) and "$in" in value:
            if doc.get(key) not in value["$in"]:
                return False
            continue
        if isinstance(value, dict) and "$exists" in value:
            exists = key in doc
            if exists is not bool(value["$exists"]):
                return False
            continue
        if doc.get(key) != value:
            return False
    return True


def test_migrate_case_writes_split_collections_before_schema_update() -> None:
    from scripts.migrate_sop_schema_v2 import migrate_case

    db = FakeDb()
    legacy_case = {
        "case_id": "case-1",
        "schema_version": 1,
        "title": "Legacy SOP",
        "markdown_documents": [{"document_id": "doc-1", "file_id": "file-1", "markdown": "# Access"}],
        "anchors": [{"anchor_id": "a1", "document_id": "doc-1"}],
        "chunks": [{"chunk_id": "c1", "document_id": "doc-1"}],
    }
    db["sop_uplift_cases"].insert_one(dict(legacy_case))

    result = migrate_case(db, legacy_case)

    migrated_case = db["sop_uplift_cases"].find_one({"case_id": "case-1"})
    assert result["status"] == "migrated"
    assert db["sop_markdown"].find_one({"case_id": "case-1", "file_id": "file-1"})["markdown"] == "# Access"
    assert db["sop_anchors"].find_one({"case_id": "case-1"})["anchors"][0]["anchor_id"] == "a1"
    assert db["sop_chunks"].find_one({"case_id": "case-1"})["chunks"][0]["chunk_id"] == "c1"
    assert migrated_case["schema_version"] == 2
    assert "markdown_documents" not in migrated_case
    assert "anchors" not in migrated_case
    assert "chunks" not in migrated_case
    assert db.operations.index("sop_markdown.insert_many") < db.operations.index("sop_uplift_cases.update_one")


def test_migrate_case_leaves_legacy_case_unchanged_when_split_write_fails() -> None:
    from scripts.migrate_sop_schema_v2 import migrate_case

    db = FakeDb(fail_markdown_insert=True)
    legacy_case = {
        "case_id": "case-1",
        "schema_version": 1,
        "markdown_documents": [{"document_id": "doc-1", "file_id": "file-1", "markdown": "# Access"}],
        "anchors": [{"anchor_id": "a1"}],
        "chunks": [{"chunk_id": "c1"}],
    }
    db["sop_uplift_cases"].insert_one(dict(legacy_case))

    result = migrate_case(db, legacy_case)

    stored_case = db["sop_uplift_cases"].find_one({"case_id": "case-1"})
    assert result["status"] == "failed"
    assert stored_case["schema_version"] == 1
    assert stored_case["markdown_documents"][0]["markdown"] == "# Access"
    assert "sop_uplift_cases.update_one" not in db.operations


def test_validate_migrated_case_requires_split_docs_and_size_limit() -> None:
    from scripts.migrate_sop_schema_v2 import validate_migrated_case

    db = FakeDb()
    db["sop_uplift_cases"].insert_one({"case_id": "case-1", "schema_version": 2, "title": "Migrated"})
    db["sop_markdown"].insert_one({"case_id": "case-1", "file_id": "file-1", "markdown": "# Access"})
    db["sop_anchors"].insert_one({"case_id": "case-1", "anchors": [{"anchor_id": "a1"}]})

    report = validate_migrated_case(db, "case-1", max_case_bytes=500_000)

    assert report["status"] == "failed"
    assert "sop_chunks missing" in report["errors"]
