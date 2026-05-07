from __future__ import annotations

from io import BytesIO
from textwrap import wrap
from typing import Any

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.axes import Axes
from matplotlib.figure import Figure
from matplotlib.patches import Circle, FancyArrowPatch, FancyBboxPatch, Polygon, Rectangle

from utils.services.schemas import SwimlaneSpec, SwimlaneStep


LANE_LABEL_X = -0.82
STEP_WIDTH = 0.82
STEP_HEIGHT = 0.42
KPMG_NAVY = "#0C233C"
KPMG_AMBER = "#EAAA00"


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
    figure_width = max(10.5, step_count * 1.1)
    figure_height = max(5.5, lane_count * 1.15 + 1.5)
    figure, axis = plt.subplots(figsize=(figure_width, figure_height))
    axis.set_facecolor("white")
    axis.set_xlim(-1.25, step_count + 0.7)
    axis.set_ylim(0.15, lane_count + 1.0)
    axis.axis("off")

    axis.text(
        -1.12,
        lane_count + 0.72,
        spec.title,
        fontsize=16,
        fontweight="bold",
        color=KPMG_NAVY,
        va="center",
    )
    _draw_lanes(axis, spec, layout["lane_y"])
    _draw_edges(axis, spec, layout["positions"])
    _draw_steps(axis, spec, layout["positions"])
    _draw_legend(axis, spec)
    figure.tight_layout()
    return figure, axis


def close_figure(figure: Figure) -> None:
    plt.close(figure)


def _layout(spec: SwimlaneSpec) -> dict[str, dict[str, tuple[float, float]] | dict[str, float]]:
    lane_y: dict[str, float] = {}
    for index, lane in enumerate(spec.lanes):
        lane_y[lane.lane_id] = len(spec.lanes) - index

    positions: dict[str, tuple[float, float]] = {}
    for index, step in enumerate(spec.steps):
        positions[step.step_id] = (
            index + 0.55,
            lane_y.get(step.lane_id, 1.0),
        )
    return {"lane_y": lane_y, "positions": positions}


def _draw_lanes(axis: Axes, spec: SwimlaneSpec, lane_y: dict[str, float]) -> None:
    for lane in spec.lanes:
        y = lane_y[lane.lane_id]
        axis.axhspan(y - 0.45, y + 0.45, color=lane.colour_hex, alpha=0.13, zorder=0)
        axis.add_patch(
            Rectangle(
                (-1.18, y - 0.45),
                0.58,
                0.9,
                facecolor=KPMG_NAVY,
                edgecolor=KPMG_NAVY,
                linewidth=0,
                zorder=1,
            )
        )
        axis.text(
            LANE_LABEL_X,
            y,
            _wrapped(lane.label, 14),
            fontsize=9,
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
        boxstyle="round,pad=0.06,rounding_size=0.04",
        linewidth=1.5,
        edgecolor=lane_colour,
        facecolor="white",
        zorder=4,
    )
    axis.add_patch(patch)
    axis.text(
        x,
        y,
        _wrapped(step.label, 18),
        fontsize=8,
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
            (x, y + STEP_HEIGHT / 1.15),
            (x + STEP_WIDTH / 1.55, y),
            (x, y - STEP_HEIGHT / 1.15),
            (x - STEP_WIDTH / 1.55, y),
        ],
        closed=True,
        linewidth=1.5,
        edgecolor=KPMG_NAVY,
        facecolor="#FFFBEB",
        zorder=4,
    )
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
    circle = Circle(
        (x, y),
        radius=0.24,
        facecolor=KPMG_NAVY if step.step_type == "start" else "white",
        edgecolor=KPMG_NAVY,
        linewidth=1.5,
        zorder=4,
    )
    axis.add_patch(circle)
    if step.step_type == "end":
        axis.add_patch(Circle((x, y), radius=0.14, facecolor=KPMG_NAVY, edgecolor=KPMG_NAVY, zorder=5))
    axis.text(
        x,
        y,
        _wrapped(step.label, 10),
        fontsize=7.5,
        color="white" if step.step_type == "start" else KPMG_NAVY,
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
    for step in spec.steps:
        start = positions.get(step.step_id)
        if not start:
            continue
        for next_step_id in step.next_steps:
            end = positions.get(next_step_id)
            if not end:
                continue
            arrow = _arrow_between(start, end)
            setattr(arrow, "_document_uplift_from", step.step_id)
            axis.add_patch(arrow)
            branch_label = step_by_id[step.step_id].branch_labels.get(next_step_id)
            if branch_label:
                mid_x = (start[0] + end[0]) / 2
                mid_y = (start[1] + end[1]) / 2
                axis.text(
                    mid_x,
                    mid_y + 0.16,
                    branch_label,
                    fontsize=8,
                    fontweight="bold",
                    color=KPMG_NAVY,
                    ha="center",
                    va="center",
                    zorder=6,
                )


def _arrow_between(
    start: tuple[float, float],
    end: tuple[float, float],
) -> FancyArrowPatch:
    start_x, start_y = start
    end_x, end_y = end
    dx = end_x - start_x
    dy = end_y - start_y
    if abs(dx) >= abs(dy):
        offset_start = (0.46 if dx >= 0 else -0.46, 0)
        offset_end = (-0.46 if dx >= 0 else 0.46, 0)
    else:
        offset_start = (0, -0.28 if dy < 0 else 0.28)
        offset_end = (0, 0.28 if dy < 0 else -0.28)
    return FancyArrowPatch(
        (start_x + offset_start[0], start_y + offset_start[1]),
        (end_x + offset_end[0], end_y + offset_end[1]),
        arrowstyle="-|>",
        mutation_scale=13,
        linewidth=1.2,
        color=KPMG_NAVY,
        connectionstyle="arc3,rad=0.0",
        zorder=3,
    )


def _draw_legend(axis: Axes, spec: SwimlaneSpec) -> None:
    legend_y = 0.42
    cursor_x = -1.08
    for lane in spec.lanes:
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
            lane.label,
            fontsize=8,
            color="#5A6478",
            ha="left",
            va="center",
            zorder=4,
        )
        cursor_x += max(1.15, 0.12 * len(lane.label))


def _wrapped(text: str, width: int) -> str:
    lines = wrap(str(text), width=width) or [str(text)]
    return "\n".join(lines[:3])
