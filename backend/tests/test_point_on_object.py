"""Direct evaluator tests for on_line/on_segment/on_circle/on_arc.

Mirrors backend/tests/test_tangent.py: direct evaluator tests first
(Task 5), then script-driven tests once the `Point(object)` overload
exists (Task 6).
"""

from math import isclose, pi

from app.geometry.engine import _point_on_arc, _point_on_circle, _point_on_line, _point_on_segment
from app.geometry.models import ArcValue, CircleValue, Coordinate, LineValue, PointValue, SegmentValue


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
