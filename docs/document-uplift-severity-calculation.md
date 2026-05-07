# Document Uplift Severity Calculation

**Date:** 2026-05-07  
**Applies to:** Document Uplift normalized findings and suggestion generation  
**Status:** Initial reference for implementation

---

## Purpose

Document Uplift separates **confidence** from **severity**.

- **Confidence** measures how strong the evidence is.
- **Severity** measures how important the issue is if the finding is true.

A finding can have high confidence but medium severity, such as a missing owner on a low-impact administrative row. A finding can also describe a potentially serious issue but remain medium or low confidence until supporting evidence is stronger.

---

## Confidence Bands

| Band | Numeric Range | Meaning |
|---|---:|---|
| High | `>= 0.80` | Direct field, date, row, section, or cited cross-document evidence supports the finding |
| Medium | `>= 0.50 and < 0.80` | Evidence is plausible and source-referenced but depends on interpretation, mapping, or LLM verification |
| Low | `< 0.50` | Weak or ambiguous signal; route to follow-up unless a human confirms it |

Low-confidence findings should not become high or critical uplift suggestions.

---

## Severity Levels

| Severity | Meaning |
|---|---|
| `critical` | Could materially break the process, regulatory obligation, customer outcome, system recovery, financial integrity, or executive sign-off |
| `high` | Important control/process gap, overdue item, contradiction, or missing accountability requiring remediation |
| `medium` | Meaningful clarity, evidence, ownership, timing, or consistency issue that should be improved |
| `low` | Minor completeness or wording issue with limited operational impact |
| `informational` | Context, observation, or follow-up question; not an uplift suggestion by default |

---

## Calculation Flow

Severity is calculated in three passes.

### 1. Start With Detection Method Default

| Detection Method | Default Severity |
|---|---|
| `deterministic_field` | `medium` |
| `deterministic_structural` | `medium` |
| `cross_document_rule` | `high` |
| `llm_inference` | `low` or `medium` |
| `hybrid` | `medium` or `high` |

### 2. Adjust For Impact Signals

Escalate severity when the finding affects:

- regulatory or legal obligation
- customer impact
- financial integrity
- executive or formal sign-off
- recovery, rollback, backup, or resilience
- SLA, deadline, RTO, RPO, or regulatory submission date
- repeated exception or recurring operational failure
- ownership of a critical activity
- missing approval or segregation of duties

Downgrade severity when the issue is:

- wording-only
- low confidence
- unsupported by source references
- better handled as a follow-up question
- unrelated to the primary procedure target

### 3. Apply Confidence Guardrails

| Confidence | Guardrail |
|---|---|
| High | Can support `medium`, `high`, or `critical` depending on impact |
| Medium | Can support `low`, `medium`, or `high`; avoid `critical` unless deterministic evidence is strong |
| Low | Should be `informational` or routed to follow-up questions |

LLM-only findings should not be `high` unless verified by deterministic evidence or explicit cited contradiction.

---

## Examples

| Scenario | Confidence | Severity |
|---|---:|---|
| Blank owner field on a low-impact administrative task | `0.90` | `medium` |
| Blank owner field on a regulatory filing approval step | `0.90` | `high` |
| Missed SLA with customer-impacting unresolved outage | `0.95` | `critical` |
| Vague evidence wording: "see attached" | `0.85` | `low` or `medium` |
| LLM-inferred ambiguity with no clear target anchor | `0.40` | `informational` |
| SOP contradicts a linked policy threshold with cited text from both documents | `0.82` | `high` |

---

## Routing Rules

- `critical`, `high`, `medium`, and `low` findings may become suggestions if they have enough confidence, source references, and a target anchor.
- `informational` findings do not become Word uplift changes by default.
- Low-confidence case-specific findings go to `agent_follow_up_questions`.
- Follow-up questions should never be applied to the Word output.

---

## Implementation Notes

The implementation should expose small helper functions:

- `confidence_band(score)` returns `high`, `medium`, or `low`.
- `default_severity_for_detection(method)` returns the starting severity.
- `calculate_finding_severity(...)` applies impact and confidence guardrails.

The helper must be deterministic and unit-tested. It should not call the LLM.

