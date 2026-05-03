from __future__ import annotations

import re
from datetime import datetime
from typing import Any


TOKEN_RE = re.compile(r"[a-z0-9]+")


def build_case_local_index(case: dict[str, Any]) -> dict[str, Any]:
    """Build a searchable index from this SOP Uplift case only."""
    entries: list[dict[str, Any]] = []
    file_by_id = {item.get("file_id"): item for item in case.get("uploaded_files", [])}
    tag_by_file_id = {item.get("file_id"): item for item in case.get("document_tags", [])}

    for chunk in case.get("chunks", []):
        document_id = chunk.get("document_id", "")
        file_id = _file_id_from_document_id(document_id)
        file_meta = file_by_id.get(file_id, {})
        tag = tag_by_file_id.get(file_id, {})
        text = chunk.get("content", "")
        if not text:
            continue
        entries.append(
            _entry(
                case_id=case.get("case_id", ""),
                source_type="chunk",
                source_id=chunk.get("chunk_id", ""),
                text=text,
                metadata={
                    "document_id": document_id,
                    "file_id": file_id,
                    "filename": file_meta.get("filename", ""),
                    "bucket": file_meta.get("bucket", ""),
                    "document_tag": tag.get("confirmed_tag", ""),
                    "anchor_ids": chunk.get("anchor_ids", []),
                    "section_paths": chunk.get("section_paths", []),
                },
            )
        )

    indexed_chunk_anchors = {
        anchor_id
        for entry in entries
        for anchor_id in entry.get("metadata", {}).get("anchor_ids", [])
    }
    for anchor in case.get("anchors", []):
        anchor_id = anchor.get("anchor_id", "")
        text = anchor.get("text", "")
        if not text or anchor_id in indexed_chunk_anchors:
            continue
        file_id = anchor.get("file_id", "")
        file_meta = file_by_id.get(file_id, {})
        tag = tag_by_file_id.get(file_id, {})
        entries.append(
            _entry(
                case_id=case.get("case_id", ""),
                source_type="anchor",
                source_id=anchor_id,
                text=text,
                metadata={
                    "document_id": anchor.get("document_id", ""),
                    "file_id": file_id,
                    "filename": file_meta.get("filename", ""),
                    "bucket": file_meta.get("bucket", ""),
                    "document_tag": tag.get("confirmed_tag", ""),
                    "anchor_id": anchor_id,
                    "section_path": anchor.get("section_path", []),
                    "block_type": anchor.get("block_type", ""),
                },
            )
        )

    for message in case.get("case_chat", []):
        text = message.get("content", "")
        if not text:
            continue
        entries.append(
            _entry(
                case_id=case.get("case_id", ""),
                source_type="chat_message",
                source_id=message.get("message_id", ""),
                text=text,
                metadata={
                    "role": message.get("role", ""),
                    "captured_context": message.get("captured_context"),
                    "linked_suggestion_ids": message.get("linked_suggestion_ids", []),
                },
            )
        )

    for suggestion in case.get("suggestions", []):
        text = " ".join(
            str(suggestion.get(key, ""))
            for key in ["title", "summary", "rationale", "impact", "suggested_text", "user_text"]
            if suggestion.get(key)
        )
        if not text:
            continue
        entries.append(
            _entry(
                case_id=case.get("case_id", ""),
                source_type="suggestion",
                source_id=suggestion.get("suggestion_id", ""),
                text=text,
                metadata={
                    "status": suggestion.get("status", ""),
                    "severity": suggestion.get("severity", ""),
                    "anchor_id": suggestion.get("anchor_id", ""),
                    "source_references": suggestion.get("source_references", []),
                },
            )
        )

    return {
        "case_id": case.get("case_id", ""),
        "process_name": case.get("process_name", ""),
        "source_scope": "case_uploads_only",
        "built_at": datetime.utcnow().isoformat(),
        "entries": entries,
        "stats": {
            "chunks": len(case.get("chunks", [])),
            "anchors": len(case.get("anchors", [])),
            "chat_messages": len(case.get("case_chat", [])),
            "suggestions": len(case.get("suggestions", [])),
            "entries": len(entries),
        },
    }


def search_case_local_index(query: str, case_index: dict[str, Any], limit: int = 5) -> list[dict[str, Any]]:
    query_terms = _tokens(query)
    if not query_terms:
        return []

    scored: list[tuple[float, dict[str, Any]]] = []
    for entry in case_index.get("entries", []):
        entry_terms = set(entry.get("tokens") or _tokens(entry.get("search_text", "")))
        overlap = query_terms.intersection(entry_terms)
        if not overlap:
            continue
        exact_phrase_bonus = 2.0 if query.lower().strip() in entry.get("search_text", "") else 0.0
        source_bonus = {
            "chunk": 0.35,
            "anchor": 0.25,
            "chat_message": 0.2,
            "suggestion": 0.1,
        }.get(entry.get("source_type", ""), 0.0)
        score = len(overlap) + exact_phrase_bonus + source_bonus
        scored.append((score, entry))

    results = []
    for score, entry in sorted(scored, key=lambda item: item[0], reverse=True)[: max(0, limit)]:
        redacted = {key: value for key, value in entry.items() if key != "tokens"}
        redacted["score"] = round(score, 3)
        results.append(redacted)
    return results


def _entry(case_id: str, source_type: str, source_id: str, text: str, metadata: dict[str, Any]) -> dict[str, Any]:
    search_text = " ".join(
        [
            text,
            str(metadata.get("filename", "")),
            str(metadata.get("bucket", "")),
            str(metadata.get("document_tag", "")),
        ]
    ).lower()
    tokens = sorted(_tokens(search_text))
    return {
        "entry_id": f"{source_type}_{source_id}",
        "case_id": case_id,
        "source_type": source_type,
        "source_id": source_id,
        "text": text,
        "search_text": search_text,
        "tokens": tokens,
        "metadata": metadata,
    }


def _tokens(text: str) -> set[str]:
    return {_normalize_token(token) for token in TOKEN_RE.findall(text.lower()) if len(token) > 1}


def _normalize_token(token: str) -> str:
    if token.startswith("approv"):
        return "approv"
    if token.endswith("ies") and len(token) > 4:
        return f"{token[:-3]}y"
    if token.endswith("s") and len(token) > 3:
        return token[:-1]
    if token.endswith("ed") and len(token) > 4:
        return token[:-2]
    if token.endswith("ing") and len(token) > 5:
        return token[:-3]
    return token


def _file_id_from_document_id(document_id: str) -> str:
    if document_id.startswith("doc_"):
        return document_id[4:]
    return ""
