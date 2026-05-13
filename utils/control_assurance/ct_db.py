from __future__ import annotations

import os

import pymongo

MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongodb:27017")
_client: pymongo.MongoClient | None = None


def _get_db():
    global _client
    if _client is None:
        _client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    return _client["trace_db"]


def ensure_indexes() -> None:
    """Create CT indexes. Safe to call multiple times."""
    db = _get_db()
    db.ct_sessions.create_index([("created_at", -1)])
    db.ct_controls.create_index([("session_id", 1)])
    db.ct_issues.create_index([("session_id", 1), ("control_id", 1)])
