"""Tests for slider parameter objects."""

import json
from pathlib import Path
from typing import Any

import pytest

from app.geometry.engine import GeometryGraph, GeometryValidationError, evaluate_geometry_document
from app.geometry.models import GeometryDocument
from app.geometry.script import ConstructionScriptError, evaluate_script

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "sliders.json"


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


def test_slider_evaluation() -> None:
    document = GeometryDocument.model_validate({
        "schemaVersion": 1,
        "id": "slider_test",
        "title": "Slider test",
        "objects": [
            {
                "id": "s1",
                "label": "s1",
                "kind": "slider",
                "definition": {"type": "slider", "min": 0, "max": 10, "value": 5, "step": 0.5}
            }
        ]
    })
    values = evaluate_geometry_document(document)
    assert values["s1"].type == "scalar"
    assert values["s1"].value == 5


def test_shared_sliders_fixture_evaluates_circle_radius_from_slider() -> None:
    """A circle can take a slider's scalar value as its radius (Finding 1)."""

    fixture = load_fixture()
    document = GeometryDocument.model_validate(fixture["document"])

    values = dump_values(evaluate_geometry_document(document))

    assert document.objects[2].definition.type == "center_radius"
    assert_nested_close(values, fixture["initialValues"])


def test_shared_sliders_fixture_moving_center_keeps_slider_derived_radius() -> None:
    """Moving the circle's center point recomputes it while the slider-derived radius stays fixed."""

    fixture = load_fixture()
    graph = GeometryGraph(GeometryDocument.model_validate(fixture["document"]))
    move = fixture["move"]

    result = graph.move_free_point(move["pointId"], move["x"], move["y"])
    values = dump_values(result.values)

    assert result.recomputed_object_ids == move["expectedRecomputed"]
    for object_id, expected in move["expectedValues"].items():
        assert_nested_close(values[object_id], expected)


def test_circle_by_center_radius_rejects_non_scalar_parent() -> None:
    document = GeometryDocument.model_validate({
        "schemaVersion": 1,
        "id": "invalid_radius",
        "title": "Invalid radius parent",
        "objects": [
            {"id": "p", "label": "p", "kind": "point", "definition": {"type": "free", "x": 0, "y": 0}},
            {"id": "q", "label": "q", "kind": "point", "definition": {"type": "free", "x": 1, "y": 0}},
            {
                "id": "c",
                "label": "c",
                "kind": "circle",
                "definition": {"type": "center_radius", "center": "p", "radius": "q"},
            },
        ],
    })

    with pytest.raises(GeometryValidationError, match="produce a scalar value"):
        GeometryGraph(document)


def test_circle_by_center_radius_is_undefined_for_negative_radius() -> None:
    document = GeometryDocument.model_validate({
        "schemaVersion": 1,
        "id": "negative_radius",
        "title": "Negative radius",
        "objects": [
            {"id": "p", "label": "p", "kind": "point", "definition": {"type": "free", "x": 0, "y": 0}},
            {
                "id": "s1",
                "label": "s1",
                "kind": "slider",
                "definition": {"type": "slider", "min": -10, "max": 10, "value": -3, "step": 1},
            },
            {
                "id": "c",
                "label": "c",
                "kind": "circle",
                "definition": {"type": "center_radius", "center": "p", "radius": "s1"},
            },
        ],
    })

    values = evaluate_geometry_document(document)

    assert values["c"].type == "undefined"
    assert values["c"].code == "negative_radius"  # type: ignore[union-attr]


def test_script_parser_supports_slider_and_center_radius_circle() -> None:
    document, values = evaluate_script(
        "s1 = Slider(0, 10, 5, 0.5)\n"
        "p = Point(0, 0)\n"
        "c = Circle(p, s1)\n"
    )

    assert document.objects[0].definition.type == "slider"
    assert document.objects[2].definition.type == "center_radius"
    assert values["c"].type == "circle"
    assert values["c"].radius == pytest.approx(5.0)


def test_script_rejects_circle_with_non_point_non_slider_second_argument() -> None:
    with pytest.raises(ConstructionScriptError, match="must reference a point or slider"):
        evaluate_script(
            "A = Point(0, 0)\n"
            "B = Point(1, 0)\n"
            "AB = Line(A, B)\n"
            "c = Circle(A, AB)\n"
        )


def test_object_command_bar_regression_slider_does_not_break_subsequent_commands() -> None:
    """Regression test for Finding 2.

    `documentToScript` (frontend) emits a `Slider(min, max, value, step)` statement
    for any document containing a slider. Before this fix, the backend parser did
    not recognize the `Slider` command, so re-submitting the exported script (or any
    new command typed into the object command bar) for a document containing a
    slider failed with "Unknown command 'Slider'". This reproduces the exact script
    text `documentToScript` would emit for a slider + a dependent point + a
    scalar-radius circle, and confirms the backend now parses and evaluates it.
    """

    # Mirrors frontend/src/persistence/documentPersistence.ts's objectToScript output
    # for a Slider followed by a Point and a center_radius Circle.
    exported_script = (
        "s1 = Slider(0, 10, 5, 0.5)\n"
        "p = Point(0, 0)\n"
        "c = Circle(p, s1)\n"
    )

    document, values = evaluate_script(exported_script, document_id="command-bar-regression")

    assert [obj.id for obj in document.objects] == ["s1", "p", "c"]
    assert values["c"].type == "circle"
    assert values["c"].radius == pytest.approx(5.0)
