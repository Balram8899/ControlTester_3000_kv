from __future__ import annotations

import re

from utils.sop_uplift.diagram_model import DiagramModel, DiagramNode


def _safe(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_]+", "_", value).strip("_") or "node"


def _label(node: DiagramNode) -> str:
    return f"{node.badge} {node.label}".strip()


def _node(node: DiagramNode) -> str:
    node_id = _safe(node.node_id)
    label = _label(node).replace('"', "'")
    if node.shape == "decision":
        return f'{node_id}{{"{label}"}}'
    if node.shape == "start_end":
        return f'{node_id}(["{label}"])'
    if node.shape == "data_store":
        return f'{node_id}[("{label}")]'
    return f'{node_id}["{label}"]'


def export_mermaid(model: DiagramModel) -> str:
    lines = ["flowchart LR", f'%% {model.title}']
    nodes_by_lane: dict[str, list[DiagramNode]] = {}
    for node in sorted(model.nodes, key=lambda item: (item.column, item.node_id)):
        nodes_by_lane.setdefault(node.lane_id, []).append(node)
    for lane in sorted(model.lanes, key=lambda item: item.order):
        lines.append(f"subgraph {lane.lane_id}[{lane.name}]")
        for node in nodes_by_lane.get(lane.lane_id, []):
            lines.append(f"  {_node(node)}")
        lines.append("end")
    for edge in model.edges:
        label = f"|{edge.label}|" if edge.label else ""
        lines.append(f"{_safe(edge.from_node_id)} -->{label} {_safe(edge.to_node_id)}")
    return "\n".join(lines) + "\n"
