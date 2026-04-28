from __future__ import annotations

import json

from utils.sop_uplift.diagram_model import DiagramModel


def export_vsdx_stub(model: DiagramModel) -> bytes:
    payload = {
        "status": "future_compatible_stub",
        "message": "VSDX export is reserved for a future TRACE SOP Uplift version.",
        "diagram_model": model.model_dump(),
    }
    return ("TRACE SOP Uplift VSDX stub\n" + json.dumps(payload, indent=2)).encode("utf-8")
