from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO


@dataclass
class MarkdownConversion:
    markdown: str
    converter: str
    status: str = "converted"
    fallback_used: bool = False
    warnings: list[str] = field(default_factory=list)


def convert_bytes_to_markdown(content: bytes, filename: str, content_type: str = "") -> MarkdownConversion:
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if suffix in {"md", "txt", "csv"}:
        return MarkdownConversion(markdown=content.decode("utf-8", errors="replace"), converter="plain_text")
    try:
        from markitdown import MarkItDown

        result = MarkItDown().convert_stream(BytesIO(content))
        text = getattr(result, "text_content", "") or str(result)
        return MarkdownConversion(markdown=text, converter="markitdown")
    except Exception as exc:
        return MarkdownConversion(
            markdown=content.decode("utf-8", errors="replace"),
            converter="utf8_fallback",
            fallback_used=True,
            warnings=[f"MarkItDown unavailable or failed: {exc}"],
        )
