"""Transport-neutral schemas for tools and read-only graph views."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.geometry.models import EvaluatedValue, GeometryDocument, GeometryModel, GeometryObject


class GraphObjectView(GeometryModel):
    object: GeometryObject
    parent_ids: tuple[str, ...]
    value: EvaluatedValue


class GraphView(GeometryModel):
    document_id: str
    revision: int = Field(ge=0)
    objects: tuple[GraphObjectView, ...]
    id_map: dict[str, int]
    label_map: dict[str, str]


class ToolDescriptor(GeometryModel):
    name: str
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    mutates_geometry_state: bool


class ExecuteToolRequest(GeometryModel):
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ExecuteToolResponse(GeometryModel):
    tool_name: str
    mutates_geometry_state: bool
    output: dict[str, Any]


class EmptyToolInput(GeometryModel):
    pass


class CreatePointInput(GeometryModel):
    object_id: str
    label: str | None = None
    x: float
    y: float


class TwoPointConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    point_a: str
    point_b: str


class CircleConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    center: str
    point: str


class PointLineConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    point: str
    line: str


class LineLineIntersectionInput(GeometryModel):
    object_id: str
    label: str | None = None
    line_a: str
    line_b: str


class CircleLineIntersectionInput(GeometryModel):
    object_id: str
    label: str | None = None
    circle: str
    line: str
    selector: Literal["first", "second", "left", "right"]


class CircleCircleIntersectionInput(GeometryModel):
    object_id: str
    label: str | None = None
    circle_a: str
    circle_b: str
    selector: Literal["upper", "lower", "left", "right"]


class ThreePointConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    point_a: str
    point_b: str
    point_c: str


class PolygonConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    point_ids: list[str]


class RegularPolygonConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    point_a: str
    point_b: str
    sides: int


class VectorPolygonConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    anchor: str
    offsets: list[dict[str, float]]


class ValidateConstructionInput(GeometryModel):
    document: GeometryDocument | None = None


class EvaluateScriptToolInput(GeometryModel):
    script: str = Field(min_length=1)
    document_id: str = "script_document"
    title: str = "Script construction"


class MutationToolOutput(GeometryModel):
    revision: int
    created_object: GeometryObject
    graph: GraphView


class ValidationToolOutput(GeometryModel):
    valid: bool
    revision: int
    graph: GraphView


class EvaluateScriptToolOutput(GeometryModel):
    revision: int
    document: GeometryDocument
    graph: GraphView


class GetGraphToolOutput(GeometryModel):
    graph: GraphView
