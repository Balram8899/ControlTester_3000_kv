# Mapping Gap Relevance Filter — Problem, Fix, and Test Cases

**Date:** 2026-05-11  
**Observed in:** `cyber-gemini-uplifted-sop.docx`, `esg-gemini-uplifted-sop.docx`  
**Related files:** `utils/services/analysis.py`, `utils/sop_processing/prompts.py`, `utils/sop_processing/output_generator.py`, `utils/services/generic_findings.py`

---

## Implementation Status - 2026-05-11

Implemented with the agreed corrections:

- The deterministic gate is applied to `_cross_document_mapping_gap_suggestions`, the helper that actually emits `mapping_gap` suggestions, not only the wrapper `_cross_document_fallback_suggestions`.
- Inferred "already covered" mapping now requires activity/evidence overlap; matching the same owner alone is no longer enough to suppress a mapping gap.
- The LLM cross-document prompt now receives `SOP PURPOSE AND SCOPE` and tells the model not to emit missing-step suggestions for items owned by a different organisational function or SOP.
- Missing/weak scope is fail-soft, not blind fail-open: suggestions are still emitted, but `requires_explicit_review=True`.
- Open-issue dependency findings from `generic_findings.py` are reviewer-gated so generic Excel-only issue notes do not silently flow into Word output.
- Stage 2 now adds a granularity guard for additive text when rewrite is unavailable or fails, compacting copied numbered sub-procedures into one SOP-appropriate sentence before DOCX insertion.
- Final calibration remains domain-agnostic: no production exclusions for Cyber, ESG, SWIFT, DLP, fraud, RBI, mobile, CSPM, vendor management, or control IDs. The deterministic gate now requires same-anchor responsibility vocabulary overlap, so broad scope nouns are not enough by themselves.

---

## Problem Statement

The SOP uplift system generates suggestions by comparing a primary SOP against uploaded supporting documents (RCMs, risk registers, event logs, deviation logs). When a supporting document covers a broader organisational scope than the SOP being uplifted, the system injects content from unrelated or adjacent functions into the SOP — content that does not belong there and actively degrades the document's usefulness.

---

## Current Issue

Two variants of the same problem were observed across the two validation documents.

### Variant A — Completely out-of-domain content (Cyber IR SOP)

Controls from treasury, payments, fraud, mobile, DLP, vendor management, and compliance were inserted into a Cyber Incident Response SOP. Examples from the generated document:

> *[INS] Performs sWIFT Customer Security Programme (CSP) controls; dual-operator authorisation for all outgoing SWIFT messages.*

> *[INS] Performs transaction monitoring rules with ML-based anomaly detection; customer-level transaction limits enforced; 2FA for high-value transactions.*

> *[INS] DLP Rule Review and Maintenance... Procedure Overview... Scope Expansion...*

None of these belong in an incident response procedure.

### Variant B — Domain-adjacent content at the wrong granularity (ESG SOP)

The ESG SOP's scope is ESG data collection, monitoring, and deviation reporting. LTIFR and board composition are legitimate ESG metrics — but entire self-contained sub-procedures with their own numbered headings were injected verbatim:

> *[INS] 4.2. Monitoring and Remediation of Independent Director Composition 4.2.1 Identification and Thresholds... 4.2.2 Escalation Process... 4.2.3 Remediation...*

> *[INS] Management of Lost Time Injury Frequency Rate (LTIFR) Deviations 1. Identification and Thresholding... 2. Escalation Protocol... 3. Remediation and Evidencing...*

These metrics are in-domain but the full H&S management procedure and full board governance procedure belong in their own SOPs — not embedded verbatim inside the ESG monitoring SOP.

### What good looks like (present in both documents)

> *[INS] Quantitative thresholds are used to determine significance and materiality. Metrics that deviate from target by more than 10% are identified as Significant Deviation, those by more than 20% as Material Deviation. The ESG team must escalate all material deviations to the ESG Head and CFO within 48 hours.*

> *[INS] Applying security patches to address exploited vulnerabilities; for vulnerabilities with a CVSS score of 9.0 or higher, emergency patching must be completed within 72 hours.*

These are correct — specific, actionable, in-scope additions that improve the SOP without disrupting its structure.

---

## Why It's Happening

**The mapping gap logic asks the wrong question.**

Currently it asks: *"Is this control mentioned in the SOP?"*

It should ask: *"Is this control within the scope of what this SOP is responsible for?"*

These are different questions. An organisational RCM or deviation log covers the full control landscape across all functions. The mapping gap logic finds every item in the supporting document that isn't referenced in the SOP and flags it as missing. It has no mechanism to determine whether a gap is the responsibility of this SOP or belongs to a different procedure entirely.

### Three specific failure points in the code

**1. `_cross_document_mapping_gap_suggestions` in `utils/services/analysis.py`**

The deterministic path, called by `_cross_document_fallback_suggestions`. It iterates every RCM control row, checks if any SOP process step references it, and emits a `mapping_gap` suggestion for every unmatched row. No scope check. No relevance check. Every unmatched control in a 40-row cross-functional RCM becomes a suggestion regardless of domain.

**2. `cross_document_synthesis_prompt` in `utils/sop_processing/prompts.py`**

The LLM path. The prompt instructs the model to find items in supporting documents with no corresponding SOP step — but gives it no instruction to filter by the SOP's stated scope. The LLM dutifully flags every unmatched item.

**3. Additive insertion path in `utils/sop_processing/output_generator.py`**

Once a `mapping_gap` suggestion is accepted, Stage 2 can still insert unsafe `proposed_text` into the Word output when the rewrite budget is unavailable or the rewrite fails. For Variant A this can mean raw RCM cell values. For Variant B this can mean entire sub-procedures. The missing piece is not just a rewrite call; it is an output-shape guard that enforces SOP-appropriate granularity before any additive insertion is written to the document.

---

## The Fix

### Part 1 — Scope relevance gate (deterministic, domain-neutral)

Extract the SOP's `purpose_scope` anchor text (already classified and available in the anchor index) and use it as a relevance vocabulary. Before emitting any `mapping_gap` suggestion, check whether the control's vocabulary overlaps sufficiently with the SOP's own stated scope.

This is domain-neutral by design. The SOP tells the system its own domain through its purpose/scope text. A Cyber IR SOP's scope contains words like "incident", "compromise", "eradication", "forensic" — SWIFT controls won't match. An ESG SOP's scope contains "emissions", "reporting", "deviation", "governance" — cyber IR controls won't match. No labels, no hardcoding.

```python
GENERIC_TERMS = {
    # Universal stopwords
    "the", "a", "an", "and", "or", "for", "of", "in", "to", "is", "are", "be",
    "this", "that", "all", "any", "as", "by", "with", "from", "at", "on", "its",
    # RCM structural words present in every row regardless of domain
    "control", "controls", "owner", "evidence", "retained", "includes",
    "performed", "process", "shall", "must", "should", "review", "ensure",
    "maintain", "management", "policy", "procedure", "requirement",
}

def _is_control_in_scope(
    control: dict,
    sop_scope_text: str,
    threshold: float = 0.12,
) -> bool:
    # Fail-open: if scope text is too short to be meaningful, include everything
    if len(sop_scope_text.split()) < 15:
        return True

    scope_terms = {
        w for w in sop_scope_text.lower().split()
        if w not in GENERIC_TERMS and len(w) > 3
    }
    control_text = " ".join([
        str(control.get("description", "")),
        str(control.get("activity", "")),
        str(control.get("owner", "")),
    ]).lower()
    control_terms = {
        w for w in control_text.split()
        if w not in GENERIC_TERMS and len(w) > 3
    }
    if not control_terms:
        return False

    overlap = len(scope_terms & control_terms) / len(control_terms)
    return overlap >= threshold
```

Called in `_cross_document_mapping_gap_suggestions` before emitting each `mapping_gap` suggestion. Controls below the threshold are discarded when the SOP has an assessable scope. If the SOP scope is missing or too weak to assess, the suggestion is emitted but marked `requires_explicit_review=True`.

### Part 2 — Scope text injected into `cross_document_synthesis_prompt`

Thread the SOP's purpose/scope text into the LLM synthesis call and add one instruction block:

```
SOP PURPOSE AND SCOPE:
{sop_scope_text}

Before flagging any supporting document item as a missing step, assess whether it
is directly within the scope of what this SOP describes. If the item belongs to a
different organisational function or would be owned by a different SOP, do not emit
a suggestion for it. Only flag items that a practitioner of this specific process
would be expected to perform or be accountable for.
```

This requires threading `sop_scope_text` into `_run_cross_document_synthesis` and the prompt function. The text is already available in the anchor index — it just isn't being passed through.

### Part 3 — Additive insertion granularity guard in `output_generator.py`

Additive insertions already attempt `sop_section_rewrite_prompt` while rewrite budget is available. Add a lightweight granularity guard after cleanup and before inserting into the Word output — enough to convert structured data (RCM cell values, numbered sub-procedure headings) into a single SOP-appropriate sentence when rewrite is unavailable or unsafe. Not a full section rewrite, but a targeted output-shape enforcement step before text touches the document.

---

## Test Cases

### TC-1 — Out-of-domain control rejected (Variant A)

```
SOP:     Cyber Incident Response ("detect, respond to, recover from cyber incidents")
Control: "SWIFT CSP dual-operator authorisation for outgoing SWIFT messages" (owner: Treasury IT)
Assert:  no mapping_gap suggestion emitted for this control
```

### TC-2 — In-domain control accepted

```
SOP:     Cyber Incident Response
Control: "Emergency patching for CVSS ≥ 9.0 vulnerabilities within 72 hours" (owner: IT Ops)
Assert:  mapping_gap suggestion emitted
```

### TC-3 — Adjacent-domain sub-procedure rejected (Variant B)

```
SOP:            ESG Risk Monitoring and Reporting ("collect, monitor, report ESG metrics")
Supporting doc: Full LTIFR H&S deviation management procedure (5 numbered sections)
Assert:         no mapping_gap suggestion that injects the full H&S procedure
Assert:         if a suggestion is emitted, proposed_text is one SOP-appropriate sentence,
                not a numbered sub-procedure
```

### TC-4 — Adjacent-domain metric reference accepted at right granularity

```
SOP:            ESG Risk Monitoring and Reporting
Supporting doc: LTIFR target threshold breached (from deviation log)
Assert:         suggestion emitted referencing LTIFR deviation monitoring
Assert:         proposed_text is a procedure step, not a complete embedded sub-procedure
```

### TC-5 — Fail-soft when scope section is absent

```
SOP:    has no purpose_scope classified anchor (unstructured document)
Assert: relevance filter bypassed, controls can still pass through
Assert: emitted mapping_gap suggestions are marked requires_explicit_review
Assert: suggestion count >= baseline without filter
Reason: better to surface uncertain candidates for reviewer confirmation than silently drop everything
```

### TC-6 — Cross-domain RCM produces near-zero out-of-scope suggestions

```
SOP: Cyber Incident Response
RCM: full organisational RCM (40 controls across cyber, fraud, SWIFT, DLP, mobile, vendor, compliance)
Assert: mapping_gap suggestions reference only IR-relevant controls
        (patching, forensics, containment, evidence preservation)
Assert: zero suggestions referencing SWIFT, DLP quarterly review, mobile RASP,
        CSPM, transaction monitoring, RBI self-assessment
```

### TC-7 — Same filter works for a different SOP domain

```
SOP: Vendor Management ("assess, onboard, monitor third-party vendors")
RCM: same full organisational RCM
Assert: mapping_gap suggestions reference only vendor-relevant controls
        (third-party assessment, contract review, SLA monitoring, offboarding)
Assert: zero suggestions referencing cyber IR, SWIFT payments, fraud monitoring
```

### TC-8 — Threshold calibration — genuinely cross-cutting controls pass

```
Control: "Maintain audit trail for all regulated activities" (applies to all SOPs)
Assert:  passes relevance filter for both Cyber IR SOP and ESG SOP
Assert:  not filtered out by the generic term exclusion list
```

### TC-9 — Full regression — suggestion count and quality

```
Rerun: the Cyber case that produced 44 suggestions (previous baseline)
Assert: total mapping_gap count drops from ~20 to ~6-8
Assert: remaining mapping_gap suggestions all reference IR-relevant controls
Assert: zero suggestions referencing SWIFT, DLP, mobile, fraud, RBI self-assessment
Assert: correct suggestions from previous run still present
        (CVSS patching, immutable backups, forensic preservation)
```

---

## Threshold Calibration Note

The `0.12` threshold is a starting point. TC-8 and TC-9 give the quantitative signal to tune it. Test against at least three domain pairs before settling:

- Cyber IR SOP + full-org RCM (should reject SWIFT, DLP, fraud)
- ESG Reporting SOP + full-org RCM (should reject cyber IR, SWIFT)
- Vendor Management SOP + full-org RCM (should reject cyber IR, fraud)

The threshold that produces clean results across all three is the right one. If it is too low, legitimate cross-cutting controls get filtered. If it is too high, out-of-domain controls slip through.
