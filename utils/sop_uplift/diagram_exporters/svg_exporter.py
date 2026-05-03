from __future__ import annotations

import html
import textwrap

from utils.sop_uplift.diagram_model import DiagramModel, DiagramNode


KPMG_BLUE = "#00338D"
COBALT = "#1E49E2"
DARK = "#0C233C"
LIGHT = "#F8FAFD"
BORDER = "#D8E0ED"
TEXT = "#0C233C"
MUTED = "#64748B"
RISK = "#C00000"
AMBER = "#EAAA00"
PACIFIC = "#00B8F5"


def _lines(label: str, width: int = 18) -> list[str]:
    return textwrap.wrap(label, width=width)[:3] or [""]


def _footer_lines(label: str, width: int = 56, max_lines: int = 3) -> list[str]:
    lines = textwrap.wrap(" ".join(str(label or "").split()), width=width) or [""]
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(". ") + "..."
    return lines


def _badge_color(badge: str) -> str:
    if badge.startswith("R"):
        return RISK
    if badge.startswith("E"):
        return AMBER
    return KPMG_BLUE


def _node_size(node: DiagramNode) -> tuple[int, int]:
    if node.shape == "decision":
        return 118, 70
    if node.shape == "start_end":
        return 120, 48
    return 148, 56


def _node_anchor(node: DiagramNode, cx: int, cy: int, side: str) -> tuple[int, int]:
    w, h = _node_size(node)
    if side == "right":
        return (cx + (w // 2 if node.shape != "decision" else w // 2), cy)
    if side == "left":
        return (cx - (w // 2 if node.shape != "decision" else w // 2), cy)
    return (cx, cy + h // 2)


def _text(parts: list[str], x: int, y: int, label: str, fill: str = TEXT, size: int = 11, anchor: str = "middle") -> None:
    for index, line in enumerate(_lines(label)):
        parts.append(
            f'<text x="{x}" y="{y + index * 13}" font-family="Arial" font-size="{size}" '
            f'fill="{fill}" text-anchor="{anchor}">{html.escape(line)}</text>'
        )


def _draw_node(parts: list[str], node: DiagramNode, cx: int, cy: int) -> None:
    w, h = _node_size(node)
    x = cx - w // 2
    y = cy - h // 2
    fill = "#FFFFFF"
    stroke = COBALT
    if node.type == "control":
        stroke = KPMG_BLUE
    elif node.type == "risk":
        stroke = RISK
    elif node.type == "evidence":
        stroke = AMBER
    if node.shape == "start_end":
        parts.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{w // 2}" ry="{h // 2}" fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>')
    elif node.shape == "decision":
        points = f"{cx},{y} {x + w},{cy} {cx},{y + h} {x},{cy}"
        parts.append(f'<polygon points="{points}" fill="#FFF8E1" stroke="{stroke}" stroke-width="1.6"/>')
    elif node.shape == "data_store":
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="#EFF8FC" stroke="{stroke}" stroke-width="1.6" stroke-dasharray="5,3"/>')
        parts.append(f'<path d="M{x + 12},{y} C{x + 28},{y + 10} {x + w - 28},{y + 10} {x + w - 12},{y}" fill="none" stroke="{stroke}" stroke-width="1"/>')
    else:
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>')
    _text(parts, cx, cy - 4, node.label)
    if node.badge:
        bx = x - 8
        by = y - 10
        parts.append(f'<rect x="{bx}" y="{by}" width="30" height="20" rx="3" fill="{_badge_color(node.badge)}"/>')
        parts.append(f'<text x="{bx + 15}" y="{by + 14}" font-family="Arial" font-size="10" font-weight="700" fill="white" text-anchor="middle">{html.escape(node.badge)}</text>')


def _draw_edge(parts: list[str], x1: int, y1: int, x2: int, y2: int, label: str) -> None:
    mid = max(x1 + 24, (x1 + x2) // 2)
    path = f"M{x1},{y1} L{mid},{y1} L{mid},{y2} L{x2},{y2}"
    parts.append(f'<path d="{path}" fill="none" stroke="{MUTED}" stroke-width="1.8" marker-end="url(#arrow)"/>')
    if label:
        parts.append(f'<text x="{mid + 4}" y="{min(y1, y2) + abs(y2 - y1) // 2 - 4}" font-family="Arial" font-size="10" fill="{MUTED}">{html.escape(label)}</text>')


def export_svg(model: DiagramModel) -> str:
    lanes = sorted(model.lanes, key=lambda lane: lane.order) or []
    lane_count = max(1, len(lanes))
    max_col = max([node.column for node in model.nodes] or [0])
    lane_h = 118
    header_h = 82
    footer_h = 170
    lane_label_w = 156
    col_w = 176
    legend_w = 210
    content_w = max(760, (max_col + 1) * col_w + 80)
    width = lane_label_w + content_w + legend_w
    height = header_h + lane_h * lane_count + footer_h
    lane_index = {lane.lane_id: index for index, lane in enumerate(lanes)}
    node_lookup = {node.node_id: node for node in model.nodes}
    pos: dict[str, tuple[int, int]] = {}

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#64748B"/></marker></defs>',
        f'<rect width="{width}" height="{height}" fill="{LIGHT}"/>',
        f'<rect x="0" y="0" width="{width}" height="{header_h}" fill="#FFFFFF" stroke="{BORDER}"/>',
        f'<rect x="0" y="0" width="92" height="{header_h}" fill="{KPMG_BLUE}"/>',
        '<text x="14" y="33" font-family="Arial" font-size="15" font-weight="700" fill="white">KPMG</text>',
        '<text x="14" y="55" font-family="Arial" font-size="12" font-weight="700" fill="#ACEAFF">TRACE</text>',
        f'<text x="108" y="32" font-family="Arial" font-size="18" font-weight="700" fill="{DARK}">{html.escape(model.title)}</text>',
        f'<text x="108" y="55" font-family="Arial" font-size="11" fill="{MUTED}">{html.escape(model.case_title)} | {html.escape(model.process_name)}</text>',
    ]
    meta_x = width - 302
    parts.append(f'<rect x="{meta_x}" y="10" width="288" height="62" rx="4" fill="{LIGHT}" stroke="{BORDER}"/>')
    meta_items = [("Owner", model.meta.process_owner or "-"), ("Document", model.meta.document_id or "-"), ("Version", model.meta.version or "1.0"), ("Effective", model.meta.effective_date or "-")]
    for index, (key, value) in enumerate(meta_items):
        x = meta_x + 10 + (index % 2) * 140
        y = 28 + (index // 2) * 24
        parts.append(f'<text x="{x}" y="{y}" font-family="Arial" font-size="9" font-weight="700" fill="{TEXT}">{key}</text>')
        parts.append(f'<text x="{x}" y="{y + 12}" font-family="Arial" font-size="9" fill="{MUTED}">{html.escape(value)}</text>')

    for index in range(lane_count):
        lane = lanes[index] if index < len(lanes) else None
        y = header_h + index * lane_h
        parts.append(f'<rect x="0" y="{y}" width="{lane_label_w + content_w}" height="{lane_h}" fill="{"#FFFFFF" if index % 2 == 0 else "#EFF3FA"}" stroke="{BORDER}"/>')
        parts.append(f'<rect x="0" y="{y}" width="{lane_label_w}" height="{lane_h}" fill="{KPMG_BLUE}"/>')
        parts.append(f'<text x="18" y="{y + 62}" font-family="Arial" font-size="12" font-weight="700" fill="white">{html.escape(lane.name if lane else "Lane")}</text>')

    for node in model.nodes:
        lane_pos = lane_index.get(node.lane_id, 0)
        cx = lane_label_w + 92 + node.column * col_w
        cy = header_h + lane_pos * lane_h + lane_h // 2
        pos[node.node_id] = (cx, cy)
        _draw_node(parts, node, cx, cy)

    for edge in model.edges:
        src = pos.get(edge.from_node_id)
        dst = pos.get(edge.to_node_id)
        if not src or not dst:
            continue
        src_node = node_lookup.get(edge.from_node_id)
        dst_node = node_lookup.get(edge.to_node_id)
        x1, y1 = _node_anchor(src_node, *src, "right") if src_node else src
        x2, y2 = _node_anchor(dst_node, *dst, "left") if dst_node else dst
        _draw_edge(parts, x1, y1, x2, y2, edge.label)

    legend_x = lane_label_w + content_w + 16
    legend_y = header_h + 16
    parts.append(f'<rect x="{legend_x}" y="{legend_y}" width="{legend_w - 32}" height="{lane_h * lane_count - 32}" rx="4" fill="#FFFFFF" stroke="{BORDER}"/>')
    parts.append(f'<text x="{legend_x + 14}" y="{legend_y + 24}" font-family="Arial" font-size="12" font-weight="700" fill="{TEXT}">Legend</text>')
    legend_items = [("Solid arrow", "arrow"), ("Start / End", "oval"), ("Process step", "rect"), ("Decision", "diamond"), ("Data store", "store"), ("C# Control", "badge_c"), ("R# Risk", "badge_r"), ("E# Evidence", "badge_e")]
    for index, (label, kind) in enumerate(legend_items):
        y = legend_y + 50 + index * 24
        x = legend_x + 16
        if kind == "arrow":
            parts.append(f'<path d="M{x},{y - 5} L{x + 32},{y - 5}" fill="none" stroke="{MUTED}" stroke-width="1.8" marker-end="url(#arrow)"/>')
        elif kind == "oval":
            parts.append(f'<ellipse cx="{x + 16}" cy="{y - 4}" rx="16" ry="8" fill="#FFFFFF" stroke="{COBALT}"/>')
        elif kind == "diamond":
            parts.append(f'<polygon points="{x+16},{y-14} {x+32},{y-4} {x+16},{y+6} {x},{y-4}" fill="#FFF8E1" stroke="{AMBER}"/>')
        elif kind == "store":
            parts.append(f'<rect x="{x}" y="{y - 14}" width="32" height="18" rx="8" fill="#EFF8FC" stroke="{PACIFIC}" stroke-dasharray="4,2"/>')
        elif kind.startswith("badge"):
            color = {"badge_c": KPMG_BLUE, "badge_r": RISK, "badge_e": AMBER}[kind]
            parts.append(f'<rect x="{x}" y="{y - 15}" width="32" height="18" rx="3" fill="{color}"/>')
        else:
            parts.append(f'<rect x="{x}" y="{y - 14}" width="32" height="18" rx="3" fill="#FFFFFF" stroke="{COBALT}"/>')
        parts.append(f'<text x="{x + 42}" y="{y}" font-family="Arial" font-size="10" fill="{MUTED}">{label}</text>')

    footer_y = header_h + lane_h * lane_count
    parts.append(f'<rect x="0" y="{footer_y}" width="{width}" height="{footer_h}" fill="#FFFFFF" stroke="{BORDER}"/>')
    sections = [
        ("Notes", ["Controls (C#) are preventative or detective activities.", "Risks (R#) are key risk exposures.", "Evidence (E#) supports process execution."]),
        ("Control Summary", [f"{item.get('badge', '')}: {item.get('label', '')}" for item in model.control_summary] or ["No controls identified."]),
        ("Risk Summary", [f"{item.get('badge', '')}: {item.get('label', '')}" for item in model.risk_summary] or ["No risks identified."]),
        ("Document Information", [f"Document ID: {model.meta.document_id or '-'}", f"Effective Date: {model.meta.effective_date or '-'}", f"Review Date: {model.meta.review_date or '-'}"]),
    ]
    section_w = width // len(sections)
    for index, (title, items) in enumerate(sections):
        x = index * section_w + 16
        parts.append(f'<text x="{x}" y="{footer_y + 24}" font-family="Arial" font-size="11" font-weight="700" fill="{TEXT}">{title}</text>')
        y = footer_y + 44
        for item in items[:4]:
            for line in _footer_lines(item, width=max(28, section_w // 8), max_lines=3):
                parts.append(f'<text x="{x}" y="{y}" font-family="Arial" font-size="9" fill="{MUTED}">{html.escape(line)}</text>')
                y += 13
            y += 3

    parts.append(f'<text x="18" y="{height - 12}" font-family="Arial" font-size="10" fill="{MUTED}">Generated by TRACE SOP Uplift</text>')
    parts.append("</svg>")
    return "".join(parts)
