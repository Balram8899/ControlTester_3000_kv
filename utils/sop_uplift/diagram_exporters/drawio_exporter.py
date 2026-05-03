from __future__ import annotations

import html
import xml.etree.ElementTree as ET

from utils.sop_uplift.diagram_model import DiagramModel


def export_drawio(model: DiagramModel) -> str:
    mxfile = ET.Element("mxfile", {"host": "TRACE SOP Uplift", "type": "device"})
    diagram = ET.SubElement(mxfile, "diagram", {"name": model.title or "SOP Uplift"})
    graph = ET.SubElement(diagram, "mxGraphModel")
    root = ET.SubElement(graph, "root")
    ET.SubElement(root, "mxCell", {"id": "0"})
    ET.SubElement(root, "mxCell", {"id": "1", "parent": "0"})

    lanes = sorted(model.lanes, key=lambda lane: lane.order)
    lane_lookup = {lane.lane_id: idx for idx, lane in enumerate(lanes)}
    node_positions: dict[str, tuple[int, int]] = {}

    for idx, lane in enumerate(lanes):
        y = 80 + idx * 120
        cell = ET.SubElement(
            root,
            "mxCell",
            {
                "id": f"lane_{lane.lane_id}",
                "value": html.escape(lane.name),
                "style": "swimlane;horizontal=0;fillColor=#0C233C;fontColor=#FFFFFF;",
                "vertex": "1",
                "parent": "1",
            },
        )
        ET.SubElement(cell, "mxGeometry", {"x": "20", "y": str(y), "width": "1040", "height": "110", "as": "geometry"})

    for node in model.nodes:
        lane_idx = lane_lookup.get(node.lane_id, 0)
        x = 200 + node.column * 180
        y = 110 + lane_idx * 120
        node_positions[node.node_id] = (x, y)
        fill = {"control": "#1E49E2", "risk": "#C00000", "evidence": "#EAAA00"}.get(node.type, "#FFFFFF")
        shape_style = {
            "decision": "shape=rhombus;whiteSpace=wrap;html=1;",
            "start_end": "ellipse;whiteSpace=wrap;html=1;",
            "data_store": "shape=mxgraph.flowchart.stored_data;whiteSpace=wrap;html=1;",
        }.get(node.shape, "rounded=1;whiteSpace=wrap;html=1;")
        label = f"[{node.badge}] {node.label}" if node.badge else node.label
        cell = ET.SubElement(
            root,
            "mxCell",
            {
                "id": node.node_id,
                "value": html.escape(label),
                "style": f"{shape_style}fillColor={fill};strokeColor=#64748B;",
                "vertex": "1",
                "parent": "1",
            },
        )
        ET.SubElement(cell, "mxGeometry", {"x": str(x), "y": str(y), "width": "140", "height": "50", "as": "geometry"})

    for edge in model.edges:
        cell = ET.SubElement(
            root,
            "mxCell",
            {
                "id": edge.edge_id,
                "value": html.escape(edge.label),
                "style": "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;",
                "edge": "1",
                "parent": "1",
                "source": edge.from_node_id,
                "target": edge.to_node_id,
            },
        )
        ET.SubElement(cell, "mxGeometry", {"relative": "1", "as": "geometry"})

    return ET.tostring(mxfile, encoding="unicode")
