"""
Audit Analyzer — fixed
Orchestrates per-control analysis using assess_evidence_with_kb().

ROOT-CAUSE FIX (BUG 8)
=======================
_assess_single_evidence() returns a Pydantic Assessment serialised to JSON.
The previous parse_assessment_result() ran naïve keyword searches on the raw
JSON string, which caused:

  • ALL results = PARTIAL  — because "PARTIALLY COMPLIANT" contains "partial"
    and was matched before the PASS/FAIL checks.
  • Observation / Recommendation / Exceptions cells filled with raw JSON blobs.
  • Exceptions list = JSON fragments ('{' triggered the gap-keyword scan).

Fix: parse_structured_assessments() reads the Assessment JSON schema directly:
  assessment_result.Compliance_Status  → PASS / FAIL / PARTIAL
  assessment_result.Risk_Level         → HIGH / MEDIUM / LOW
  assessment_rationale.*               → clean narrative for Observation
  improvement_recommendation.*         → clean text for Recommendation
  Gap_analysis / Why_it_failed         → genuine exception strings (not JSON)

When multiple evidence chunks are assessed, results are aggregated by
"most severe wins" so a single failed chunk correctly propagates to FAIL.

Other fixes carried forward
===========================
BUG 3  importlib-based lazy-load for llm_chain.
BUG 4  'impact' key always present in return dict.
BUG 5  FileWrapper.close() no-op added.
"""

import importlib
import json
import os
import re
from typing import Any, Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

# ── Lazy module reference ──────────────────────────────────────────────────────
_llm_chain_module = None


def get_llm_chain():
    global _llm_chain_module
    if _llm_chain_module is None:
        _llm_chain_module = importlib.import_module("utils.llm_chain")
    return _llm_chain_module


# ── FileWrapper ────────────────────────────────────────────────────────────────

class FileWrapper:
    def __init__(self, filepath: str, filename: str):
        self.name = filename
        self._path = filepath

    def read(self) -> bytes:
        with open(self._path, "rb") as f:
            return f.read()

    def close(self) -> None:   # BUG 5 fix
        pass


# ── Severity helpers ───────────────────────────────────────────────────────────

_RESULT_RANK  = {"PASS": 1, "PARTIAL": 2, "FAIL": 3, "NO_EVIDENCE": 3}
_IMPACT_RANK  = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 3}


def _worse_result(a: str, b: str) -> str:
    return a if _RESULT_RANK.get(a, 0) >= _RESULT_RANK.get(b, 0) else b


def _worse_impact(a: str, b: str) -> str:
    return a if _IMPACT_RANK.get(a, 0) >= _IMPACT_RANK.get(b, 0) else b


# ── Assessment JSON parser ─────────────────────────────────────────────────────

def _try_parse_assessment_json(raw: Any) -> Optional[Dict]:
    """
    Attempt to parse one assessment item into an Assessment schema dict.
    Returns None on failure (error strings, malformed JSON, wrong schema).
    """
    if not raw:
        return None

    # assess_evidence_with_kb may return the parsed dict directly (if the
    # Pydantic .json() was already decoded), or a JSON string.
    if isinstance(raw, dict):
        obj = raw
    elif isinstance(raw, str):
        if raw.startswith(("Error:", "ValidationError:")):
            return None
        text = re.sub(r"```(?:json)?|```", "", raw, flags=re.IGNORECASE).strip()
        try:
            obj = json.loads(text)
        except json.JSONDecodeError:
            m = re.search(r"\{.*\}", text, re.DOTALL)
            if m:
                try:
                    obj = json.loads(m.group(0))
                except json.JSONDecodeError:
                    return None
            else:
                return None
    else:
        return None

    # Must match the Assessment schema
    if isinstance(obj, dict) and "assessment_result" in obj:
        return obj
    return None


def _compliance_to_result(status: str) -> str:
    s = (status or "").upper().strip()
    if s == "COMPLIANT":
        return "PASS"
    if "NON" in s:
        return "FAIL"
    return "PARTIAL"


def _risk_to_impact(level: str) -> str:
    l = (level or "").upper().strip()
    if l in ("CRITICAL", "HIGH"):
        return "HIGH"
    if l == "LOW":
        return "LOW"
    return "MEDIUM"


def parse_structured_assessments(
    assessment_items: List[Dict[str, Any]],
    control: Dict[str, Any],
) -> Dict[str, Any]:
    """
    BUG 8 FIX — replaces the old keyword-scan parse_assessment_result().

    Consumes the list returned by assess_evidence_with_kb():
        [{"assessment": "<JSON string or error>"}, ...]

    Parses every chunk, aggregates results, and returns clean human-readable
    strings ready to be written straight into the workpaper cells.
    """
    parsed_chunks: List[Dict] = []
    fallback_texts: List[str] = []

    for item in assessment_items:
        raw = item.get("assessment", "")
        obj = _try_parse_assessment_json(raw)
        if obj:
            parsed_chunks.append(obj)
        elif isinstance(raw, str) and raw.strip():
            fallback_texts.append(raw)

    # ── No valid JSON at all — use prose keyword fallback ─────────────────────
    if not parsed_chunks:
        return _keyword_fallback("\n\n".join(fallback_texts), control)

    # ── Aggregate across all parsed chunks ────────────────────────────────────
    agg_result  = "PASS"
    agg_impact  = "LOW"
    observations: List[str] = []
    mandatory:    List[str] = []
    enhancements: List[str] = []
    exceptions:   List[str] = []

    for chunk in parsed_chunks:
        ar       = chunk.get("assessment_result", {})
        rationale = chunk.get("assessment_rationale", {})
        recs     = chunk.get("improvement_recommendation", {})

        status   = ar.get("Compliance_Status", "PARTIALLY COMPLIANT")
        risk     = ar.get("Risk_Level", "MEDIUM")

        c_result = _compliance_to_result(status)
        c_impact = _risk_to_impact(risk)

        agg_result = _worse_result(agg_result, c_result)
        agg_impact = _worse_impact(agg_impact, c_impact)

        # ── Build observation sentence for this chunk ─────────────────────────
        obs_parts: List[str] = []

        if c_result == "PASS":
            for key in ("Evidence_of_compliance", "Effectiveness_assessment"):
                val = rationale.get(key, "").strip()
                if val:
                    obs_parts.append(val)
        else:
            for key in ("Why_it_failed", "Gap_analysis"):
                val = rationale.get(key, "").strip()
                if val:
                    obs_parts.append(val)
                    # Genuine exception text (not JSON)
                    if len(val) > 15 and val not in exceptions:
                        exceptions.append(val[:200])
            # Also include partial compliance evidence
            ev = rationale.get("Evidence_of_compliance", "").strip()
            if ev:
                obs_parts.append(f"Partial compliance: {ev}")

        if obs_parts:
            observations.append("  ".join(obs_parts))

        # ── Collect recommendations ───────────────────────────────────────────
        for r in recs.get("Mandatory_Improvements", []):
            r = r.strip()
            if r and r not in mandatory:
                mandatory.append(r)
        for r in recs.get("Enhancement_Opportunities", []):
            r = r.strip()
            if r and r not in enhancements:
                enhancements.append(r)

    # ── De-duplicate observations ─────────────────────────────────────────────
    unique_obs: List[str] = []
    seen: set = set()
    for o in observations:
        if o not in seen:
            seen.add(o)
            unique_obs.append(o)

    observation_text = "\n\n".join(unique_obs).strip() or (
        f"Control tested: {control.get('control_description', 'N/A')}"
    )

    # ── Build recommendation ──────────────────────────────────────────────────
    if mandatory:
        rec_text = "; ".join(mandatory[:3])
    elif enhancements:
        rec_text = "; ".join(enhancements[:2])
    else:
        rec_text = {
            "FAIL":       "Address identified deficiencies immediately and retest.",
            "PARTIAL":    "Remediate identified gaps to achieve full compliance.",
            "PASS":       "Continue monitoring and periodic review of this control.",
            "NO_EVIDENCE":"Obtain required evidence and retest.",
        }.get(agg_result, "Review this control.")

    return {
        "result":         agg_result,
        "observation":    observation_text[:1500],
        "kb1_reference":  None,   # not extractable from Assessment schema
        "kb2_reference":  None,
        "recommendation": rec_text[:600],
        "exceptions":     exceptions[:5],
        "impact":         agg_impact,    # BUG 4 fix: always present
    }


def _keyword_fallback(raw_text: str, control: Dict[str, Any]) -> Dict[str, Any]:
    """Prose-based fallback used when the LLM did not return valid Assessment JSON."""
    text_lower = raw_text.lower()

    is_neg     = any(w in text_lower for w in ["fail","non-compliant","ineffective","deficiency","exception"])
    is_pos     = any(w in text_lower for w in ["pass","compliant","effective","satisfactory"])
    is_partial = "partial" in text_lower

    result = "PARTIAL" if is_partial else ("FAIL" if is_neg else ("PASS" if is_pos else "PARTIAL"))

    high   = any(p in text_lower for p in ["critical","high risk","risk: high","impact: high"])
    medium = any(p in text_lower for p in ["medium risk","risk: medium","impact: medium"])
    low    = any(p in text_lower for p in ["low risk","risk: low","impact: low"])

    impact = "HIGH" if high else ("LOW" if low else ("MEDIUM" if medium else
             ("HIGH" if result == "FAIL" else ("MEDIUM" if result == "PARTIAL" else "LOW"))))

    return {
        "result":         result,
        "observation":    raw_text[:800],
        "kb1_reference":  None,
        "kb2_reference":  None,
        "recommendation": "Address identified deficiencies and retest." if result == "FAIL" else "Review control.",
        "exceptions":     [],
        "impact":         impact,
    }


# ── Per-control orchestration ──────────────────────────────────────────────────

def analyze_control_evidence(
    control: Dict[str, Any],
    evidence_files: List[Dict[str, str]],
    kb1_vectorstore,
    kb2_vectorstore,
    model: str,
) -> Dict[str, Any]:
    control_id = control.get("control_id", "UNKNOWN")
    logger.info(f"Analyzing control: {control_id}")

    if not evidence_files:
        return _no_evidence_result(control_id)

    try:
        llm_chain = get_llm_chain()

        evidence_wrappers: List[FileWrapper] = []
        evidence_filenames: List[str] = []
        for ef in evidence_files:
            try:
                w = FileWrapper(filepath=ef["tmp_path"], filename=ef["filename"])
                evidence_wrappers.append(w)
                evidence_filenames.append(ef["filename"])
            except Exception as exc:
                logger.error(f"Failed to wrap {ef.get('filename')}: {exc}")

        if not evidence_wrappers:
            return _no_evidence_result(control_id, "Evidence files could not be loaded.")

        evidence_context = build_evidence_context(control)

        if kb1_vectorstore is None and kb2_vectorstore is None:
            logger.warning(f"Both KBs None for {control_id} — direct assessment.")
            return _assess_without_kb(control, evidence_wrappers, evidence_filenames, model)

        assessment_items = llm_chain.assess_evidence_with_kb(
            evidence_files=evidence_wrappers,
            kb_vectorstore=kb1_vectorstore,
            company_kb_vectorstore=kb2_vectorstore,
            selected_model=model,
            evidence_context=evidence_context,
        )

        if not assessment_items:
            return _no_evidence_result(control_id, "LLM returned no assessment output.")

        # BUG 8 FIX: parse structured JSON instead of keyword-scanning
        parsed = parse_structured_assessments(assessment_items, control)
        parsed["control_id"]        = control_id
        parsed["evidence_analyzed"] = evidence_filenames

        logger.info(f"{control_id}: result={parsed['result']}, impact={parsed['impact']}")
        return parsed

    except Exception as exc:
        logger.error(f"Analysis failed for {control_id}: {exc}")
        return {
            "control_id":        control_id,
            "result":            "FAIL",
            "observation":       f"Analysis error: {exc}",
            "kb1_reference":     None,
            "kb2_reference":     None,
            "recommendation":    "Review this control manually — analysis error occurred.",
            "exceptions":        [str(exc)],
            "evidence_analyzed": [ef["filename"] for ef in evidence_files],
            "impact":            "HIGH",
        }


def _no_evidence_result(control_id: str, reason: str = "No evidence provided.") -> Dict[str, Any]:
    return {
        "control_id":        control_id,
        "result":            "NO_EVIDENCE",
        "observation":       reason,
        "kb1_reference":     None,
        "kb2_reference":     None,
        "recommendation":    "Evidence must be provided to complete testing.",
        "exceptions":        ["No evidence uploaded"],
        "evidence_analyzed": [],
        "impact":            "HIGH",
    }


def _assess_without_kb(
    control: Dict[str, Any],
    evidence_wrappers: List[FileWrapper],
    evidence_filenames: List[str],
    model: str,
) -> Dict[str, Any]:
    control_id = control.get("control_id", "UNKNOWN")
    try:
        from langchain_ollama import OllamaLLM
        llm = OllamaLLM(model=model, base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"))

        parts = []
        for w in evidence_wrappers:
            try:
                parts.append(w.read().decode("utf-8", errors="ignore")[:4000])
            except Exception:
                pass

        evidence_text = "\n\n---\n\n".join(parts) or "No readable evidence."
        prompt = (
            f"You are a senior cybersecurity auditor.\n\n"
            f"CONTROL:\n{build_evidence_context(control)}\n\n"
            f"EVIDENCE:\n{evidence_text}\n\n"
            "Assess: PASS / FAIL / PARTIAL, Risk: HIGH / MEDIUM / LOW, "
            "observations, and recommendations."
        )
        response = llm.invoke(prompt)
        base = _keyword_fallback(response, control)
        base.update({
            "control_id":        control_id,
            "evidence_analyzed": evidence_filenames,
            "kb1_reference":     None,
            "kb2_reference":     None,
            "observation":       response[:800],
        })
        return base
    except Exception as exc:
        return {
            "control_id":        control_id,
            "result":            "FAIL",
            "observation":       f"Direct assessment failed: {exc}",
            "kb1_reference":     None,
            "kb2_reference":     None,
            "recommendation":    "Both KBs unavailable — perform manual review.",
            "exceptions":        [str(exc)],
            "evidence_analyzed": evidence_filenames,
            "impact":            "HIGH",
        }


# ── Context builder ────────────────────────────────────────────────────────────

def build_evidence_context(control: Dict[str, Any]) -> str:
    return "\n".join([
        f"Control ID       : {control.get('control_id', 'N/A')}",
        f"Description      : {control.get('control_description', 'N/A')}",
        f"Risk Statement   : {control.get('risk_statement', 'N/A')}",
        f"Test Objective   : {control.get('test_objective', 'N/A')}",
        f"Test Steps       : {control.get('test_steps', 'N/A')}",
        f"Evidence Required: {control.get('evidence_required', 'N/A')}",
        f"Sample Size      : {control.get('sample_size', 'N/A')}",
        f"Control Owner    : {control.get('control_owner', 'N/A')}",
        f"Frequency        : {control.get('frequency', 'N/A')}",
    ])


# ── Session-level orchestration ───────────────────────────────────────────────

def analyze_all_controls(
    session_data: Dict[str, Any],
    kb1_vectorstore,
    kb2_vectorstore,
    model: str,
) -> List[Dict[str, Any]]:
    controls      = session_data.get("controls", [])
    uploaded_files = session_data.get("uploaded_files", {})

    logger.info(f"Starting analysis of {len(controls)} controls")
    results = []

    for control in controls:
        cid = control.get("control_id")
        evidence = [
            {"filename": fname, "tmp_path": fdata["tmp_path"]}
            for fname, fdata in uploaded_files.items()
            if cid in fdata.get("satisfies_controls", [])
        ]
        results.append(analyze_control_evidence(control, evidence, kb1_vectorstore, kb2_vectorstore, model))

    logger.info(f"Analysis complete: {len(results)} results")
    return results


def generate_overall_summary(analysis_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    total             = len(analysis_results)
    pass_count        = sum(1 for r in analysis_results if r["result"] == "PASS")
    fail_count        = sum(1 for r in analysis_results if r["result"] == "FAIL")
    partial_count     = sum(1 for r in analysis_results if r["result"] == "PARTIAL")
    no_evidence_count = sum(1 for r in analysis_results if r["result"] == "NO_EVIDENCE")

    if no_evidence_count == total:
        overall = "NO_EVIDENCE"
    elif fail_count > 0:
        overall = "NON_COMPLIANT"
    elif partial_count > 0:
        overall = "PARTIALLY_COMPLIANT"
    else:
        overall = "COMPLIANT"

    return {
        "controls_tested":           total,
        "controls_with_evidence":    total - no_evidence_count,
        "controls_without_evidence": no_evidence_count,
        "overall_result":            overall,
        "pass_count":                pass_count,
        "fail_count":                fail_count,
        "partial_count":             partial_count,
        "no_evidence_count":         no_evidence_count,
    }