from __future__ import annotations

from io import BytesIO
from textwrap import wrap
from typing import Any

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.axes import Axes
from matplotlib.figure import Figure
from matplotlib.path import Path as MplPath
from matplotlib.patches import Ellipse, FancyArrowPatch, FancyBboxPatch, Polygon, Rectangle

from utils.services.schemas import SwimlaneSpec, SwimlaneStep


LANE_BAND_X = -1.74
LANE_BAND_WIDTH = 1.32
LANE_LABEL_X = -1.08
LANE_LABEL_WRAP = 14
DIAGRAM_LEFT_X = -1.98
STEP_START_X = 0.96
STEP_WIDTH = 1.12
STEP_HEIGHT = 0.62
STEP_SPACING = 1.55
LANE_HEIGHT = 1.28
DECISION_WIDTH = 1.26
DECISION_HEIGHT = 0.92
TERMINAL_WIDTH = 0.72
TERMINAL_HEIGHT = 0.36
KPMG_NAVY = "#0C233C"
KPMG_AMBER = "#EAAA00"
KPMG_TEAL = "#008B95"
KPMG_TEAL_TINT = "#E6F7F8"
KPMG_SKY = "#00A3E0"
MUTED_CONNECTOR = "#7A8BA0"


def render(spec: SwimlaneSpec) -> tuple[bytes, bytes]:
    figure, _axis = build_figure(spec)
    try:
        png = BytesIO()
        pdf = BytesIO()
        figure.savefig(png, format="png", dpi=300, bbox_inches="tight")
        figure.savefig(pdf, format="pdf", bbox_inches="tight")
        return png.getvalue(), pdf.getvalue()
    finally:
        close_figure(figure)


def build_figure(spec: SwimlaneSpec) -> tuple[Figure, Axes]:
    layout = _layout(spec)
    lane_count = max(1, len(spec.lanes))
    step_count = max(1, len(spec.steps))
    body_top = _body_top(lane_count)
    body_right = _body_right(spec)
    legend_x = _legend_x(spec)
    canvas_right = _canvas_right(spec)
    figure_width = max(16.0, step_count * 1.5 + 4.8)
    figure_height = max(7.1, lane_count * 1.35 + 1.95)
    figure, axis = plt.subplots(figsize=(figure_width, figure_height))
    axis.set_facecolor("white")
    axis.set_xlim(DIAGRAM_LEFT_X, canvas_right)
    axis.set_ylim(0.32, body_top + 1.45)
    axis.axis("off")

    _draw_header(axis, spec, body_top, canvas_right)
    _draw_lanes(axis, spec, layout["lane_y"], body_right)
    _draw_edges(axis, spec, layout["positions"])
    _draw_steps(axis, spec, layout["positions"])
    _draw_legend_panel(axis, legend_x, lane_count)
    figure.tight_layout()
    return figure, axis


def close_figure(figure: Figure) -> None:
    plt.close(figure)


def _body_right(spec: SwimlaneSpec) -> float:
    last_step_x = (max(1, len(spec.steps)) - 1) * STEP_SPACING + STEP_START_X
    return last_step_x + max(STEP_WIDTH, DECISION_WIDTH, TERMINAL_WIDTH) / 2 + 0.8


def _legend_x(spec: SwimlaneSpec) -> float:
    return _body_right(spec) + 0.16


def _canvas_right(spec: SwimlaneSpec) -> float:
    return _legend_x(spec) + 1.72


def _body_top(lane_count: int) -> float:
    return max(1, lane_count) * LANE_HEIGHT


def _layout(spec: SwimlaneSpec) -> dict[str, dict[str, tuple[float, float]] | dict[str, float]]:
    lane_y: dict[str, float] = {}
    for index, lane in enumerate(spec.lanes):
        lane_y[lane.lane_id] = (len(spec.lanes) - index) * LANE_HEIGHT

    positions: dict[str, tuple[float, float]] = {}
    for index, step in enumerate(spec.steps):
        positions[step.step_id] = (
            index * STEP_SPACING + STEP_START_X,
            lane_y.get(step.lane_id, 1.0),
        )
    return {"lane_y": lane_y, "positions": positions}


def _draw_header(axis: Axes, spec: SwimlaneSpec, body_top: float, canvas_right: float) -> None:
    header_y = body_top + 0.72
    axis.add_patch(
        FancyBboxPatch(
            (DIAGRAM_LEFT_X + 0.02, header_y),
            canvas_right - DIAGRAM_LEFT_X - 0.04,
            0.52,
            boxstyle="round,pad=0.015,rounding_size=0.035",
            linewidth=1.0,
            edgecolor=KPMG_NAVY,
            facecolor="white",
            zorder=1,
        )
    )
    axis.text(
        DIAGRAM_LEFT_X + 0.28,
        header_y + 0.26,
        "KPMG",
        fontsize=16,
        fontweight="bold",
        fontstyle="italic",
        color="#00338D",
        ha="left",
        va="center",
        zorder=3,
    )
    axis.text(
        DIAGRAM_LEFT_X + 1.08,
        header_y + 0.26,
        "|  TRACE",
        fontsize=15,
        fontweight="bold",
        color="#00A3E0",
        ha="left",
        va="center",
        zorder=3,
    )
    axis.text(
        DIAGRAM_LEFT_X + 2.1,
        header_y + 0.26,
        spec.title,
        fontsize=16,
        fontweight="bold",
        color=KPMG_NAVY,
        ha="left",
        va="center",
        zorder=3,
    )
    owner = _ellipsize(str(getattr(spec, "process_owner", "") or ""), 68)
    document_name = _ellipsize(
        str(getattr(spec, "document_name", "") or "Current reviewed SOP"),
        62,
    )
    axis.text(
        canvas_right - 0.16,
        header_y + 0.34,
        f"Process Owner: {owner}",
        fontsize=7.3,
        fontweight="bold",
        color=KPMG_NAVY,
        ha="right",
        va="center",
        zorder=3,
    )
    axis.text(
        canvas_right - 0.16,
        header_y + 0.18,
        f"Document: {document_name}",
        fontsize=7.3,
        color=KPMG_NAVY,
        ha="right",
        va="center",
        zorder=3,
    )


def _draw_lanes(
    axis: Axes,
    spec: SwimlaneSpec,
    lane_y: dict[str, float],
    body_right: float,
) -> None:
    for lane in spec.lanes:
        y = lane_y[lane.lane_id]
        axis.add_patch(
            Rectangle(
                (LANE_BAND_X, y - LANE_HEIGHT / 2),
                body_right - LANE_BAND_X,
                LANE_HEIGHT,
                facecolor=lane.colour_hex,
                edgecolor="#C8D1E1",
                linewidth=0.8,
                alpha=0.2,
                zorder=0,
            )
        )
        axis.add_patch(
            Rectangle(
                (LANE_BAND_X, y - LANE_HEIGHT / 2),
                LANE_BAND_WIDTH,
                LANE_HEIGHT,
                facecolor=KPMG_NAVY,
                edgecolor=KPMG_NAVY,
                linewidth=0,
                zorder=1,
            )
        )
        axis.text(
            LANE_LABEL_X,
            y,
            _wrapped(lane.label, LANE_LABEL_WRAP, max_lines=4),
            fontsize=7.3,
            fontweight="bold",
            color="white",
            ha="center",
            va="center",
            zorder=2,
        )


def _draw_steps(
    axis: Axes,
    spec: SwimlaneSpec,
    positions: dict[str, tuple[float, float]],
) -> None:
    lane_by_id = {lane.lane_id: lane for lane in spec.lanes}
    for step in spec.steps:
        x, y = positions[step.step_id]
        lane_colour = lane_by_id.get(step.lane_id).colour_hex if step.lane_id in lane_by_id else "#1E49E2"
        if step.step_type == "decision":
            _draw_decision(axis, x, y, step, lane_colour)
        elif step.step_type in {"start", "end"}:
            _draw_terminal(axis, x, y, step)
        else:
            _draw_action(axis, x, y, step, lane_colour)


def _draw_action(
    axis: Axes,
    x: float,
    y: float,
    step: SwimlaneStep,
    lane_colour: str,
) -> None:
    patch = FancyBboxPatch(
        (x - STEP_WIDTH / 2, y - STEP_HEIGHT / 2),
        STEP_WIDTH,
        STEP_HEIGHT,
        boxstyle="round,pad=0.045,rounding_size=0.075",
        linewidth=1.5,
        edgecolor=KPMG_NAVY,
        facecolor="white",
        zorder=4,
    )
    setattr(patch, "_document_uplift_shape", "process_step")
    axis.add_patch(patch)
    axis.text(
        x,
        y,
        _wrapped(step.label, 18),
        fontsize=8.3,
        color=KPMG_NAVY,
        ha="center",
        va="center",
        zorder=5,
    )


def _draw_decision(
    axis: Axes,
    x: float,
    y: float,
    step: SwimlaneStep,
    _lane_colour: str,
) -> None:
    diamond = Polygon(
        [
            (x, y + DECISION_HEIGHT / 2),
            (x + DECISION_WIDTH / 2, y),
            (x, y - DECISION_HEIGHT / 2),
            (x - DECISION_WIDTH / 2, y),
        ],
        closed=True,
        linewidth=1.5,
        edgecolor=KPMG_TEAL,
        facecolor=KPMG_TEAL_TINT,
        zorder=4,
    )
    setattr(diamond, "_document_uplift_shape", "decision")
    axis.add_patch(diamond)
    axis.text(
        x,
        y,
        _wrapped(step.label, 14),
        fontsize=8,
        color=KPMG_NAVY,
        ha="center",
        va="center",
        zorder=5,
    )


def _draw_terminal(axis: Axes, x: float, y: float, step: SwimlaneStep) -> None:
    terminal = Ellipse(
        (x, y),
        width=TERMINAL_WIDTH,
        height=TERMINAL_HEIGHT,
        facecolor="white",
        edgecolor=KPMG_SKY,
        linewidth=1.5,
        zorder=4,
    )
    setattr(terminal, "_document_uplift_shape", "terminal")
    axis.add_patch(terminal)
    axis.text(
        x,
        y,
        _wrapped(step.label, 10),
        fontsize=7.5,
        color=KPMG_NAVY,
        ha="center",
        va="center",
        zorder=6,
    )


def _draw_edges(
    axis: Axes,
    spec: SwimlaneSpec,
    positions: dict[str, tuple[float, float]],
) -> None:
    step_by_id = {step.step_id: step for step in spec.steps}
    edge_index = 0
    for step in spec.steps:
        start = positions.get(step.step_id)
        if not start:
            continue
        next_step_ids = list(step.next_steps)
        for branch_index, next_step_id in enumerate(next_step_ids):
            end = positions.get(next_step_id)
            if not end:
                continue
            end_step = step_by_id.get(next_step_id)
            if end_step is None:
                continue
            branch_label = step.branch_labels.get(next_step_id)
            arrow = _arrow_between_steps(
                step,
                end_step,
                start,
                end,
                branch_label=branch_label,
                branch_index=branch_index,
                branch_count=len(next_step_ids),
                edge_index=edge_index,
            )
            setattr(arrow, "_document_uplift_from", step.step_id)
            setattr(arrow, "_document_uplift_to", next_step_id)
            axis.add_patch(arrow)
            if branch_label:
                _draw_branch_label(axis, arrow, branch_label)
            edge_index += 1


def _arrow_between_steps(
    start_step: SwimlaneStep,
    end_step: SwimlaneStep,
    start: tuple[float, float],
    end: tuple[float, float],
    *,
    branch_label: str | None,
    branch_index: int,
    branch_count: int,
    edge_index: int,
) -> FancyArrowPatch:
    start_x, start_y = start
    end_x, end_y = end
    dx = end_x - start_x
    dy = end_y - start_y

    start_direction = _source_direction(
        start_step,
        dx,
        dy,
        branch_label=branch_label,
        branch_index=branch_index,
        branch_count=branch_count,
    )
    end_direction = _target_direction(dx, dy)
    start_anchor = _shape_anchor(start_step, start_x, start_y, start_direction)
    end_anchor = _shape_anchor(end_step, end_x, end_y, end_direction)
    sx, sy = start_anchor
    ex, ey = end_anchor

    if abs(sy - ey) < 0.001 or abs(sx - ex) < 0.001:
        points = [(sx, sy), (ex, ey)]
    elif start_direction in {"up", "down"}:
        points = [(sx, sy), (sx, ey), (ex, ey)]
    elif end_direction in {"up", "down"}:
        points = [(sx, sy), (ex, sy), (ex, ey)]
    else:
        mid_x = sx + (ex - sx) / 2
        if abs(start_y - end_y) > 0.001:
            mid_x += ((edge_index % 3) - 1) * 0.12
        points = [(sx, sy), (mid_x, sy), (mid_x, ey), (ex, ey)]

    path = MplPath(points, [MplPath.MOVETO] + [MplPath.LINETO] * (len(points) - 1))
    is_cross_lane = abs(start_y - end_y) > 0.001
    arrow = FancyArrowPatch(
        path=path,
        arrowstyle="-|>",
        mutation_scale=15,
        linewidth=1.0 if is_cross_lane else 1.2,
        color=MUTED_CONNECTOR if is_cross_lane and start_step.step_type != "decision" else KPMG_NAVY,
        zorder=3,
    )
    setattr(arrow, "_document_uplift_points", points)
    return arrow


def _source_direction(
    step: SwimlaneStep,
    dx: float,
    dy: float,
    *,
    branch_label: str | None,
    branch_index: int,
    branch_count: int,
) -> str:
    if step.step_type == "decision" and branch_count > 1:
        if dy < -0.001:
            return "down"
        if dy > 0.001:
            return "up"
        if dx < -0.001:
            return "left"
        if branch_label and branch_label.strip().lower() in {"no", "false"} and branch_index > 0:
            return "down"
        return "right"
    if abs(dx) < 0.001:
        return "down" if dy < 0 else "up"
    return "right" if dx >= 0 else "left"


def _target_direction(dx: float, dy: float) -> str:
    if abs(dx) < 0.001:
        return "up" if dy < 0 else "down"
    if abs(dy) < 0.001 or abs(dx) >= abs(dy):
        return "left" if dx > 0 else "right"
    return "up" if dy < 0 else "down"


def _shape_anchor(step: SwimlaneStep, x: float, y: float, direction: str) -> tuple[float, float]:
    if step.step_type == "decision":
        half_width = DECISION_WIDTH / 2
        half_height = DECISION_HEIGHT / 2
    elif step.step_type in {"start", "end"}:
        half_width = TERMINAL_WIDTH / 2
        half_height = TERMINAL_HEIGHT / 2
    else:
        half_width = STEP_WIDTH / 2
        half_height = STEP_HEIGHT / 2

    if direction == "right":
        return (x + half_width, y)
    if direction == "left":
        return (x - half_width, y)
    if direction == "up":
        return (x, y + half_height)
    return (x, y - half_height)


def _draw_branch_label(axis: Axes, arrow: FancyArrowPatch, branch_label: str) -> None:
    points = getattr(arrow, "_document_uplift_points", [])
    if len(points) < 2:
        return
    start, next_point = points[0], points[1]
    if abs(start[1] - next_point[1]) < 0.001:
        x_offset = 0.24 if next_point[0] >= start[0] else -0.24
        label_x = start[0] + x_offset
        label_y = start[1] + 0.16
    else:
        y_offset = 0.24 if next_point[1] >= start[1] else -0.24
        label_x = start[0] + 0.18
        label_y = start[1] + y_offset
    axis.text(
        label_x,
        label_y,
        branch_label,
        fontsize=8,
        fontweight="bold",
        color=KPMG_NAVY,
        ha="center",
        va="center",
        zorder=6,
    )


def _draw_legend_panel(axis: Axes, legend_x: float, lane_count: int) -> None:
    panel_y = LANE_HEIGHT / 2
    panel_h = max(LANE_HEIGHT, lane_count * LANE_HEIGHT) - 0.05
    axis.add_patch(
        FancyBboxPatch(
            (legend_x, panel_y),
            1.45,
            panel_h,
            boxstyle="round,pad=0.025,rounding_size=0.035",
            linewidth=0.8,
            edgecolor="#AAB7C8",
            facecolor="white",
            zorder=2,
        )
    )
    axis.text(
        legend_x + 0.12,
        panel_y + panel_h - 0.22,
        "Legend",
        fontsize=9.5,
        fontweight="bold",
        color=KPMG_NAVY,
        ha="left",
        va="center",
        zorder=3,
    )
    axis.text(
        legend_x + 0.12,
        panel_y + panel_h - 0.52,
        "Shapes",
        fontsize=8.5,
        fontweight="bold",
        color=KPMG_NAVY,
        ha="left",
        va="center",
        zorder=3,
    )
    y = panel_y + panel_h - 0.85
    _legend_terminal(axis, legend_x + 0.28, y)
    axis.text(legend_x + 0.55, y, "Start / End", fontsize=7.5, color=KPMG_NAVY, va="center")
    y -= 0.35
    axis.add_patch(
        Rectangle(
            (legend_x + 0.13, y - 0.09),
            0.3,
            0.18,
            linewidth=1.2,
            edgecolor=KPMG_NAVY,
            facecolor="white",
            zorder=3,
        )
    )
    axis.text(legend_x + 0.55, y, "Process Step", fontsize=7.5, color=KPMG_NAVY, va="center")
    y -= 0.35
    axis.add_patch(
        Polygon(
            [
                (legend_x + 0.28, y + 0.14),
                (legend_x + 0.47, y),
                (legend_x + 0.28, y - 0.14),
                (legend_x + 0.09, y),
            ],
            closed=True,
            linewidth=1.2,
            edgecolor=KPMG_TEAL,
            facecolor=KPMG_TEAL_TINT,
            zorder=3,
        )
    )
    axis.text(legend_x + 0.55, y, "Decision", fontsize=7.5, color=KPMG_NAVY, va="center")


def _legend_terminal(axis: Axes, x: float, y: float) -> None:
    terminal = Ellipse(
        (x, y),
        width=0.38,
        height=0.18,
        linewidth=1.2,
        edgecolor=KPMG_SKY,
        facecolor="white",
        zorder=3,
    )
    setattr(terminal, "_document_uplift_shape", "terminal")
    axis.add_patch(terminal)


def _draw_footer(axis: Axes, spec: SwimlaneSpec, body_right: float, canvas_right: float) -> None:
    panel_y = -0.68
    panel_h = 0.48
    gap = 0.08
    total_width = canvas_right - DIAGRAM_LEFT_X - 0.04
    panel_width = (total_width - gap * 3) / 4
    titles = ["Notes", "Control Summary", "Risk Summary", "Document Information"]
    for index, title in enumerate(titles):
        x = DIAGRAM_LEFT_X + 0.02 + index * (panel_width + gap)
        axis.add_patch(
            FancyBboxPatch(
                (x, panel_y),
                panel_width,
                panel_h,
                boxstyle="round,pad=0.02,rounding_size=0.025",
                linewidth=0.8,
                edgecolor="#AAB7C8",
                facecolor="white",
                zorder=2,
            )
        )
        axis.text(
            x + 0.12,
            panel_y + panel_h - 0.13,
            title,
            fontsize=8.5,
            fontweight="bold",
            color=KPMG_NAVY,
            ha="left",
            va="center",
            zorder=3,
        )
    axis.text(
        DIAGRAM_LEFT_X + 0.14,
        panel_y + 0.16,
        "Diagram reflects the current reviewed SOP state.",
        fontsize=6.8,
        color="#5A6478",
        ha="left",
        va="center",
        zorder=3,
    )
    cursor_x = DIAGRAM_LEFT_X + 0.02
    legend_y = -0.82
    legend_right = canvas_right - 0.2
    for lane in spec.lanes:
        item_width = min(max(1.25, 0.08 * len(lane.label) + 0.45), 2.25)
        if cursor_x + item_width > legend_right:
            cursor_x = DIAGRAM_LEFT_X + 0.02
            legend_y -= 0.16
        axis.add_patch(
            Rectangle(
                (cursor_x, legend_y - 0.07),
                0.13,
                0.13,
                facecolor=lane.colour_hex,
                alpha=0.85,
                zorder=4,
            )
        )
        axis.text(
            cursor_x + 0.18,
            legend_y,
            _wrapped(lane.label, 28, max_lines=1),
            fontsize=6.8,
            color="#5A6478",
            ha="left",
            va="center",
            zorder=4,
        )
        cursor_x += item_width


def _wrapped(text: str, width: int, max_lines: int = 3) -> str:
    lines = wrap(str(text), width=width) or [str(text)]
    return "\n".join(lines[:max_lines])


def _ellipsize(text: str, max_chars: int) -> str:
    cleaned = " ".join(str(text or "").split())
    if len(cleaned) <= max_chars:
        return cleaned
    return f"{cleaned[: max_chars - 3].rstrip()}..."
