from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_evaluate_script_endpoint_returns_document_and_values() -> None:
    response = client.post(
        "/geometry/evaluate-script",
        json={
            "script": (
                "A = Point(0, 0)\n"
                "B = Point(4, 0)\n"
                "AB = Line(A, B)\n"
                "M = Midpoint(A, B)"
            ),
            "documentId": "api_document",
            "title": "API construction",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["document"]["schemaVersion"] == 1
    assert payload["document"]["id"] == "api_document"
    assert payload["document"]["objects"][2]["definition"] == {
        "type": "through_points",
        "pointA": "A",
        "pointB": "B",
    }
    assert payload["values"]["M"] == {"type": "point", "x": 2.0, "y": 0.0}


def test_evaluate_script_endpoint_returns_line_numbered_error() -> None:
    response = client.post(
        "/geometry/evaluate-script",
        json={"script": "A = Point(0, 0)\nAB = Line(A, B)"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == {
        "code": "undefined_reference",
        "message": "Object 'B' must be defined before it is used",
        "line": 2,
        "column": 14,
        "sourceLine": "AB = Line(A, B)",
    }

