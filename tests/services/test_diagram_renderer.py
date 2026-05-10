from __future__ import annotations

import warnings

from pyparsing import PyparsingDeprecationWarning

warnings.filterwarnings("ignore", category=PyparsingDeprecationWarning)

from matplotlib.colors import to_rgba
from matplotlib.patches import Ellipse, FancyArrowPatch, FancyBboxPatch, Polygon, Rectangle

from utils.services.schemas import SwimlaneLane, SwimlaneSpec, SwimlaneStep
from utils.sop_processing import diagram_renderer


def _spec() -> SwimlaneSpec:
    return SwimlaneSpec(
        title="Access review process swimlane",
        process_owner="Access Governance Lead",
        document_name="Access Review SOP",
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
        labels = {text.get_text().replace("\n", " ") for text in axis.texts}
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


def test_connectors_are_orthogonal_not_diagonal() -> None:
    figure, axis = diagram_renderer.build_figure(_spec())
    try:
        arrows = [
            patch
            for patch in axis.patches
            if isinstance(patch, FancyArrowPatch)
            and getattr(patch, "_document_uplift_points", None)
        ]
        assert arrows
        for arrow in arrows:
            points = getattr(arrow, "_document_uplift_points")
            for start, end in zip(points, points[1:]):
                same_x = abs(start[0] - end[0]) < 0.001
                same_y = abs(start[1] - end[1]) < 0.001
                assert same_x or same_y
    finally:
        diagram_renderer.close_figure(figure)


def test_renderer_uses_reference_flowchart_shape_styles() -> None:
    figure, axis = diagram_renderer.build_figure(_spec())
    try:
        process_steps = [
            patch
            for patch in axis.patches
            if isinstance(patch, FancyBboxPatch)
            and abs(patch.get_width() - diagram_renderer.STEP_WIDTH) < 0.001
            and abs(patch.get_height() - diagram_renderer.STEP_HEIGHT) < 0.001
        ]
        diamonds = [
            patch
            for patch in axis.patches
            if isinstance(patch, Polygon)
            and getattr(patch, "_document_uplift_shape", None) == "decision"
        ]

        assert process_steps
        assert all(patch.get_edgecolor() == to_rgba(diagram_renderer.KPMG_NAVY) for patch in process_steps)
        assert diamonds
        assert all(patch.get_edgecolor() == to_rgba("#008B95") for patch in diamonds)
        assert all(patch.get_facecolor() == to_rgba("#E6F7F8") for patch in diamonds)
    finally:
        diagram_renderer.close_figure(figure)


def test_terminals_render_as_oval_flowchart_symbols() -> None:
    figure, axis = diagram_renderer.build_figure(_spec())
    try:
        terminal_shapes = [
            patch
            for patch in axis.patches
            if type(patch) is Ellipse
            and getattr(patch, "_document_uplift_shape", None) == "terminal"
        ]

        assert len(terminal_shapes) >= 2
        assert all(patch.width > patch.height for patch in terminal_shapes)
    finally:
        diagram_renderer.close_figure(figure)


def test_header_uses_swimlane_metadata_without_hardcoded_document_text() -> None:
    figure, axis = diagram_renderer.build_figure(_spec())
    try:
        labels = {text.get_text() for text in axis.texts}

        assert "Process Owner: Access Governance Lead" in labels
        assert "Document: Access Review SOP" in labels
        assert "Document: Current reviewed SOP" not in labels
    finally:
        diagram_renderer.close_figure(figure)


def test_header_has_no_extra_logo_container_and_clamps_long_metadata() -> None:
    spec = _spec()
    spec.process_owner = "Very Long Global Technology Cyber Operations Risk Committee Accountable Executive Owner"
    spec.document_name = "Very_Long_Primary_Procedure_Document_Name_For_Enterprise_Cyber_Operations_Review_v12.3.docx"
    figure, axis = diagram_renderer.build_figure(spec)
    try:
        logo_boxes = [
            patch
            for patch in axis.patches
            if isinstance(patch, FancyBboxPatch)
            and abs(patch.get_width() - 2.08) < 0.01
            and abs(patch.get_height() - 0.4) < 0.01
        ]
        metadata = [
            text
            for text in axis.texts
            if text.get_text().startswith(("Process Owner:", "Document:"))
        ]
        right_limit = axis.get_xlim()[1]

        assert not logo_boxes
        assert metadata
        assert all(text.get_ha() == "right" for text in metadata)
        assert all(text.get_position()[0] <= right_limit - 0.1 for text in metadata)
        assert any("..." in text.get_text() for text in metadata)
    finally:
        diagram_renderer.close_figure(figure)


def test_action_connector_endpoints_touch_box_boundaries() -> None:
    spec = _spec()
    layout = diagram_renderer._layout(spec)
    figure, axis = diagram_renderer.build_figure(spec)
    try:
        arrow = next(
            patch
            for patch in axis.patches
            if isinstance(patch, FancyArrowPatch)
            and getattr(patch, "_document_uplift_from", None) == "extract"
            and getattr(patch, "_document_uplift_to", None) == "review"
        )
        points = getattr(arrow, "_document_uplift_points")
        extract_x, extract_y = layout["positions"]["extract"]
        review_x, review_y = layout["positions"]["review"]

        assert points[0] == (extract_x + diagram_renderer.STEP_WIDTH / 2, extract_y)
        assert points[-1] == (review_x - diagram_renderer.STEP_WIDTH / 2, review_y)
    finally:
        diagram_renderer.close_figure(figure)


def test_decision_branches_exit_different_vertices() -> None:
    figure, axis = diagram_renderer.build_figure(_spec())
    try:
        exception_arrows = [
            patch
            for patch in axis.patches
            if isinstance(patch, FancyArrowPatch)
            and getattr(patch, "_document_uplift_from", None) == "exception"
        ]
        start_points = {
            getattr(arrow, "_document_uplift_points")[0]
            for arrow in exception_arrows
        }

        assert len(exception_arrows) == 2
        assert len(start_points) == 2
    finally:
        diagram_renderer.close_figure(figure)


def test_renderer_includes_shape_legend_without_footer_panels() -> None:
    figure, axis = diagram_renderer.build_figure(_spec())
    try:
        labels = {text.get_text() for text in axis.texts}
        assert {"Start / End", "Process Step", "Decision"} <= labels
        assert {"Legend", "Shapes"} <= labels
        assert {"Notes", "Control Summary", "Risk Summary", "Document Information"}.isdisjoint(labels)
    finally:
        diagram_renderer.close_figure(figure)


def test_renderer_does_not_render_lane_colour_footer_legend() -> None:
    spec = SwimlaneSpec(
        title="Cross-domain process swimlane",
        lanes=[
            SwimlaneLane(lane_id=f"lane-{index}", label=f"Very long cross-domain accountable team {index}", colour_hex="#1E49E2")
            for index in range(1, 9)
        ],
        steps=[
            SwimlaneStep(
                step_id="start",
                lane_id="lane-1",
                label="Start",
                step_type="start",
                next_steps=[],
            )
        ],
    )
    figure, axis = diagram_renderer.build_figure(spec)
    try:
        assert all(text.get_position()[1] >= 0.2 for text in axis.texts)
    finally:
        diagram_renderer.close_figure(figure)


def test_long_lane_labels_have_left_margin_and_are_not_truncated() -> None:
    spec = SwimlaneSpec(
        title="Cross-domain process swimlane",
        lanes=[
            SwimlaneLane(
                lane_id="owner",
                label="Investment Advisor / Relationship Manager (IA/RM)",
                colour_hex="#1E49E2",
            ),
        ],
        steps=[
            SwimlaneStep(
                step_id="start",
                lane_id="owner",
                label="Start",
                step_type="start",
                next_steps=[],
            )
        ],
    )

    figure, axis = diagram_renderer.build_figure(spec)
    try:
        lane_label = next(
            text.get_text()
            for text in axis.texts
            if "Investment" in text.get_text()
        )
        lane_bands = [
            patch
            for patch in axis.patches
            if isinstance(patch, Rectangle) and patch.get_width() > 0.5
        ]
        left_limit = axis.get_xlim()[0]
        leftmost_band_x = min(patch.get_x() for patch in lane_bands)

        assert "Manager" in lane_label
        assert leftmost_band_x - left_limit >= 0.15
    finally:
        diagram_renderer.close_figure(figure)
