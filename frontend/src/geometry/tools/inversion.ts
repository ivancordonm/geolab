import type {
  Arc,
  Circle,
  CircleValue,
  EvaluationMap,
  GeometryDocument,
  GeometryObject,
  HomothetyPoint,
  HomothetyScalar,
  IntersectionLC,
  IntersectionLL,
  InversionInCircle,
  Line,
  LineValue,
  Midpoint,
  ParallelLine,
  PerpendicularBisectorLine,
  PerpendicularLine,
  PointValue,
  RotatedObject,
  Segment,
  TranslatedObject,
} from "../../types/geometry";
import { GEOMETRY_EPSILON, GeometryGraph } from "../engine";
import { nextObjectId, requireObject } from "./shared";
import type { ReflectionObject } from "./transformations";

/** Handles the "inversion" construction tool. This is the largest and most
 * involved family: inverting a point is a single closed-form operation, but
 * inverting a line, circle, segment, or polygon requires constructing an
 * auxiliary chain of dependent objects (feet of perpendiculars, midpoints,
 * inverted vertices, arcs, ...), which is what most of this file does. */

type LineObject = Extract<GeometryObject, { kind: "line" }>;
type CircleObject = Extract<GeometryObject, { kind: "circle" }>;
type SegmentObject = Extract<GeometryObject, { kind: "segment" }>;
type PolygonObject = Extract<GeometryObject, { kind: "polygon" }>;
type SourceLineObject = Exclude<LineObject, ReflectionObject | RotatedObject | TranslatedObject | HomothetyScalar | HomothetyPoint>;
type SourceCircleObject = Exclude<CircleObject, ReflectionObject | RotatedObject | TranslatedObject | HomothetyScalar | HomothetyPoint>;
type SourceSegmentObject = Exclude<SegmentObject, ReflectionObject | RotatedObject | TranslatedObject | HomothetyScalar | HomothetyPoint>;
type SourcePolygonObject = Exclude<PolygonObject, ReflectionObject | RotatedObject | TranslatedObject | HomothetyScalar | HomothetyPoint>;

export function createInversionConstruction(
  document: GeometryDocument,
  sourceId: string,
  inversionCircleId: string,
): readonly GeometryObject[] {
  const graph = new GeometryGraph(document);
  const source = requireObject(document, sourceId);
  const inversionCircle = requireObject(document, inversionCircleId);
  if (!isSourceCircleObject(inversionCircle)) {
    throw new Error("Inversion requires a circle as the second object");
  }

  const created: GeometryObject[] = [];
  let workingDocument: GeometryDocument = { ...document, objects: [...document.objects] };
  const values = graph.values;
  const inversionCenterId = ensureCircleCenterPoint(
    inversionCircle,
    inversionCircleId,
    values,
    () => workingDocument,
    (object) => pushCreatedObject(object, created, () => workingDocument, (next) => { workingDocument = next; }),
  );
  const currentValues = new GeometryGraph(workingDocument).values;

  switch (source.kind) {
    case "point":
      return [createInversionPoint(workingDocument, sourceId, inversionCircleId)];
    case "line":
      if (!isSourceLineObject(source)) {
        throw new Error("Inversion of reflected lines is not supported by the construction tool");
      }
      return createLineInversion(
        source,
        sourceId,
        inversionCircleId,
        inversionCenterId,
        currentValues,
        created,
        () => workingDocument,
        (object) => pushCreatedObject(object, created, () => workingDocument, (next) => { workingDocument = next; }),
      );
    case "circle":
      if (!isSourceCircleObject(source)) {
        throw new Error("Inversion of reflected circles is not supported by the construction tool");
      }
      return createCircleInversion(
        source,
        sourceId,
        inversionCircleId,
        inversionCenterId,
        currentValues,
        created,
        () => workingDocument,
        (object) => pushCreatedObject(object, created, () => workingDocument, (next) => { workingDocument = next; }),
      );
    case "segment":
      if (!isSourceSegmentObject(source)) {
        throw new Error("Inversion of reflected segments is not supported by the construction tool");
      }
      return createSegmentInversion(source, inversionCircleId, created, currentValues, () => workingDocument, (object) =>
        pushCreatedObject(object, created, () => workingDocument, (next) => { workingDocument = next; }),
      );
    case "polygon":
      if (!isSourcePolygonObject(source)) {
        throw new Error("Inversion of reflected polygons is not supported by the construction tool");
      }
      return createPolygonInversion(source, inversionCircleId, created, currentValues, () => workingDocument, (object) =>
        pushCreatedObject(object, created, () => workingDocument, (next) => { workingDocument = next; }),
      );
  }
  throw new Error("Unsupported inversion source");
}

function createLineInversion(
  source: SourceLineObject,
  sourceId: string,
  inversionCircleId: string,
  inversionCenterId: string,
  values: EvaluationMap,
  created: GeometryObject[],
  getDocument: () => GeometryDocument,
  push: (object: GeometryObject) => void,
): readonly GeometryObject[] {
  const center = requirePointValue(values, inversionCenterId);
  const line = requireLineValue(values, sourceId);
  if (Math.abs(line.a * center.x + line.b * center.y + line.c) <= GEOMETRY_EPSILON) {
    const result: ParallelLine = {
      id: nextObjectId(getDocument(), "ivl"),
      label: nextObjectId(getDocument(), "ivl"),
      kind: "line",
      visible: true,
      definition: { type: "parallel_through", point: inversionCenterId, line: sourceId },
    };
    push(result);
    return created;
  }

  const perpendicular: PerpendicularLine = {
    id: nextObjectId(getDocument(), "ivh"),
    label: nextObjectId(getDocument(), "ivh"),
    kind: "line",
    visible: false,
    definition: { type: "perpendicular_through", point: inversionCenterId, line: sourceId },
  };
  push(perpendicular);
  const foot: IntersectionLL = {
    id: nextObjectId(getDocument(), "ivp"),
    label: nextObjectId(getDocument(), "ivp"),
    kind: "point",
    visible: false,
    definition: { type: "intersection_ll", lineA: sourceId, lineB: perpendicular.id },
  };
  push(foot);
  const invertedFoot = createInversionPoint(getDocument(), foot.id, inversionCircleId, false, "ivp");
  push(invertedFoot);
  const midpoint: Midpoint = {
    id: nextObjectId(getDocument(), "ivm"),
    label: nextObjectId(getDocument(), "ivm"),
    kind: "point",
    visible: false,
    definition: { type: "midpoint", pointA: inversionCenterId, pointB: invertedFoot.id },
  };
  push(midpoint);
  const result: Circle = {
    id: nextObjectId(getDocument(), "ivc"),
    label: nextObjectId(getDocument(), "ivc"),
    kind: "circle",
    visible: true,
    definition: { type: "center_through_point", center: midpoint.id, point: inversionCenterId },
  };
  push(result);
  return created;
}

function createCircleInversion(
  source: SourceCircleObject,
  sourceId: string,
  inversionCircleId: string,
  inversionCenterId: string,
  values: EvaluationMap,
  created: GeometryObject[],
  getDocument: () => GeometryDocument,
  push: (object: GeometryObject) => void,
): readonly GeometryObject[] {
  const sourceCenterId = ensureCircleCenterPoint(
    source,
    sourceId,
    values,
    getDocument,
    push,
  );
  const o = requirePointValue(values, inversionCenterId);
  const c = requirePointValue(new GeometryGraph(getDocument()).values, sourceCenterId);
  const circleValue = requireCircleValue(values, sourceId);
  const centerDistance = Math.hypot(c.x - o.x, c.y - o.y);

  if (centerDistance <= GEOMETRY_EPSILON) {
    const radiusPointId = getCircleRadiusPointId(source);
    const invertedRadiusPoint = createInversionPoint(getDocument(), radiusPointId, inversionCircleId, false, "ivp");
    push(invertedRadiusPoint);
    const result: Circle = {
      id: nextObjectId(getDocument(), "ivc"),
      label: nextObjectId(getDocument(), "ivc"),
      kind: "circle",
      visible: true,
      definition: { type: "center_through_point", center: inversionCenterId, point: invertedRadiusPoint.id },
    };
    push(result);
    return created;
  }

  if (Math.abs(centerDistance - circleValue.radius) <= GEOMETRY_EPSILON) {
    const invertedCenter = createInversionPoint(getDocument(), sourceCenterId, inversionCircleId, false, "ivp");
    push(invertedCenter);
    const midpoint: Midpoint = {
      id: nextObjectId(getDocument(), "ivm"),
      label: nextObjectId(getDocument(), "ivm"),
      kind: "point",
      visible: false,
      definition: { type: "midpoint", pointA: inversionCenterId, pointB: invertedCenter.id },
    };
    push(midpoint);
    const centerLine: Line = {
      id: nextObjectId(getDocument(), "ivl"),
      label: nextObjectId(getDocument(), "ivl"),
      kind: "line",
      visible: false,
      definition: { type: "through_points", pointA: inversionCenterId, pointB: sourceCenterId },
    };
    push(centerLine);
    const result: PerpendicularLine = {
      id: nextObjectId(getDocument(), "ivh"),
      label: nextObjectId(getDocument(), "ivh"),
      kind: "line",
      visible: true,
      definition: { type: "perpendicular_through", point: midpoint.id, line: centerLine.id },
    };
    push(result);
    return created;
  }

  const centerLine: Line = {
    id: nextObjectId(getDocument(), "ivl"),
    label: nextObjectId(getDocument(), "ivl"),
    kind: "line",
    visible: false,
    definition: { type: "through_points", pointA: inversionCenterId, pointB: sourceCenterId },
  };
  push(centerLine);
  const intersection1: IntersectionLC = {
    id: nextObjectId(getDocument(), "ivp"),
    label: nextObjectId(getDocument(), "ivp"),
    kind: "point",
    visible: false,
    definition: { type: "intersection_lc", line: centerLine.id, circle: sourceId, index: 1 },
  };
  push(intersection1);
  const intersection2: IntersectionLC = {
    id: nextObjectId(getDocument(), "ivp"),
    label: nextObjectId(getDocument(), "ivp"),
    kind: "point",
    visible: false,
    definition: { type: "intersection_lc", line: centerLine.id, circle: sourceId, index: 2 },
  };
  push(intersection2);
  const inverted1 = createInversionPoint(getDocument(), intersection1.id, inversionCircleId, false, "ivp");
  push(inverted1);
  const inverted2 = createInversionPoint(getDocument(), intersection2.id, inversionCircleId, false, "ivp");
  push(inverted2);
  const midpoint: Midpoint = {
    id: nextObjectId(getDocument(), "ivm"),
    label: nextObjectId(getDocument(), "ivm"),
    kind: "point",
    visible: false,
    definition: { type: "midpoint", pointA: inverted1.id, pointB: inverted2.id },
  };
  push(midpoint);
  const result: Circle = {
    id: nextObjectId(getDocument(), "ivc"),
    label: nextObjectId(getDocument(), "ivc"),
    kind: "circle",
    visible: true,
    definition: { type: "center_through_point", center: midpoint.id, point: inverted1.id },
  };
  push(result);
  return created;
}

function createSegmentInversion(
  source: SourceSegmentObject,
  inversionCircleId: string,
  created: GeometryObject[],
  values: EvaluationMap,
  getDocument: () => GeometryDocument,
  push: (object: GeometryObject) => void,
): readonly GeometryObject[] {
  return createEdgeInversion(
    source.definition.pointA,
    source.definition.pointB,
    inversionCircleId,
    created,
    values,
    getDocument,
    push,
  );
}

function createPolygonInversion(
  source: SourcePolygonObject,
  inversionCircleId: string,
  created: GeometryObject[],
  values: EvaluationMap,
  getDocument: () => GeometryDocument,
  push: (object: GeometryObject) => void,
): readonly GeometryObject[] {
  const vertexIds = getPolygonVertexPointIds(source, values, getDocument, push);
  for (let index = 0; index < vertexIds.length; index += 1) {
    const startId = vertexIds[index];
    const endId = vertexIds[(index + 1) % vertexIds.length];
    createEdgeInversion(startId, endId, inversionCircleId, created, new GeometryGraph(getDocument()).values, getDocument, push);
  }
  return created;
}

function createEdgeInversion(
  startPointId: string,
  endPointId: string,
  inversionCircleId: string,
  created: GeometryObject[],
  values: EvaluationMap,
  getDocument: () => GeometryDocument,
  push: (object: GeometryObject) => void,
): readonly GeometryObject[] {
  const inversionCircle = requireCircleValue(values, inversionCircleId);
  const startValue = requirePointValue(values, startPointId);
  const endValue = requirePointValue(values, endPointId);
  const center = inversionCircle.center;
  const startIsCenter = isSamePoint(startValue, center);
  const endIsCenter = isSamePoint(endValue, center);

  if (startIsCenter || endIsCenter) {
    throw new Error("Inversion of an edge touching the inversion center requires ray support");
  }

  const start = createInversionPoint(getDocument(), startPointId, inversionCircleId, false, "ivp");
  push(start);
  const end = createInversionPoint(getDocument(), endPointId, inversionCircleId, false, "ivp");
  push(end);

  if (isCollinearWithCenter(startValue, endValue, center)) {
    if (pointOnSegment(center, startValue, endValue)) {
      throw new Error("Inversion of an edge crossing the inversion center requires disconnected-curve support");
    }
    const segment: Segment = {
      id: nextObjectId(getDocument(), "ivs"),
      label: nextObjectId(getDocument(), "ivs"),
      kind: "segment",
      visible: true,
      definition: { type: "between_points", pointA: start.id, pointB: end.id },
    };
    push(segment);
    return created;
  }

  const midpoint: Midpoint = {
    id: nextObjectId(getDocument(), "ivm"),
    label: nextObjectId(getDocument(), "ivm"),
    kind: "point",
    visible: false,
    definition: { type: "midpoint", pointA: startPointId, pointB: endPointId },
  };
  push(midpoint);
  const mid = createInversionPoint(getDocument(), midpoint.id, inversionCircleId, false, "ivp");
  push(mid);
  const arc: Arc = {
    id: nextObjectId(getDocument(), "iva"),
    label: nextObjectId(getDocument(), "iva"),
    kind: "arc",
    visible: true,
    definition: { type: "arc_through_points", pointA: start.id, pointMid: mid.id, pointB: end.id },
  };
  push(arc);
  return created;
}

function getPolygonVertexPointIds(
  source: SourcePolygonObject,
  values: EvaluationMap,
  getDocument: () => GeometryDocument,
  push: (object: GeometryObject) => void,
): string[] {
  if (source.definition.type === "polygon") {
    return [...source.definition.points];
  }

  const polygonValue = values.get(source.id);
  if (polygonValue?.type !== "polygon") {
    throw new Error("Unable to evaluate polygon vertices");
  }

  const vertexIds: string[] = [];
  for (let index = 0; index < polygonValue.vertices.length; index += 1) {
    const object: GeometryObject = {
      id: nextObjectId(getDocument(), "ivv"),
      label: nextObjectId(getDocument(), "ivv"),
      kind: "point",
      visible: false,
      definition: { type: "polygon_vertex", polygon: source.id, index },
    };
    push(object);
    vertexIds.push(object.id);
  }
  return vertexIds;
}

function createInversionPoint(
  document: GeometryDocument,
  pointId: string,
  circleId: string,
  visible = true,
  prefix = "iv",
): InversionInCircle {
  const id = nextObjectId(document, prefix);
  return {
    id,
    label: id,
    kind: "point",
    visible,
    definition: { type: "inversion_in_circle", point: pointId, circle: circleId },
  };
}

function ensureCircleCenterPoint(
  circle: SourceCircleObject,
  circleId: string,
  values: EvaluationMap,
  getDocument: () => GeometryDocument,
  push: (object: GeometryObject) => void,
): string {
  switch (circle.definition.type) {
    case "center_through_point":
    case "center_radius":
      return circle.definition.center;
    case "circumscribed":
      break;
  }

  const line1: PerpendicularBisectorLine = {
    id: nextObjectId(getDocument(), "ivpb"),
    label: nextObjectId(getDocument(), "ivpb"),
    kind: "line",
    visible: false,
    definition: {
      type: "perpendicular_bisector",
      pointA: circle.definition.pointA,
      pointB: circle.definition.pointB,
    },
  };
  push(line1);
  const line2: PerpendicularBisectorLine = {
    id: nextObjectId(getDocument(), "ivpb"),
    label: nextObjectId(getDocument(), "ivpb"),
    kind: "line",
    visible: false,
    definition: {
      type: "perpendicular_bisector",
      pointA: circle.definition.pointB,
      pointB: circle.definition.pointC,
    },
  };
  push(line2);
  const center: IntersectionLL = {
    id: nextObjectId(getDocument(), "ivctr"),
    label: nextObjectId(getDocument(), "ivctr"),
    kind: "point",
    visible: false,
    definition: { type: "intersection_ll", lineA: line1.id, lineB: line2.id },
  };
  push(center);
  const centerValue = new GeometryGraph(getDocument()).values.get(center.id);
  if (centerValue?.type !== "point") {
    throw new Error(`Unable to compute center for circle '${circleId}'`);
  }
  return center.id;
}

function isSourceLineObject(object: GeometryObject): object is SourceLineObject {
  return object.kind === "line" && object.definition.type !== "reflection_over_line" && object.definition.type !== "reflection_over_point" && object.definition.type !== "rotation";
}

function isSourceCircleObject(object: GeometryObject): object is SourceCircleObject {
  return object.kind === "circle" && object.definition.type !== "reflection_over_line" && object.definition.type !== "reflection_over_point" && object.definition.type !== "rotation";
}

function isSourceSegmentObject(object: GeometryObject): object is SourceSegmentObject {
  return object.kind === "segment" && object.definition.type !== "reflection_over_line" && object.definition.type !== "reflection_over_point" && object.definition.type !== "rotation";
}

function isSourcePolygonObject(object: GeometryObject): object is SourcePolygonObject {
  return object.kind === "polygon" && object.definition.type !== "reflection_over_line" && object.definition.type !== "reflection_over_point" && object.definition.type !== "rotation";
}

function pushCreatedObject(
  object: GeometryObject,
  created: GeometryObject[],
  getDocument: () => GeometryDocument,
  setDocument: (document: GeometryDocument) => void,
): void {
  created.push(object);
  setDocument({
    ...getDocument(),
    objects: [...getDocument().objects, object],
  });
}

function requirePointValue(values: EvaluationMap, pointId: string): PointValue {
  const value = values.get(pointId);
  if (value?.type !== "point") {
    throw new Error(`Expected '${pointId}' to evaluate as a point`);
  }
  return value;
}

function requireLineValue(values: EvaluationMap, lineId: string): LineValue {
  const value = values.get(lineId);
  if (value?.type !== "line") {
    throw new Error(`Expected '${lineId}' to evaluate as a line`);
  }
  return value;
}

function requireCircleValue(values: EvaluationMap, circleId: string): CircleValue {
  const value = values.get(circleId);
  if (value?.type !== "circle") {
    throw new Error(`Expected '${circleId}' to evaluate as a circle`);
  }
  return value;
}

function isSamePoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= GEOMETRY_EPSILON;
}

function isCollinearWithCenter(
  start: { x: number; y: number },
  end: { x: number; y: number },
  center: { x: number; y: number },
): boolean {
  const cross =
    (start.x - center.x) * (end.y - center.y) -
    (start.y - center.y) * (end.x - center.x);
  return Math.abs(cross) <= GEOMETRY_EPSILON;
}

function pointOnSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): boolean {
  return (
    point.x >= Math.min(start.x, end.x) - GEOMETRY_EPSILON &&
    point.x <= Math.max(start.x, end.x) + GEOMETRY_EPSILON &&
    point.y >= Math.min(start.y, end.y) - GEOMETRY_EPSILON &&
    point.y <= Math.max(start.y, end.y) + GEOMETRY_EPSILON
  );
}

function getCircleRadiusPointId(circle: SourceCircleObject): string {
  switch (circle.definition.type) {
    case "center_through_point":
      return circle.definition.point;
    case "center_radius":
      throw new Error(
        "This construction requires a circle defined by a point on its circumference, not a scalar radius",
      );
    case "circumscribed":
      return circle.definition.pointA;
  }
}
