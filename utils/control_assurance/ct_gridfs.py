from __future__ import annotations

import os
from typing import Iterator

import gridfs
import pymongo
from bson import ObjectId

MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongodb:27017")
_client: pymongo.MongoClient | None = None


def _get_client() -> pymongo.MongoClient:
    global _client
    if _client is None:
        _client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    return _client


def get_ct_bucket() -> gridfs.GridFS:
    db = _get_client()["trace_db"]
    return gridfs.GridFS(db, collection="ct_files")


def upload_to_gridfs(content: bytes, filename: str, metadata: dict) -> str:
    bucket = get_ct_bucket()
    file_id = bucket.put(content, filename=filename, metadata=metadata)
    return str(file_id)


def download_from_gridfs(gridfs_id: str) -> bytes:
    bucket = get_ct_bucket()
    grid_out = bucket.get(ObjectId(gridfs_id))
    return grid_out.read()


def stream_from_gridfs(gridfs_id: str) -> Iterator[bytes]:
    bucket = get_ct_bucket()
    grid_out = bucket.get(ObjectId(gridfs_id))
    while chunk := grid_out.read(65536):
        yield chunk


def delete_from_gridfs(gridfs_id: str) -> None:
    bucket = get_ct_bucket()
    bucket.delete(ObjectId(gridfs_id))


def get_file_metadata(gridfs_id: str) -> dict:
    bucket = get_ct_bucket()
    grid_out = bucket.get(ObjectId(gridfs_id))
    return {
        "filename": grid_out.filename,
        "length": grid_out.length,
        "metadata": grid_out.metadata or {},
    }
