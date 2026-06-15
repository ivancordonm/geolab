"""Deterministic geometry tools exposed through the agent registry."""

from __future__ import annotations

from collections.abc import Callable

from pydantic import BaseModel

from app.agent.models import (
    CircleCircleIntersectionInput,
    CircleConstructionInput,
    CircleLineIntersectionInput,
    CreatePointInput,
    EmptyToolInput,
    EvaluateScriptToolInput,
    EvaluateScriptToolOutput,
    GetGraphToolOutput,
    GraphObjectView,
    GraphView,
    LineLineIntersectionInput,
    MutationToolOutput,
    PointLineConstructionInput,
    PolygonConstructionInput,
    RegularPolygonConstructionInput,
    ThreePointConstructionInput,
    TwoPointConstructionInput,
    ValidateConstructionInput,
    ValidationToolOutput,
    VectorPolygonConstructionInput,
)
from app.agent.registry import ToolDefinition, ToolExecutionError, ToolRegistry
from app.geometry.engine import GeometryGraph
from app.geometry.models import (
    Circle,
    CircleByCenterPointDefinition,
    Coordinate,
    GeometryDocument,
    GeometryObject,
    IntersectionCC,
    IntersectionCCDefinition,
    IntersectionLC,
    IntersectionLCDefinition,
    IntersectionLL,
    IntersectionLLDefinition,
    Line,
    LineThroughPointsDefinition,
    Midpoint,
    MidpointDefinition,
    ParallelLine,
    ParallelLineDefinition,
    PerpendicularLine,
    PerpendicularLineDefinition,
    PerpendicularBisectorDefinition,
    PerpendicularBisectorLine,
    AngleBisectorDefinition,
    AngleBisectorLine,
    CircumscribedCircle,
    CircumscribedDefinition,
    Point,
    Polygon,
    PolygonDefinition,
    RegularPolygonDefinition,
    Segment,
    SegmentBetweenPointsDefinition,
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


def _commit(workspace: GeometryWorkspace, obj: GeometryObject) -> MutationToolOutput:
    access = workspace.add_object(obj)
    return MutationToolOutput(
        revision=access.revision,
        created_object=obj,
        graph=graph_view_from_access_map(access),
    )


def _commit_defined(workspace: GeometryWorkspace, obj: GeometryObject) -> MutationToolOutput:
    candidate = workspace.document_snapshot().model_copy(
        update={"objects": [*workspace.document_snapshot().objects, obj]},
        deep=True,
    )
    graph = GeometryGraph(GeometryDocument.model_validate(candidate.model_dump(by_alias=True)))
    value = graph.values[obj.id]
    if value.type == "undefined":
        raise ToolExecutionError(f"{value.code}: {value.message}")
    return _commit(workspace, obj)


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


def _node_view(node: GraphObjectAccess) -> GraphObjectView:
    return GraphObjectView(
        object=node.object.model_copy(deep=True),
        parent_ids=node.parent_ids,
        value=node.value.model_copy(deep=True),
    )
