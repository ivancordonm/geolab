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
    "create_reflection_over_line",
    "create_reflection_over_point",
    "create_translation",
    "create_rotation",
    "create_homothety",
    "create_inversion",
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

    inverted = execute(registry, "create_inversion", {"objectId": "Inv", "point": "P", "circle": "c1"})
    assert point_value(inverted, "Inv") == pytest.approx((0.5, 0.0))


@pytest.mark.skip(reason="create_arc arrives in Task 7")
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
