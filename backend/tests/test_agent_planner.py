import pytest

from app.agent.planner import RuleBasedPlanner, UnsupportedRequestError
from app.geometry.script import evaluate_script


def test_create_triangle_abc_generates_valid_complete_script() -> None:
    response = RuleBasedPlanner().generate_plan("Create triangle ABC")

    assert response.generated_script == (
        "A = Point(0, 0)\n"
        "B = Point(5, 0)\n"
        "C = Point(2, 3)\n"
        "AB = Segment(A, B)\n"
        "BC = Segment(B, C)\n"
        "CA = Segment(C, A)"
    )
    document, _ = evaluate_script(response.generated_script)
    assert [item.id for item in document.objects] == ["A", "B", "C", "AB", "BC", "CA"]
    assert response.warnings == []


def test_midpoint_request_extends_current_script() -> None:
    current = "A = Point(0, 0)\nB = Point(4, 0)\nAB = Segment(A, B)"

    response = RuleBasedPlanner().generate_plan("Construct midpoint of AB", current)

    assert response.generated_script.endswith("M = Midpoint(A, B)")
    document, values = evaluate_script(response.generated_script)
    assert document.objects[-1].definition.type == "midpoint"
    assert values["M"].model_dump() == {"type": "point", "x": 2.0, "y": 0.0}


def test_altitude_request_creates_supporting_line_and_perpendicular() -> None:
    current = (
        "A = Point(0, 0)\n"
        "B = Point(5, 0)\n"
        "C = Point(2, 3)\n"
        "AB = Segment(A, B)\n"
        "BC = Segment(B, C)\n"
        "CA = Segment(C, A)"
    )

    response = RuleBasedPlanner().generate_plan("Construct altitude from C", current)

    assert "line_AB = Line(A, B)" in response.generated_script
    assert "h_C = PerpendicularLine(C, line_AB)" in response.generated_script
    _, values = evaluate_script(response.generated_script)
    assert values["h_C"].model_dump() == {"type": "line", "a": 1.0, "b": 0.0, "c": -2.0}


def test_combined_triangle_and_altitude_request_is_supported() -> None:
    response = RuleBasedPlanner().generate_plan(
        "Construct triangle ABC and draw the altitude from C."
    )

    assert "AB = Segment(A, B)" in response.generated_script
    assert "line_AB = Line(A, B)" in response.generated_script
    assert "h_C = PerpendicularLine(C, line_AB)" in response.generated_script
    assert len(response.plan) == 4


def test_invalid_request_is_rejected_deterministically() -> None:
    with pytest.raises(UnsupportedRequestError, match="currently plan"):
        RuleBasedPlanner().generate_plan("Prove that every cyclic quadrilateral has nice angles")

