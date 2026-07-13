from types import MappingProxyType

import pytest

from app.agent.models import GraphView
from app.agent.registry import InvalidToolInputError, ToolExecutionError, UnknownToolError
from app.agent.tools import create_geometry_tool_registry, graph_view_from_access_map
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
    "validate_construction",
    "evaluate_script",
    "get_current_graph",
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


def test_create_distance_tool_rejects_non_point_parent() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "B", "x": 1, "y": 0})
    execute(registry, "create_line", {"objectId": "ln", "pointA": "A", "pointB": "B"})

    with pytest.raises(ToolExecutionError, match="must be a point"):
        execute(registry, "create_distance", {"objectId": "d", "pointA": "A", "pointB": "ln"})
