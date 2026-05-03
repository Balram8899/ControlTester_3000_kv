from __future__ import annotations

import hashlib
from typing import Any


def build_chunks(
    markdown: str,
    anchors: list[dict[str, Any]],
    document_id: str,
    file_id: str = "",
    max_chars: int = 2400,
) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    current_blocks: list[dict[str, Any]] = []
    current_len = 0

    def flush() -> None:
        nonlocal current_blocks, current_len
        if not current_blocks:
            return
        content = "\n\n".join(block.get("text", "") for block in current_blocks).strip()
        chunk_index = len(chunks)
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        chunks.append(
            {
                "chunk_id": f"{document_id}_chunk_{chunk_index + 1}",
                "document_id": document_id,
                "file_id": file_id,
                "content": content,
                "anchor_ids": [block["anchor_id"] for block in current_blocks],
                "section_paths": [block.get("section_path", []) for block in current_blocks],
                "chunk_hash": digest,
                "char_start": current_blocks[0].get("char_start", 0),
                "char_end": current_blocks[-1].get("char_end", 0),
            }
        )
        current_blocks = []
        current_len = 0

    for anchor in anchors:
        text = anchor.get("text", "")
        if current_blocks and current_len + len(text) > max_chars:
            flush()
        current_blocks.append(anchor)
        current_len += len(text)
        if anchor.get("block_type") == "heading" and current_len > max_chars // 2:
            flush()

    flush()
    return chunks
