from __future__ import annotations

from typing import Any


def retrieve_context(query: str, chunks: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    terms = {term.lower() for term in query.split() if term.strip()}
    scored = []
    for chunk in chunks:
        content = chunk.get("content", "").lower()
        score = sum(1 for term in terms if term in content)
        if score:
            scored.append((score, chunk))
    return [chunk for _, chunk in sorted(scored, key=lambda item: item[0], reverse=True)[:limit]]
