import base64
import json
from types import MappingProxyType

import pytest

from app.agent.models import GraphView
from app.agent.registry import InvalidToolInputError, ToolExecutionError, UnknownToolError
from app.agent.tools import create_geometry_tool_registry, graph_view_from_access_map
from app.geometry.models import (
    Circle,
    CircleByCenterPointDefinition,
    FreePointDefinition,
    GeometryDocument,
    IntersectionLL,
    IntersectionLLDefinition,
    Line,
    LineThroughPointsDefinition,
    Point,
)
from app.geometry.workspace import GeometryWorkspace

EXPECTED_TOOLS = {
    "create_point",
    "create_line",
    "create_segment",
    "create_circle",
    "create_midpoint",
    "create_parallel_line",
    "create_perpendicular_line",
    "create_line_line_intersection",
    "create_circle_line_intersection",
    "create_circle_circle_intersection",
    "create_tangent",
    "create_perpendicular_bisector",
    "create_angle_bisector",
    "create_circumcircle",
    "create_polygon",
    "create_regular_polygon",
    "create_vector_polygon",
    "create_slider",
    "create_distance",
    "create_angle",
    "create_area",
    "create_slope",
    "create_point_on_object",
    "create_reflection_over_line",
    "create_reflection_over_point",
    "create_translation",
    "create_rotation",
    "create_homothety",
    "create_inversion",
    "create_arc",
    "create_function",
    "create_polygon_vertex",
    "validate_construction",
    "evaluate_script",
    "get_current_graph",
    "export_svg",
    "export_png",
    "export_json",
}


def execute(registry: object, name: str, arguments: dict[str, object]) -> object:
    _, output = registry.execute(name, arguments)  # type: ignore[attr-defined]
    return output


def test_registry_contains_required_schema_described_tools() -> None:
    registry = create_geometry_tool_registry(GeometryWorkspace())
    descriptors = {descriptor.name: descriptor for descriptor in registry.descriptors()}

    assert set(descriptors) == EXPECTED_TOOLS
    assert descriptors["create_point"].mutates_geometry_state is True
    assert descriptors["get_current_graph"].mutates_geometry_state is False
    assert descriptors["create_point"].input_schema["properties"]["objectId"]["type"] == "string"
    assert "properties" in descriptors["create_point"].output_schema
    assert isinstance(registry.definitions, MappingProxyType)


def test_invalid_tool_calls_do_not_mutate_workspace() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)

    with pytest.raises(UnknownToolError):
        registry.execute("delete_everything", {})
    with pytest.raises(InvalidToolInputError):
        registry.execute("create_point", {"objectId": "A", "x": 0})
    with pytest.raises(ToolExecutionError, match="Unknown geometry object"):
        registry.execute(
            "create_line",
            {"objectId": "AB", "pointA": "A", "pointB": "B"},
        )

    assert workspace.revision == 0
    assert workspace.document_snapshot().objects == []


def test_graph_access_map_is_read_only_and_resolves_ids_and_labels() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "point_a", "label": "A", "x": 0, "y": 0})
    access = workspace.graph_access_map()

    assert access.resolve("point_a").object.label == "A"
    assert access.resolve("A").object.id == "point_a"
    with pytest.raises(TypeError):
        access.by_id["other"] = access.by_id["point_a"]  # type: ignore[index]
    with pytest.raises(TypeError):
        access.id_by_label["B"] = "other"  # type: ignore[index]

    view = graph_view_from_access_map(access)
    assert isinstance(view, GraphView)
    assert view.id_map == {"point_a": 0}
    assert view.label_map == {"A": "point_a"}


def test_tool_execution_builds_a_valid_dependency_graph() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)

    execute(registry, "create_point", {"objectId": "a_id", "label": "A", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "b_id", "label": "B", "x": 4, "y": 0})
    execute(registry, "create_point", {"objectId": "c_id", "label": "C", "x": 2, "y": 3})
    execute(
        registry,
        "create_line",
        {"objectId": "line_ab", "label": "AB", "pointA": "A", "pointB": "B"},
    )
    execute(
        registry,
        "create_segment",
        {"objectId": "segment_ab", "pointA": "a_id", "pointB": "b_id"},
    )
    execute(
        registry,
        "create_midpoint",
        {"objectId": "midpoint_ab", "label": "M", "pointA": "A", "pointB": "B"},
    )
    execute(
        registry,
        "create_circle",
        {"objectId": "circle_ac", "center": "A", "point": "C"},
    )
    execute(
        registry,
        "create_parallel_line",
        {"objectId": "parallel", "point": "C", "line": "AB"},
    )
    output = execute(
        registry,
        "create_perpendicular_line",
        {"objectId": "altitude", "point": "C", "line": "AB"},
    )

    assert output.revision == 9  # type: ignore[attr-defined]
    assert output.created_object.definition.type == "perpendicular_through"  # type: ignore[attr-defined]
    access = workspace.graph_access_map()
    assert access.by_id["midpoint_ab"].parent_ids == ("a_id", "b_id")
    assert access.by_id["altitude"].value.type == "line"

    validation = execute(registry, "validate_construction", {})
    assert validation.valid is True  # type: ignore[attr-defined]
    assert workspace.revision == 9


def test_evaluate_script_tool_replaces_graph_only_after_validation() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "old", "x": 0, "y": 0})

    with pytest.raises(ToolExecutionError, match="Line 2"):
        execute(
            registry,
            "evaluate_script",
            {"script": "A = Point(0, 0)\nAB = Line(A, B)"},
        )
    assert [obj.id for obj in workspace.document_snapshot().objects] == ["old"]
    assert workspace.revision == 1

    output = execute(
        registry,
        "evaluate_script",
        {"script": "A = Point(0, 0)\nB = Point(2, 0)\nAB = Line(A, B)"},
    )
    assert output.revision == 2  # type: ignore[attr-defined]
    assert [obj.id for obj in workspace.document_snapshot().objects] == ["A", "B", "AB"]


def test_directional_intersection_tool_is_atomic_on_ambiguity() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "B", "x": 4, "y": 0})
    execute(registry, "create_circle", {"objectId": "cA", "center": "A", "point": "B"})
    execute(registry, "create_circle", {"objectId": "cB", "center": "B", "point": "A"})

    with pytest.raises(ToolExecutionError, match="ambiguous_selector"):
        execute(
            registry,
            "create_circle_circle_intersection",
            {
                "objectId": "C",
                "circleA": "cA",
                "circleB": "cB",
                "selector": "left",
            },
        )

    assert workspace.revision == 4
    assert "C" not in workspace.graph_access_map().by_id


def test_create_tangent_registers_a_line() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "B", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "U", "x": 1, "y": 0})
    execute(registry, "create_circle", {"objectId": "c", "center": "B", "point": "U"})
    execute(registry, "create_point", {"objectId": "P", "x": 5, "y": 0})

    execute(registry, "create_tangent", {"objectId": "t", "point": "P", "circle": "c", "selector": "first"})

    obj = next(o for o in workspace.document_snapshot().objects if o.id == "t")
    assert obj.kind == "line"
    assert obj.definition.type == "tangent_pc"
    assert obj.definition.selector == "first"


def test_measure_tools_create_distance_angle_area_and_slope() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)

    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "B", "x": 3, "y": 4})
    execute(registry, "create_point", {"objectId": "O", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "P1", "x": 1, "y": 0})
    execute(registry, "create_point", {"objectId": "P2", "x": 0, "y": 1})
    execute(registry, "create_point", {"objectId": "T1", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "T2", "x": 4, "y": 0})
    execute(registry, "create_point", {"objectId": "T3", "x": 0, "y": 3})
    execute(registry, "create_polygon", {"objectId": "tri", "pointIds": ["T1", "T2", "T3"]})
    execute(registry, "create_line", {"objectId": "ln", "pointA": "A", "pointB": "B"})

    distance_output = execute(registry, "create_distance", {"objectId": "d", "pointA": "A", "pointB": "B"})
    angle_output = execute(registry, "create_angle", {"objectId": "ang", "pointA": "P1", "vertex": "O", "pointB": "P2"})
    area_output = execute(registry, "create_area", {"objectId": "area", "polygon": "tri"})
    slope_output = execute(registry, "create_slope", {"objectId": "slope", "line": "ln"})

    assert distance_output.created_object.definition.type == "distance"  # type: ignore[attr-defined]
    access = workspace.graph_access_map()
    assert access.by_id["d"].value.type == "scalar"
    assert access.by_id["d"].value.value == pytest.approx(5.0)  # type: ignore[union-attr]

    assert angle_output.created_object.definition.type == "angle"  # type: ignore[attr-defined]
    assert access.by_id["ang"].value.value == pytest.approx(90.0)  # type: ignore[union-attr]

    assert area_output.created_object.definition.type == "area"  # type: ignore[attr-defined]
    assert access.by_id["area"].value.value == pytest.approx(6.0)  # type: ignore[union-attr]

    assert slope_output.created_object.definition.type == "slope"  # type: ignore[attr-defined]
    assert access.by_id["slope"].value.value == pytest.approx(4.0 / 3.0)  # type: ignore[union-attr]


def test_create_slope_tool_rejects_vertical_line_atomically() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "V1", "x": 2, "y": 0})
    execute(registry, "create_point", {"objectId": "V2", "x": 2, "y": 5})
    execute(registry, "create_line", {"objectId": "vln", "pointA": "V1", "pointB": "V2"})

    with pytest.raises(ToolExecutionError, match="vertical_line"):
        execute(registry, "create_slope", {"objectId": "slope", "line": "vln"})

    assert "slope" not in workspace.graph_access_map().by_id


def test_create_point_on_object_on_a_line():
    registry = create_geometry_tool_registry(GeometryWorkspace())
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "B", "x": 4, "y": 0})
    execute(registry, "create_line", {"objectId": "l", "pointA": "A", "pointB": "B"})

    output = execute(registry, "create_point_on_object", {"objectId": "P", "parent": "l"})

    assert output.created_object.kind == "point"
    assert output.created_object.definition.type == "on_line"
    assert output.created_object.definition.line == "l"


def test_create_point_on_object_on_an_arc_uses_the_mid_angle():
    registry = create_geometry_tool_registry(GeometryWorkspace())
    execute(registry, "create_point", {"objectId": "E", "x": 5, "y": 0})
    execute(registry, "create_point", {"objectId": "F", "x": 0, "y": 5})
    execute(registry, "create_point", {"objectId": "G", "x": -5, "y": 0})
    execute(registry, "create_arc", {"objectId": "arc1", "pointA": "E", "pointB": "F", "pointC": "G"})

    output = execute(registry, "create_point_on_object", {"objectId": "P", "parent": "arc1"})

    assert output.created_object.definition.type == "on_arc"
    graph = output.graph
    value = graph.objects[graph.id_map["P"]].value
    assert value.type == "point"
    assert value.x == pytest.approx(0.0, abs=1e-9)
    assert value.y == pytest.approx(5.0, abs=1e-9)


def test_create_point_on_object_rejects_a_non_projectable_parent():
    registry = create_geometry_tool_registry(GeometryWorkspace())
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})

    with pytest.raises(ToolExecutionError):
        execute(registry, "create_point_on_object", {"objectId": "P", "parent": "A"})


def test_create_distance_tool_rejects_non_point_parent() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "B", "x": 1, "y": 0})
    execute(registry, "create_line", {"objectId": "ln", "pointA": "A", "pointB": "B"})

    with pytest.raises(ToolExecutionError, match="must be a point"):
        execute(registry, "create_distance", {"objectId": "d", "pointA": "A", "pointB": "ln"})
def test_transformation_tools_create_defined_objects() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "A", "x": 1, "y": 1})
    execute(registry, "create_point", {"objectId": "B", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "C", "x": 0, "y": 2})
    execute(registry, "create_point", {"objectId": "D", "x": 2, "y": -1})
    execute(registry, "create_point", {"objectId": "P", "x": 2, "y": 0})
    execute(registry, "create_point", {"objectId": "U", "x": 1, "y": 0})
    execute(registry, "create_line", {"objectId": "axis", "pointA": "B", "pointB": "C"})
    execute(registry, "create_circle", {"objectId": "c1", "center": "B", "point": "U"})

    def point_value(output: object, object_id: str) -> tuple[float, float]:
        graph = output.graph  # type: ignore[attr-defined]
        value = graph.objects[graph.id_map[object_id]].value
        assert value.type == "point"
        return value.x, value.y

    reflected = execute(registry, "create_reflection_over_line", {"objectId": "R", "source": "A", "line": "axis"})
    assert point_value(reflected, "R") == pytest.approx((-1.0, 1.0))

    mirrored = execute(registry, "create_reflection_over_point", {"objectId": "RP", "source": "A", "center": "B"})
    assert point_value(mirrored, "RP") == pytest.approx((-1.0, -1.0))

    translated = execute(registry, "create_translation", {"objectId": "T", "source": "A", "fromPoint": "B", "toPoint": "D"})
    assert point_value(translated, "T") == pytest.approx((3.0, 0.0))

    rotated = execute(registry, "create_rotation", {"objectId": "G", "source": "A", "center": "B", "degrees": 90})
    assert point_value(rotated, "G") == pytest.approx((-1.0, 1.0))

    scaled = execute(registry, "create_homothety", {"objectId": "H", "center": "B", "point": "P", "ratio": 2})
    assert point_value(scaled, "H") == pytest.approx((4.0, 0.0))

    inverted = execute(registry, "create_inversion", {"objectId": "Inv", "source": "P", "circle": "c1"})
    assert point_value(inverted, "Inv") == pytest.approx((0.5, 0.0))


def test_transformation_source_must_be_transformable() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "B", "x": 4, "y": 0})
    execute(registry, "create_point", {"objectId": "C", "x": 2, "y": 3})
    execute(registry, "create_arc", {"objectId": "arc1", "pointA": "A", "pointB": "C", "pointC": "B"})
    execute(registry, "create_line", {"objectId": "l1", "pointA": "A", "pointB": "B"})

    with pytest.raises(ToolExecutionError, match="must be a point, line, segment, circle, or polygon"):
        execute(registry, "create_reflection_over_line", {"objectId": "R", "source": "arc1", "line": "l1"})


def test_arc_function_and_vertex_tools() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "B", "x": 4, "y": 0})
    execute(registry, "create_point", {"objectId": "C", "x": 2, "y": 3})
    execute(registry, "create_polygon", {"objectId": "poly", "pointIds": ["A", "B", "C"]})

    arc = execute(registry, "create_arc", {"objectId": "arc1", "pointA": "A", "pointB": "C", "pointC": "B"})
    arc_value = arc.graph.objects[arc.graph.id_map["arc1"]].value
    assert arc_value.type == "arc"

    fn = execute(registry, "create_function", {"objectId": "f1", "expression": "x^2 + 1"})
    fn_value = fn.graph.objects[fn.graph.id_map["f1"]].value
    assert fn_value.type == "function"

    vertex = execute(registry, "create_polygon_vertex", {"objectId": "V", "polygon": "poly", "index": 1})
    vertex_value = vertex.graph.objects[vertex.graph.id_map["V"]].value
    assert vertex_value.type == "point"
    assert (vertex_value.x, vertex_value.y) == pytest.approx((4.0, 0.0))


def test_invalid_function_expression_is_rejected_without_mutation() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)

    with pytest.raises(ToolExecutionError):
        execute(registry, "create_function", {"objectId": "f1", "expression": "__import__('os')"})
    assert workspace.revision == 0


def test_export_tools_return_svg_png_and_json() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})

    svg = execute(registry, "export_svg", {})
    assert "<svg" in svg.svg

    png = execute(registry, "export_png", {})
    assert base64.b64decode(png.png_base64)[:8] == b"\x89PNG\r\n\x1a\n"

    exported = execute(registry, "export_json", {})
    payload = json.loads(exported.document_json)
    assert payload["objects"][0]["id"] == "A"

    descriptors = {d.name: d for d in registry.descriptors()}
    assert descriptors["export_svg"].mutates_geometry_state is False
    assert descriptors["export_png"].mutates_geometry_state is False
    assert descriptors["export_json"].mutates_geometry_state is False


def test_create_inversion_tool_inverts_a_line_into_a_circle() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "B", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "U", "x": 1, "y": 0})
    execute(registry, "create_circle", {"objectId": "c1", "center": "B", "point": "U"})
    execute(registry, "create_point", {"objectId": "E", "x": 1, "y": 2})
    execute(registry, "create_point", {"objectId": "F", "x": 3, "y": 2})
    execute(registry, "create_line", {"objectId": "r", "pointA": "E", "pointB": "F"})

    output = execute(registry, "create_inversion", {"objectId": "C1", "source": "r", "circle": "c1"})

    assert output.created_object.kind == "circle"  # type: ignore[attr-defined]
    assert output.created_objects[-1].id == "C1"  # type: ignore[attr-defined]
    graph = output.graph  # type: ignore[attr-defined]
    value = graph.objects[graph.id_map["C1"]].value
    assert value.type == "circle"
    assert (value.center.x, value.center.y) == pytest.approx((0.0, 0.25))
    assert value.radius == pytest.approx(0.25)


def test_create_inversion_tool_inverts_a_polygon_into_arcs() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "B", "x": 5, "y": 5})
    execute(registry, "create_point", {"objectId": "U", "x": 6, "y": 5})
    execute(registry, "create_circle", {"objectId": "c1", "center": "B", "point": "U"})
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "V2", "x": 4, "y": 0})
    execute(registry, "create_point", {"objectId": "V3", "x": 2, "y": 3})
    execute(registry, "create_polygon", {"objectId": "poly", "pointIds": ["A", "V2", "V3"]})

    output = execute(registry, "create_inversion", {"objectId": "InvPoly", "source": "poly", "circle": "c1"})

    assert len(output.created_objects) >= 3  # type: ignore[attr-defined]
    edge_results = [obj for obj in output.created_objects if obj.definition.type == "inversion_in_circle"]  # type: ignore[attr-defined]
    assert len(edge_results) == 3
    assert edge_results[0].id == "InvPoly"
    assert {result.kind for result in edge_results} <= {"segment", "arc"}
    # Regression: `created_object` must report the caller-requested object
    # (the first edge's inverted result, which carries the requested id),
    # not `_commit_many`'s generic "last object in the batch" default (which
    # here would be an auto-generated edge id like "InvPoly_edge2").
    assert output.created_object.id == "InvPoly"  # type: ignore[attr-defined]


def test_create_inversion_tool_rejects_polygon_when_a_non_last_edge_is_undefined() -> None:
    """Regression test: a polygon vertex sitting exactly on the inversion
    center makes that vertex's incident edges invert to `UndefinedValue`
    (`edge_touches_center`). `_commit_many` must reject the whole batch even
    when the degenerate edge is NOT the last object appended -- committing
    only the last object's definedness previously let earlier undefined
    edges slip through uncommitted-check but still committed."""
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "B", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "U", "x": 1, "y": 0})
    execute(registry, "create_circle", {"objectId": "c1", "center": "B", "point": "U"})
    # V1 coincides with the inversion center (0, 0); it is neither the first
    # nor the last polygon vertex, so the undefined edges it touches (edge0:
    # V0-V1, edge1: V1-V2) are appended to `objects` before the final,
    # perfectly well-defined edge3 (V3-V0).
    execute(registry, "create_point", {"objectId": "V0", "x": 5, "y": 0})
    execute(registry, "create_point", {"objectId": "V1", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "V2", "x": 5, "y": 5})
    execute(registry, "create_point", {"objectId": "V3", "x": 0, "y": 5})
    execute(registry, "create_polygon", {"objectId": "poly", "pointIds": ["V0", "V1", "V2", "V3"]})

    with pytest.raises(ToolExecutionError, match="edge_touches_center"):
        execute(registry, "create_inversion", {"objectId": "Bad", "source": "poly", "circle": "c1"})

    access = workspace.graph_access_map()
    assert "Bad" not in access.by_id
    assert not any(
        object_id.startswith("ivedge") or object_id.startswith("ivvertex") for object_id in access.by_id
    )


def test_create_inversion_tool_rejects_a_point_at_the_inversion_center() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "B", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "U", "x": 1, "y": 0})
    execute(registry, "create_circle", {"objectId": "c1", "center": "B", "point": "U"})

    with pytest.raises(ToolExecutionError):
        execute(registry, "create_inversion", {"objectId": "Bad", "source": "B", "circle": "c1"})


def _degenerate_circle_document() -> GeometryDocument:
    """A document whose 'c1' circle is centered on the intersection of two
    parallel lines, so 'c1' evaluates to UndefinedValue. GeometryWorkspace's
    constructor only structurally validates the document (no cycles/dangling
    references), so this degenerate-but-structurally-valid document can be
    used as the workspace's starting state -- unlike going through
    `create_line_line_intersection`, which would reject committing the
    undefined intersection point in the first place."""

    return GeometryDocument(
        id="current_graph",
        title="Current construction",
        objects=[
            Point(id="A", label="A", definition=FreePointDefinition(x=0, y=0)),
            Point(id="B", label="B", definition=FreePointDefinition(x=1, y=0)),
            Point(id="C", label="C", definition=FreePointDefinition(x=0, y=1)),
            Point(id="D", label="D", definition=FreePointDefinition(x=1, y=1)),
            Line(id="l1", label="l1", definition=LineThroughPointsDefinition(point_a="A", point_b="B")),
            Line(id="l2", label="l2", definition=LineThroughPointsDefinition(point_a="C", point_b="D")),
            IntersectionLL(id="Bad", label="Bad", definition=IntersectionLLDefinition(line_a="l1", line_b="l2")),
            Circle(id="c1", label="c1", definition=CircleByCenterPointDefinition(center="Bad", point="A")),
        ],
    )


def test_create_inversion_tool_rejects_a_degenerate_inversion_circle() -> None:
    """Regression test: `_create_inversion` must not crash with an
    AssertionError when the circle argument's value is UndefinedValue (e.g.
    its center is the intersection of two parallel lines)."""
    workspace = GeometryWorkspace(_degenerate_circle_document())
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "E", "x": 1, "y": 2})
    execute(registry, "create_point", {"objectId": "F", "x": 3, "y": 2})
    execute(registry, "create_line", {"objectId": "r", "pointA": "E", "pointB": "F"})

    with pytest.raises(ToolExecutionError, match="not a well-defined circle"):
        execute(registry, "create_inversion", {"objectId": "Inv", "source": "r", "circle": "c1"})


def test_create_polygon_inversion_tool_rejects_a_degenerate_inversion_circle() -> None:
    """Same as above but through the polygon-source path
    (`_create_polygon_inversion`), which has its own separate assert."""
    workspace = GeometryWorkspace(_degenerate_circle_document())
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "V2", "x": 4, "y": 0})
    execute(registry, "create_point", {"objectId": "V3", "x": 2, "y": 3})
    execute(registry, "create_polygon", {"objectId": "poly", "pointIds": ["A", "V2", "V3"]})

    with pytest.raises(ToolExecutionError, match="not a well-defined circle"):
        execute(registry, "create_inversion", {"objectId": "InvPoly", "source": "poly", "circle": "c1"})
