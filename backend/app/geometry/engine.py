"""Dependency graph and deterministic evaluators for classical 2D geometry."""

from __future__ import annotations

from collections import deque
from math import cos, hypot, isfinite, pi, sin, sqrt

from app.geometry.models import (
    AngleBisectorDefinition,
    CircleByCenterPointDefinition,
    CircleValue,
    CircumscribedDefinition,
    Coordinate,
    EvaluatedValue,
    FreePointDefinition,
    GeometryDocument,
    GeometryObject,
    HomothetyPointDefinition,
    HomothetyScalarDefinition,
    IntersectionCCDefinition,
    IntersectionLCDefinition,
    IntersectionLLDefinition,
    InversionInCircleDefinition,
    LineThroughPointsDefinition,
    LineValue,
    MidpointDefinition,
    ParallelLineDefinition,
    PerpendicularBisectorDefinition,
    PerpendicularLineDefinition,
    Point,
    PointValue,
    ReflectionOverLineDefinition,
    ReflectionOverPointDefinition,
    RotationDefinition,
    SegmentBetweenPointsDefinition,
    SegmentValue,
    TranslationDefinition,
    UndefinedValue,
)

GEOMETRY_EPSILON = 1e-9


class GeometryValidationError(ValueError):
    """Raised when construction references do not form a valid geometry DAG."""


class RecomputeResult:
    """Snapshot returned after moving and recomputing a free point."""

    def __init__(
        self,
        document: GeometryDocument,
        values: dict[str, EvaluatedValue],
        recomputed_object_ids: list[str],
    ) -> None:
        self.document = document
        self.values = values
        self.recomputed_object_ids = recomputed_object_ids


def get_parent_ids(obj: GeometryObject) -> list[str]:
    """Return construction parent IDs in deterministic argument order."""

    definition = obj.definition
    if isinstance(definition, FreePointDefinition):
        return []
    if isinstance(definition, (LineThroughPointsDefinition, SegmentBetweenPointsDefinition, MidpointDefinition, PerpendicularBisectorDefinition)):
        return [definition.point_a, definition.point_b]
    if isinstance(definition, CircleByCenterPointDefinition):
        return [definition.center, definition.point]
    if isinstance(definition, (ParallelLineDefinition, PerpendicularLineDefinition)):
        return [definition.point, definition.line]
    if isinstance(definition, IntersectionLLDefinition):
        return [definition.line_a, definition.line_b]
    if isinstance(definition, IntersectionLCDefinition):
        return [definition.line, definition.circle]
    if isinstance(definition, IntersectionCCDefinition):
        return [definition.circle_a, definition.circle_b]
    if isinstance(definition, AngleBisectorDefinition):
        return [definition.arm_a, definition.vertex, definition.arm_b]
    if isinstance(definition, CircumscribedDefinition):
        return [definition.point_a, definition.point_b, definition.point_c]
    if isinstance(definition, ReflectionOverLineDefinition):
        return [definition.point, definition.line]
    if isinstance(definition, ReflectionOverPointDefinition):
        return [definition.point, definition.center]
    if isinstance(definition, HomothetyScalarDefinition):
        return [definition.center, definition.point]
    if isinstance(definition, HomothetyPointDefinition):
        return [definition.center, definition.point, definition.ratio_point]
    if isinstance(definition, InversionInCircleDefinition):
        return [definition.point, definition.circle]
    if isinstance(definition, TranslationDefinition):
        return [definition.point, definition.from_, definition.to]
    if isinstance(definition, RotationDefinition):
        return [definition.point, definition.center]
    raise GeometryValidationError(f"Unsupported definition for object '{obj.id}'")


class GeometryGraph:
    """Validated dependency DAG with cached deterministic evaluated values."""

    def __init__(self, document: GeometryDocument) -> None:
        self._document = document.model_copy(deep=True)
        self._objects_by_id: dict[str, GeometryObject] = {}
        self._parents_by_id: dict[str, list[str]] = {}
        self._dependants_by_id: dict[str, set[str]] = {}
        self._values: dict[str, EvaluatedValue] = {}

        self._index_and_validate_document()
        self._topological_order = self._build_topological_order()
        self._recompute_ids(set(self._topological_order))

    @property
    def document(self) -> GeometryDocument:
        return self._document.model_copy(deep=True)

    @property
    def values(self) -> dict[str, EvaluatedValue]:
        return {object_id: value.model_copy(deep=True) for object_id, value in self._values.items()}

    def move_free_point(self, point_id: str, x: float, y: float) -> RecomputeResult:
        """Move one free point and recompute only its transitive dependants."""

        if not isfinite(x) or not isfinite(y):
            raise GeometryValidationError("Point coordinates must be finite")

        obj = self._objects_by_id.get(point_id)
        if obj is None:
            raise GeometryValidationError(f"Unknown point '{point_id}'")
        if not isinstance(obj, Point):
            raise GeometryValidationError(f"Object '{point_id}' is not a free point")

        updated = obj.model_copy(update={"definition": FreePointDefinition(x=x, y=y)})
        self._objects_by_id[point_id] = updated
        self._document = self._document.model_copy(
            update={
                "objects": [updated if candidate.id == point_id else candidate for candidate in self._document.objects]
            },
            deep=True,
        )

        affected = self._collect_dependants(point_id)
        recomputed = self._recompute_ids(affected)
        return RecomputeResult(self.document, self.values, recomputed)

    def _index_and_validate_document(self) -> None:
        for obj in self._document.objects:
            self._objects_by_id[obj.id] = obj
            self._dependants_by_id[obj.id] = set()

        for obj in self._document.objects:
            parent_ids = get_parent_ids(obj)
            self._parents_by_id[obj.id] = parent_ids
            for parent_id in parent_ids:
                if parent_id not in self._objects_by_id:
                    raise GeometryValidationError(
                        f"Object '{obj.id}' references missing parent '{parent_id}'"
                    )
                self._dependants_by_id[parent_id].add(obj.id)
            self._validate_parent_kinds(obj)

    def _validate_parent_kinds(self, obj: GeometryObject) -> None:
        definition = obj.definition

        def require_kind(parent_id: str, expected: str) -> None:
            actual = self._objects_by_id[parent_id].kind
            if actual != expected:
                raise GeometryValidationError(
                    f"Object '{obj.id}' requires parent '{parent_id}' to be a {expected}"
                )

        if isinstance(definition, FreePointDefinition):
            if not isfinite(definition.x) or not isfinite(definition.y):
                raise GeometryValidationError(f"Point '{obj.id}' coordinates must be finite")
        elif isinstance(definition, (LineThroughPointsDefinition, SegmentBetweenPointsDefinition, MidpointDefinition, PerpendicularBisectorDefinition)):
            require_kind(definition.point_a, "point")
            require_kind(definition.point_b, "point")
        elif isinstance(definition, CircleByCenterPointDefinition):
            require_kind(definition.center, "point")
            require_kind(definition.point, "point")
        elif isinstance(definition, (ParallelLineDefinition, PerpendicularLineDefinition)):
            require_kind(definition.point, "point")
            require_kind(definition.line, "line")
        elif isinstance(definition, IntersectionLLDefinition):
            require_kind(definition.line_a, "line")
            require_kind(definition.line_b, "line")
        elif isinstance(definition, IntersectionLCDefinition):
            require_kind(definition.line, "line")
            require_kind(definition.circle, "circle")
        elif isinstance(definition, IntersectionCCDefinition):
            require_kind(definition.circle_a, "circle")
            require_kind(definition.circle_b, "circle")
        elif isinstance(definition, AngleBisectorDefinition):
            require_kind(definition.arm_a, "point")
            require_kind(definition.vertex, "point")
            require_kind(definition.arm_b, "point")
        elif isinstance(definition, CircumscribedDefinition):
            require_kind(definition.point_a, "point")
            require_kind(definition.point_b, "point")
            require_kind(definition.point_c, "point")
        elif isinstance(definition, ReflectionOverLineDefinition):
            require_kind(definition.point, "point")
            require_kind(definition.line, "line")
        elif isinstance(definition, ReflectionOverPointDefinition):
            require_kind(definition.point, "point")
            require_kind(definition.center, "point")
        elif isinstance(definition, HomothetyScalarDefinition):
            require_kind(definition.center, "point")
            require_kind(definition.point, "point")
            if not isfinite(definition.ratio):
                raise GeometryValidationError(f"Object '{obj.id}' ratio must be finite")
        elif isinstance(definition, HomothetyPointDefinition):
            require_kind(definition.center, "point")
            require_kind(definition.point, "point")
            require_kind(definition.ratio_point, "point")
        elif isinstance(definition, InversionInCircleDefinition):
            require_kind(definition.point, "point")
            require_kind(definition.circle, "circle")
        elif isinstance(definition, TranslationDefinition):
            require_kind(definition.point, "point")
            require_kind(definition.from_, "point")
            require_kind(definition.to, "point")
        elif isinstance(definition, RotationDefinition):
            require_kind(definition.point, "point")
            require_kind(definition.center, "point")
            if not isfinite(definition.degrees):
                raise GeometryValidationError(f"Object '{obj.id}' degrees must be finite")

    def _build_topological_order(self) -> list[str]:
        states: dict[str, str] = {}
        order: list[str] = []

        def visit(object_id: str) -> None:
            state = states.get(object_id)
            if state == "visiting":
                raise GeometryValidationError(f"Dependency cycle detected at '{object_id}'")
            if state == "visited":
                return

            states[object_id] = "visiting"
            for parent_id in self._parents_by_id.get(object_id, []):
                visit(parent_id)
            states[object_id] = "visited"
            order.append(object_id)

        for obj in self._document.objects:
            visit(obj.id)
        return order

    def _collect_dependants(self, root_id: str) -> set[str]:
        affected = {root_id}
        pending = deque([root_id])
        while pending:
            current = pending.popleft()
            for dependant in self._dependants_by_id[current]:
                if dependant not in affected:
                    affected.add(dependant)
                    pending.append(dependant)
        return affected

    def _recompute_ids(self, object_ids: set[str]) -> list[str]:
        recomputed: list[str] = []
        for object_id in self._topological_order:
            if object_id not in object_ids:
                continue
            self._values[object_id] = self._evaluate_object(self._objects_by_id[object_id])
            recomputed.append(object_id)
        return recomputed

    def _evaluate_object(self, obj: GeometryObject) -> EvaluatedValue:  # noqa: PLR0911, PLR0912
        definition = obj.definition

        if isinstance(definition, FreePointDefinition):
            return PointValue(x=definition.x, y=definition.y)

        if isinstance(definition, LineThroughPointsDefinition):
            points = self._require_points(obj.id, definition.point_a, definition.point_b)
            return points if isinstance(points, UndefinedValue) else _line_through_points(*points)

        if isinstance(definition, SegmentBetweenPointsDefinition):
            points = self._require_points(obj.id, definition.point_a, definition.point_b)
            if isinstance(points, UndefinedValue):
                return points
            return SegmentValue(start=Coordinate(x=points[0].x, y=points[0].y), end=Coordinate(x=points[1].x, y=points[1].y))

        if isinstance(definition, MidpointDefinition):
            points = self._require_points(obj.id, definition.point_a, definition.point_b)
            if isinstance(points, UndefinedValue):
                return points
            return PointValue(x=(points[0].x + points[1].x) / 2, y=(points[0].y + points[1].y) / 2)

        if isinstance(definition, CircleByCenterPointDefinition):
            points = self._require_points(obj.id, definition.center, definition.point)
            if isinstance(points, UndefinedValue):
                return points
            return CircleValue(center=Coordinate(x=points[0].x, y=points[0].y), radius=hypot(points[1].x - points[0].x, points[1].y - points[0].y))

        if isinstance(definition, (ParallelLineDefinition, PerpendicularLineDefinition)):
            point = self._require_value(obj.id, definition.point, "point")
            if isinstance(point, UndefinedValue):
                return point
            line = self._require_value(obj.id, definition.line, "line")
            if isinstance(line, UndefinedValue):
                return line
            assert isinstance(point, PointValue)
            assert isinstance(line, LineValue)
            if isinstance(definition, ParallelLineDefinition):
                return _canonical_line(line.a, line.b, -(line.a * point.x + line.b * point.y))
            return _canonical_line(-line.b, line.a, line.b * point.x - line.a * point.y)

        # ─── New: intersections ────────────────────────────────────────────

        if isinstance(definition, IntersectionLLDefinition):
            lA = self._require_value(obj.id, definition.line_a, "line")
            if isinstance(lA, UndefinedValue):
                return lA
            lB = self._require_value(obj.id, definition.line_b, "line")
            if isinstance(lB, UndefinedValue):
                return lB
            assert isinstance(lA, LineValue)
            assert isinstance(lB, LineValue)
            return _intersect_lines(lA, lB)

        if isinstance(definition, IntersectionLCDefinition):
            ln = self._require_value(obj.id, definition.line, "line")
            if isinstance(ln, UndefinedValue):
                return ln
            cr = self._require_value(obj.id, definition.circle, "circle")
            if isinstance(cr, UndefinedValue):
                return cr
            assert isinstance(ln, LineValue)
            assert isinstance(cr, CircleValue)
            return _intersect_line_circle(ln, cr, definition.index)

        if isinstance(definition, IntersectionCCDefinition):
            cA = self._require_value(obj.id, definition.circle_a, "circle")
            if isinstance(cA, UndefinedValue):
                return cA
            cB = self._require_value(obj.id, definition.circle_b, "circle")
            if isinstance(cB, UndefinedValue):
                return cB
            assert isinstance(cA, CircleValue)
            assert isinstance(cB, CircleValue)
            return _intersect_circle_circle(cA, cB, definition.index)

        # ─── New: bisectors / circumcircle ────────────────────────────────

        if isinstance(definition, PerpendicularBisectorDefinition):
            points = self._require_points(obj.id, definition.point_a, definition.point_b)
            if isinstance(points, UndefinedValue):
                return points
            return _perpendicular_bisector(*points)

        if isinstance(definition, AngleBisectorDefinition):
            arm_a = self._require_value(obj.id, definition.arm_a, "point")
            if isinstance(arm_a, UndefinedValue):
                return arm_a
            vertex = self._require_value(obj.id, definition.vertex, "point")
            if isinstance(vertex, UndefinedValue):
                return vertex
            arm_b = self._require_value(obj.id, definition.arm_b, "point")
            if isinstance(arm_b, UndefinedValue):
                return arm_b
            assert isinstance(arm_a, PointValue)
            assert isinstance(vertex, PointValue)
            assert isinstance(arm_b, PointValue)
            return _angle_bisector(arm_a, vertex, arm_b)

        if isinstance(definition, CircumscribedDefinition):
            pA = self._require_value(obj.id, definition.point_a, "point")
            if isinstance(pA, UndefinedValue):
                return pA
            pB = self._require_value(obj.id, definition.point_b, "point")
            if isinstance(pB, UndefinedValue):
                return pB
            pC = self._require_value(obj.id, definition.point_c, "point")
            if isinstance(pC, UndefinedValue):
                return pC
            assert isinstance(pA, PointValue)
            assert isinstance(pB, PointValue)
            assert isinstance(pC, PointValue)
            return _circumscribed_circle(pA, pB, pC)

        # ─── New: transformations ──────────────────────────────────────────

        if isinstance(definition, ReflectionOverLineDefinition):
            pt = self._require_value(obj.id, definition.point, "point")
            if isinstance(pt, UndefinedValue):
                return pt
            ln = self._require_value(obj.id, definition.line, "line")
            if isinstance(ln, UndefinedValue):
                return ln
            assert isinstance(pt, PointValue)
            assert isinstance(ln, LineValue)
            d = ln.a * pt.x + ln.b * pt.y + ln.c
            return PointValue(x=_clean_zero(pt.x - 2 * ln.a * d), y=_clean_zero(pt.y - 2 * ln.b * d))

        if isinstance(definition, ReflectionOverPointDefinition):
            pt = self._require_value(obj.id, definition.point, "point")
            if isinstance(pt, UndefinedValue):
                return pt
            ctr = self._require_value(obj.id, definition.center, "point")
            if isinstance(ctr, UndefinedValue):
                return ctr
            assert isinstance(pt, PointValue)
            assert isinstance(ctr, PointValue)
            return PointValue(x=_clean_zero(2 * ctr.x - pt.x), y=_clean_zero(2 * ctr.y - pt.y))

        if isinstance(definition, HomothetyScalarDefinition):
            ctr = self._require_value(obj.id, definition.center, "point")
            if isinstance(ctr, UndefinedValue):
                return ctr
            pt = self._require_value(obj.id, definition.point, "point")
            if isinstance(pt, UndefinedValue):
                return pt
            assert isinstance(ctr, PointValue)
            assert isinstance(pt, PointValue)
            k = definition.ratio
            return PointValue(x=_clean_zero(ctr.x + k * (pt.x - ctr.x)), y=_clean_zero(ctr.y + k * (pt.y - ctr.y)))

        if isinstance(definition, HomothetyPointDefinition):
            ctr = self._require_value(obj.id, definition.center, "point")
            if isinstance(ctr, UndefinedValue):
                return ctr
            pt = self._require_value(obj.id, definition.point, "point")
            if isinstance(pt, UndefinedValue):
                return pt
            rp = self._require_value(obj.id, definition.ratio_point, "point")
            if isinstance(rp, UndefinedValue):
                return rp
            assert isinstance(ctr, PointValue)
            assert isinstance(pt, PointValue)
            assert isinstance(rp, PointValue)
            dop = hypot(pt.x - ctr.x, pt.y - ctr.y)
            if dop <= GEOMETRY_EPSILON:
                return UndefinedValue(code="coincident_points", message="Center and source point coincide")
            k = hypot(rp.x - ctr.x, rp.y - ctr.y) / dop
            return PointValue(x=_clean_zero(ctr.x + k * (pt.x - ctr.x)), y=_clean_zero(ctr.y + k * (pt.y - ctr.y)))

        if isinstance(definition, InversionInCircleDefinition):
            pt = self._require_value(obj.id, definition.point, "point")
            if isinstance(pt, UndefinedValue):
                return pt
            cr = self._require_value(obj.id, definition.circle, "circle")
            if isinstance(cr, UndefinedValue):
                return cr
            assert isinstance(pt, PointValue)
            assert isinstance(cr, CircleValue)
            dx = pt.x - cr.center.x
            dy = pt.y - cr.center.y
            d2 = dx * dx + dy * dy
            if d2 <= GEOMETRY_EPSILON * GEOMETRY_EPSILON:
                return UndefinedValue(code="point_at_center", message="Inversion is undefined at the center of the circle")
            r2 = cr.radius * cr.radius
            return PointValue(x=_clean_zero(cr.center.x + r2 * dx / d2), y=_clean_zero(cr.center.y + r2 * dy / d2))

        if isinstance(definition, TranslationDefinition):
            pt = self._require_value(obj.id, definition.point, "point")
            if isinstance(pt, UndefinedValue):
                return pt
            from_pt = self._require_value(obj.id, definition.from_, "point")
            if isinstance(from_pt, UndefinedValue):
                return from_pt
            to_pt = self._require_value(obj.id, definition.to, "point")
            if isinstance(to_pt, UndefinedValue):
                return to_pt
            assert isinstance(pt, PointValue)
            assert isinstance(from_pt, PointValue)
            assert isinstance(to_pt, PointValue)
            return PointValue(x=_clean_zero(pt.x + to_pt.x - from_pt.x), y=_clean_zero(pt.y + to_pt.y - from_pt.y))

        if isinstance(definition, RotationDefinition):
            pt = self._require_value(obj.id, definition.point, "point")
            if isinstance(pt, UndefinedValue):
                return pt
            ctr = self._require_value(obj.id, definition.center, "point")
            if isinstance(ctr, UndefinedValue):
                return ctr
            assert isinstance(pt, PointValue)
            assert isinstance(ctr, PointValue)
            theta = definition.degrees * pi / 180.0
            c = cos(theta)
            s = sin(theta)
            dx = pt.x - ctr.x
            dy = pt.y - ctr.y
            return PointValue(x=_clean_zero(ctr.x + dx * c - dy * s), y=_clean_zero(ctr.y + dx * s + dy * c))

        raise GeometryValidationError(f"Unsupported definition for object '{obj.id}'")

    def _require_points(self, object_id: str, first_id: str, second_id: str) -> tuple[PointValue, PointValue] | UndefinedValue:
        first = self._require_value(object_id, first_id, "point")
        if isinstance(first, UndefinedValue):
            return first
        second = self._require_value(object_id, second_id, "point")
        if isinstance(second, UndefinedValue):
            return second
        assert isinstance(first, PointValue)
        assert isinstance(second, PointValue)
        return first, second

    def _require_value(self, object_id: str, parent_id: str, expected_type: str) -> EvaluatedValue:
        value = self._values.get(parent_id)
        if value is None or isinstance(value, UndefinedValue):
            return UndefinedValue(code="parent_undefined", message=f"Object '{object_id}' depends on undefined parent '{parent_id}'")
        if value.type != expected_type:
            return UndefinedValue(code="parent_type_mismatch", message=f"Object '{object_id}' expected '{parent_id}' to evaluate as {expected_type}")
        return value


def evaluate_geometry_document(document: GeometryDocument) -> dict[str, EvaluatedValue]:
    """Validate and evaluate every object in a geometry document."""

    return GeometryGraph(document).values


def move_free_point(document: GeometryDocument, point_id: str, x: float, y: float) -> RecomputeResult:
    """Create a graph, move one free point, and return the recomputed snapshot."""

    return GeometryGraph(document).move_free_point(point_id, x, y)


# ─── Geometry helpers ──────────────────────────────────────────────────────

def _line_through_points(first: PointValue, second: PointValue) -> EvaluatedValue:
    a = first.y - second.y
    b = second.x - first.x
    c = first.x * second.y - second.x * first.y
    if hypot(a, b) <= GEOMETRY_EPSILON:
        return UndefinedValue(code="coincident_points", message="A line requires two distinct points")
    return _canonical_line(a, b, c)


def _canonical_line(a: float, b: float, c: float) -> LineValue:
    norm = hypot(a, b)
    normalized_a = a / norm
    normalized_b = b / norm
    normalized_c = c / norm
    if normalized_a < -GEOMETRY_EPSILON or (abs(normalized_a) <= GEOMETRY_EPSILON and normalized_b < 0):
        normalized_a *= -1
        normalized_b *= -1
        normalized_c *= -1
    return LineValue(a=_clean_zero(normalized_a), b=_clean_zero(normalized_b), c=_clean_zero(normalized_c))


def _intersect_lines(lA: LineValue, lB: LineValue) -> EvaluatedValue:
    det = lA.a * lB.b - lA.b * lB.a
    if abs(det) <= GEOMETRY_EPSILON:
        return UndefinedValue(code="parallel_lines", message="Lines are parallel or coincident")
    return PointValue(x=_clean_zero((lA.b * lB.c - lB.b * lA.c) / det), y=_clean_zero((lB.a * lA.c - lA.a * lB.c) / det))


def _intersect_line_circle(ln: LineValue, cr: CircleValue, index: int) -> EvaluatedValue:
    d_signed = ln.a * cr.center.x + ln.b * cr.center.y + ln.c
    h2 = cr.radius * cr.radius - d_signed * d_signed
    if h2 < -GEOMETRY_EPSILON:
        return UndefinedValue(code="no_intersection", message="Line and circle do not intersect")
    h = sqrt(max(0.0, h2))
    fx = cr.center.x - ln.a * d_signed
    fy = cr.center.y - ln.b * d_signed
    p1 = (fx - ln.b * h, fy + ln.a * h)
    p2 = (fx + ln.b * h, fy - ln.a * h)
    hi, lo = _sorted_pair(p1, p2)
    x, y = hi if index == 1 else lo
    return PointValue(x=_clean_zero(x), y=_clean_zero(y))


def _intersect_circle_circle(cA: CircleValue, cB: CircleValue, index: int) -> EvaluatedValue:
    dx = cB.center.x - cA.center.x
    dy = cB.center.y - cA.center.y
    d = hypot(dx, dy)
    if d <= GEOMETRY_EPSILON:
        return UndefinedValue(code="concentric_circles", message="Circles are concentric")
    if d > cA.radius + cB.radius + GEOMETRY_EPSILON or d < abs(cA.radius - cB.radius) - GEOMETRY_EPSILON:
        return UndefinedValue(code="no_intersection", message="Circles do not intersect")
    a = (cA.radius * cA.radius - cB.radius * cB.radius + d * d) / (2 * d)
    h2 = cA.radius * cA.radius - a * a
    h = sqrt(max(0.0, h2))
    ex, ey = dx / d, dy / d
    fx = cA.center.x + a * ex
    fy = cA.center.y + a * ey
    p1 = (fx - h * ey, fy + h * ex)
    p2 = (fx + h * ey, fy - h * ex)
    hi, lo = _sorted_pair(p1, p2)
    x, y = hi if index == 1 else lo
    return PointValue(x=_clean_zero(x), y=_clean_zero(y))


def _perpendicular_bisector(a: PointValue, b: PointValue) -> EvaluatedValue:
    da = b.x - a.x
    db = b.y - a.y
    if hypot(da, db) <= GEOMETRY_EPSILON:
        return UndefinedValue(code="coincident_points", message="Perpendicular bisector requires two distinct points")
    mx = (a.x + b.x) / 2
    my = (a.y + b.y) / 2
    return _canonical_line(da, db, -(da * mx + db * my))


def _angle_bisector(arm_a: PointValue, vertex: PointValue, arm_b: PointValue) -> EvaluatedValue:
    dax = arm_a.x - vertex.x
    day = arm_a.y - vertex.y
    dbx = arm_b.x - vertex.x
    dby = arm_b.y - vertex.y
    na = hypot(dax, day)
    nb = hypot(dbx, dby)
    if na <= GEOMETRY_EPSILON or nb <= GEOMETRY_EPSILON:
        return UndefinedValue(code="coincident_points", message="Angle bisector requires distinct arm endpoints")
    dir_x = dax / na + dbx / nb
    dir_y = day / na + dby / nb
    if hypot(dir_x, dir_y) <= GEOMETRY_EPSILON:
        dir_x = -day / na
        dir_y = dax / na
    return _canonical_line(-dir_y, dir_x, dir_y * vertex.x - dir_x * vertex.y)


def _circumscribed_circle(pA: PointValue, pB: PointValue, pC: PointValue) -> EvaluatedValue:
    a1 = pB.x - pA.x
    b1 = pB.y - pA.y
    c1 = -(a1 * (pA.x + pB.x) / 2 + b1 * (pA.y + pB.y) / 2)
    a2 = pC.x - pB.x
    b2 = pC.y - pB.y
    c2 = -(a2 * (pB.x + pC.x) / 2 + b2 * (pB.y + pC.y) / 2)
    det = a1 * b2 - a2 * b1
    if abs(det) <= GEOMETRY_EPSILON:
        return UndefinedValue(code="collinear_points", message="Circumscribed circle requires three non-collinear points")
    cx = (b1 * c2 - b2 * c1) / det
    cy = (a2 * c1 - a1 * c2) / det
    return CircleValue(center=Coordinate(x=_clean_zero(cx), y=_clean_zero(cy)), radius=_clean_zero(hypot(pA.x - cx, pA.y - cy)))


def _sorted_pair(
    p: tuple[float, float], q: tuple[float, float]
) -> tuple[tuple[float, float], tuple[float, float]]:
    """Return (higher-y-or-smaller-x, other) for deterministic two-solution ordering."""
    p_first = p[1] > q[1] + GEOMETRY_EPSILON or (abs(p[1] - q[1]) <= GEOMETRY_EPSILON and p[0] <= q[0])
    return (p, q) if p_first else (q, p)


def _clean_zero(value: float) -> float:
    return 0.0 if abs(value) <= GEOMETRY_EPSILON else value
