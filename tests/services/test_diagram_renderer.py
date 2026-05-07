from __future__ import annotations

import warnings

from pyparsing import PyparsingDeprecationWarning

warnings.filterwarnings("ignore", category=PyparsingDeprecationWarning)

from matplotlib.patches import FancyArrowPatch

from utils.services.schemas import SwimlaneLane, SwimlaneSpec, SwimlaneStep
from utils.sop_processing import diagram_renderer


def _spec() -> SwimlaneSpec:
    return SwimlaneSpec(
        title="Access review process swimlane",
        lanes=[
            SwimlaneLane(lane_id="business", label="Business owner", colour_hex="#1E49E2"),
            SwimlaneLane(lane_id="risk", label="Operations risk", colour_hex="#098E7E"),
            SwimlaneLane(lane_id="compliance", label="Compliance", colour_hex="#7213EA"),
            SwimlaneLane(lane_id="testing", label="Control testing", colour_hex="#EAAA00"),
        ],
        steps=[
            SwimlaneStep(
                step_id="start",
                lane_id="business",
                label="Start",
                step_type="start",
                next_steps=["extract"],
            ),
            SwimlaneStep(
                step_id="extract",
                lane_id="business",
                label="Extract users",
                step_type="action",
                next_steps=["review"],
            ),
            SwimlaneStep(
                step_id="review",
                lane_id="business",
                label="Review access",
                step_type="action",
                next_steps=["exception"],
            ),
            SwimlaneStep(
                step_id="exception",
                lane_id="business",
                label="Exception?",
                step_type="decision",
                next_steps=["approve", "review_exception"],
                branch_labels={"approve": "No", "review_exception": "Yes"},
            ),
            SwimlaneStep(
                step_id="approve",
                lane_id="business",
                label="Approve",
                step_type="action",
                next_steps=["end"],
            ),
            SwimlaneStep(
                step_id="review_exception",
                lane_id="risk",
                label="Review exception",
                step_type="action",
                next_steps=["retain"],
            ),
            SwimlaneStep(
                step_id="retain",
                lane_id="compliance",
                label="Retain evidence",
                step_type="action",
                next_steps=["repository"],
            ),
            SwimlaneStep(
                step_id="repository",
                lane_id="compliance",
                label="Evidence repository",
                step_type="action",
                next_steps=["testing"],
            ),
            SwimlaneStep(
                step_id="testing",
                lane_id="testing",
                label="Perform control testing",
                step_type="action",
                next_steps=[],
            ),
            SwimlaneStep(
                step_id="end",
                lane_id="business",
                label="End",
                step_type="end",
                next_steps=[],
            ),
        ],
    )


def test_render_returns_nonempty_bytes() -> None:
    png_bytes, pdf_bytes = diagram_renderer.render(_spec())

    assert len(png_bytes) > 1000
    assert len(pdf_bytes) > 1000


def test_render_produces_valid_png_header() -> None:
    png_bytes, _pdf_bytes = diagram_renderer.render(_spec())

    assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"


def test_all_lanes_rendered() -> None:
    figure, axis = diagram_renderer.build_figure(_spec())
    try:
        labels = {text.get_text() for text in axis.texts}
        assert {"Business owner", "Operations risk", "Compliance", "Control testing"} <= labels
    finally:
        diagram_renderer.close_figure(figure)


def test_decision_step_has_two_arrows() -> None:
    figure, axis = diagram_renderer.build_figure(_spec())
    try:
        arrow_count = sum(
            1
            for patch in axis.patches
            if isinstance(patch, FancyArrowPatch)
            and getattr(patch, "_document_uplift_from", None) == "exception"
        )
        labels = {text.get_text() for text in axis.texts}
        assert arrow_count == 2
        assert {"Yes", "No"} <= labels
    finally:
        diagram_renderer.close_figure(figure)
