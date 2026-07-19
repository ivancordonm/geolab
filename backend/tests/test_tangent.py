"""Direct evaluator tests for the tangent_pc construction.

Note: the `Tangent(...)` script command does not exist yet (Task 3 adds it).
These tests exercise `_tangent_point_circle` directly, without the parser.
"""

from math import isclose

import pytest

from app.geometry.engine import _tangent_point_circle
from app.geometry.models import CircleValue, Coordinate, PointValue
from app.geometry.script import ConstructionScriptError, evaluate_script


def test_two_tangents_from_external_point():
    # Circle centre (0,0) r=3; external point at (5,0). Tangent length = 4.
    circle = CircleValue(center=Coordinate(x=0, y=0), radius=3)
    point = PointValue(x=5, y=0)
    t1 = _tangent_point_circle(point, circle, index=1, selector=None)
    t2 = _tangent_point_circle(point, circle, index=2, selector=None)
    assert t1.type == "line" and t2.type == "line"
    # The two tangent lines are distinct.
    assert not (
        isclose(t1.a, t2.a, abs_tol=1e-9)
        and isclose(t1.b, t2.b, abs_tol=1e-9)
        and isclose(t1.c, t2.c, abs_tol=1e-9)
    )
    # Both lines pass through P=(5,0).
    for t in (t1, t2):
        assert isclose(t.a * 5 + t.b * 0 + t.c, 0.0, abs_tol=1e-9)


def test_point_inside_circle_is_undefined():
    circle = CircleValue(center=Coordinate(x=0, y=0), radius=3)
    point = PointValue(x=1, y=0)
    result = _tangent_point_circle(point, circle, index=1, selector=None)
    assert result.type == "undefined"
    assert result.code == "no_tangent"


def test_point_on_circle_single_tangent():
    # P=(3,0) on the circle: tangent is the vertical line x=3 -> a=1,b=0,c=-3.
    circle = CircleValue(center=Coordinate(x=0, y=0), radius=3)
    point = PointValue(x=3, y=0)
    t1 = _tangent_point_circle(point, circle, index=1, selector=None)
    assert t1.type == "line"
    assert isclose(abs(t1.a), 1.0, abs_tol=1e-9)
    assert isclose(t1.b, 0.0, abs_tol=1e-9)
    assert isclose(t1.a * 3 + t1.b * 0 + t1.c, 0.0, abs_tol=1e-9)


def test_tangent_evaluator_direct():
    circle = CircleValue(center=Coordinate(x=0, y=0), radius=3)
    p = PointValue(x=5, y=0)
    line1 = _tangent_point_circle(p, circle, index=1, selector=None)
    assert line1.type == "line"
    assert abs(line1.a * 5 + line1.b * 0 + line1.c) < 1e-9


# ─── Parser-driven tests (Task 3: the `Tangent(...)` script command) ───────


def test_tangent_command_two_tangents_from_external_point():
    document, _ = evaluate_script(
        "O = Point(0,0)\nR = Point(3,0)\nc = Circle(O, R)\nP = Point(5,0)\n"
        "t1 = Tangent(P, c, 1)\nt2 = Tangent(P, c, 2)\n",
        document_id="doc", title="t",
    )
    ids = {o.id: o for o in document.objects}
    for tid in ("t1", "t2"):
        obj = ids[tid]
        assert obj.kind == "line"
        assert obj.definition.type == "tangent_pc"
        assert obj.definition.point == "P"
        assert obj.definition.circle == "c"
    assert ids["t1"].definition.index == 1
    assert ids["t2"].definition.index == 2


def test_tangent_command_selector_form():
    document, _ = evaluate_script(
        "O = Point(0,0)\nR = Point(3,0)\nc = Circle(O, R)\nP = Point(5,0)\n"
        "t = Tangent(P, c, first)\n",
        document_id="doc", title="t",
    )
    ids = {o.id: o for o in document.objects}
    assert ids["t"].definition.selector == "first"
    assert ids["t"].definition.index is None


def test_tangent_command_rejects_bad_arity():
    with pytest.raises(ConstructionScriptError) as error_info:
        evaluate_script(
            "O=Point(0,0)\nR=Point(3,0)\nc=Circle(O,R)\nP=Point(5,0)\nt=Tangent(P, c)\n",
            document_id="d", title="t",
        )
    assert error_info.value.diagnostic.code == "invalid_arity"
