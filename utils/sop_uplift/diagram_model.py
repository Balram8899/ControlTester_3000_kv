from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


NodeType = Literal["activity", "decision", "approval", "control", "risk", "evidence", "handoff"]


class DiagramLane(BaseModel):
    lane_id: str
    name: str
    order: int = 1


class DiagramNode(BaseModel):
    node_id: str
    lane_id: str
    type: NodeType = "activity"
    label: str
    description: str = ""
    source_anchor_ids: list[str] = Field(default_factory=list)
    linked_control_ids: list[str] = Field(default_factory=list)
    linked_risk_ids: list[str] = Field(default_factory=list)


class DiagramEdge(BaseModel):
    edge_id: str
    from_node_id: str
    to_node_id: str
    label: str = ""


class DiagramModel(BaseModel):
    title: str
    case_title: str = ""
    process_name: str = ""
    lanes: list[DiagramLane] = Field(default_factory=list)
    nodes: list[DiagramNode] = Field(default_factory=list)
    edges: list[DiagramEdge] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
