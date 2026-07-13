"""Tests for Measure objects: distance, angle, area, slope."""

import json
from pathlib import Path
from typing import Any

import pytest

from app.geometry.engine import GeometryGraph, GeometryValidationError, evaluate_geometry_document
from app.geometry.models import GeometryDocument
from app.geometry.script import evaluate_script

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "measures.json"


def load_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text())


def dump_values(values: dict[str, Any]) -> dict[str, Any]:
    return {key: value.model_dump(by_alias=True) for key, value in values.items()}


def assert_nested_close(actual: Any, expected: Any) -> None:
    if isinstance(expected, dict):
        assert actual.keys() == expected.keys()
        for key in expected:
            assert_nested_close(actual[key], expected[key])
    elif isinstance(expected, float):
        assert actual == pytest.approx(expected)
    else:
        assert actual == expected


def test_distance_measure() -> None:
    document = GeometryDocument.model_validate({
        "schemaVersion": 1,
        "id": "measure_test",
        "title": "Measures",
        "objects": [
            {"id": "A", "label": "A", "kind": "point", "definition": {"type": "free", "x": 0, "y": 0}},
            {"id": "B", "label": "B", "kind": "point", "definition": {"type": "free", "x": 3, "y": 4}},
            {
                "id": "d",
                "label": "d",
                "kind": "measure",
                "definition": {"type": "distance", "point_a": "A", "point_b": "B"},
            },
        ],
    })
    values = evaluate_geometry_document(document)
    assert values["d"].type == "scalar"
    assert values["d"].value == pytest.approx(5.0)


def test_angle_measure() -> None:
    """Angle between O(0,0)->A(1,0) and O(0,0)->B(0,1) is a right angle (90 degrees)."""

    document = GeometryDocument.model_validate({
        "schemaVersion": 1,
        "id": "angle_test",
        "title": "Angle measure",
        "objects": [
            {"id": "A", "label": "A", "kind": "point", "definition": {"type": "free", "x": 1, "y": 0}},
            {"id": "O", "label": "O", "kind": "point", "definition": {"type": "free", "x": 0, "y": 0}},
            {"id": "B", "label": "B", "kind": "point", "definition": {"type": "free", "x": 0, "y": 1}},
            {
                "id": "ang",
                "label": "ang",
                "kind": "measure",
                "definition": {"type": "angle", "point_a": "A", "vertex": "O", "point_b": "B"},
            },
        ],
    })
    values = evaluate_geometry_document(document)
    assert values["ang"].type == "scalar"
    assert values["ang"].value == pytest.approx(90.0)


def test_angle_measure_straight_angle() -> None:
    """Angle between O->A(1,0) and O->C(-1,0) is a straight angle (180 degrees)."""

    document = GeometryDocument.model_validate({
        "schemaVersion": 1,
        "id": "angle_straight_test",
        "title": "Angle measure straight",
        "objects": [
            {"id": "A", "label": "A", "kind": "point", "definition": {"type": "free", "x": 1, "y": 0}},
            {"id": "O", "label": "O", "kind": "point", "definition": {"type": "free", "x": 0, "y": 0}},
            {"id": "C", "label": "C", "kind": "point", "definition": {"type": "free", "x": -1, "y": 0}},
            {
                "id": "ang",
                "label": "ang",
                "kind": "measure",
                "definition": {"type": "angle", "point_a": "A", "vertex": "O", "point_b": "C"},
            },
        ],
    })
    values = evaluate_geometry_document(document)
    assert values["ang"].type == "scalar"
    assert values["ang"].value == pytest.approx(180.0)


def test_angle_measure_is_undefined_when_vertex_coincides_with_arm_point() -> None:
    document = GeometryDocument.model_validate({
        "schemaVersion": 1,
        "id": "angle_degenerate_test",
        "title": "Angle measure degenerate",
        "objects": [
            {"id": "A", "label": "A", "kind": "point", "definition": {"type": "free", "x": 0, "y": 0}},
            {"id": "O", "label": "O", "kind": "point", "definition": {"type": "free", "x": 0, "y": 0}},
            {"id": "B", "label": "B", "kind": "point", "definition": {"type": "free", "x": 0, "y": 1}},
            {
                "id": "ang",
                "label": "ang",
                "kind": "measure",
                "definition": {"type": "angle", "point_a": "A", "vertex": "O", "point_b": "B"},
            },
        ],
    })
    values = evaluate_geometry_document(document)
    assert values["ang"].type == "undefined"
    assert values["ang"].code == "coincident_points"  # type: ignore[union-attr]


def test_area_measure() -> None:
    """Right triangle with legs 4 and 3 has area 6."""

    document = GeometryDocument.model_validate({
        "schemaVersion": 1,
        "id": "area_test",
        "title": "Area measure",
        "objects": [
            {"id": "T1", "label": "T1", "kind": "point", "definition": {"type": "free", "x": 0, "y": 0}},
            {"id": "T2", "label": "T2", "kind": "point", "definition": {"type": "free", "x": 4, "y": 0}},
            {"id": "T3", "label": "T3", "kind": "point", "definition": {"type": "free", "x": 0, "y": 3}},
            {
                "id": "tri",
                "label": "tri",
                "kind": "polygon",
                "definition": {"type": "polygon", "points": ["T1", "T2", "T3"]},
            },
            {
                "id": "area",
                "label": "area",
                "kind": "measure",
                "definition": {"type": "area", "polygon": "tri"},
            },
        ],
    })
    values = evaluate_geometry_document(document)
    assert values["area"].type == "scalar"
    assert values["area"].value == pytest.approx(6.0)


def test_area_measure_is_non_negative_regardless_of_winding_order() -> None:
    """Clockwise vertex order yields a negative shoelace sum; area must still be positive."""

    document = GeometryDocument.model_validate({
        "schemaVersion": 1,
        "id": "area_winding_test",
        "title": "Area measure winding",
        "objects": [
            {"id": "T1", "label": "T1", "kind": "point", "definition": {"type": "free", "x": 0, "y": 0}},
            {"id": "T2", "label": "T2", "kind": "point", "definition": {"type": "free", "x": 0, "y": 3}},
            {"id": "T3", "label": "T3", "kind": "point", "definition": {"type": "free", "x": 4, "y": 0}},
            {
                "id": "tri",
                "label": "tri",
                "kind": "polygon",
                "definition": {"type": "polygon", "points": ["T1", "T2", "T3"]},
            },
            {
                "id": "area",
                "label": "area",
                "kind": "measure",
                "definition": {"type": "area", "polygon": "tri"},
            },
        ],
    })
    values = evaluate_geometry_document(document)
    assert values["area"].type == "scalar"
    assert values["area"].value == pytest.approx(6.0)
    assert values["area"].value > 0  # type: ignore[union-attr]


def test_slope_measure() -> None:
    """Line through (0,0) and (1,1) has slope 1.0."""

    document = GeometryDocument.model_validate({
        "schemaVersion": 1,
        "id": "slope_test",
        "title": "Slope measure",
        "objects": [
            {"id": "L1", "label": "L1", "kind": "point", "definition": {"type": "free", "x": 0, "y": 0}},
            {"id": "L2", "label": "L2", "kind": "point", "definition": {"type": "free", "x": 1, "y": 1}},
            {
                "id": "ln",
                "label": "ln",
                "kind": "line",
                "definition": {"type": "through_points", "point_a": "L1", "point_b": "L2"},
            },
            {
                "id": "slope",
                "label": "slope",
                "kind": "measure",
                "definition": {"type": "slope", "line": "ln"},
            },
        ],
    })
    values = evaluate_geometry_document(document)
    assert values["slope"].type == "scalar"
    assert values["slope"].value == pytest.approx(1.0)


def test_slope_measure_is_undefined_for_vertical_line() -> None:
    document = GeometryDocument.model_validate({
        "schemaVersion": 1,
        "id": "slope_vertical_test",
        "title": "Slope measure vertical",
        "objects": [
            {"id": "V1", "label": "V1", "kind": "point", "definition": {"type": "free", "x": 2, "y": 0}},
            {"id": "V2", "label": "V2", "kind": "point", "definition": {"type": "free", "x": 2, "y": 5}},
            {
                "id": "vln",
                "label": "vln",
                "kind": "line",
                "definition": {"type": "through_points", "point_a": "V1", "point_b": "V2"},
            },
            {
                "id": "slope",
                "label": "slope",
                "kind": "measure",
                "definition": {"type": "slope", "line": "vln"},
            },
        ],
    })
    values = evaluate_geometry_document(document)
    assert values["slope"].type == "undefined"
    assert values["slope"].code == "vertical_line"  # type: ignore[union-attr]


def test_measure_rejects_wrong_parent_kind() -> None:
    """A distance measure requires point parents; referencing a line must fail validation."""

    document_payload = {
        "schemaVersion": 1,
        "id": "measure_invalid_parent",
        "title": "Invalid measure parent",
        "objects": [
            {"id": "A", "label": "A", "kind": "point", "definition": {"type": "free", "x": 0, "y": 0}},
            {"id": "B", "label": "B", "kind": "point", "definition": {"type": "free", "x": 1, "y": 0}},
            {
                "id": "ln",
                "label": "ln",
                "kind": "line",
                "definition": {"type": "through_points", "point_a": "A", "point_b": "B"},
            },
            {
                "id": "d",
                "label": "d",
                "kind": "measure",
                "definition": {"type": "distance", "point_a": "A", "point_b": "ln"},
            },
        ],
    }
    document = GeometryDocument.model_validate(document_payload)
    with pytest.raises(GeometryValidationError, match="requires parent"):
        GeometryGraph(document)


def test_shared_measures_fixture_evaluates_all_four_variants() -> None:
    fixture = load_fixture()
    document = GeometryDocument.model_validate(fixture["document"])

    values = dump_values(evaluate_geometry_document(document))

    assert_nested_close(values, fixture["initialValues"])


def test_object_command_bar_regression_measures_do_not_break_subsequent_commands() -> None:
    """Regression test for the Measures equivalent of Task 1's Slider regression.

    `documentToScript` (frontend) emits `Distance(...)`, `Angle(...)`, `Area(...)`,
    and `Slope(...)` statements for any document containing measure objects. Before
    this fix, the backend script parser did not recognize any of these four
    commands, so re-submitting the exported script (or any new command typed into
    the object command bar) for a document containing a measure failed with
    "Unknown command 'Distance'" (or Angle/Area/Slope). This reproduces the exact
    script text `documentToScript` emits (pinned down in
    frontend/src/persistence/documentPersistence.test.ts's "exports every measure
    variant as a backend-parseable script" test) for points, a line, a polygon,
    one of each measure type, and confirms the backend now parses and evaluates
    all of it.
    """

    # Mirrors frontend/src/persistence/documentPersistence.ts's objectToScript
    # output for points, a line, a polygon, and all four measure variants.
    exported_script = (
        "A = Point(0, 0)\n"
        "B = Point(4, 0)\n"
        "C = Point(2, 3)\n"
        "AB = Line(A, B)\n"
        "poly = Polygon(A, B, C)\n"
        "d = Distance(A, B)\n"
        "ang = Angle(A, B, C)\n"
        "ar = Area(poly)\n"
        "sl = Slope(AB)\n"
    )

    document, values = evaluate_script(exported_script, document_id="command-bar-measures-regression")

    assert [obj.id for obj in document.objects] == ["A", "B", "C", "AB", "poly", "d", "ang", "ar", "sl"]
    assert values["d"].type == "scalar"
    assert values["d"].value == pytest.approx(4.0)
    assert values["ang"].type == "scalar"
    assert values["ar"].type == "scalar"
    assert values["ar"].value == pytest.approx(6.0)
    assert values["sl"].type == "scalar"
    assert values["sl"].value == pytest.approx(0.0)
