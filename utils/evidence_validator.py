"""
Evidence Validator
Two-level validation: Content Type + Content Match
Maps one evidence file to multiple controls
NO API CODE - pure validation logic
"""

import os
import json
import re
from typing import Dict, List, Any, Tuple
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Lazy load LLM
_llm_cache = None

def get_llm(model: str):
    """Lazy load the active Settings LLM."""
    global _llm_cache
    from utils.llm_config_store import get_active_llm_signature
    signature = get_active_llm_signature()
    if _llm_cache is None or _llm_cache[0] != signature:
        from utils.llm_chain import _make_llm
        _llm_cache = (signature, _make_llm(model, temperature=0.1))
    return _llm_cache[1]


# Content type mapping by extension
CONTENT_TYPE_MAP = {
    ".log": "system log",
    ".txt": "text document",
    ".csv": "structured data",
    ".xlsx": "spreadsheet",
    ".xls": "spreadsheet",
    ".pdf": "document",
    ".png": "screenshot",
    ".jpg": "screenshot",
    ".jpeg": "screenshot",
    ".json": "configuration or log",
    ".xml": "configuration",
    ".cfg": "configuration file",
    ".conf": "configuration file",
    ".config": "configuration file",
}


def validate_evidence_file(
    file_path: str,
    filename: str,
    pending_controls: List[Dict[str, Any]],
    model: str
) -> Dict[str, Any]:
    """
    Validate evidence file with two-level validation.
    
    Level 1: Content Type Check (extension + LLM classification)
    Level 2: Content Match Check (does it satisfy requirements?)
    
    Args:
        file_path: Path to uploaded evidence file
        filename: Original filename
        pending_controls: List of controls awaiting evidence
        model: LLM model name
    
    Returns:
        Validation result dict with:
        {
            "validation_status": "accepted" | "rejected",
            "content_type_detected": str,
            "satisfies_controls": [control_id, ...],
            "rejection_reason": str | None,
            "content_preview": str,
            "level1_passed": bool,
            "level2_details": {...}
        }
    """
    logger.info(f"Validating evidence file: {filename}")
    
    try:
        # Read file content (first 2000 chars for preview, full for classification)
        content_preview = read_file_preview(file_path, max_chars=2000)
        full_content = read_file_content(file_path, max_chars=5000)
        
        # LEVEL 1: Content Type Check
        level1_result = validate_content_type(
            filename, 
            content_preview, 
            pending_controls,
            model
        )
        
        if not level1_result["passed"]:
            return {
                "validation_status": "rejected",
                "content_type_detected": level1_result.get("detected_type", "unknown"),
                "satisfies_controls": [],
                "rejection_reason": level1_result.get("reason", "Content type validation failed"),
                "content_preview": content_preview[:500],
                "level1_passed": False,
                "level2_details": {}
            }
        
        # LEVEL 2: Content Match Check
        level2_result = validate_content_match(
            filename,
            full_content,
            pending_controls,
            model
        )
        
        satisfies = level2_result.get("satisfies_controls", [])
        
        if not satisfies:
            return {
                "validation_status": "rejected",
                "content_type_detected": level1_result.get("detected_type"),
                "satisfies_controls": [],
                "rejection_reason": "File does not match any pending control requirements. " + 
                                   level2_result.get("reason", ""),
                "content_preview": content_preview[:500],
                "level1_passed": True,
                "level2_details": level2_result
            }
        
        # SUCCESS
        return {
            "validation_status": "accepted",
            "content_type_detected": level1_result.get("detected_type"),
            "satisfies_controls": satisfies,
            "rejection_reason": None,
            "content_preview": content_preview[:500],
            "level1_passed": True,
            "level2_details": level2_result
        }
        
    except Exception as e:
        logger.error(f"Validation failed for {filename}: {e}")
        return {
            "validation_status": "rejected",
            "content_type_detected": "error",
            "satisfies_controls": [],
            "rejection_reason": f"Validation error: {str(e)}",
            "content_preview": "",
            "level1_passed": False,
            "level2_details": {}
        }


def validate_content_type(
    filename: str,
    content_preview: str,
    pending_controls: List[Dict[str, Any]],
    model: str
) -> Dict[str, Any]:
    """
    Level 1: Validate content type.
    
    Returns:
        {
            "passed": bool,
            "detected_type": str,
            "confidence": str,
            "reason": str
        }
    """
    # Get expected type from extension
    ext = Path(filename).suffix.lower()
    expected_type = CONTENT_TYPE_MAP.get(ext, "unknown")
    
    # Use LLM to classify content
    llm = get_llm(model)
    
    prompt = f"""Classify this file content. Return JSON only with no other text:

{{
  "detected_type": "system log|config file|report|screenshot|policy doc|spreadsheet|database log|text document|other",
  "confidence": "high|medium|low",
  "summary": "one sentence describing what this file contains"
}}

Filename: {filename}
Extension suggests: {expected_type}

Content preview (first 2000 chars):
{content_preview}

Return ONLY valid JSON:"""

    try:
        raw_response = llm.invoke(prompt)
        parsed = safe_json_loads(raw_response)
        
        if not parsed:
            # Fallback if LLM fails
            return {
                "passed": True,  # Accept on classification failure
                "detected_type": expected_type,
                "confidence": "low",
                "reason": "LLM classification unavailable, accepting based on extension"
            }
        
        detected_type = parsed.get("detected_type", "unknown")
        confidence = parsed.get("confidence", "medium")
        summary = parsed.get("summary", "")
        
        logger.info(f"Level 1: {filename} detected as '{detected_type}' ({confidence} confidence)")
        
        # Accept if confidence is not low
        passed = confidence in ["high", "medium"]
        
        return {
            "passed": passed,
            "detected_type": detected_type,
            "confidence": confidence,
            "reason": summary if passed else f"Low confidence classification: {summary}"
        }
        
    except Exception as e:
        logger.error(f"Level 1 classification failed: {e}")
        return {
            "passed": True,  # Accept on error
            "detected_type": expected_type,
            "confidence": "error",
            "reason": "Classification failed, accepting based on extension"
        }


def validate_content_match(
    filename: str,
    content: str,
    pending_controls: List[Dict[str, Any]],
    model: str
) -> Dict[str, Any]:
    """
    Level 2: Check if content matches control requirements.
    Maps one file to potentially multiple controls.
    
    Returns:
        {
            "satisfies_controls": [control_id, ...],
            "matches": [{control_id, match_level, reason}, ...],
            "overall_summary": str,
            "reason": str
        }
    """
    if not pending_controls:
        return {
            "satisfies_controls": [],
            "matches": [],
            "overall_summary": "No pending controls to match against",
            "reason": "No controls awaiting evidence"
        }
    
    llm = get_llm(model)
    
    # Build control list for prompt
    control_list = []
    for idx, control in enumerate(pending_controls, 1):
        control_list.append(
            f"{idx}. Control ID: {control['control_id']}\n"
            f"   Description: {control.get('control_description', 'N/A')[:150]}\n"
            f"   Evidence Required: {control.get('evidence_required', 'N/A')}"
        )
    
    controls_text = "\n\n".join(control_list)
    
    prompt = f"""You are an audit evidence validator. Determine which controls this evidence file satisfies.

Evidence filename: {filename}

Content preview (first 5000 chars):
{content}

Pending controls requiring evidence:
{controls_text}

For EACH control, determine if this file satisfies the evidence requirement.
Match levels: FULL (completely satisfies), PARTIAL (partially satisfies), NONE (does not satisfy)

Return JSON array:
[
  {{
    "control_id": "CTL-001",
    "match_level": "FULL|PARTIAL|NONE",
    "reason": "brief explanation"
  }}
]

Return ONLY valid JSON array:"""

    try:
        raw_response = llm.invoke(prompt)
        parsed = safe_json_loads(raw_response)
        
        if not parsed or not isinstance(parsed, list):
            logger.warning(f"Level 2: Invalid LLM response for {filename}")
            return {
                "satisfies_controls": [],
                "matches": [],
                "overall_summary": "Failed to analyze content match",
                "reason": "LLM did not return valid match analysis"
            }
        
        # Extract controls that have FULL or PARTIAL match
        satisfies = []
        matches = []
        
        for item in parsed:
            control_id = item.get("control_id")
            match_level = item.get("match_level", "NONE").upper()
            reason = item.get("reason", "")
            
            matches.append({
                "control_id": control_id,
                "match_level": match_level,
                "reason": reason
            })
            
            if match_level in ["FULL", "PARTIAL"]:
                satisfies.append(control_id)
        
        logger.info(f"Level 2: {filename} satisfies {len(satisfies)} controls: {satisfies}")
        
        overall_summary = f"File satisfies {len(satisfies)} out of {len(pending_controls)} pending controls"
        
        return {
            "satisfies_controls": satisfies,
            "matches": matches,
            "overall_summary": overall_summary,
            "reason": overall_summary
        }
        
    except Exception as e:
        logger.error(f"Level 2 content match failed: {e}")
        return {
            "satisfies_controls": [],
            "matches": [],
            "overall_summary": "Content match analysis failed",
            "reason": f"Error: {str(e)}"
        }


def read_file_preview(file_path: str, max_chars: int = 2000) -> str:
    """Read file preview (text-based files only)."""
    try:
        ext = Path(file_path).suffix.lower()
        
        # Binary file types - return description
        if ext in [".png", ".jpg", ".jpeg", ".gif", ".pdf", ".xlsx", ".xls"]:
            return f"[Binary file: {ext} - cannot preview text content]"
        
        # Text-based files
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read(max_chars)
        
        return content
        
    except Exception as e:
        logger.error(f"Failed to read preview of {file_path}: {e}")
        return "[Error reading file preview]"


def read_file_content(file_path: str, max_chars: int = 5000) -> str:
    """Read file content (more than preview, for analysis)."""
    try:
        ext = Path(file_path).suffix.lower()
        
        # Binary file types
        if ext in [".png", ".jpg", ".jpeg", ".gif"]:
            return f"[Image file: {ext}]"
        
        if ext == ".pdf":
            # Try to extract text from PDF
            try:
                from langchain_community.document_loaders import PyPDFLoader
                loader = PyPDFLoader(file_path)
                docs = loader.load()
                text = "\n\n".join([doc.page_content for doc in docs[:3]])  # First 3 pages
                return text[:max_chars]
            except:
                return "[PDF file - text extraction failed]"
        
        if ext in [".xlsx", ".xls"]:
            # Try to extract from Excel
            try:
                import openpyxl
                wb = openpyxl.load_workbook(file_path, data_only=True)
                ws = wb.active
                text_parts = []
                for row in ws.iter_rows(max_row=50, values_only=True):
                    row_text = " | ".join([str(v) for v in row if v is not None])
                    if row_text:
                        text_parts.append(row_text)
                return "\n".join(text_parts)[:max_chars]
            except:
                return "[Excel file - data extraction failed]"
        
        # Text files
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read(max_chars)
        
    except Exception as e:
        logger.error(f"Failed to read content of {file_path}: {e}")
        return "[Error reading file content]"


def safe_json_loads(llm_output: str):
    """Safely extract JSON from LLM output."""
    if not llm_output or not llm_output.strip():
        return None

    llm_output = llm_output.strip()
    llm_output = re.sub(r"```json|```", "", llm_output, flags=re.IGNORECASE).strip()

    # Try direct parse
    try:
        return json.loads(llm_output)
    except json.JSONDecodeError:
        pass

    # Try extracting first JSON object/array
    match = re.search(r"[\[{].*[\]}]", llm_output, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return None
