"""Tests for slider parameter objects."""

from app.geometry.engine import evaluate_geometry_document
from app.geometry.models import GeometryDocument


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
