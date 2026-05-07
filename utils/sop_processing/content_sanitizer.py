from __future__ import annotations

from dataclasses import dataclass, field


MAX_CHUNK_CHARS = 4000

INJECTION_PATTERNS = [
    "ignore previous instructions",
    "new system prompt",
    "[inst]",
    "system:",
    "developer:",
]


@dataclass(frozen=True)
class SanitizedChunk:
    content: str
    file_id: str
    anchor_id: str
    truncated: bool = False
    injection_risk: bool = False
    matched_patterns: list[str] = field(default_factory=list)

    @property
    def delimited_content(self) -> str:
        return (
            f'<document_content file_id="{self.file_id}" '
            f'anchor_id="{self.anchor_id}" is_user_supplied_content="true">\n'
            f"{self.content}\n"
            "</document_content>"
        )


def sanitize_chunk(
    content: str,
    file_id: str,
    anchor_id: str,
    max_chars: int = MAX_CHUNK_CHARS,
) -> SanitizedChunk:
    matched_patterns = _matched_injection_patterns(content)
    truncated_content, truncated = _truncate_content(content, max_chars)
    return SanitizedChunk(
        content=truncated_content,
        file_id=file_id,
        anchor_id=anchor_id,
        truncated=truncated,
        injection_risk=bool(matched_patterns),
        matched_patterns=matched_patterns,
    )


def _matched_injection_patterns(content: str) -> list[str]:
    lowered = content.lower()
    return [pattern for pattern in INJECTION_PATTERNS if pattern in lowered]


def _truncate_content(content: str, max_chars: int) -> tuple[str, bool]:
    if len(content) <= max_chars:
        return content, False
    preview = content[:max_chars].rstrip()
    boundary = max(preview.rfind("."), preview.rfind("!"), preview.rfind("?"))
    if boundary > 0:
        return preview[: boundary + 1].strip(), True
    return preview, True
