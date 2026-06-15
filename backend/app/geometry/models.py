"""Versioned, JSON-serializable geometry construction schemas."""

from __future__ import annotations

from typing import Literal, TypeAlias

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

GEOMETRY_SCHEMA_VERSION = 1


class GeometryModel(BaseModel):
    """Base model using the canonical camelCase JSON contract."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
        frozen=True,
    )


StrokeDash: TypeAlias = Literal["solid", "dashed", "dotted"]


class GeometryStyle(GeometryModel):
    color: str | None = None
    stroke_width: float | None = None
    stroke_dash: StrokeDash | None = None


class GeometryObjectBase(GeometryModel):
    id: str
    label: str
    visible: bool = True
    style: GeometryStyle | None = None

    @field_validator("id", "label")
    @classmethod
    def value_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value


# ─── Existing definitions ───────────────────────────────────────────────────

class FreePointDefinition(GeometryModel):
    type: Literal["free"] = "free"
    x: float
    y: float


class LineThroughPointsDefinition(GeometryModel):
    type: Literal["through_points"] = "through_points"
    point_a: str
    point_b: str


class SegmentBetweenPointsDefinition(GeometryModel):
    type: Literal["between_points"] = "between_points"
    point_a: str
    point_b: str


class CircleByCenterPointDefinition(GeometryModel):
    type: Literal["center_through_point"] = "center_through_point"
    center: str
    point: str


class MidpointDefinition(GeometryModel):
    type: Literal["midpoint"] = "midpoint"
    point_a: str
    point_b: str


class ParallelLineDefinition(GeometryModel):
    type: Literal["parallel_through"] = "parallel_through"
    point: str
    line: str


class PerpendicularLineDefinition(GeometryModel):
    type: Literal["perpendicular_through"] = "perpendicular_through"
    point: str
    line: str


# ─── New: intersections ─────────────────────────────────────────────────────

class IntersectionLLDefinition(GeometryModel):
    type: Literal["intersection_ll"] = "intersection_ll"
    line_a: str
    line_b: str


class IntersectionLCDefinition(GeometryModel):
    type: Literal["intersection_lc"] = "intersection_lc"
    line: str
    circle: str
    index: Literal[1, 2] | None = None
    selector: Literal["first", "second", "left", "right"] | None = None

    @model_validator(mode="after")
    def exactly_one_solution_selector(self) -> IntersectionLCDefinition:
        if (self.index is None) == (self.selector is None):
            raise ValueError("intersection_lc requires exactly one of index or selector")
        return self


class IntersectionCCDefinition(GeometryModel):
    type: Literal["intersection_cc"] = "intersection_cc"
    circle_a: str
    circle_b: str
    index: Literal[1, 2] | None = None
    selector: Literal["upper", "lower", "left", "right"] | None = None

    @model_validator(mode="after")
    def exactly_one_solution_selector(self) -> IntersectionCCDefinition:
        if (self.index is None) == (self.selector is None):
            raise ValueError("intersection_cc requires exactly one of index or selector")
        return self


# ─── New: bisectors and circumcircle ───────────────────────────────────────

class PerpendicularBisectorDefinition(GeometryModel):
    type: Literal["perpendicular_bisector"] = "perpendicular_bisector"
    point_a: str
    point_b: str


class AngleBisectorDefinition(GeometryModel):
    type: Literal["angle_bisector"] = "angle_bisector"
    arm_a: str
    vertex: str
    arm_b: str


class CircumscribedDefinition(GeometryModel):
    type: Literal["circumscribed"] = "circumscribed"
    point_a: str
    point_b: str
    point_c: str


# ─── New: transformations ───────────────────────────────────────────────────

class ReflectionOverLineDefinition(GeometryModel):
    type: Literal["reflection_over_line"] = "reflection_over_line"
    object_id: str = Field(
        validation_alias=AliasChoices("object", "point"),
        serialization_alias="object",
    )
    line: str


class ReflectionOverPointDefinition(GeometryModel):
    type: Literal["reflection_over_point"] = "reflection_over_point"
    object_id: str = Field(
        validation_alias=AliasChoices("object", "point"),
        serialization_alias="object",
    )
    center: str


class HomothetyScalarDefinition(GeometryModel):
    type: Literal["homothety_scalar"] = "homothety_scalar"
    center: str
    point: str
    ratio: float


class HomothetyPointDefinition(GeometryModel):
    type: Literal["homothety_point"] = "homothety_point"
    center: str
    point: str
    ratio_point: str


class InversionInCircleDefinition(GeometryModel):
    type: Literal["inversion_in_circle"] = "inversion_in_circle"
    point: str
    circle: str


class TranslationDefinition(GeometryModel):
    type: Literal["translation"] = "translation"
    point: str
    from_: str = Field(alias="from")
    to: str

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
        frozen=True,
    )


class RotationDefinition(GeometryModel):
    type: Literal["rotation"] = "rotation"
    point: str
    center: str
    degrees: float


# ─── Object classes ─────────────────────────────────────────────────────────

class Point(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: FreePointDefinition


class Line(GeometryObjectBase):
    kind: Literal["line"] = "line"
    definition: LineThroughPointsDefinition


class Segment(GeometryObjectBase):
    kind: Literal["segment"] = "segment"
    definition: SegmentBetweenPointsDefinition


class Circle(GeometryObjectBase):
    kind: Literal["circle"] = "circle"
    definition: CircleByCenterPointDefinition


class Midpoint(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: MidpointDefinition


class ParallelLine(GeometryObjectBase):
    kind: Literal["line"] = "line"
    definition: ParallelLineDefinition


class PerpendicularLine(GeometryObjectBase):
    kind: Literal["line"] = "line"
    definition: PerpendicularLineDefinition


# Intersections

class IntersectionLL(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: IntersectionLLDefinition


class IntersectionLC(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: IntersectionLCDefinition


class IntersectionCC(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: IntersectionCCDefinition


# Bisectors / circumcircle

class PerpendicularBisectorLine(GeometryObjectBase):
    kind: Literal["line"] = "line"
    definition: PerpendicularBisectorDefinition


class AngleBisectorLine(GeometryObjectBase):
    kind: Literal["line"] = "line"
    definition: AngleBisectorDefinition


class CircumscribedCircle(GeometryObjectBase):
    kind: Literal["circle"] = "circle"
    definition: CircumscribedDefinition


# Transformations

class ReflectionOverLine(GeometryObjectBase):
    kind: Literal["point", "line", "segment", "circle", "polygon"]
    definition: ReflectionOverLineDefinition


class ReflectionOverPoint(GeometryObjectBase):
    kind: Literal["point", "line", "segment", "circle", "polygon"]
    definition: ReflectionOverPointDefinition


class HomothetyScalar(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: HomothetyScalarDefinition


class HomothetyPoint(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: HomothetyPointDefinition


class InversionInCircle(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: InversionInCircleDefinition


class TranslatedPoint(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: TranslationDefinition


class RotatedPoint(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: RotationDefinition


# ─── New: polygons ──────────────────────────────────────────────────────────

class PolygonDefinition(GeometryModel):
    """Basic polygon: N ≥ 3 existing point IDs define the vertices in order."""

    type: Literal["polygon"] = "polygon"
    point_ids: list[str]


class RegularPolygonDefinition(GeometryModel):
    """Regular polygon: two adjacent vertices + number of sides."""

    type: Literal["regular_polygon"] = "regular_polygon"
    point_a: str
    point_b: str
    sides: int


class VectorPolygonDefinition(GeometryModel):
    """Vector polygon: one anchor point + a list of (dx, dy) offsets.

    Vertices are [anchor, anchor+offset_0, anchor+offset_1, …].
    """

    type: Literal["vector_polygon"] = "vector_polygon"
    anchor: str
    offsets: list[Coordinate]


PolygonVariantDefinition: TypeAlias = PolygonDefinition | RegularPolygonDefinition | VectorPolygonDefinition


class Polygon(GeometryObjectBase):
    kind: Literal["polygon"] = "polygon"
    definition: PolygonVariantDefinition


GeometryObject: TypeAlias = (
    Point
    | Line
    | Segment
    | Circle
    | Midpoint
    | ParallelLine
    | PerpendicularLine
    | IntersectionLL
    | IntersectionLC
    | IntersectionCC
    | PerpendicularBisectorLine
    | AngleBisectorLine
    | CircumscribedCircle
    | ReflectionOverLine
    | ReflectionOverPoint
    | HomothetyScalar
    | HomothetyPoint
    | InversionInCircle
    | TranslatedPoint
    | RotatedPoint
    | Polygon
)


class GeometryViewport(GeometryModel):
    center_x: float = 0
    center_y: float = 0
    scale: float = Field(default=50, gt=0)


class GeometryDocument(GeometryModel):
    schema_version: Literal[1] = GEOMETRY_SCHEMA_VERSION
    id: str
    title: str
    objects: list[GeometryObject]
    viewport: GeometryViewport | None = None
    metadata: dict[str, str] | None = None

    @field_validator("id")
    @classmethod
    def id_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value

    @model_validator(mode="after")
    def ids_and_labels_must_be_unique(self) -> GeometryDocument:
        ids = [item.id for item in self.objects]
        labels = [item.label for item in self.objects]
        if len(ids) != len(set(ids)):
            raise ValueError("geometry object ids must be unique")
        if len(labels) != len(set(labels)):
            raise ValueError("geometry object labels must be unique")
        return self


class PointValue(GeometryModel):
    type: Literal["point"] = "point"
    x: float
    y: float


class LineValue(GeometryModel):
    type: Literal["line"] = "line"
    a: float
    b: float
    c: float


class Coordinate(GeometryModel):
    x: float
    y: float


class SegmentValue(GeometryModel):
    type: Literal["segment"] = "segment"
    start: Coordinate
    end: Coordinate


class CircleValue(GeometryModel):
    type: Literal["circle"] = "circle"
    center: Coordinate
    radius: float


class UndefinedValue(GeometryModel):
    type: Literal["undefined"] = "undefined"
    code: str
    message: str


class PolygonValue(GeometryModel):
    type: Literal["polygon"] = "polygon"
    vertices: list[Coordinate]


EvaluatedValue: TypeAlias = PointValue | LineValue | SegmentValue | CircleValue | PolygonValue | UndefinedValue


def geometry_document_to_json(document: GeometryDocument, *, indent: int | None = 2) -> str:
    """Serialize a document using the shared camelCase JSON representation."""

    return document.model_dump_json(by_alias=True, indent=indent)


def geometry_document_from_json(payload: str) -> GeometryDocument:
    """Parse and structurally validate a shared geometry JSON document."""

    return GeometryDocument.model_validate_json(payload)
