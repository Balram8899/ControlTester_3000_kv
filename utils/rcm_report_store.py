"""
RCM Report Store — MongoDB persistence for RCM compliance reports.

Stores compliance analysis results and RCM files (via GridFS) so users
can view, download, and manage past assessments from the Reports tab.
"""

import os
import uuid
import logging
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any

logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "controltester_db"
COLLECTION_NAME = "rcm_reports"


class RCMReportStore:
    """MongoDB store for RCM compliance reports with GridFS file storage."""

    def __init__(self):
        try:
            from pymongo import MongoClient
            import gridfs

            self._client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
            self._client.admin.command("ping")
            self._db = self._client[DB_NAME]
            self._col = self._db[COLLECTION_NAME]
            self._fs = gridfs.GridFS(self._db, collection="rcm_files")
            self._col.create_index("report_id", unique=True)
            self._col.create_index([("created_at", -1)])
            logger.info(f"RCMReportStore connected to {MONGO_URI}")
        except Exception as exc:
            logger.error(f"RCMReportStore MongoDB connection failed: {exc}")
            self._client = None
            self._col = None
            self._fs = None

    @property
    def is_connected(self) -> bool:
        return self._col is not None

    def _require_connection(self):
        if not self.is_connected:
            raise RuntimeError(
                f"MongoDB unavailable (URI={MONGO_URI}). "
                "Ensure the mongodb service is running."
            )

    def save_report(
        self,
        report_data: Dict[str, Any],
        rcm_file_bytes: bytes,
        rcm_filename: str,
    ) -> str:
        """Save a compliance report and its RCM file. Returns report_id."""
        self._require_connection()

        report_id = uuid.uuid4().hex
        gridfs_file_id = self._fs.put(
            rcm_file_bytes,
            filename=rcm_filename,
            report_id=report_id,
        )

        doc = {
            "report_id": report_id,
            "created_at": datetime.utcnow().isoformat(),
            "regulation_document_ids": report_data.get("regulation_document_ids", []),
            "regulation_names": report_data.get("regulation_names", []),
            "rcm_filename": rcm_filename,
            "gridfs_file_id": gridfs_file_id,
            "model_used": report_data.get("model_used", ""),
            "status": report_data.get("status", "success"),
            "error_message": report_data.get("error_message"),
            "compliance_stats": report_data.get("compliance_stats", {}),
            "analysis": report_data.get("analysis", {}),
            "executive_summary": report_data.get("executive_summary", ""),
            "domain_reports": report_data.get("domain_reports", {}),
            "suggestions_summary_counts": report_data.get("suggestions_summary_counts", {}),
        }

        self._col.insert_one(doc)
        logger.info(f"Saved RCM report {report_id} (rcm={rcm_filename})")
        return report_id

    def save_gap_analysis_report(self, report_data: Dict[str, Any]) -> str:
        """Save a regulatory gap analysis report (no attached file). Returns report_id."""
        self._require_connection()
        report_id = uuid.uuid4().hex
        doc = {
            "report_id": report_id,
            "report_type": "regulatory_gap_analysis",
            "created_at": datetime.utcnow().isoformat(),
            # Document metadata
            "regulation_document_ids": report_data.get("regulation_document_ids", []),
            "regulation_names": report_data.get("document_names", []),
            "document_names": report_data.get("document_names", []),
            "document_count": report_data.get("document_count", 0),
            # Common fields
            "model_used": report_data.get("model_used", ""),
            "status": "success",
            "error_message": None,
            # Gap-analysis-specific
            "final_report": report_data.get("final_report", ""),
            "gap_summary": report_data.get("gap_summary", {}),
            "graph_context_used": report_data.get("graph_context_used", False),
            "graph_stats": report_data.get("graph_stats"),
            "analysis": report_data.get("gap_analysis_data", {}),
            # Empty / N/A for RCM-specific fields
            "rcm_filename": "",
            "compliance_stats": {},
            "executive_summary": report_data.get("final_report", ""),
            "domain_reports": {},
            "suggestions_summary_counts": {},
        }
        self._col.insert_one(doc)
        logger.info(f"Saved gap analysis report {report_id} ({len(report_data.get('document_names', []))} docs)")
        return report_id

    def list_reports(self) -> List[Dict]:
        """Return all reports (summary only — no full analysis/domain_reports text)."""
        self._require_connection()
        cursor = self._col.find(
            {},
            {
                "_id": 0,
                "report_id": 1,
                "report_type": 1,
                "created_at": 1,
                "regulation_document_ids": 1,
                "regulation_names": 1,
                "document_names": 1,
                "document_count": 1,
                "rcm_filename": 1,
                "model_used": 1,
                "status": 1,
                "error_message": 1,
                "compliance_stats": 1,
                "suggestions_summary_counts": 1,
                "gap_summary": 1,
                "graph_context_used": 1,
            },
        ).sort("created_at", -1)
        return list(cursor)

    def get_report(self, report_id: str) -> Optional[Dict]:
        """Return full report including analysis and domain reports."""
        self._require_connection()
        doc = self._col.find_one({"report_id": report_id}, {"_id": 0})
        if doc and "gridfs_file_id" in doc:
            from bson import ObjectId
            doc["gridfs_file_id"] = str(doc["gridfs_file_id"])
        return doc

    def get_rcm_file(self, report_id: str) -> Optional[Tuple[bytes, str]]:
        """Retrieve the RCM file bytes and filename for a report."""
        self._require_connection()
        doc = self._col.find_one({"report_id": report_id}, {"gridfs_file_id": 1, "rcm_filename": 1})
        if not doc or "gridfs_file_id" not in doc:
            return None
        grid_out = self._fs.get(doc["gridfs_file_id"])
        return grid_out.read(), doc.get("rcm_filename", "rcm_file")

    def delete_report(self, report_id: str) -> bool:
        """Delete a report and its associated GridFS file."""
        self._require_connection()
        doc = self._col.find_one({"report_id": report_id}, {"gridfs_file_id": 1})
        if not doc:
            return False
        if "gridfs_file_id" in doc:
            try:
                self._fs.delete(doc["gridfs_file_id"])
            except Exception as exc:
                logger.warning(f"Failed to delete GridFS file for {report_id}: {exc}")
        result = self._col.delete_one({"report_id": report_id})
        return result.deleted_count > 0
