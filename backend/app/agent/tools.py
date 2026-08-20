"""Deterministic geometry tools exposed through the agent registry."""

from __future__ import annotations

import base64
from collections.abc import Callable
from math import atan2

from pydantic import BaseModel

from app.agent.models import (
    AngleConstructionInput,
    AreaConstructionInput,
    CircleCircleIntersectionInput,
    CircleConstructionInput,
    CircleLineIntersectionInput,
    CreatePointInput,
    CreatePointOnObjectInput,
    EmptyToolInput,
    EvaluateScriptToolInput,
    EvaluateScriptToolOutput,
    ExportJsonOutput,
    ExportPngOutput,
    ExportSvgOutput,
    FunctionConstructionInput,
    GetGraphToolOutput,
    GraphObjectView,
    GraphView,
    HomothetyConstructionInput,
    InversionConstructionInput,
    LineLineIntersectionInput,
    MutationToolOutput,
    PointLineConstructionInput,
    PolygonConstructionInput,
    PolygonVertexConstructionInput,
    RegularPolygonConstructionInput,
    RotationConstructionInput,
    SliderConstructionInput,
    SlopeConstructionInput,
    SourceLineConstructionInput,
    SourcePointConstructionInput,
    TangentConstructionInput,
    ThreePointConstructionInput,
    TranslationConstructionInput,
    TwoPointConstructionInput,
    ValidateConstructionInput,
    ValidationToolOutput,
    VectorPolygonConstructionInput,
)
from app.agent.registry import ToolDefinition, ToolExecutionError, ToolRegistry
from app.geometry.engine import GeometryGraph, infer_inversion_result_kind
from app.geometry.function_expression import normalize_function_expression
from app.geometry.rendering import render_graph_png, render_graph_svg
from app.geometry.models import (
    AngleMeasureDefinition,
    AreaMeasureDefinition,
    AngleBisectorDefinition,
    AngleBisectorLine,
    Arc,
    ArcThroughPointsDefinition,
    ArcValue,
    Circle,
    CircleByCenterPointDefinition,
    CircleValue,
    CircumscribedCircle,
    CircumscribedDefinition,
    Coordinate,
    DistanceMeasureDefinition,
    FunctionExpressionDefinition,
    FunctionGraph,
    GeometryDocument,
    GeometryObject,
    HomothetyScalar,
    HomothetyScalarDefinition,
    IntersectionCC,
    IntersectionCCDefinition,
    IntersectionLC,
    IntersectionLCDefinition,
    IntersectionLL,
    IntersectionLLDefinition,
    InversionInCircle,
    InversionInCircleDefinition,
    Line,
    LineThroughPointsDefinition,
    Measure,
    Midpoint,
    MidpointDefinition,
    ParallelLine,
    ParallelLineDefinition,
    PerpendicularBisectorDefinition,
    PerpendicularBisectorLine,
    PerpendicularLine,
    PerpendicularLineDefinition,
    Point,
    PointOnArc,
    PointOnArcDefinition,
    PointOnCircle,
    PointOnCircleDefinition,
    PointOnLine,
    PointOnLineDefinition,
    PointOnSegment,
    PointOnSegmentDefinition,
    Polygon,
    PolygonDefinition,
    PolygonValue,
    PolygonVertexDefinition,
    PolygonVertexPoint,
    ReflectionOverLine,
    ReflectionOverLineDefinition,
    ReflectionOverPoint,
    ReflectionOverPointDefinition,
    RegularPolygonDefinition,
    RotatedObject,
    RotationDefinition,
    Segment,
    SegmentBetweenPointsDefinition,
    SegmentValue,
    Slider,
    SliderDefinition,
    SlopeMeasureDefinition,
    TangentFromPoint,
    TangentPointCircleDefinition,
    TranslatedObject,
    TranslationDefinition,
    UndefinedValue,
    VectorPolygonDefinition,
)
from app.geometry.script import ConstructionScriptError, evaluate_script
from app.geometry.workspace import (
    GeometryWorkspace,
    GraphAccessMap,
    GraphObjectAccess,
    build_graph_access_map,
)


def graph_view_from_access_map(access_map: GraphAccessMap) -> GraphView:
    """Convert immutable internal indexes to a detached transport snapshot."""

    nodes = tuple(access_map.by_id.values())
    return GraphView(
        document_id=access_map.document_id,
        revision=access_map.revision,
        objects=tuple(_node_view(node) for node in nodes),
        id_map={node.object.id: index for index, node in enumerate(nodes)},
        label_map=dict(access_map.id_by_label),
    )


def _create_slider(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = SliderConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    obj = Slider(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=SliderDefinition(
            min=input_model.min,
            max=input_model.max,
            value=input_model.value,
            step=input_model.step,
        ),
    )
    return _commit(workspace, obj)


def _create_distance(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = TwoPointConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    point_a = _resolve_kind(access, input_model.point_a, "point")
    point_b = _resolve_kind(access, input_model.point_b, "point")
    obj = Measure(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=DistanceMeasureDefinition(point_a=point_a.object.id, point_b=point_b.object.id),
    )
    return _commit_defined(workspace, obj)


def _create_angle(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = AngleConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    point_a = _resolve_kind(access, input_model.point_a, "point")
    vertex = _resolve_kind(access, input_model.vertex, "point")
    point_b = _resolve_kind(access, input_model.point_b, "point")
    obj = Measure(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=AngleMeasureDefinition(
            point_a=point_a.object.id,
            vertex=vertex.object.id,
            point_b=point_b.object.id,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_area(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = AreaConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    polygon = _resolve_kind(access, input_model.polygon, "polygon")
    obj = Measure(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=AreaMeasureDefinition(polygon=polygon.object.id),
    )
    return _commit_defined(workspace, obj)


def _create_slope(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = SlopeConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    line = _resolve_kind(access, input_model.line, "line")
    obj = Measure(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=SlopeMeasureDefinition(line=line.object.id),
    )
    return _commit_defined(workspace, obj)


def _create_point_on_object(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = CreatePointOnObjectInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    try:
        parent = access.resolve(input_model.parent)
    except ValueError as error:
        raise ToolExecutionError(str(error)) from error
    label = input_model.label or input_model.object_id

    if parent.object.kind == "line":
        obj = PointOnLine(id=input_model.object_id, label=label, definition=PointOnLineDefinition(line=parent.object.id, t=0.0))
    elif parent.object.kind == "segment":
        obj = PointOnSegment(id=input_model.object_id, label=label, definition=PointOnSegmentDefinition(segment=parent.object.id, t=0.0))
    elif parent.object.kind == "circle":
        obj = PointOnCircle(id=input_model.object_id, label=label, definition=PointOnCircleDefinition(circle=parent.object.id, angle=0.0))
    elif parent.object.kind == "arc":
        arc_value = parent.value
        if isinstance(arc_value, UndefinedValue):
            raise ToolExecutionError(f"Geometry object '{input_model.parent}' is not a well-defined arc")
        assert isinstance(arc_value, ArcValue)
        default_angle = atan2(arc_value.mid.y - arc_value.center.y, arc_value.mid.x - arc_value.center.x)
        obj = PointOnArc(id=input_model.object_id, label=label, definition=PointOnArcDefinition(arc=parent.object.id, angle=default_angle))
    else:
        raise ToolExecutionError(
            f"Geometry object '{input_model.parent}' must be a line, segment, circle, or arc, "
            f"but it is a {parent.object.kind}"
        )
    return _commit_defined(workspace, obj)


def _export_svg(workspace: GeometryWorkspace) -> ExportSvgOutput:
    graph = graph_view_from_access_map(workspace.graph_access_map())
    return ExportSvgOutput(svg=render_graph_svg(graph))


def _export_png(workspace: GeometryWorkspace) -> ExportPngOutput:
    graph = graph_view_from_access_map(workspace.graph_access_map())
    return ExportPngOutput(png_base64=base64.b64encode(render_graph_png(graph)).decode("ascii"))


def _export_json(workspace: GeometryWorkspace) -> ExportJsonOutput:
    document = workspace.document_snapshot()
    return ExportJsonOutput(document_json=document.model_dump_json(by_alias=True, indent=2))


def create_geometry_tool_registry(workspace: GeometryWorkspace) -> ToolRegistry:
    """Create the fixed MVP registry bound to one validated workspace."""

    registry = ToolRegistry()
    registry.register(
        _definition(
            "create_point",
            "Create a free point with validated finite coordinates.",
            CreatePointInput,
            MutationToolOutput,
            True,
            lambda model: _create_point(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_line",
            "Create a line through two existing points addressed by ID or label.",
            TwoPointConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_two_point(workspace, model, "line"),
        )
    )
    registry.register(
        _definition(
            "create_segment",
            "Create a segment between two existing points.",
            TwoPointConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_two_point(workspace, model, "segment"),
        )
    )
    registry.register(
        _definition(
            "create_circle",
            "Create a circle from an existing center point and through-point.",
            CircleConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_circle(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_midpoint",
            "Create the midpoint of two existing points.",
            TwoPointConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_two_point(workspace, model, "midpoint"),
        )
    )
    registry.register(
        _definition(
            "create_parallel_line",
            "Create a line through a point parallel to an existing line.",
            PointLineConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_point_line(workspace, model, "parallel"),
        )
    )
    registry.register(
        _definition(
            "create_perpendicular_line",
            "Create a line through a point perpendicular to an existing line.",
            PointLineConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_point_line(workspace, model, "perpendicular"),
        )
    )
    registry.register(
        _definition(
            "create_line_line_intersection",
            "Create the deterministic intersection point of two existing lines.",
            LineLineIntersectionInput,
            MutationToolOutput,
            True,
            lambda model: _create_line_line_intersection(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_circle_line_intersection",
            "Create one selected intersection of an existing circle and line.",
            CircleLineIntersectionInput,
            MutationToolOutput,
            True,
            lambda model: _create_circle_line_intersection(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_tangent",
            "Create one tangent line from a point to a circle, selected by first, second, left, or right.",
            TangentConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_tangent(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_circle_circle_intersection",
            "Create one directionally selected intersection of two existing circles.",
            CircleCircleIntersectionInput,
            MutationToolOutput,
            True,
            lambda model: _create_circle_circle_intersection(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_perpendicular_bisector",
            "Create the perpendicular bisector of two existing points.",
            TwoPointConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_perpendicular_bisector(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_angle_bisector",
            "Create the angle bisector through three existing points: arm, vertex, arm.",
            ThreePointConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_angle_bisector(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_circumcircle",
            "Create the circle through three existing non-collinear points.",
            ThreePointConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_circumcircle(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_polygon",
            "Create a basic closed polygon from three or more existing points (in vertex order).",
            PolygonConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_polygon(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_regular_polygon",
            "Create a regular n-gon: provide two adjacent vertices and the number of sides.",
            RegularPolygonConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_regular_polygon(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_vector_polygon",
            "Create a vector polygon from an anchor point and a list of (x, y) offset vectors.",
            VectorPolygonConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_vector_polygon(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_slider",
            "Create a slider parameter (min, max, initial value, step).",
            SliderConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_slider(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_distance",
            "Create a distance measure: the Euclidean distance between two existing points.",
            TwoPointConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_distance(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_angle",
            "Create an angle measure (degrees, 0-180) at a vertex between two existing points.",
            AngleConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_angle(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_area",
            "Create an area measure for an existing polygon (shoelace formula, always non-negative).",
            AreaConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_area(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_slope",
            "Create a slope measure for an existing line (undefined for vertical lines).",
            SlopeConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_slope(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_point_on_object",
            "Create a point constrained to an existing line, segment, circle, or arc.",
            CreatePointOnObjectInput,
            MutationToolOutput,
            True,
            lambda model: _create_point_on_object(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_reflection_over_line",
            "Reflect an existing point/line/segment/circle/polygon over an existing line.",
            SourceLineConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_reflection_over_line(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_reflection_over_point",
            "Reflect an existing point/line/segment/circle/polygon over an existing point.",
            SourcePointConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_reflection_over_point(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_translation",
            "Translate an existing object by the vector from one point to another.",
            TranslationConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_translation(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_rotation",
            "Rotate an existing object around a center point by an angle in degrees.",
            RotationConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_rotation(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_homothety",
            "Scale an existing point from a center by a numeric ratio (homothety).",
            HomothetyConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_homothety(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_inversion",
            "Invert an existing point/line/segment/circle/polygon in an existing circle.",
            InversionConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_inversion(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_arc",
            "Create a circular arc through three existing points: start, mid, end.",
            ThreePointConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_arc(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_function",
            "Create a real-valued function graph y = f(x) from a validated expression.",
            FunctionConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_function(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_polygon_vertex",
            "Create a point bound to the i-th vertex (0-based) of an existing polygon.",
            PolygonVertexConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_polygon_vertex(workspace, model),
        )
    )
    registry.register(
        _definition(
            "validate_construction",
            "Validate a supplied document, or the current graph when omitted, without mutation.",
            ValidateConstructionInput,
            ValidationToolOutput,
            False,
            lambda model: _validate_construction(workspace, model),
        )
    )
    registry.register(
        _definition(
            "evaluate_script",
            "Parse and validate a construction script, then atomically replace the graph.",
            EvaluateScriptToolInput,
            EvaluateScriptToolOutput,
            True,
            lambda model: _evaluate_script(workspace, model),
        )
    )
    registry.register(
        _definition(
            "get_current_graph",
            "Return a safe read-only snapshot indexed by object IDs and labels.",
            EmptyToolInput,
            GetGraphToolOutput,
            False,
            lambda model: GetGraphToolOutput(graph=graph_view_from_access_map(workspace.graph_access_map())),
        )
    )
    registry.register(
        _definition(
            "export_svg",
            "Render the current construction as an SVG image string without mutation.",
            EmptyToolInput,
            ExportSvgOutput,
            False,
            lambda model: _export_svg(workspace),
        )
    )
    registry.register(
        _definition(
            "export_png",
            "Render the current construction as a base64-encoded PNG without mutation.",
            EmptyToolInput,
            ExportPngOutput,
            False,
            lambda model: _export_png(workspace),
        )
    )
    registry.register(
        _definition(
            "export_json",
            "Serialize the current versioned document as pretty-printed JSON without mutation.",
            EmptyToolInput,
            ExportJsonOutput,
            False,
            lambda model: _export_json(workspace),
        )
    )
    return registry


def _definition(
    name: str,
    description: str,
    input_model: type[BaseModel],
    output_model: type[BaseModel],
    mutates: bool,
    handler: Callable[[BaseModel], BaseModel],
) -> ToolDefinition:
    return ToolDefinition(
        name=name,
        description=description,
        input_model=input_model,
        output_model=output_model,
        mutates_geometry_state=mutates,
        handler=handler,
    )


def _create_point(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = CreatePointInput.model_validate(raw_input)
    _ensure_name_available(workspace.graph_access_map(), input_model.object_id, input_model.label)
    obj = Point(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition={"type": "free", "x": input_model.x, "y": input_model.y},
    )
    return _commit(workspace, obj)


def _create_two_point(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
    construction: str,
) -> MutationToolOutput:
    input_model = TwoPointConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    first = _resolve_kind(access, input_model.point_a, "point")
    second = _resolve_kind(access, input_model.point_b, "point")
    common = {"id": input_model.object_id, "label": input_model.label or input_model.object_id}
    if construction == "line":
        obj: GeometryObject = Line(
            **common,
            definition=LineThroughPointsDefinition(point_a=first.object.id, point_b=second.object.id),
        )
    elif construction == "segment":
        obj = Segment(
            **common,
            definition=SegmentBetweenPointsDefinition(
                point_a=first.object.id,
                point_b=second.object.id,
            ),
        )
    else:
        obj = Midpoint(
            **common,
            definition=MidpointDefinition(point_a=first.object.id, point_b=second.object.id),
        )
    return _commit(workspace, obj)


def _create_circle(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = CircleConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    center = _resolve_kind(access, input_model.center, "point")
    point = _resolve_kind(access, input_model.point, "point")
    obj = Circle(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=CircleByCenterPointDefinition(
            center=center.object.id,
            point=point.object.id,
        ),
    )
    return _commit(workspace, obj)


def _create_point_line(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
    construction: str,
) -> MutationToolOutput:
    input_model = PointLineConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    point = _resolve_kind(access, input_model.point, "point")
    line = _resolve_kind(access, input_model.line, "line")
    common = {"id": input_model.object_id, "label": input_model.label or input_model.object_id}
    if construction == "parallel":
        obj: GeometryObject = ParallelLine(
            **common,
            definition=ParallelLineDefinition(point=point.object.id, line=line.object.id),
        )
    else:
        obj = PerpendicularLine(
            **common,
            definition=PerpendicularLineDefinition(point=point.object.id, line=line.object.id),
        )
    return _commit(workspace, obj)


def _create_line_line_intersection(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
) -> MutationToolOutput:
    input_model = LineLineIntersectionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    line_a = _resolve_kind(access, input_model.line_a, "line")
    line_b = _resolve_kind(access, input_model.line_b, "line")
    obj = IntersectionLL(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=IntersectionLLDefinition(line_a=line_a.object.id, line_b=line_b.object.id),
    )
    return _commit_defined(workspace, obj)


def _create_circle_line_intersection(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
) -> MutationToolOutput:
    input_model = CircleLineIntersectionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    circle = _resolve_kind(access, input_model.circle, "circle")
    line = _resolve_kind(access, input_model.line, "line")
    obj = IntersectionLC(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=IntersectionLCDefinition(
            line=line.object.id,
            circle=circle.object.id,
            selector=input_model.selector,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_tangent(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
) -> MutationToolOutput:
    input_model = TangentConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    point = _resolve_kind(access, input_model.point, "point")
    circle = _resolve_kind(access, input_model.circle, "circle")
    obj = TangentFromPoint(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=TangentPointCircleDefinition(
            point=point.object.id,
            circle=circle.object.id,
            selector=input_model.selector,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_circle_circle_intersection(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
) -> MutationToolOutput:
    input_model = CircleCircleIntersectionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    circle_a = _resolve_kind(access, input_model.circle_a, "circle")
    circle_b = _resolve_kind(access, input_model.circle_b, "circle")
    obj = IntersectionCC(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=IntersectionCCDefinition(
            circle_a=circle_a.object.id,
            circle_b=circle_b.object.id,
            selector=input_model.selector,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_perpendicular_bisector(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
) -> MutationToolOutput:
    input_model = TwoPointConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    point_a = _resolve_kind(access, input_model.point_a, "point")
    point_b = _resolve_kind(access, input_model.point_b, "point")
    obj = PerpendicularBisectorLine(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=PerpendicularBisectorDefinition(
            point_a=point_a.object.id,
            point_b=point_b.object.id,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_angle_bisector(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
) -> MutationToolOutput:
    input_model = ThreePointConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    arm_a = _resolve_kind(access, input_model.point_a, "point")
    vertex = _resolve_kind(access, input_model.point_b, "point")
    arm_b = _resolve_kind(access, input_model.point_c, "point")
    obj = AngleBisectorLine(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=AngleBisectorDefinition(
            arm_a=arm_a.object.id,
            vertex=vertex.object.id,
            arm_b=arm_b.object.id,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_circumcircle(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
) -> MutationToolOutput:
    input_model = ThreePointConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    point_a = _resolve_kind(access, input_model.point_a, "point")
    point_b = _resolve_kind(access, input_model.point_b, "point")
    point_c = _resolve_kind(access, input_model.point_c, "point")
    obj = CircumscribedCircle(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=CircumscribedDefinition(
            point_a=point_a.object.id,
            point_b=point_b.object.id,
            point_c=point_c.object.id,
        ),
    )
    return _commit_defined(workspace, obj)


def _validate_construction(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
) -> ValidationToolOutput:
    input_model = ValidateConstructionInput.model_validate(raw_input)
    document = input_model.document or workspace.document_snapshot()
    GeometryGraph(document)
    access = build_graph_access_map(document, revision=workspace.revision)
    return ValidationToolOutput(
        valid=True,
        revision=workspace.revision,
        graph=graph_view_from_access_map(access),
    )


def _evaluate_script(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
) -> EvaluateScriptToolOutput:
    input_model = EvaluateScriptToolInput.model_validate(raw_input)
    try:
        document, _ = evaluate_script(
            input_model.script,
            document_id=input_model.document_id,
            title=input_model.title,
        )
    except ConstructionScriptError as error:
        diagnostic = error.diagnostic
        raise ToolExecutionError(
            f"Line {diagnostic.line}, column {diagnostic.column}: {diagnostic.message}"
        ) from error
    access = workspace.replace_document(document)
    return EvaluateScriptToolOutput(
        revision=access.revision,
        document=workspace.document_snapshot(),
        graph=graph_view_from_access_map(access),
    )


def _create_polygon(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
) -> MutationToolOutput:
    input_model = PolygonConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    if len(input_model.point_ids) < 3:
        raise ToolExecutionError("A polygon requires at least 3 vertex points")
    point_ids = [_resolve_kind(access, pid, "point").object.id for pid in input_model.point_ids]
    obj = Polygon(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=PolygonDefinition(point_ids=point_ids),
    )
    return _commit_defined(workspace, obj)


def _create_regular_polygon(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
) -> MutationToolOutput:
    input_model = RegularPolygonConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    if input_model.sides < 3:
        raise ToolExecutionError("A regular polygon requires at least 3 sides")
    point_a = _resolve_kind(access, input_model.point_a, "point")
    point_b = _resolve_kind(access, input_model.point_b, "point")
    obj = Polygon(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=RegularPolygonDefinition(
            point_a=point_a.object.id,
            point_b=point_b.object.id,
            sides=input_model.sides,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_vector_polygon(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
) -> MutationToolOutput:
    input_model = VectorPolygonConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    anchor = _resolve_kind(access, input_model.anchor, "point")
    if len(input_model.offsets) < 2:
        raise ToolExecutionError("A vector polygon requires at least 2 offset vectors")
    offsets = [Coordinate(x=o["x"], y=o["y"]) for o in input_model.offsets]
    obj = Polygon(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=VectorPolygonDefinition(anchor=anchor.object.id, offsets=offsets),
    )
    return _commit_defined(workspace, obj)


def _create_reflection_over_line(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = SourceLineConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    source = _resolve_transformable(access, input_model.source)
    line = _resolve_kind(access, input_model.line, "line")
    obj = ReflectionOverLine(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        kind=source.object.kind,
        definition=ReflectionOverLineDefinition(object_id=source.object.id, line=line.object.id),
    )
    return _commit_defined(workspace, obj)


def _create_reflection_over_point(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = SourcePointConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    source = _resolve_transformable(access, input_model.source)
    center = _resolve_kind(access, input_model.center, "point")
    obj = ReflectionOverPoint(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        kind=source.object.kind,
        definition=ReflectionOverPointDefinition(object_id=source.object.id, center=center.object.id),
    )
    return _commit_defined(workspace, obj)


def _create_translation(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = TranslationConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    source = _resolve_transformable(access, input_model.source)
    from_point = _resolve_kind(access, input_model.from_point, "point")
    to_point = _resolve_kind(access, input_model.to_point, "point")
    obj = TranslatedObject(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        kind=source.object.kind,
        definition=TranslationDefinition(
            object_id=source.object.id,
            from_=from_point.object.id,
            to=to_point.object.id,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_rotation(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = RotationConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    source = _resolve_transformable(access, input_model.source)
    center = _resolve_kind(access, input_model.center, "point")
    obj = RotatedObject(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        kind=source.object.kind,
        definition=RotationDefinition(
            object_id=source.object.id,
            center=center.object.id,
            degrees=input_model.degrees,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_homothety(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = HomothetyConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    center = _resolve_kind(access, input_model.center, "point")
    point = _resolve_kind(access, input_model.point, "point")
    obj = HomothetyScalar(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        kind=point.object.kind,
        definition=HomothetyScalarDefinition(
            center=center.object.id,
            point=point.object.id,
            ratio=input_model.ratio,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_inversion(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = InversionConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    circle = _resolve_kind(access, input_model.circle, "circle")
    if isinstance(circle.value, UndefinedValue):
        raise ToolExecutionError(f"Geometry object '{input_model.circle}' is not a well-defined circle")
    assert isinstance(circle.value, CircleValue)
    source = _resolve_transformable(access, input_model.source)

    if source.object.kind == "polygon":
        return _create_polygon_inversion(workspace, input_model, source, circle)

    declared_kind = infer_inversion_result_kind(source.value, circle.value)
    if declared_kind is None:
        raise ToolExecutionError(f"Geometry object '{input_model.source}' cannot be inverted")
    obj = InversionInCircle(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        kind=declared_kind,
        definition=InversionInCircleDefinition(object_id=source.object.id, circle=circle.object.id),
    )
    return _commit_defined(workspace, obj)


def _next_object_id(objects: list[GeometryObject], prefix: str) -> str:
    occupied = {obj.id for obj in objects} | {obj.label for obj in objects}
    index = 1
    while f"{prefix}{index}" in occupied:
        index += 1
    return f"{prefix}{index}"


def _polygon_vertex_ids(
    document: GeometryDocument, polygon: GeometryObject
) -> tuple[list[str], list[GeometryObject]]:
    if polygon.definition.type == "polygon":
        return list(polygon.definition.point_ids), []
    value = GeometryGraph(document).values[polygon.id]
    if not isinstance(value, PolygonValue):
        raise ToolExecutionError(f"Unable to evaluate vertices of polygon '{polygon.id}'")
    vertex_ids: list[str] = []
    created: list[GeometryObject] = []
    working = list(document.objects)
    for index in range(len(value.vertices)):
        vertex_id = _next_object_id(working, "ivvertex")
        vertex = PolygonVertexPoint(
            id=vertex_id,
            label=vertex_id,
            visible=False,
            definition=PolygonVertexDefinition(polygon=polygon.id, index=index),
        )
        created.append(vertex)
        working.append(vertex)
        vertex_ids.append(vertex_id)
    return vertex_ids, created


def _create_polygon_inversion(
    workspace: GeometryWorkspace,
    input_model: InversionConstructionInput,
    source: GraphObjectAccess,
    circle: GraphObjectAccess,
) -> MutationToolOutput:
    if isinstance(circle.value, UndefinedValue):
        raise ToolExecutionError(f"Geometry object '{input_model.circle}' is not a well-defined circle")
    assert isinstance(circle.value, CircleValue)
    document = workspace.document_snapshot()
    vertex_ids, vertex_objects = _polygon_vertex_ids(document, source.object)
    objects: list[GeometryObject] = list(vertex_objects)
    working = [*document.objects, *vertex_objects]

    for index, start_id in enumerate(vertex_ids):
        end_id = vertex_ids[(index + 1) % len(vertex_ids)]
        edge_id = _next_object_id(working, "ivedge")
        edge = Segment(
            id=edge_id,
            label=edge_id,
            visible=False,
            definition=SegmentBetweenPointsDefinition(point_a=start_id, point_b=end_id),
        )
        objects.append(edge)
        working.append(edge)
        edge_value = GeometryGraph(document.model_copy(update={"objects": working})).values[edge_id]
        if isinstance(edge_value, UndefinedValue):
            raise ToolExecutionError(f"{edge_value.code}: {edge_value.message}")
        assert isinstance(edge_value, SegmentValue)
        declared_kind = infer_inversion_result_kind(edge_value, circle.value)
        if declared_kind is None:
            raise ToolExecutionError(f"Edge {index} of '{input_model.source}' cannot be inverted")
        is_first = index == 0
        result_id = input_model.object_id if is_first else _next_object_id(working, f"{input_model.object_id}_edge")
        result = InversionInCircle(
            id=result_id,
            label=(input_model.label or input_model.object_id) if is_first else result_id,
            kind=declared_kind,
            definition=InversionInCircleDefinition(object_id=edge_id, circle=circle.object.id),
        )
        objects.append(result)
        working.append(result)

    output = _commit_many(workspace, objects)
    # `_commit_many` reports `objects[-1]` (the last object in the batch) as
    # `created_object`, which is correct for every other caller of
    # `_commit_many` (they all pass a single-object or naturally-ordered
    # batch). Here, though, the caller's requested `object_id` is assigned to
    # the FIRST edge's inverted result (see `is_first` above), not the last
    # one appended -- so report the object the caller actually asked for.
    requested = next(obj for obj in objects if obj.id == input_model.object_id)
    return output.model_copy(update={"created_object": requested})


def _create_arc(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = ThreePointConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    start = _resolve_kind(access, input_model.point_a, "point")
    mid = _resolve_kind(access, input_model.point_b, "point")
    end = _resolve_kind(access, input_model.point_c, "point")
    obj = Arc(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=ArcThroughPointsDefinition(
            point_a=start.object.id,
            point_mid=mid.object.id,
            point_b=end.object.id,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_function(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = FunctionConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    expression = normalize_function_expression(input_model.expression)
    obj = FunctionGraph(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=FunctionExpressionDefinition(expression=expression),
    )
    return _commit_defined(workspace, obj)


def _create_polygon_vertex(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = PolygonVertexConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    polygon = _resolve_kind(access, input_model.polygon, "polygon")
    obj = PolygonVertexPoint(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=PolygonVertexDefinition(polygon=polygon.object.id, index=input_model.index),
    )
    return _commit_defined(workspace, obj)


def _commit(workspace: GeometryWorkspace, obj: GeometryObject) -> MutationToolOutput:
    access = workspace.add_object(obj)
    return MutationToolOutput(
        revision=access.revision,
        created_object=obj,
        created_objects=(obj,),
        graph=graph_view_from_access_map(access),
    )


def _commit_many(workspace: GeometryWorkspace, objects: list[GeometryObject]) -> MutationToolOutput:
    """Validate *objects* as one atomic addition and commit only if every
    object in the batch evaluates to a defined value. This is intentionally
    caller-agnostic: any object appended to the batch (not just the last one)
    can be the one that turns out undefined, and the whole addition must be
    rejected -- nothing committed -- if any of them are."""

    document = workspace.document_snapshot()
    candidate = document.model_copy(update={"objects": [*document.objects, *objects]}, deep=True)
    graph = GeometryGraph(GeometryDocument.model_validate(candidate.model_dump(by_alias=True)))
    for obj in objects:
        value = graph.values[obj.id]
        if value.type == "undefined":
            raise ToolExecutionError(f"{value.code}: {value.message}")
    primary = objects[-1]
    access = workspace.add_objects(objects)
    return MutationToolOutput(
        revision=access.revision,
        created_object=primary,
        created_objects=tuple(objects),
        graph=graph_view_from_access_map(access),
    )


def _commit_defined(workspace: GeometryWorkspace, obj: GeometryObject) -> MutationToolOutput:
    return _commit_many(workspace, [obj])


def _ensure_name_available(access: GraphAccessMap, object_id: str, label: str | None) -> None:
    actual_label = label or object_id
    occupied_ids = set(access.by_id)
    occupied_labels = set(access.id_by_label)
    if object_id in occupied_ids or object_id in occupied_labels:
        raise ToolExecutionError(f"Geometry identifier '{object_id}' is already in use")
    if actual_label in occupied_ids or actual_label in occupied_labels:
        raise ToolExecutionError(f"Geometry label '{actual_label}' is already in use")


def _resolve_kind(access: GraphAccessMap, identifier: str, expected_kind: str) -> GraphObjectAccess:
    try:
        node = access.resolve(identifier)
    except ValueError as error:
        raise ToolExecutionError(str(error)) from error
    if node.object.kind != expected_kind:
        raise ToolExecutionError(
            f"Geometry object '{identifier}' must be a {expected_kind}, "
            f"but it is a {node.object.kind}"
        )
    return node


_TRANSFORMABLE_KINDS = ("point", "line", "segment", "circle", "polygon")


def _resolve_transformable(access: GraphAccessMap, identifier: str) -> GraphObjectAccess:
    try:
        node = access.resolve(identifier)
    except ValueError as error:
        raise ToolExecutionError(str(error)) from error
    if node.object.kind not in _TRANSFORMABLE_KINDS:
        raise ToolExecutionError(
            f"Geometry object '{identifier}' must be a point, line, segment, circle, "
            f"or polygon, but it is a {node.object.kind}"
        )
    return node


def _node_view(node: GraphObjectAccess) -> GraphObjectView:
    return GraphObjectView(
        object=node.object.model_copy(deep=True),
        parent_ids=node.parent_ids,
        value=node.value.model_copy(deep=True),
    )
