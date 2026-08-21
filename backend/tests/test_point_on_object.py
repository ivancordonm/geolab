"""Direct evaluator tests for on_line/on_segment/on_circle/on_arc.

Mirrors backend/tests/test_tangent.py: direct evaluator tests first
(Task 5), then script-driven tests once the `Point(object)` overload
exists (Task 6).
"""

from math import isclose, nan, pi

import pytest

from app.geometry.engine import (
    GeometryValidationError,
    _point_on_arc,
    _point_on_circle,
    _point_on_line,
    _point_on_segment,
    evaluate_geometry_document,
)
from app.geometry.models import ArcValue, CircleValue, Coordinate, LineValue, PointValue, SegmentValue
from app.geometry.script import ConstructionScriptError, evaluate_script


def test_point_on_line_at_t():
    line = LineValue(a=0, b=1, c=0)  # the x-axis
    point = _point_on_line(line, 2.0)
    assert isclose(point.x, -2.0, abs_tol=1e-9)
    assert isclose(point.y, 0.0, abs_tol=1e-9)


def test_point_on_segment_clamps_to_endpoints():
    segment = SegmentValue(start=Coordinate(x=0, y=0), end=Coordinate(x=4, y=0))
    assert _point_on_segment(segment, 5.0) == PointValue(x=4, y=0)
    assert _point_on_segment(segment, -5.0) == PointValue(x=0, y=0)
    assert _point_on_segment(segment, 0.5) == PointValue(x=2, y=0)


def test_point_on_circle_at_angle():
    circle = CircleValue(center=Coordinate(x=0, y=0), radius=5)
    point = _point_on_circle(circle, pi)
    assert isclose(point.x, -5.0, abs_tol=1e-9)
    assert isclose(point.y, 0.0, abs_tol=1e-9)


def test_point_on_arc_clamps_to_the_arc_range():
    # Upper half-circle: start=(5,0) angle 0, mid=(0,5) angle pi/2, end=(-5,0) angle pi.
    arc = ArcValue(
        center=Coordinate(x=0, y=0),
        radius=5,
        start=Coordinate(x=5, y=0),
        mid=Coordinate(x=0, y=5),
        end=Coordinate(x=-5, y=0),
    )
    on_arc = _point_on_arc(arc, pi / 2)
    assert isclose(on_arc.x, 0.0, abs_tol=1e-9)
    assert isclose(on_arc.y, 5.0, abs_tol=1e-9)
    # -pi/2 (the excluded lower half) is exactly antipodal to the arc's midpoint,
    # i.e. equidistant from both endpoints. The frontend's clampAngleToArc (which
    # this evaluator mirrors bit-for-bit) breaks this exact tie toward the end
    # (its `<=` comparison), per the documented precedent in
    # frontend/src/geometry/engine.test.ts ("point on object" > "clamps a point
    # on an arc to the arc's angular range").
    clamped = _point_on_arc(arc, -pi / 2)
    assert isclose(clamped.x, -5.0, abs_tol=1e-9)
    assert isclose(clamped.y, 0.0, abs_tol=1e-9)


def test_point_command_on_a_line_uses_the_clicked_default():
    document, values = evaluate_script(
        "A = Point(0,0)\nB = Point(4,0)\nl = Line(A,B)\nP = Point(l)\n",
        document_id="doc", title="t",
    )
    ids = {o.id: o for o in document.objects}
    assert ids["P"].kind == "point"
    assert ids["P"].definition.type == "on_line"
    assert ids["P"].definition.line == "l"
    assert ids["P"].definition.t == 0.0
    assert values["P"].type == "point"


def test_point_command_on_a_segment():
    document, values = evaluate_script(
        "A = Point(0,0)\nB = Point(4,0)\ns = Segment(A,B)\nP = Point(s)\n",
        document_id="doc", title="t",
    )
    ids = {o.id: o for o in document.objects}
    assert ids["P"].definition.type == "on_segment"
    assert ids["P"].definition.segment == "s"
    assert values["P"].type == "point"


def test_point_command_on_a_circle():
    document, values = evaluate_script(
        "O = Point(0,0)\nR = Point(3,0)\nc = Circle(O,R)\nP = Point(c)\n",
        document_id="doc", title="t",
    )
    ids = {o.id: o for o in document.objects}
    assert ids["P"].definition.type == "on_circle"
    assert ids["P"].definition.circle == "c"
    assert values["P"].type == "point"


def test_point_command_on_an_arc_defaults_to_the_mid_angle():
    document, values = evaluate_script(
        "E = Point(5,0)\nF = Point(0,5)\nG = Point(-5,0)\narc1 = Arc(E,F,G)\nP = Point(arc1)\n",
        document_id="doc", title="t",
    )
    ids = {o.id: o for o in document.objects}
    assert ids["P"].definition.type == "on_arc"
    assert ids["P"].definition.arc == "arc1"
    point = values["P"]
    assert point.type == "point"
    assert isclose(point.x, 0.0, abs_tol=1e-9)
    assert isclose(point.y, 5.0, abs_tol=1e-9)  # the arc's own mid point


def test_point_command_rejects_a_non_projectable_reference():
    with pytest.raises(ConstructionScriptError) as error_info:
        evaluate_script(
            "A=Point(0,0)\nB=Point(4,0)\nC=Point(2,3)\npoly=Polygon(A,B,C)\nP=Point(poly)\n",
            document_id="d", title="t",
        )
    assert error_info.value.diagnostic.code == "invalid_reference_type"


def test_point_on_line_rejects_a_non_finite_parameter():
    document, _ = evaluate_script(
        "A = Point(0,0)\nB = Point(4,0)\nl = Line(A,B)\nP = Point(l)\n",
        document_id="doc", title="t",
    )
    # Models are frozen, so rebuild the document the way a hostile JSON import would.
    corrupted = document.model_copy(
        update={
            "objects": [
                o.model_copy(update={"definition": o.definition.model_copy(update={"t": nan})})
                if o.id == "P"
                else o
                for o in document.objects
            ]
        }
    )
    with pytest.raises(GeometryValidationError):
        evaluate_geometry_document(corrupted)
