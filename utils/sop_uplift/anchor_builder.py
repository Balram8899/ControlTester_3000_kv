from __future__ import annotations

import hashlib
import re
from typing import Any


def _anchor_id(document_id: str, block_type: str, index: int, content: str) -> str:
    digest = hashlib.sha1(f"{document_id}:{block_type}:{index}:{content}".encode("utf-8")).hexdigest()[:12]
    return f"anc_{digest}"


def _content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def build_anchors(markdown: str, document_id: str, file_id: str) -> list[dict[str, Any]]:
    anchors: list[dict[str, Any]] = []
    section_path: list[str] = []
    block_index = 0
    lines = markdown.splitlines(keepends=True)
    offset = 0
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        start = offset

        if not stripped:
            offset += len(line)
            i += 1
            continue

        heading_match = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading_match:
            level = len(heading_match.group(1))
            title = heading_match.group(2).strip()
            section_path = section_path[: level - 1] + [title]
            content = line.rstrip("\n")
            block_type = "heading"
            end = start + len(line)
            i += 1
            offset = end
        elif stripped.startswith("|"):
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i])
                offset += len(lines[i])
                i += 1
            content = "".join(table_lines).rstrip("\n")
            block_type = "table"
            end = offset
        elif stripped.startswith(("-", "*", "+")) or re.match(r"^\d+\.\s+", stripped):
            list_lines = []
            while i < len(lines):
                candidate = lines[i].strip()
                if not candidate or not (candidate.startswith(("-", "*", "+")) or re.match(r"^\d+\.\s+", candidate)):
                    break
                list_lines.append(lines[i])
                offset += len(lines[i])
                i += 1
            content = "".join(list_lines).rstrip("\n")
            block_type = "list"
            end = offset
        else:
            paragraph_lines = []
            while i < len(lines):
                candidate = lines[i].strip()
                if not candidate:
                    break
                if re.match(r"^(#{1,6})\s+(.+)$", candidate) or candidate.startswith("|"):
                    break
                paragraph_lines.append(lines[i])
                offset += len(lines[i])
                i += 1
            content = "".join(paragraph_lines).strip()
            block_type = "paragraph"
            end = offset

        anchors.append(
            {
                "file_id": file_id,
                "document_id": document_id,
                "section_id": " > ".join(section_path) if section_path else "Document",
                "block_id": f"block_{block_index + 1}",
                "anchor_id": _anchor_id(document_id, block_type, block_index, content),
                "block_type": block_type,
                "section_path": list(section_path),
                "char_start": start,
                "char_end": end,
                "content_hash": _content_hash(content),
                "text": content,
                "page_number": None,
            }
        )
        block_index += 1

    return anchors
