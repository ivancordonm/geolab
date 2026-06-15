export const GEOMETRY_SCHEMA_VERSION = 1 as const;

export type GeometryObjectId = string;
export type GeometryKind = "point" | "line" | "segment" | "circle" | "polygon" | "arc";

export type StrokeDash = "solid" | "dashed" | "dotted";

export interface GeometryStyle {
  color?: string;
  strokeWidth?: number;
  strokeDash?: StrokeDash;
  labelOffset?: { x: number; y: number };
}

interface GeometryObjectBase {
  id: GeometryObjectId;
  label: string;
  kind: GeometryKind;
  visible: boolean;
  style?: GeometryStyle;
}

// ─── Existing constructions ────────────────────────────────────────────────

export interface Point extends GeometryObjectBase {
  kind: "point";
  definition: { type: "free"; x: number; y: number };
}

export interface Line extends GeometryObjectBase {
  kind: "line";
  definition: { type: "through_points"; pointA: GeometryObjectId; pointB: GeometryObjectId };
}

export interface Segment extends GeometryObjectBase {
  kind: "segment";
  definition: { type: "between_points"; pointA: GeometryObjectId; pointB: GeometryObjectId };
}

export interface Circle extends GeometryObjectBase {
  kind: "circle";
  definition: { type: "center_through_point"; center: GeometryObjectId; point: GeometryObjectId };
}

export interface Midpoint extends GeometryObjectBase {
  kind: "point";
  definition: { type: "midpoint"; pointA: GeometryObjectId; pointB: GeometryObjectId };
}

export interface PolygonVertexPoint extends GeometryObjectBase {
  kind: "point";
  definition: { type: "polygon_vertex"; polygon: GeometryObjectId; index: number };
}

export interface ParallelLine extends GeometryObjectBase {
  kind: "line";
  definition: { type: "parallel_through"; point: GeometryObjectId; line: GeometryObjectId };
}

export interface PerpendicularLine extends GeometryObjectBase {
  kind: "line";
  definition: { type: "perpendicular_through"; point: GeometryObjectId; line: GeometryObjectId };
}

// ─── Intersections ─────────────────────────────────────────────────────────

export interface IntersectionLL extends GeometryObjectBase {
  kind: "point";
  definition: { type: "intersection_ll"; lineA: GeometryObjectId; lineB: GeometryObjectId };
}

export interface IntersectionLC extends GeometryObjectBase {
  kind: "point";
  definition: {
    type: "intersection_lc";
    line: GeometryObjectId;
    circle: GeometryObjectId;
    index?: 1 | 2 | null;
    selector?: "first" | "second" | "left" | "right" | null;
  };
}

export interface IntersectionCC extends GeometryObjectBase {
  kind: "point";
  definition: {
    type: "intersection_cc";
    circleA: GeometryObjectId;
    circleB: GeometryObjectId;
    index?: 1 | 2 | null;
    selector?: "upper" | "lower" | "left" | "right" | null;
  };
}

// ─── Bisectors and special lines ───────────────────────────────────────────

export interface PerpendicularBisectorLine extends GeometryObjectBase {
  kind: "line";
  definition: { type: "perpendicular_bisector"; pointA: GeometryObjectId; pointB: GeometryObjectId };
}

export interface AngleBisectorLine extends GeometryObjectBase {
  kind: "line";
  definition: { type: "angle_bisector"; armA: GeometryObjectId; vertex: GeometryObjectId; armB: GeometryObjectId };
}

export interface CircumscribedCircle extends GeometryObjectBase {
  kind: "circle";
  definition: { type: "circumscribed"; pointA: GeometryObjectId; pointB: GeometryObjectId; pointC: GeometryObjectId };
}

// ─── Transformations ───────────────────────────────────────────────────────

export interface ReflectionOverLine extends GeometryObjectBase {
  kind: "point" | "line" | "segment" | "circle" | "polygon";
  definition: { type: "reflection_over_line"; object: GeometryObjectId; line: GeometryObjectId; point?: GeometryObjectId };
}

export interface ReflectionOverPoint extends GeometryObjectBase {
  kind: "point" | "line" | "segment" | "circle" | "polygon";
  definition: { type: "reflection_over_point"; object: GeometryObjectId; center: GeometryObjectId; point?: GeometryObjectId };
}

export interface HomothetyScalar extends GeometryObjectBase {
  kind: "point";
  definition: { type: "homothety_scalar"; center: GeometryObjectId; point: GeometryObjectId; ratio: number };
}

export interface HomothetyPoint extends GeometryObjectBase {
  kind: "point";
  definition: { type: "homothety_point"; center: GeometryObjectId; point: GeometryObjectId; ratioPoint: GeometryObjectId };
}

export interface InversionInCircle extends GeometryObjectBase {
  kind: "point";
  definition: { type: "inversion_in_circle"; point: GeometryObjectId; circle: GeometryObjectId };
}

export interface TranslatedPoint extends GeometryObjectBase {
  kind: "point";
  definition: { type: "translation"; point: GeometryObjectId; from: GeometryObjectId; to: GeometryObjectId };
}

export interface RotatedPoint extends GeometryObjectBase {
  kind: "point";
  definition: { type: "rotation"; point: GeometryObjectId; center: GeometryObjectId; degrees: number };
}

export interface Arc extends GeometryObjectBase {
  kind: "arc";
  definition: { type: "arc_through_points"; pointA: GeometryObjectId; pointMid: GeometryObjectId; pointB: GeometryObjectId };
}

// ─── Polygons ──────────────────────────────────────────────────────────────

export interface Polygon extends GeometryObjectBase {
  kind: "polygon";
  definition:
    | { type: "polygon"; points: GeometryObjectId[] }
    | { type: "regular_polygon"; pointA: GeometryObjectId; pointB: GeometryObjectId; sides: number }
    | { type: "vector_polygon"; anchor: GeometryObjectId; offsets: { x: number; y: number }[] };
}

// ─── Union ─────────────────────────────────────────────────────────────────

export type GeometryObject =
  | Point
  | Line
  | Segment
  | Circle
  | Midpoint
  | PolygonVertexPoint
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
  | Arc
  | Polygon;

// ─── Viewport and document ─────────────────────────────────────────────────

export interface GeometryViewport {
  centerX: number;
  centerY: number;
  scale: number;
}

export interface GeometryDocument {
  schemaVersion: typeof GEOMETRY_SCHEMA_VERSION;
  id: string;
  title: string;
  objects: GeometryObject[];
  viewport?: GeometryViewport;
  metadata?: Record<string, string>;
}

// ─── Evaluated values ──────────────────────────────────────────────────────

export interface PointValue {
  type: "point";
  x: number;
  y: number;
}

export interface LineValue {
  type: "line";
  a: number;
  b: number;
  c: number;
}

export interface SegmentValue {
  type: "segment";
  start: Omit<PointValue, "type">;
  end: Omit<PointValue, "type">;
}

export interface CircleValue {
  type: "circle";
  center: Omit<PointValue, "type">;
  radius: number;
}

export interface ArcValue {
  type: "arc";
  center: Omit<PointValue, "type">;
  radius: number;
  start: Omit<PointValue, "type">;
  mid: Omit<PointValue, "type">;
  end: Omit<PointValue, "type">;
}

export interface UndefinedValue {
  type: "undefined";
  code: string;
  message: string;
}

export interface PolygonValue {
  type: "polygon";
  vertices: { x: number; y: number }[];
}

export type EvaluatedValue =
  | PointValue
  | LineValue
  | SegmentValue
  | CircleValue
  | ArcValue
  | PolygonValue
  | UndefinedValue;

export type EvaluationMap = ReadonlyMap<GeometryObjectId, EvaluatedValue>;
