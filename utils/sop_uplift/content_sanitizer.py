from __future__ import annotations

import html
import re
from dataclasses import dataclass

INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions",
    r"you\s+are\s+now\s+a",
    r"new\s+system\s+prompt",
    r"disregard\s+(all\s+)?(previous|prior)",
    r"forget\s+(all\s+)?(previous|prior)",
    r"your\s+(new\s+)?role\s+is",
    r"act\s+as\s+(a\s+)?(?!auditor|reviewer)",
    r"<\s*system\s*>",
    r"\[INST\]",
    r"###\s*instruction",
]


@dataclass
class SanitizedChunk:
    content: str
    delimited_content: str
    truncated: bool
    injection_risk: bool
    matched_patterns: list[str]
    warnings: list[str]


def _truncate_at_sentence(text: str, max_chars: int) -> tuple[str, bool]:
    if len(text) <= max_chars:
        return text, False
    clipped = text[:max_chars]
    boundary = max(clipped.rfind("."), clipped.rfind("\n"), clipped.rfind(";"))
    if boundary > max_chars * 0.6:
        clipped = clipped[: boundary + 1]
    return clipped.strip(), True


def sanitize_chunk(
    chunk_text: str,
    file_id: str,
    anchor_id: str,
    max_chunk_chars: int = 4000,
) -> SanitizedChunk:
    matched = [
        pattern
        for pattern in INJECTION_PATTERNS
        if re.search(pattern, chunk_text, flags=re.IGNORECASE)
    ]
    content, truncated = _truncate_at_sentence(chunk_text, max_chunk_chars)
    warnings: list[str] = []
    if matched:
        warnings.append("Potential prompt-injection-like text detected in source content.")
    if truncated:
        warnings.append(f"Chunk truncated to {max_chunk_chars} characters before prompt injection.")
    delimited = (
        f'<document_content file_id="{html.escape(file_id)}" '
        f'anchor_id="{html.escape(anchor_id)}" is_user_supplied_content="true">\n'
        f"{content}\n"
        "</document_content>"
    )
    return SanitizedChunk(
        content=content,
        delimited_content=delimited,
        truncated=truncated,
        injection_risk=bool(matched),
        matched_patterns=matched,
        warnings=warnings,
    )
