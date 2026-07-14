"""Dependency graph and deterministic evaluators for classical 2D geometry."""

from __future__ import annotations

from collections import deque
from math import atan2, cos, degrees, hypot, isfinite, pi, sin, sqrt

from app.geometry.models import (
    AngleBisectorDefinition,
    AngleMeasureDefinition,
    ArcThroughPointsDefinition,
    ArcValue,
    AreaMeasureDefinition,
    CircleByCenterPointDefinition,
    CircleByCenterRadiusDefinition,
    CircleValue,
    CircumscribedDefinition,
    Coordinate,
    DistanceMeasureDefinition,
    EvaluatedValue,
    FunctionExpressionDefinition,
    FunctionValue,
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
    PolygonDefinition,
    PolygonVertexDefinition,
    PolygonValue,
    ReflectionOverLineDefinition,
    ReflectionOverPointDefinition,
    RegularPolygonDefinition,
    RotationDefinition,
    ScalarValue,
    SegmentBetweenPointsDefinition,
    SegmentValue,
    SliderDefinition,
    SlopeMeasureDefinition,
    TranslationDefinition,
    UndefinedValue,
    VectorPolygonDefinition,
)
from app.geometry.function_expression import normalize_function_expression

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
    if isinstance(definition, (FreePointDefinition, SliderDefinition)):
        return []
    if isinstance(definition, PolygonVertexDefinition):
        return [definition.polygon]
    if isinstance(definition, (LineThroughPointsDefinition, SegmentBetweenPointsDefinition, MidpointDefinition, PerpendicularBisectorDefinition)):
        return [definition.point_a, definition.point_b]
    if isinstance(definition, CircleByCenterPointDefinition):
        return [definition.center, definition.point]
    if isinstance(definition, CircleByCenterRadiusDefinition):
        return [definition.center, definition.radius]
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
        return [definition.object_id, definition.line]
    if isinstance(definition, ReflectionOverPointDefinition):
        return [definition.object_id, definition.center]
    if isinstance(definition, HomothetyScalarDefinition):
        return [definition.center, definition.object_id]
    if isinstance(definition, HomothetyPointDefinition):
        return [definition.center, definition.object_id, definition.ratio_point]
    if isinstance(definition, InversionInCircleDefinition):
        return [definition.point, definition.circle]
    if isinstance(definition, TranslationDefinition):
        return [definition.object_id, definition.from_, definition.to]
    if isinstance(definition, RotationDefinition):
        return [definition.object_id, definition.center]
    if isinstance(definition, ArcThroughPointsDefinition):
        return [definition.point_a, definition.point_mid, definition.point_b]
    if isinstance(definition, FunctionExpressionDefinition):
        return []
    # ─── Polygons ────────────────────────────────────────────────────────────
    if isinstance(definition, PolygonDefinition):
        return list(definition.point_ids)
    if isinstance(definition, RegularPolygonDefinition):
        return [definition.point_a, definition.point_b]
    if isinstance(definition, VectorPolygonDefinition):
        return [definition.anchor]
    # ─── Measures ────────────────────────────────────────────────────────────
    if isinstance(definition, DistanceMeasureDefinition):
        return [definition.point_a, definition.point_b]
    if isinstance(definition, AngleMeasureDefinition):
        return [definition.point_a, definition.vertex, definition.point_b]
    if isinstance(definition, AreaMeasureDefinition):
        return [definition.polygon]
    if isinstance(definition, SlopeMeasureDefinition):
        return [definition.line]
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
        elif isinstance(definition, SliderDefinition):
            if not isfinite(definition.min) or not isfinite(definition.max) or not isfinite(definition.value) or not isfinite(definition.step):
                raise GeometryValidationError(f"Slider '{obj.id}' parameters must be finite")
        elif isinstance(definition, PolygonVertexDefinition):
            require_kind(definition.polygon, "polygon")
        elif isinstance(definition, (LineThroughPointsDefinition, SegmentBetweenPointsDefinition, MidpointDefinition, PerpendicularBisectorDefinition)):
            require_kind(definition.point_a, "point")
            require_kind(definition.point_b, "point")
        elif isinstance(definition, CircleByCenterPointDefinition):
            require_kind(definition.center, "point")
            require_kind(definition.point, "point")
        elif isinstance(definition, CircleByCenterRadiusDefinition):
            require_kind(definition.center, "point")
            # Deliberately slider-only: Measures also produce scalars, but no script/tool
            # path can construct a measure-driven radius today, so widening this is left
            # for whoever builds that construction, not a forgotten follow-up.
            scalar_kinds = {"slider"}
            actual = self._objects_by_id[definition.radius].kind
            if actual not in scalar_kinds:
                raise GeometryValidationError(
                    f"Object '{obj.id}' requires parent '{definition.radius}' to produce a scalar value"
                )
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
            actual = self._objects_by_id[definition.object_id].kind
            if actual not in {"point", "line", "segment", "circle", "polygon"}:
                raise GeometryValidationError(
                    f"Object '{obj.id}' requires parent '{definition.object_id}' to be reflectable"
                )
            require_kind(definition.line, "line")
            if obj.kind != actual:
                raise GeometryValidationError(
                    f"Object '{obj.id}' must keep the reflected kind '{actual}'"
                )
        elif isinstance(definition, ReflectionOverPointDefinition):
            actual = self._objects_by_id[definition.object_id].kind
            if actual not in {"point", "line", "segment", "circle", "polygon"}:
                raise GeometryValidationError(
                    f"Object '{obj.id}' requires parent '{definition.object_id}' to be reflectable"
                )
            require_kind(definition.center, "point")
            if obj.kind != actual:
                raise GeometryValidationError(
                    f"Object '{obj.id}' must keep the reflected kind '{actual}'"
                )
        elif isinstance(definition, HomothetyScalarDefinition):
            require_kind(definition.center, "point")
            actual = self._objects_by_id[definition.object_id].kind
            if actual not in {"point", "line", "segment", "circle", "polygon"}:
                raise GeometryValidationError(
                    f"Object '{obj.id}' requires parent '{definition.object_id}' to be scalable"
                )
            if obj.kind != actual:
                raise GeometryValidationError(
                    f"Object '{obj.id}' must keep the scaled kind '{actual}'"
                )
            if not isfinite(definition.ratio):
                raise GeometryValidationError(f"Object '{obj.id}' ratio must be finite")
            if definition.ratio == 0 and actual != "point":
                raise GeometryValidationError(f"Object '{obj.id}' ratio must be non-zero for {actual}s")
        elif isinstance(definition, HomothetyPointDefinition):
            require_kind(definition.center, "point")
            actual = self._objects_by_id[definition.object_id].kind
            if actual not in {"point", "line", "segment", "circle", "polygon"}:
                raise GeometryValidationError(
                    f"Object '{obj.id}' requires parent '{definition.object_id}' to be scalable"
                )
            if obj.kind != actual:
                raise GeometryValidationError(
                    f"Object '{obj.id}' must keep the scaled kind '{actual}'"
                )
            require_kind(definition.ratio_point, "point")
        elif isinstance(definition, InversionInCircleDefinition):
            require_kind(definition.point, "point")
            require_kind(definition.circle, "circle")
        elif isinstance(definition, TranslationDefinition):
            actual = self._objects_by_id[definition.object_id].kind
            if actual not in {"point", "line", "segment", "circle", "polygon"}:
                raise GeometryValidationError(
                    f"Object '{obj.id}' requires parent '{definition.object_id}' to be translatable"
                )
            require_kind(definition.from_, "point")
            require_kind(definition.to, "point")
            if obj.kind != actual:
                raise GeometryValidationError(
                    f"Object '{obj.id}' must keep the translated kind '{actual}'"
                )
        elif isinstance(definition, RotationDefinition):
            actual = self._objects_by_id[definition.object_id].kind
            if actual not in {"point", "line", "segment", "circle", "polygon"}:
                raise GeometryValidationError(
                    f"Object '{obj.id}' requires parent '{definition.object_id}' to be rotatable"
                )
            require_kind(definition.center, "point")
            if obj.kind != actual:
                raise GeometryValidationError(
                    f"Object '{obj.id}' must keep the rotated kind '{actual}'"
                )
            if not isfinite(definition.degrees):
                raise GeometryValidationError(f"Object '{obj.id}' degrees must be finite")
        elif isinstance(definition, ArcThroughPointsDefinition):
            require_kind(definition.point_a, "point")
            require_kind(definition.point_mid, "point")
            require_kind(definition.point_b, "point")
        elif isinstance(definition, FunctionExpressionDefinition):
            normalize_function_expression(definition.expression)
        # ─── Polygons ─────────────────────────────────────────────────────────
        elif isinstance(definition, PolygonDefinition):
            if len(definition.point_ids) < 3:
                raise GeometryValidationError(f"Polygon '{obj.id}' requires at least 3 vertices")
            for pid in definition.point_ids:
                require_kind(pid, "point")
        elif isinstance(definition, RegularPolygonDefinition):
            if definition.sides < 3:
                raise GeometryValidationError(f"RegularPolygon '{obj.id}' requires at least 3 sides")
            require_kind(definition.point_a, "point")
            require_kind(definition.point_b, "point")
        elif isinstance(definition, VectorPolygonDefinition):
            if len(definition.offsets) < 2:
                raise GeometryValidationError(f"VectorPolygon '{obj.id}' requires at least 2 offsets")
            require_kind(definition.anchor, "point")
        # ─── Measures ─────────────────────────────────────────────────────────
        elif isinstance(definition, DistanceMeasureDefinition):
            require_kind(definition.point_a, "point")
            require_kind(definition.point_b, "point")
        elif isinstance(definition, AngleMeasureDefinition):
            require_kind(definition.point_a, "point")
            require_kind(definition.vertex, "point")
            require_kind(definition.point_b, "point")
        elif isinstance(definition, AreaMeasureDefinition):
            require_kind(definition.polygon, "polygon")
        elif isinstance(definition, SlopeMeasureDefinition):
            require_kind(definition.line, "line")

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

        if isinstance(definition, SliderDefinition):
            return ScalarValue(value=definition.value)

        if isinstance(definition, PolygonVertexDefinition):
            polygon = self._require_value(obj.id, definition.polygon, "polygon")
            if isinstance(polygon, UndefinedValue):
                return polygon
            assert isinstance(polygon, PolygonValue)
            if definition.index >= len(polygon.vertices):
                return UndefinedValue(
                    code="vertex_out_of_range",
                    message=f"Polygon vertex {definition.index} is out of range",
                )
            vertex = polygon.vertices[definition.index]
            return PointValue(x=_clean_zero(vertex.x), y=_clean_zero(vertex.y))

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

        if isinstance(definition, CircleByCenterRadiusDefinition):
            center = self._require_value(obj.id, definition.center, "point")
            if isinstance(center, UndefinedValue):
                return center
            radius = self._require_value(obj.id, definition.radius, "scalar")
            if isinstance(radius, UndefinedValue):
                return radius
            assert isinstance(center, PointValue)
            assert isinstance(radius, ScalarValue)
            if radius.value < 0:
                return UndefinedValue(code="negative_radius", message=f"Circle '{obj.id}' radius must be non-negative")
            return CircleValue(center=Coordinate(x=center.x, y=center.y), radius=radius.value)

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
            return _intersect_line_circle(ln, cr, definition.index, definition.selector)

        if isinstance(definition, IntersectionCCDefinition):
            cA = self._require_value(obj.id, definition.circle_a, "circle")
            if isinstance(cA, UndefinedValue):
                return cA
            cB = self._require_value(obj.id, definition.circle_b, "circle")
            if isinstance(cB, UndefinedValue):
                return cB
            assert isinstance(cA, CircleValue)
            assert isinstance(cB, CircleValue)
            return _intersect_circle_circle(cA, cB, definition.index, definition.selector)

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
            ln = self._require_value(obj.id, definition.line, "line")
            if isinstance(ln, UndefinedValue):
                return ln
            assert isinstance(ln, LineValue)
            source = self._require_value(obj.id, definition.object_id, obj.kind)
            if isinstance(source, UndefinedValue):
                return source
            return _reflect_value_over_line(source, ln)

        if isinstance(definition, ReflectionOverPointDefinition):
            ctr = self._require_value(obj.id, definition.center, "point")
            if isinstance(ctr, UndefinedValue):
                return ctr
            assert isinstance(ctr, PointValue)
            source = self._require_value(obj.id, definition.object_id, obj.kind)
            if isinstance(source, UndefinedValue):
                return source
            return _reflect_value_over_point(source, ctr)

        if isinstance(definition, HomothetyScalarDefinition):
            ctr = self._require_value(obj.id, definition.center, "point")
            if isinstance(ctr, UndefinedValue):
                return ctr
            assert isinstance(ctr, PointValue)
            source = self._require_value(obj.id, definition.object_id, obj.kind)
            if isinstance(source, UndefinedValue):
                return source
            return _scale_value(source, ctr, definition.ratio)

        if isinstance(definition, HomothetyPointDefinition):
            ctr = self._require_value(obj.id, definition.center, "point")
            if isinstance(ctr, UndefinedValue):
                return ctr
            assert isinstance(ctr, PointValue)
            source = self._require_value(obj.id, definition.object_id, obj.kind)
            if isinstance(source, UndefinedValue):
                return source
            rp = self._require_value(obj.id, definition.ratio_point, "point")
            if isinstance(rp, UndefinedValue):
                return rp
            assert isinstance(rp, PointValue)
            ref = _reference_point_for_ratio(source, ctr)
            dop = hypot(ref.x - ctr.x, ref.y - ctr.y)
            if dop <= GEOMETRY_EPSILON:
                return UndefinedValue(code="coincident_points", message="Center and reference point coincide")
            k = hypot(rp.x - ctr.x, rp.y - ctr.y) / dop
            if k == 0 and source.type != "point":
                return UndefinedValue(code="zero_ratio", message="A zero homothety ratio is only supported for points")
            return _scale_value(source, ctr, k)

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
            source = self._require_value(obj.id, definition.object_id, obj.kind)
            if isinstance(source, UndefinedValue):
                return source
            from_pt = self._require_value(obj.id, definition.from_, "point")
            if isinstance(from_pt, UndefinedValue):
                return from_pt
            to_pt = self._require_value(obj.id, definition.to, "point")
            if isinstance(to_pt, UndefinedValue):
                return to_pt
            assert isinstance(from_pt, PointValue)
            assert isinstance(to_pt, PointValue)
            return _translate_value(source, to_pt.x - from_pt.x, to_pt.y - from_pt.y)

        if isinstance(definition, RotationDefinition):
            ctr = self._require_value(obj.id, definition.center, "point")
            if isinstance(ctr, UndefinedValue):
                return ctr
            assert isinstance(ctr, PointValue)
            source = self._require_value(obj.id, definition.object_id, obj.kind)
            if isinstance(source, UndefinedValue):
                return source
            return _rotate_value(source, ctr, definition.degrees)

        if isinstance(definition, ArcThroughPointsDefinition):
            point_a = self._require_value(obj.id, definition.point_a, "point")
            if isinstance(point_a, UndefinedValue):
                return point_a
            point_mid = self._require_value(obj.id, definition.point_mid, "point")
            if isinstance(point_mid, UndefinedValue):
                return point_mid
            point_b = self._require_value(obj.id, definition.point_b, "point")
            if isinstance(point_b, UndefinedValue):
                return point_b
            assert isinstance(point_a, PointValue)
            assert isinstance(point_mid, PointValue)
            assert isinstance(point_b, PointValue)
            circle = _circumscribed_circle(point_a, point_mid, point_b)
            if isinstance(circle, UndefinedValue):
                return circle
            assert isinstance(circle, CircleValue)
            return ArcValue(
                center=circle.center,
                radius=circle.radius,
                start=Coordinate(x=_clean_zero(point_a.x), y=_clean_zero(point_a.y)),
                mid=Coordinate(x=_clean_zero(point_mid.x), y=_clean_zero(point_mid.y)),
                end=Coordinate(x=_clean_zero(point_b.x), y=_clean_zero(point_b.y)),
            )

        if isinstance(definition, FunctionExpressionDefinition):
            return FunctionValue(expression=normalize_function_expression(definition.expression))

        # ─── Polygons ─────────────────────────────────────────────────────────

        if isinstance(definition, PolygonDefinition):
            vertices: list[Coordinate] = []
            for pid in definition.point_ids:
                pv = self._require_value(obj.id, pid, "point")
                if isinstance(pv, UndefinedValue):
                    return pv
                assert isinstance(pv, PointValue)
                vertices.append(Coordinate(x=pv.x, y=pv.y))
            return PolygonValue(vertices=vertices)

        if isinstance(definition, RegularPolygonDefinition):
            pA = self._require_value(obj.id, definition.point_a, "point")
            if isinstance(pA, UndefinedValue):
                return pA
            pB = self._require_value(obj.id, definition.point_b, "point")
            if isinstance(pB, UndefinedValue):
                return pB
            assert isinstance(pA, PointValue)
            assert isinstance(pB, PointValue)
            return _regular_polygon_vertices(pA, pB, definition.sides)

        if isinstance(definition, VectorPolygonDefinition):
            anchor_val = self._require_value(obj.id, definition.anchor, "point")
            if isinstance(anchor_val, UndefinedValue):
                return anchor_val
            assert isinstance(anchor_val, PointValue)
            ax, ay = anchor_val.x, anchor_val.y
            vertices = [Coordinate(x=ax, y=ay)]
            for offset in definition.offsets:
                vertices.append(Coordinate(x=_clean_zero(ax + offset.x), y=_clean_zero(ay + offset.y)))
            return PolygonValue(vertices=vertices)

        # ─── Measures ───────────────────────────────────────────────────────

        if isinstance(definition, DistanceMeasureDefinition):
            points = self._require_points(obj.id, definition.point_a, definition.point_b)
            if isinstance(points, UndefinedValue):
                return points
            pt_a, pt_b = points
            return ScalarValue(value=hypot(pt_b.x - pt_a.x, pt_b.y - pt_a.y))

        if isinstance(definition, AngleMeasureDefinition):
            pt_a = self._require_value(obj.id, definition.point_a, "point")
            if isinstance(pt_a, UndefinedValue):
                return pt_a
            vertex = self._require_value(obj.id, definition.vertex, "point")
            if isinstance(vertex, UndefinedValue):
                return vertex
            pt_b = self._require_value(obj.id, definition.point_b, "point")
            if isinstance(pt_b, UndefinedValue):
                return pt_b
            assert isinstance(pt_a, PointValue)
            assert isinstance(vertex, PointValue)
            assert isinstance(pt_b, PointValue)
            return _angle_measure(pt_a, vertex, pt_b)

        if isinstance(definition, AreaMeasureDefinition):
            polygon = self._require_value(obj.id, definition.polygon, "polygon")
            if isinstance(polygon, UndefinedValue):
                return polygon
            assert isinstance(polygon, PolygonValue)
            return ScalarValue(value=_polygon_area(polygon))

        if isinstance(definition, SlopeMeasureDefinition):
            line = self._require_value(obj.id, definition.line, "line")
            if isinstance(line, UndefinedValue):
                return line
            assert isinstance(line, LineValue)
            if abs(line.b) <= GEOMETRY_EPSILON:
                return UndefinedValue(
                    code="vertical_line",
                    message=f"Slope '{obj.id}' is undefined for a vertical line",
                )
            return ScalarValue(value=-line.a / line.b)

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


def _reflect_point_over_line(point: PointValue, line: LineValue) -> PointValue:
    d = line.a * point.x + line.b * point.y + line.c
    return PointValue(
        x=_clean_zero(point.x - 2 * line.a * d),
        y=_clean_zero(point.y - 2 * line.b * d),
    )


def _reflect_point_over_center(point: PointValue, center: PointValue) -> PointValue:
    return PointValue(x=_clean_zero(2 * center.x - point.x), y=_clean_zero(2 * center.y - point.y))


def _line_sample_points(line: LineValue) -> tuple[PointValue, PointValue]:
    base = PointValue(x=_clean_zero(-line.a * line.c), y=_clean_zero(-line.b * line.c))
    direction = PointValue(
        x=_clean_zero(base.x - line.b),
        y=_clean_zero(base.y + line.a),
    )
    return base, direction


def _reflect_value_over_line(value: EvaluatedValue, mirror: LineValue) -> EvaluatedValue:
    if isinstance(value, PointValue):
        return _reflect_point_over_line(value, mirror)
    if isinstance(value, LineValue):
        p1, p2 = _line_sample_points(value)
        return _line_through_points(_reflect_point_over_line(p1, mirror), _reflect_point_over_line(p2, mirror))
    if isinstance(value, SegmentValue):
        start = _reflect_point_over_line(PointValue(x=value.start.x, y=value.start.y), mirror)
        end = _reflect_point_over_line(PointValue(x=value.end.x, y=value.end.y), mirror)
        return SegmentValue(start=Coordinate(x=start.x, y=start.y), end=Coordinate(x=end.x, y=end.y))
    if isinstance(value, CircleValue):
        center = _reflect_point_over_line(PointValue(x=value.center.x, y=value.center.y), mirror)
        return CircleValue(center=Coordinate(x=center.x, y=center.y), radius=value.radius)
    if isinstance(value, PolygonValue):
        return PolygonValue(
            vertices=[
                Coordinate(x=reflected.x, y=reflected.y)
                for reflected in (
                    _reflect_point_over_line(PointValue(x=vertex.x, y=vertex.y), mirror)
                    for vertex in value.vertices
                )
            ]
        )
    raise GeometryValidationError(f"Reflection over line is unsupported for evaluated type '{value.type}'")


def _reflect_value_over_point(value: EvaluatedValue, center: PointValue) -> EvaluatedValue:
    if isinstance(value, PointValue):
        return _reflect_point_over_center(value, center)
    if isinstance(value, LineValue):
        p1, p2 = _line_sample_points(value)
        return _line_through_points(_reflect_point_over_center(p1, center), _reflect_point_over_center(p2, center))
    if isinstance(value, SegmentValue):
        start = _reflect_point_over_center(PointValue(x=value.start.x, y=value.start.y), center)
        end = _reflect_point_over_center(PointValue(x=value.end.x, y=value.end.y), center)
        return SegmentValue(start=Coordinate(x=start.x, y=start.y), end=Coordinate(x=end.x, y=end.y))
    if isinstance(value, CircleValue):
        reflected_center = _reflect_point_over_center(PointValue(x=value.center.x, y=value.center.y), center)
        return CircleValue(center=Coordinate(x=reflected_center.x, y=reflected_center.y), radius=value.radius)
    if isinstance(value, PolygonValue):
        return PolygonValue(
            vertices=[
                Coordinate(x=reflected.x, y=reflected.y)
                for reflected in (
                    _reflect_point_over_center(PointValue(x=vertex.x, y=vertex.y), center)
                    for vertex in value.vertices
                )
            ]
        )
    raise GeometryValidationError(f"Reflection over point is unsupported for evaluated type '{value.type}'")


def _rotate_point(pt: PointValue, ctr: PointValue, degrees: float) -> PointValue:
    theta = degrees * pi / 180.0
    c = cos(theta)
    s = sin(theta)
    dx = pt.x - ctr.x
    dy = pt.y - ctr.y
    return PointValue(
        x=_clean_zero(ctr.x + dx * c - dy * s),
        y=_clean_zero(ctr.y + dx * s + dy * c),
    )


def _translate_value(value: EvaluatedValue, dx: float, dy: float) -> EvaluatedValue:
    if isinstance(value, PointValue):
        return PointValue(x=_clean_zero(value.x + dx), y=_clean_zero(value.y + dy))
    if isinstance(value, LineValue):
        p1, p2 = _line_sample_points(value)
        return _line_through_points(
            PointValue(x=_clean_zero(p1.x + dx), y=_clean_zero(p1.y + dy)),
            PointValue(x=_clean_zero(p2.x + dx), y=_clean_zero(p2.y + dy)),
        )
    if isinstance(value, SegmentValue):
        return SegmentValue(
            start=Coordinate(x=_clean_zero(value.start.x + dx), y=_clean_zero(value.start.y + dy)),
            end=Coordinate(x=_clean_zero(value.end.x + dx), y=_clean_zero(value.end.y + dy)),
        )
    if isinstance(value, CircleValue):
        return CircleValue(
            center=Coordinate(x=_clean_zero(value.center.x + dx), y=_clean_zero(value.center.y + dy)),
            radius=value.radius,
        )
    if isinstance(value, PolygonValue):
        return PolygonValue(
            vertices=[
                Coordinate(x=_clean_zero(vertex.x + dx), y=_clean_zero(vertex.y + dy))
                for vertex in value.vertices
            ]
        )
    raise GeometryValidationError(f"Translation is unsupported for evaluated type '{value.type}'")


def _rotate_value(value: EvaluatedValue, center: PointValue, degrees: float) -> EvaluatedValue:
    if isinstance(value, PointValue):
        return _rotate_point(value, center, degrees)
    if isinstance(value, LineValue):
        p1, p2 = _line_sample_points(value)
        return _line_through_points(_rotate_point(p1, center, degrees), _rotate_point(p2, center, degrees))
    if isinstance(value, SegmentValue):
        start = _rotate_point(PointValue(x=value.start.x, y=value.start.y), center, degrees)
        end = _rotate_point(PointValue(x=value.end.x, y=value.end.y), center, degrees)
        return SegmentValue(start=Coordinate(x=start.x, y=start.y), end=Coordinate(x=end.x, y=end.y))
    if isinstance(value, CircleValue):
        rotated_center = _rotate_point(PointValue(x=value.center.x, y=value.center.y), center, degrees)
        return CircleValue(center=Coordinate(x=rotated_center.x, y=rotated_center.y), radius=value.radius)
    if isinstance(value, PolygonValue):
        return PolygonValue(
            vertices=[
                Coordinate(x=rotated.x, y=rotated.y)
                for rotated in (
                    _rotate_point(PointValue(x=vertex.x, y=vertex.y), center, degrees)
                    for vertex in value.vertices
                )
            ]
        )
    raise GeometryValidationError(f"Rotation is unsupported for evaluated type '{value.type}'")


def _scale_point(point: PointValue, center: PointValue, ratio: float) -> PointValue:
    return PointValue(
        x=_clean_zero(center.x + ratio * (point.x - center.x)),
        y=_clean_zero(center.y + ratio * (point.y - center.y)),
    )


def _scale_value(value: EvaluatedValue, center: PointValue, ratio: float) -> EvaluatedValue:
    if isinstance(value, PointValue):
        return _scale_point(value, center, ratio)
    if isinstance(value, LineValue):
        p1, p2 = _line_sample_points(value)
        return _line_through_points(_scale_point(p1, center, ratio), _scale_point(p2, center, ratio))
    if isinstance(value, SegmentValue):
        start = _scale_point(PointValue(x=value.start.x, y=value.start.y), center, ratio)
        end = _scale_point(PointValue(x=value.end.x, y=value.end.y), center, ratio)
        return SegmentValue(start=Coordinate(x=start.x, y=start.y), end=Coordinate(x=end.x, y=end.y))
    if isinstance(value, CircleValue):
        scaled_center = _scale_point(PointValue(x=value.center.x, y=value.center.y), center, ratio)
        return CircleValue(
            center=Coordinate(x=scaled_center.x, y=scaled_center.y),
            radius=abs(ratio) * value.radius,
        )
    if isinstance(value, PolygonValue):
        return PolygonValue(
            vertices=[
                Coordinate(x=scaled.x, y=scaled.y)
                for scaled in (
                    _scale_point(PointValue(x=vertex.x, y=vertex.y), center, ratio)
                    for vertex in value.vertices
                )
            ]
        )
    raise GeometryValidationError(f"Homothety is unsupported for evaluated type '{value.type}'")


def _reference_point_for_ratio(value: EvaluatedValue, center: PointValue) -> PointValue:
    if isinstance(value, PointValue):
        return value
    if isinstance(value, LineValue):
        d = value.a * center.x + value.b * center.y + value.c
        return PointValue(x=_clean_zero(center.x - value.a * d), y=_clean_zero(center.y - value.b * d))
    if isinstance(value, SegmentValue):
        return PointValue(
            x=_clean_zero((value.start.x + value.end.x) / 2),
            y=_clean_zero((value.start.y + value.end.y) / 2),
        )
    if isinstance(value, CircleValue):
        return PointValue(x=value.center.x, y=value.center.y)
    if isinstance(value, PolygonValue):
        count = len(value.vertices)
        return PointValue(
            x=_clean_zero(sum(vertex.x for vertex in value.vertices) / count),
            y=_clean_zero(sum(vertex.y for vertex in value.vertices) / count),
        )
    raise GeometryValidationError(f"Homothety is unsupported for evaluated type '{value.type}'")


def _intersect_line_circle(
    ln: LineValue,
    cr: CircleValue,
    index: int | None,
    selector: str | None,
) -> EvaluatedValue:
    d_signed = ln.a * cr.center.x + ln.b * cr.center.y + ln.c
    h2 = cr.radius * cr.radius - d_signed * d_signed
    if h2 < -GEOMETRY_EPSILON:
        return UndefinedValue(code="no_intersection", message="Line and circle do not intersect")
    h = sqrt(max(0.0, h2))
    fx = cr.center.x - ln.a * d_signed
    fy = cr.center.y - ln.b * d_signed
    p1 = (fx - ln.b * h, fy + ln.a * h)
    p2 = (fx + ln.b * h, fy - ln.a * h)
    selected = _select_intersection(p1, p2, index=index, selector=selector)
    if isinstance(selected, UndefinedValue):
        return selected
    x, y = selected
    return PointValue(x=_clean_zero(x), y=_clean_zero(y))


def _intersect_circle_circle(
    cA: CircleValue,
    cB: CircleValue,
    index: int | None,
    selector: str | None,
) -> EvaluatedValue:
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
    selected = _select_intersection(p1, p2, index=index, selector=selector)
    if isinstance(selected, UndefinedValue):
        return selected
    x, y = selected
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


def _select_intersection(
    p: tuple[float, float],
    q: tuple[float, float],
    *,
    index: int | None,
    selector: str | None,
) -> tuple[float, float] | UndefinedValue:
    """Select one of two solutions without silently guessing directional ties."""

    if hypot(p[0] - q[0], p[1] - q[1]) <= GEOMETRY_EPSILON:
        return p
    first, second = _sorted_pair(p, q)
    if index is not None:
        return first if index == 1 else second
    if selector == "first":
        return first
    if selector == "second":
        return second
    if selector in ("upper", "lower"):
        if abs(p[1] - q[1]) <= GEOMETRY_EPSILON:
            return UndefinedValue(
                code="ambiguous_selector",
                message=f"Selector '{selector}' cannot distinguish intersections with equal y",
            )
        if selector == "upper":
            return p if p[1] > q[1] else q
        return p if p[1] < q[1] else q
    if selector in ("left", "right"):
        if abs(p[0] - q[0]) <= GEOMETRY_EPSILON:
            return UndefinedValue(
                code="ambiguous_selector",
                message=f"Selector '{selector}' cannot distinguish intersections with equal x",
            )
        if selector == "left":
            return p if p[0] < q[0] else q
        return p if p[0] > q[0] else q
    return UndefinedValue(code="invalid_selector", message="Intersection selector is invalid")


def _regular_polygon_vertices(pA: PointValue, pB: PointValue, n: int) -> EvaluatedValue:
    """Compute vertices of a regular n-gon whose first edge is A→B.

    Vertices are generated by rotating the edge vector counter-clockwise by
    the exterior angle 2π/n at each step. This matches GeoGebra's convention.
    Requires n ≥ 3.
    """
    if n < 3:
        return UndefinedValue(code="invalid_sides", message="Regular polygon requires at least 3 sides")
    # Exterior angle for a regular n-gon is 2π/n (CCW rotation).
    angle = 2 * pi / n
    cos_a = cos(angle)
    sin_a = sin(angle)
    # Start with the edge vector A→B; the next vertex is found by rotating and advancing.
    vx = pB.x - pA.x
    vy = pB.y - pA.y
    vertices = [Coordinate(x=pA.x, y=pA.y), Coordinate(x=pB.x, y=pB.y)]
    cur_x, cur_y = pB.x, pB.y
    for _ in range(n - 2):
        # Rotate edge vector CCW by angle.
        new_vx = vx * cos_a - vy * sin_a
        new_vy = vx * sin_a + vy * cos_a
        vx, vy = new_vx, new_vy
        cur_x = _clean_zero(cur_x + vx)
        cur_y = _clean_zero(cur_y + vy)
        vertices.append(Coordinate(x=cur_x, y=cur_y))
    return PolygonValue(vertices=vertices)


def _angle_measure(pt_a: PointValue, vertex: PointValue, pt_b: PointValue) -> EvaluatedValue:
    """Unsigned angle at `vertex` between rays to `pt_a` and `pt_b`, in degrees, range [0, 180].

    Uses atan2(|cross|, dot) of the two arm vectors, which is numerically stable
    near 0 and 180 degrees and always non-negative (no directional/signed angle).
    """

    vax = pt_a.x - vertex.x
    vay = pt_a.y - vertex.y
    vbx = pt_b.x - vertex.x
    vby = pt_b.y - vertex.y
    if hypot(vax, vay) <= GEOMETRY_EPSILON or hypot(vbx, vby) <= GEOMETRY_EPSILON:
        return UndefinedValue(code="coincident_points", message="Angle requires distinct vertex and arm points")
    cross = vax * vby - vay * vbx
    dot = vax * vbx + vay * vby
    angle_rad = atan2(abs(cross), dot)
    return ScalarValue(value=degrees(angle_rad))


def _polygon_area(polygon: PolygonValue) -> float:
    """Shoelace formula; always non-negative regardless of vertex winding order."""

    vertices = polygon.vertices
    n = len(vertices)
    total = 0.0
    for i in range(n):
        j = (i + 1) % n
        total += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y
    return abs(total) / 2.0


def _clean_zero(value: float) -> float:
    return 0.0 if abs(value) <= GEOMETRY_EPSILON else value
