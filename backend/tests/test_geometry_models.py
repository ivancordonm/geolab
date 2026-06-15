import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.geometry.engine import GeometryGraph, GeometryValidationError, evaluate_geometry_document
from app.geometry.models import (
    GeometryDocument,
    geometry_document_from_json,
    geometry_document_to_json,
)

FIXTURE_PATH = (
    Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "basic-geometry.json"
)


def load_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text())


def dump_values(values: dict[str, Any]) -> dict[str, Any]:
    return {key: value.model_dump(by_alias=True) for key, value in values.items()}


def assert_nested_close(actual: Any, expected: Any) -> None:
    if isinstance(expected, dict):
        assert actual.keys() == expected.keys()
        for key in expected:
            assert_nested_close(actual[key], expected[key])
    elif isinstance(expected, list):
        assert len(actual) == len(expected)
        for actual_item, expected_item in zip(actual, expected, strict=True):
            assert_nested_close(actual_item, expected_item)
    elif isinstance(expected, float):
        assert actual == pytest.approx(expected)
    else:
        assert actual == expected


def test_shared_document_parses_and_serializes_with_camel_case_fields() -> None:
    fixture = load_fixture()
    document = GeometryDocument.model_validate(fixture["document"])

    serialized = geometry_document_to_json(document)
    restored = geometry_document_from_json(serialized)

    assert restored == document
    serialized_payload = json.loads(serialized)
    assert serialized_payload["schemaVersion"] == 1
    assert serialized_payload["objects"][3]["definition"]["pointA"] == "A"


def test_all_supported_constructions_match_shared_fixture() -> None:
    fixture = load_fixture()
    document = GeometryDocument.model_validate(fixture["document"])

    values = dump_values(evaluate_geometry_document(document))

    assert_nested_close(values, fixture["initialValues"])


def test_moving_free_point_recomputes_only_transitive_dependants() -> None:
    fixture = load_fixture()
    graph = GeometryGraph(GeometryDocument.model_validate(fixture["document"]))
    move = fixture["move"]

    result = graph.move_free_point(move["pointId"], move["x"], move["y"])
    values = dump_values(result.values)

    assert result.recomputed_object_ids == move["expectedRecomputed"]
    for object_id, expected in move["expectedValues"].items():
        assert_nested_close(values[object_id], expected)
    assert_nested_close(values["c1"], fixture["initialValues"]["c1"])


def test_degenerate_line_and_its_dependants_are_undefined() -> None:
    fixture = load_fixture()
    graph = GeometryGraph(GeometryDocument.model_validate(fixture["document"]))

    result = graph.move_free_point("B", 0, 0)

    assert result.values["l1"].type == "undefined"
    assert result.values["l1"].code == "coincident_points"
    assert result.values["p"].type == "undefined"
    assert result.values["p"].code == "parent_undefined"


def test_invalid_documents_and_derived_point_moves_are_rejected() -> None:
    fixture = load_fixture()
    duplicate = fixture["document"] | {
        "objects": fixture["document"]["objects"]
        + [fixture["document"]["objects"][0]]
    }
    with pytest.raises(ValidationError, match="ids must be unique"):
        GeometryDocument.model_validate(duplicate)

    missing_parent = fixture["document"].copy()
    missing_parent["objects"] = [item.copy() for item in fixture["document"]["objects"]]
    missing_parent["objects"][3]["definition"] = {
        "type": "through_points",
        "pointA": "missing",
        "pointB": "B",
    }
    with pytest.raises(GeometryValidationError, match="missing parent"):
        GeometryGraph(GeometryDocument.model_validate(missing_parent))

    graph = GeometryGraph(GeometryDocument.model_validate(fixture["document"]))
    with pytest.raises(GeometryValidationError, match="not a free point"):
        graph.move_free_point("M", 1, 1)


def test_dependency_cycles_are_rejected() -> None:
    cyclic = {
        "schemaVersion": 1,
        "id": "cyclic",
        "title": "Cyclic lines",
        "objects": [
            {
                "id": "A",
                "label": "A",
                "kind": "point",
                "visible": True,
                "definition": {"type": "free", "x": 0, "y": 0},
            },
            {
                "id": "p",
                "label": "p",
                "kind": "line",
                "visible": True,
                "definition": {"type": "parallel_through", "point": "A", "line": "q"},
            },
            {
                "id": "q",
                "label": "q",
                "kind": "line",
                "visible": True,
                "definition": {"type": "parallel_through", "point": "A", "line": "p"},
            },
        ],
    }

    with pytest.raises(GeometryValidationError, match="Dependency cycle detected"):
        GeometryGraph(GeometryDocument.model_validate(cyclic))


def test_directional_selectors_recompute_from_current_parent_geometry() -> None:
    document = GeometryDocument.model_validate(
        {
            "schemaVersion": 1,
            "id": "dynamic-selector",
            "title": "Dynamic selector",
            "objects": [
                {"id": "A", "label": "A", "kind": "point", "definition": {"type": "free", "x": 0, "y": 0}},
                {"id": "B", "label": "B", "kind": "point", "definition": {"type": "free", "x": 4, "y": 0}},
                {"id": "cA", "label": "cA", "kind": "circle", "definition": {"type": "center_through_point", "center": "A", "point": "B"}},
                {"id": "cB", "label": "cB", "kind": "circle", "definition": {"type": "center_through_point", "center": "B", "point": "A"}},
                {"id": "C", "label": "C", "kind": "point", "definition": {"type": "intersection_cc", "circleA": "cA", "circleB": "cB", "selector": "upper"}},
            ],
        }
    )
    graph = GeometryGraph(document)

    assert graph.values["C"].type == "point"
    assert graph.values["C"].y > 0  # type: ignore[union-attr]
    moved = graph.move_free_point("B", 0, 4)
    assert moved.values["C"].type == "undefined"
    assert moved.values["C"].code == "ambiguous_selector"  # type: ignore[union-attr]
