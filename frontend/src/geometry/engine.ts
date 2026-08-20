import type {
  ArcValue,
  CircleValue,
  EvaluatedValue,
  EvaluationMap,
  FunctionValue,
  GeometryDocument,
  GeometryObject,
  GeometryObjectId,
  LineValue,
  Point,
  PolygonValue,
  PointValue,
  ScalarValue,
  SegmentValue,
  UndefinedValue,
} from "../types/geometry";
import { evaluateCircleFamily } from "./evaluators/circles";
import { normalizeFunctionExpression } from "./functionExpression";
import { validateObjectGroups } from "./objectGroups";
import {
  angleForPointOnArc,
  angleForPointOnCircle,
  pointOnArcFromAngle,
  pointOnCircleFromAngle,
  pointOnLineFromT,
  pointOnSegmentFromT,
  tForPointOnLine,
  tForPointOnSegment,
} from "./evaluators/pointOnObject";

export const GEOMETRY_EPSILON = 1e-9;

// Inversion is not kind-preserving (e.g. a line not through the inversion
// center becomes a circle), unlike reflection/homothety/translation/rotation.
const INVERSION_RESULT_KINDS: Record<string, readonly string[]> = {
  point: ["point"],
  line: ["line", "circle"],
  circle: ["line", "circle"],
  segment: ["segment", "arc"],
};

export class GeometryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeometryValidationError";
  }
}

export interface RecomputeResult {
  document: GeometryDocument;
  values: EvaluationMap;
  recomputedObjectIds: GeometryObjectId[];
}

export function getParentIds(object: GeometryObject): GeometryObjectId[] {
  switch (object.definition.type) {
    case "free":
      return [];
    case "slider":
      return [];
    case "polygon_vertex":
      return [object.definition.polygon];
    case "on_line":
      return [object.definition.line];
    case "on_segment":
      return [object.definition.segment];
    case "on_circle":
      return [object.definition.circle];
    case "on_arc":
      return [object.definition.arc];
    case "through_points":
    case "between_points":
    case "midpoint":
    case "perpendicular_bisector":
      return [object.definition.pointA, object.definition.pointB];
    case "center_through_point":
      return [object.definition.center, object.definition.point];
    case "center_radius":
      return [object.definition.center, object.definition.radius];
    case "parallel_through":
    case "perpendicular_through":
      return [object.definition.point, object.definition.line];
    case "intersection_ll":
      return [object.definition.lineA, object.definition.lineB];
    case "intersection_lc":
      return [object.definition.line, object.definition.circle];
    case "intersection_cc":
      return [object.definition.circleA, object.definition.circleB];
    case "tangent_pc":
      return [object.definition.point, object.definition.circle];
    case "angle_bisector":
      return [object.definition.armA, object.definition.vertex, object.definition.armB];
    case "circumscribed":
      return [object.definition.pointA, object.definition.pointB, object.definition.pointC];
    case "reflection_over_line":
      return [object.definition.object ?? object.definition.point!, object.definition.line];
    case "reflection_over_point":
      return [object.definition.object ?? object.definition.point!, object.definition.center];
    case "homothety_scalar":
      return [object.definition.center, object.definition.object ?? object.definition.point!];
    case "homothety_point":
      return [object.definition.center, object.definition.object ?? object.definition.point!, object.definition.ratioPoint];
    case "inversion_in_circle":
      return [object.definition.object ?? object.definition.point!, object.definition.circle];
    case "translation":
      return [object.definition.object ?? object.definition.point!, object.definition.from, object.definition.to];
    case "rotation":
      return [object.definition.object ?? object.definition.point!, object.definition.center];
    case "arc_through_points":
      return [object.definition.pointA, object.definition.pointMid, object.definition.pointB];
    case "function_expression":
      return [];
    // ─── Polygons ─────────────────────────────────────────────────────────
    case "polygon":
      return [...object.definition.points];
    case "regular_polygon":
      return [object.definition.pointA, object.definition.pointB];
    case "vector_polygon":
      return [object.definition.anchor];
    case "distance":
      return [object.definition.pointA, object.definition.pointB];
    case "angle":
      return [object.definition.pointA, object.definition.vertex, object.definition.pointB];
    case "area":
      return [object.definition.polygon];
    case "slope":
      return [object.definition.line];
  }
  return [];
}

export class GeometryGraph {
  private documentState: GeometryDocument;
  private readonly objectsById: Map<GeometryObjectId, GeometryObject>;
  private readonly parentsById: Map<GeometryObjectId, GeometryObjectId[]>;
  private readonly dependantsById: Map<GeometryObjectId, Set<GeometryObjectId>>;
  private readonly topologicalOrder: GeometryObjectId[];
  private readonly evaluatedValues = new Map<GeometryObjectId, EvaluatedValue>();

  constructor(document: GeometryDocument) {
    this.documentState = cloneGeometryDocument(document);
    try {
      validateObjectGroups(this.documentState);
    } catch (error) {
      throw new GeometryValidationError(error instanceof Error ? error.message : "Invalid geometry groups");
    }
    this.objectsById = new Map();
    this.parentsById = new Map();
    this.dependantsById = new Map();

    this.indexAndValidateDocument();
    this.topologicalOrder = this.buildTopologicalOrder();
    this.recomputeIds(new Set(this.topologicalOrder));
  }

  get document(): GeometryDocument {
    return cloneGeometryDocument(this.documentState);
  }

  get values(): EvaluationMap {
    return new Map(this.evaluatedValues);
  }

  moveFreePoint(pointId: GeometryObjectId, x: number, y: number): RecomputeResult {
    assertFiniteNumber(x, "x");
    assertFiniteNumber(y, "y");

    const object = this.objectsById.get(pointId);
    if (object === undefined) {
      throw new GeometryValidationError(`Unknown point '${pointId}'`);
    }
    if (!isFreePoint(object)) {
      throw new GeometryValidationError(`Object '${pointId}' is not a free point`);
    }

    const updatedPoint: Point = {
      ...object,
      definition: { type: "free", x, y },
    };
    this.objectsById.set(pointId, updatedPoint);
    this.documentState = {
      ...this.documentState,
      objects: this.documentState.objects.map((candidate) =>
        candidate.id === pointId ? updatedPoint : candidate,
      ),
    };

    const affected = this.collectDependants(pointId);
    const recomputedObjectIds = this.recomputeIds(affected);

    return {
      document: this.document,
      values: this.values,
      recomputedObjectIds,
    };
  }

  moveConstrainedPoint(pointId: GeometryObjectId, x: number, y: number): RecomputeResult {
    assertFiniteNumber(x, "x");
    assertFiniteNumber(y, "y");

    const object = this.objectsById.get(pointId);
    if (object === undefined) {
      throw new GeometryValidationError(`Unknown point '${pointId}'`);
    }
    if (object.kind !== "point") {
      throw new GeometryValidationError(`Object '${pointId}' is not a point constrained to another object`);
    }
    const def = object.definition;

    let updatedDefinition: typeof def;
    if (def.type === "on_line") {
      const line = this.requireValue<LineValue>(pointId, def.line, "line");
      if (isUndefined(line)) throw new GeometryValidationError(`Cannot move '${pointId}': parent line is undefined`);
      updatedDefinition = { type: "on_line", line: def.line, t: tForPointOnLine(line, { x, y }) };
    } else if (def.type === "on_segment") {
      const segment = this.requireValue<SegmentValue>(pointId, def.segment, "segment");
      if (isUndefined(segment)) throw new GeometryValidationError(`Cannot move '${pointId}': parent segment is undefined`);
      updatedDefinition = { type: "on_segment", segment: def.segment, t: tForPointOnSegment(segment, { x, y }) };
    } else if (def.type === "on_circle") {
      const circle = this.requireValue<CircleValue>(pointId, def.circle, "circle");
      if (isUndefined(circle)) throw new GeometryValidationError(`Cannot move '${pointId}': parent circle is undefined`);
      updatedDefinition = { type: "on_circle", circle: def.circle, angle: angleForPointOnCircle(circle, { x, y }) };
    } else if (def.type === "on_arc") {
      const arc = this.requireValue<ArcValue>(pointId, def.arc, "arc");
      if (isUndefined(arc)) throw new GeometryValidationError(`Cannot move '${pointId}': parent arc is undefined`);
      updatedDefinition = { type: "on_arc", arc: def.arc, angle: angleForPointOnArc(arc, { x, y }) };
    } else {
      throw new GeometryValidationError(`Object '${pointId}' is not a point constrained to another object`);
    }

    const updatedPoint = { ...object, definition: updatedDefinition } as GeometryObject;
    this.objectsById.set(pointId, updatedPoint);
    this.documentState = {
      ...this.documentState,
      objects: this.documentState.objects.map((candidate) => (candidate.id === pointId ? updatedPoint : candidate)),
    };

    const affected = this.collectDependants(pointId);
    const recomputedObjectIds = this.recomputeIds(affected);

    return { document: this.document, values: this.values, recomputedObjectIds };
  }

  private indexAndValidateDocument(): void {
    if (this.documentState.schemaVersion !== 1) {
      throw new GeometryValidationError(
        `Unsupported geometry schema version '${this.documentState.schemaVersion}'`,
      );
    }

    const labels = new Set<string>();
    for (const object of this.documentState.objects) {
      if (this.objectsById.has(object.id)) {
        throw new GeometryValidationError(`Duplicate object id '${object.id}'`);
      }
      if (labels.has(object.label)) {
        throw new GeometryValidationError(`Duplicate object label '${object.label}'`);
      }
      if (object.id.trim() === "" || object.label.trim() === "") {
        throw new GeometryValidationError("Object ids and labels must not be empty");
      }
      this.objectsById.set(object.id, object);
      this.dependantsById.set(object.id, new Set());
      labels.add(object.label);
    }

    for (const object of this.documentState.objects) {
      const parentIds = getParentIds(object);
      this.parentsById.set(object.id, parentIds);
      for (const parentId of parentIds) {
        if (!this.objectsById.has(parentId)) {
          throw new GeometryValidationError(
            `Object '${object.id}' references missing parent '${parentId}'`,
          );
        }
        this.dependantsById.get(parentId)?.add(object.id);
      }
      this.validateParentKinds(object);
    }
  }

  private validateParentKinds(object: GeometryObject): void {
    const requireKind = (parentId: string, expected: GeometryObject["kind"]): void => {
      const parent = this.objectsById.get(parentId);
      if (parent?.kind !== expected) {
        throw new GeometryValidationError(
          `Object '${object.id}' requires parent '${parentId}' to be a ${expected}`,
        );
      }
    };

    const def = object.definition;
    switch (def.type) {
      case "free":
        assertFiniteNumber(def.x, `${object.id}.x`);
        assertFiniteNumber(def.y, `${object.id}.y`);
        return;
      case "slider":
        assertFiniteNumber(def.min, `${object.id}.min`);
        assertFiniteNumber(def.max, `${object.id}.max`);
        assertFiniteNumber(def.value, `${object.id}.value`);
        assertFiniteNumber(def.step, `${object.id}.step`);
        return;
      case "polygon_vertex":
        requireKind(def.polygon, "polygon");
        if (!Number.isInteger(def.index) || def.index < 0) {
          throw new GeometryValidationError(`Object '${object.id}' requires a non-negative vertex index`);
        }
        return;
      case "on_line":
        requireKind(def.line, "line");
        return;
      case "on_segment":
        requireKind(def.segment, "segment");
        return;
      case "on_circle":
        requireKind(def.circle, "circle");
        return;
      case "on_arc":
        requireKind(def.arc, "arc");
        return;
      case "through_points":
      case "between_points":
      case "midpoint":
      case "perpendicular_bisector":
        requireKind(def.pointA, "point");
        requireKind(def.pointB, "point");
        return;
      case "center_through_point":
        requireKind(def.center, "point");
        requireKind(def.point, "point");
        return;
      case "center_radius":
        requireKind(def.center, "point");
        if (this.objectsById.get(def.radius)?.kind !== "slider") {
          throw new GeometryValidationError(`Object '${object.id}' requires parent '${def.radius}' to be a slider`);
        }
        return;
      case "parallel_through":
      case "perpendicular_through":
        requireKind(def.point, "point");
        requireKind(def.line, "line");
        return;
      case "intersection_ll":
        requireKind(def.lineA, "line");
        requireKind(def.lineB, "line");
        return;
      case "intersection_lc":
        requireKind(def.line, "line");
        requireKind(def.circle, "circle");
        if ((def.index == null) === (def.selector == null)) {
          throw new GeometryValidationError(
            `Object '${object.id}' requires exactly one intersection index or selector`,
          );
        }
        return;
      case "intersection_cc":
        requireKind(def.circleA, "circle");
        requireKind(def.circleB, "circle");
        if ((def.index == null) === (def.selector == null)) {
          throw new GeometryValidationError(
            `Object '${object.id}' requires exactly one intersection index or selector`,
          );
        }
        return;
      case "tangent_pc":
        requireKind(def.point, "point");
        requireKind(def.circle, "circle");
        if ((def.index == null) === (def.selector == null)) {
          throw new GeometryValidationError(
            `Object '${object.id}' requires exactly one tangent index or selector`,
          );
        }
        return;
      case "angle_bisector":
        requireKind(def.armA, "point");
        requireKind(def.vertex, "point");
        requireKind(def.armB, "point");
        return;
      case "circumscribed":
        requireKind(def.pointA, "point");
        requireKind(def.pointB, "point");
        requireKind(def.pointC, "point");
        return;
      case "reflection_over_line":
        {
          const sourceId = def.object ?? def.point!;
          const parent = this.objectsById.get(sourceId);
          const actual = parent?.kind;
          if (actual === undefined || !["point", "line", "segment", "circle", "polygon"].includes(actual)) {
            throw new GeometryValidationError(
              `Object '${object.id}' requires parent '${sourceId}' to be reflectable`,
            );
          }
          requireKind(def.line, "line");
          if (object.kind !== actual) {
            throw new GeometryValidationError(
              `Object '${object.id}' must keep the reflected kind '${actual}'`,
            );
          }
        }
        return;
      case "reflection_over_point":
        {
          const sourceId = def.object ?? def.point!;
          const parent = this.objectsById.get(sourceId);
          const actual = parent?.kind;
          if (actual === undefined || !["point", "line", "segment", "circle", "polygon"].includes(actual)) {
            throw new GeometryValidationError(
              `Object '${object.id}' requires parent '${sourceId}' to be reflectable`,
            );
          }
          requireKind(def.center, "point");
          if (object.kind !== actual) {
            throw new GeometryValidationError(
              `Object '${object.id}' must keep the reflected kind '${actual}'`,
            );
          }
        }
        return;
      case "homothety_scalar":
        {
        const sourceId = def.object ?? def.point!;
        requireKind(def.center, "point");
        const parent = this.objectsById.get(sourceId);
        const actual = parent?.kind;
        if (actual === undefined || !["point", "line", "segment", "circle", "polygon"].includes(actual)) {
          throw new GeometryValidationError(
            `Object '${object.id}' requires parent '${sourceId}' to be scalable`,
          );
        }
        if (object.kind !== actual) {
          throw new GeometryValidationError(`Object '${object.id}' must keep the scaled kind '${actual}'`);
        }
        assertFiniteNumber(def.ratio, `${object.id}.ratio`);
        if (def.ratio === 0 && actual !== "point") {
          throw new GeometryValidationError(`Object '${object.id}' ratio must be non-zero for ${actual}s`);
        }
        return;
        }
      case "homothety_point":
        {
          const sourceId = def.object ?? def.point!;
          requireKind(def.center, "point");
          const parent = this.objectsById.get(sourceId);
          const actual = parent?.kind;
          if (actual === undefined || !["point", "line", "segment", "circle", "polygon"].includes(actual)) {
            throw new GeometryValidationError(
              `Object '${object.id}' requires parent '${sourceId}' to be scalable`,
            );
          }
          if (object.kind !== actual) {
            throw new GeometryValidationError(`Object '${object.id}' must keep the scaled kind '${actual}'`);
          }
          requireKind(def.ratioPoint, "point");
        }
        return;
      case "inversion_in_circle":
        {
          requireKind(def.circle, "circle");
          const sourceId = def.object ?? def.point!;
          const actual = this.objectsById.get(sourceId)?.kind;
          const allowed = INVERSION_RESULT_KINDS[actual as keyof typeof INVERSION_RESULT_KINDS];
          if (allowed === undefined) {
            throw new GeometryValidationError(
              `Object '${object.id}' requires parent '${sourceId}' to be invertible`,
            );
          }
          if (!allowed.includes(object.kind)) {
            throw new GeometryValidationError(
              `Object '${object.id}' declared kind '${object.kind}' is not a possible inversion result for a ${actual}`,
            );
          }
        }
        return;
      case "translation":
        {
          const sourceId = def.object ?? def.point!;
          const parent = this.objectsById.get(sourceId);
          const actual = parent?.kind;
          if (actual === undefined || !["point", "line", "segment", "circle", "polygon"].includes(actual)) {
            throw new GeometryValidationError(
              `Object '${object.id}' requires parent '${sourceId}' to be translatable`,
            );
          }
          requireKind(def.from, "point");
          requireKind(def.to, "point");
          if (object.kind !== actual) {
            throw new GeometryValidationError(
              `Object '${object.id}' must keep the translated kind '${actual}'`,
            );
          }
        }
        return;
      case "rotation":
        {
          const sourceId = def.object ?? def.point!;
          const parent = this.objectsById.get(sourceId);
          const actual = parent?.kind;
          if (actual === undefined || !["point", "line", "segment", "circle", "polygon"].includes(actual)) {
            throw new GeometryValidationError(
              `Object '${object.id}' requires parent '${sourceId}' to be rotatable`,
            );
          }
          requireKind(def.center, "point");
          if (object.kind !== actual) {
            throw new GeometryValidationError(
              `Object '${object.id}' must keep the rotated kind '${actual}'`,
            );
          }
          assertFiniteNumber(def.degrees, `${object.id}.degrees`);
        }
        return;
      case "arc_through_points":
        requireKind(def.pointA, "point");
        requireKind(def.pointMid, "point");
        requireKind(def.pointB, "point");
        return;
      case "distance":
        requireKind(def.pointA, "point");
        requireKind(def.pointB, "point");
        return;
      case "angle":
        requireKind(def.pointA, "point");
        requireKind(def.vertex, "point");
        requireKind(def.pointB, "point");
        return;
      case "area":
        requireKind(def.polygon, "polygon");
        return;
      case "slope":
        requireKind(def.line, "line");
        return;
      case "function_expression":
        normalizeFunctionExpression(def.expression);
        return;
      // ─── Polygons ───────────────────────────────────────────────────────
      case "polygon":
        if (def.points.length < 3) {
          throw new GeometryValidationError(`Polygon '${object.id}' requires at least 3 vertices`);
        }
        for (const pid of def.points) requireKind(pid, "point");
        return;
      case "regular_polygon":
        if (def.sides < 3) {
          throw new GeometryValidationError(`RegularPolygon '${object.id}' requires at least 3 sides`);
        }
        requireKind(def.pointA, "point");
        requireKind(def.pointB, "point");
        return;
      case "vector_polygon":
        if (def.offsets.length < 2) {
          throw new GeometryValidationError(`VectorPolygon '${object.id}' requires at least 2 offsets`);
        }
        requireKind(def.anchor, "point");
    }
  }

  private buildTopologicalOrder(): GeometryObjectId[] {
    const states = new Map<GeometryObjectId, "visiting" | "visited">();
    const order: GeometryObjectId[] = [];

    const visit = (objectId: GeometryObjectId): void => {
      const state = states.get(objectId);
      if (state === "visiting") {
        throw new GeometryValidationError(`Dependency cycle detected at '${objectId}'`);
      }
      if (state === "visited") {
        return;
      }

      states.set(objectId, "visiting");
      for (const parentId of this.parentsById.get(objectId) ?? []) {
        visit(parentId);
      }
      states.set(objectId, "visited");
      order.push(objectId);
    };

    for (const object of this.documentState.objects) {
      visit(object.id);
    }
    return order;
  }

  private collectDependants(rootId: GeometryObjectId): Set<GeometryObjectId> {
    const affected = new Set<GeometryObjectId>([rootId]);
    const pending = [rootId];

    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) {
        continue;
      }
      for (const dependant of this.dependantsById.get(current) ?? []) {
        if (!affected.has(dependant)) {
          affected.add(dependant);
          pending.push(dependant);
        }
      }
    }
    return affected;
  }

  private recomputeIds(objectIds: Set<GeometryObjectId>): GeometryObjectId[] {
    const recomputed: GeometryObjectId[] = [];
    for (const objectId of this.topologicalOrder) {
      if (!objectIds.has(objectId)) {
        continue;
      }
      const object = this.objectsById.get(objectId);
      if (object === undefined) {
        throw new GeometryValidationError(`Unknown object '${objectId}'`);
      }
      this.evaluatedValues.set(objectId, this.evaluateObject(object));
      recomputed.push(objectId);
    }
    return recomputed;
  }

  private evaluateObject(object: GeometryObject): EvaluatedValue {
    const def = object.definition;
    switch (def.type) {
      case "free":
        return { type: "point", x: def.x, y: def.y };
      case "slider":
        return { type: "scalar", value: def.value } satisfies ScalarValue;

      case "polygon_vertex": {
        const polygon = this.requireValue<PolygonValue>(object.id, def.polygon, "polygon");
        if (isUndefined(polygon)) return polygon;
        const vertex = polygon.vertices[def.index];
        if (vertex === undefined) {
          return { type: "undefined", code: "vertex_out_of_range", message: `Polygon vertex ${def.index} is out of range` };
        }
        return { type: "point", x: cleanZero(vertex.x), y: cleanZero(vertex.y) };
      }

      case "on_line": {
        const line = this.requireValue<LineValue>(object.id, def.line, "line");
        return isUndefined(line) ? line : pointOnLineFromT(line, def.t);
      }
      case "on_segment": {
        const segment = this.requireValue<SegmentValue>(object.id, def.segment, "segment");
        return isUndefined(segment) ? segment : pointOnSegmentFromT(segment, def.t);
      }
      case "on_circle": {
        const circle = this.requireValue<CircleValue>(object.id, def.circle, "circle");
        return isUndefined(circle) ? circle : pointOnCircleFromAngle(circle, def.angle);
      }
      case "on_arc": {
        const arc = this.requireValue<ArcValue>(object.id, def.arc, "arc");
        return isUndefined(arc) ? arc : pointOnArcFromAngle(arc, def.angle);
      }

      case "through_points": {
        const pts = this.requirePointValues(object.id, [def.pointA, def.pointB]);
        return isUndefined(pts) ? pts : lineThroughPoints(pts[0], pts[1]);
      }

      case "between_points": {
        const pts = this.requirePointValues(object.id, [def.pointA, def.pointB]);
        return isUndefined(pts)
          ? pts
          : { type: "segment", start: { x: pts[0].x, y: pts[0].y }, end: { x: pts[1].x, y: pts[1].y } };
      }

      case "midpoint": {
        const pts = this.requirePointValues(object.id, [def.pointA, def.pointB]);
        return isUndefined(pts)
          ? pts
          : { type: "point", x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      }

      case "center_through_point": {
        const pts = this.requirePointValues(object.id, [def.center, def.point]);
        if (isUndefined(pts)) return pts;
        return {
          type: "circle",
          center: { x: pts[0].x, y: pts[0].y },
          radius: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
        };
      }

      case "center_radius": {
        const center = this.requireValue<PointValue>(object.id, def.center, "point");
        if (isUndefined(center)) return center;
        const radius = this.requireValue<ScalarValue>(object.id, def.radius, "scalar");
        if (isUndefined(radius)) return radius;
        return {
          type: "circle",
          center: { x: center.x, y: center.y },
          radius: Math.abs(radius.value),
        };
      }

      case "parallel_through": {
        const pt = this.requireValue<PointValue>(object.id, def.point, "point");
        if (isUndefined(pt)) return pt;
        const ln = this.requireValue<LineValue>(object.id, def.line, "line");
        return isUndefined(ln) ? ln : canonicalLine(ln.a, ln.b, -(ln.a * pt.x + ln.b * pt.y));
      }

      case "perpendicular_through": {
        const pt = this.requireValue<PointValue>(object.id, def.point, "point");
        if (isUndefined(pt)) return pt;
        const ln = this.requireValue<LineValue>(object.id, def.line, "line");
        return isUndefined(ln) ? ln : canonicalLine(-ln.b, ln.a, ln.b * pt.x - ln.a * pt.y);
      }

      // ─── New: intersections ────────────────────────────────────────────

      case "intersection_ll": {
        const lA = this.requireValue<LineValue>(object.id, def.lineA, "line");
        if (isUndefined(lA)) return lA;
        const lB = this.requireValue<LineValue>(object.id, def.lineB, "line");
        if (isUndefined(lB)) return lB;
        return intersectLines(lA, lB);
      }

      case "intersection_lc": {
        const ln = this.requireValue<LineValue>(object.id, def.line, "line");
        if (isUndefined(ln)) return ln;
        const cr = this.requireValue<CircleValue>(object.id, def.circle, "circle");
        if (isUndefined(cr)) return cr;
        return intersectLineCircle(ln, cr, def.index, def.selector);
      }

      case "intersection_cc": {
        const cA = this.requireValue<CircleValue>(object.id, def.circleA, "circle");
        if (isUndefined(cA)) return cA;
        const cB = this.requireValue<CircleValue>(object.id, def.circleB, "circle");
        if (isUndefined(cB)) return cB;
        return intersectCircleCircle(cA, cB, def.index, def.selector);
      }

      case "tangent_pc":
        return evaluateCircleFamily(object, this.evaluatedValues);

      // ─── New: bisectors / circumcircle ────────────────────────────────

      case "perpendicular_bisector": {
        const pts = this.requirePointValues(object.id, [def.pointA, def.pointB]);
        if (isUndefined(pts)) return pts;
        return perpendicularBisector(pts[0], pts[1]);
      }

      case "angle_bisector": {
        const armA = this.requireValue<PointValue>(object.id, def.armA, "point");
        if (isUndefined(armA)) return armA;
        const vertex = this.requireValue<PointValue>(object.id, def.vertex, "point");
        if (isUndefined(vertex)) return vertex;
        const armB = this.requireValue<PointValue>(object.id, def.armB, "point");
        if (isUndefined(armB)) return armB;
        return angleBisector(armA, vertex, armB);
      }

      case "circumscribed": {
        const pA = this.requireValue<PointValue>(object.id, def.pointA, "point");
        if (isUndefined(pA)) return pA;
        const pB = this.requireValue<PointValue>(object.id, def.pointB, "point");
        if (isUndefined(pB)) return pB;
        const pC = this.requireValue<PointValue>(object.id, def.pointC, "point");
        if (isUndefined(pC)) return pC;
        return circumscribedCircle(pA, pB, pC);
      }

      // ─── New: transformations ──────────────────────────────────────────

      case "reflection_over_line": {
        const ln = this.requireValue<LineValue>(object.id, def.line, "line");
        if (isUndefined(ln)) return ln;
        const sourceId = def.object ?? def.point!;
        const source = this.requireValue<EvaluatedValue>(object.id, sourceId, object.kind as EvaluatedValue["type"]);
        if (isUndefined(source)) return source;
        return reflectValueOverLine(source, ln);
      }

      case "reflection_over_point": {
        const ctr = this.requireValue<PointValue>(object.id, def.center, "point");
        if (isUndefined(ctr)) return ctr;
        const sourceId = def.object ?? def.point!;
        const source = this.requireValue<EvaluatedValue>(object.id, sourceId, object.kind as EvaluatedValue["type"]);
        if (isUndefined(source)) return source;
        return reflectValueOverPoint(source, ctr);
      }

      case "homothety_scalar": {
        const ctr = this.requireValue<PointValue>(object.id, def.center, "point");
        if (isUndefined(ctr)) return ctr;
        const source = this.requireValue<EvaluatedValue>(
          object.id,
          def.object ?? def.point!,
          object.kind as EvaluatedValue["type"],
        );
        if (isUndefined(source)) return source;
        return scaleValue(source, ctr, def.ratio);
      }

      case "homothety_point": {
        const ctr = this.requireValue<PointValue>(object.id, def.center, "point");
        if (isUndefined(ctr)) return ctr;
        const source = this.requireValue<EvaluatedValue>(
          object.id,
          def.object ?? def.point!,
          object.kind as EvaluatedValue["type"],
        );
        if (isUndefined(source)) return source;
        const rp = this.requireValue<PointValue>(object.id, def.ratioPoint, "point");
        if (isUndefined(rp)) return rp;
        const ref = referencePointForRatio(source, ctr);
        const dop = Math.hypot(ref.x - ctr.x, ref.y - ctr.y);
        if (dop <= GEOMETRY_EPSILON) {
          return { type: "undefined", code: "coincident_points", message: "Center and reference point coincide" };
        }
        const k = Math.hypot(rp.x - ctr.x, rp.y - ctr.y) / dop;
        if (k === 0 && source.type !== "point") {
          return { type: "undefined", code: "zero_ratio", message: "A zero homothety ratio is only supported for points" };
        }
        return scaleValue(source, ctr, k);
      }

      case "inversion_in_circle": {
        const cr = this.requireValue<CircleValue>(object.id, def.circle, "circle");
        if (isUndefined(cr)) return cr;
        const sourceId = def.object ?? def.point!;
        const sourceKind = this.objectsById.get(sourceId)?.kind as EvaluatedValue["type"];
        const source = this.requireValue<EvaluatedValue>(object.id, sourceId, sourceKind);
        if (isUndefined(source)) return source;
        return invertValue(source, cr, object.kind);
      }

      case "translation": {
        const sourceId = def.object ?? def.point!;
        const source = this.requireValue<EvaluatedValue>(object.id, sourceId, object.kind as EvaluatedValue["type"]);
        if (isUndefined(source)) return source;
        const from = this.requireValue<PointValue>(object.id, def.from, "point");
        if (isUndefined(from)) return from;
        const to = this.requireValue<PointValue>(object.id, def.to, "point");
        if (isUndefined(to)) return to;
        return translateValue(source, to.x - from.x, to.y - from.y);
      }

      case "rotation": {
        const ctr = this.requireValue<PointValue>(object.id, def.center, "point");
        if (isUndefined(ctr)) return ctr;
        const sourceId = def.object ?? def.point!;
        const source = this.requireValue<EvaluatedValue>(object.id, sourceId, object.kind as EvaluatedValue["type"]);
        if (isUndefined(source)) return source;
        return rotateValue(source, ctr, def.degrees);
      }

      case "arc_through_points": {
        const pA = this.requireValue<PointValue>(object.id, def.pointA, "point");
        if (isUndefined(pA)) return pA;
        const pM = this.requireValue<PointValue>(object.id, def.pointMid, "point");
        if (isUndefined(pM)) return pM;
        const pB = this.requireValue<PointValue>(object.id, def.pointB, "point");
        if (isUndefined(pB)) return pB;
        const circle = circleFromThreePoints(pA, pM, pB);
        if (isUndefined(circle)) return circle;
        return {
          type: "arc",
          center: circle.center,
          radius: circle.radius,
          start: { x: cleanZero(pA.x), y: cleanZero(pA.y) },
          mid: { x: cleanZero(pM.x), y: cleanZero(pM.y) },
          end: { x: cleanZero(pB.x), y: cleanZero(pB.y) },
        };
      }

      case "function_expression":
        return {
          type: "function",
          expression: normalizeFunctionExpression(def.expression),
        } satisfies FunctionValue;

      // ─── Polygons ─────────────────────────────────────────────────────────

      case "polygon": {
        const vertices: { x: number; y: number }[] = [];
        for (const pid of def.points) {
          const pv = this.requireValue<PointValue>(object.id, pid, "point");
          if (isUndefined(pv)) return pv;
          vertices.push({ x: pv.x, y: pv.y });
        }
        return { type: "polygon", vertices } satisfies PolygonValue;
      }

      case "regular_polygon": {
        const pA = this.requireValue<PointValue>(object.id, def.pointA, "point");
        if (isUndefined(pA)) return pA;
        const pB = this.requireValue<PointValue>(object.id, def.pointB, "point");
        if (isUndefined(pB)) return pB;
        return regularPolygonVertices(pA, pB, def.sides);
      }

      case "vector_polygon": {
        const anchor = this.requireValue<PointValue>(object.id, def.anchor, "point");
        if (isUndefined(anchor)) return anchor;
        const ax = anchor.x;
        const ay = anchor.y;
        const vertices: { x: number; y: number }[] = [{ x: ax, y: ay }];
        for (const offset of def.offsets) {
          vertices.push({ x: cleanZero(ax + offset.x), y: cleanZero(ay + offset.y) });
        }
        return { type: "polygon", vertices } satisfies PolygonValue;
      }

      case "distance": {
        const pA = this.requireValue<PointValue>(object.id, def.pointA, "point");
        if (isUndefined(pA)) return pA;
        const pB = this.requireValue<PointValue>(object.id, def.pointB, "point");
        if (isUndefined(pB)) return pB;
        return { type: "scalar", value: Math.hypot(pA.x - pB.x, pA.y - pB.y) } satisfies ScalarValue;
      }

      case "angle": {
        const pA = this.requireValue<PointValue>(object.id, def.pointA, "point");
        if (isUndefined(pA)) return pA;
        const v = this.requireValue<PointValue>(object.id, def.vertex, "point");
        if (isUndefined(v)) return v;
        const pB = this.requireValue<PointValue>(object.id, def.pointB, "point");
        if (isUndefined(pB)) return pB;
        const u1x = pA.x - v.x;
        const u1y = pA.y - v.y;
        const u2x = pB.x - v.x;
        const u2y = pB.y - v.y;
        const norm1 = Math.hypot(u1x, u1y);
        const norm2 = Math.hypot(u2x, u2y);
        if (norm1 <= GEOMETRY_EPSILON || norm2 <= GEOMETRY_EPSILON) {
          return { type: "undefined", code: "coincident_points", message: "Angle is undefined when the vertex coincides with an arm point" };
        }
        const dot = u1x * u2x + u1y * u2y;
        const cos = Math.max(-1, Math.min(1, dot / (norm1 * norm2)));
        return { type: "scalar", value: Math.acos(cos) * (180 / Math.PI) } satisfies ScalarValue;
      }

      case "area": {
        const polygon = this.requireValue<PolygonValue>(object.id, def.polygon, "polygon");
        if (isUndefined(polygon)) return polygon;
        let sum = 0;
        const vertices = polygon.vertices;
        for (let i = 0; i < vertices.length; i += 1) {
          const current = vertices[i];
          const next = vertices[(i + 1) % vertices.length];
          sum += current.x * next.y - current.y * next.x;
        }
        return { type: "scalar", value: Math.abs(sum) / 2 } satisfies ScalarValue;
      }

      case "slope": {
        const line = this.requireValue<LineValue>(object.id, def.line, "line");
        if (isUndefined(line)) return line;
        if (Math.abs(line.b) <= GEOMETRY_EPSILON) {
          return {
            type: "undefined",
            code: "vertical_line",
            message: `Slope '${object.id}' is undefined for a vertical line`,
          };
        }
        return { type: "scalar", value: -line.a / line.b } satisfies ScalarValue;
      }
    }
    throw new GeometryValidationError(
      `Unsupported geometry definition type '${(def as { type: string }).type}'`,
    );
  }

  private requirePointValues(
    objectId: string,
    parentIds: [string, string],
  ): [PointValue, PointValue] | UndefinedValue {
    const first = this.requireValue<PointValue>(objectId, parentIds[0], "point");
    if (isUndefined(first)) {
      return first;
    }
    const second = this.requireValue<PointValue>(objectId, parentIds[1], "point");
    return isUndefined(second) ? second : [first, second];
  }

  private requireValue<T extends EvaluatedValue>(
    objectId: string,
    parentId: string,
    expectedType: T["type"],
  ): T | UndefinedValue {
    const value = this.evaluatedValues.get(parentId);
    if (value === undefined || value.type === "undefined") {
      return {
        type: "undefined",
        code: "parent_undefined",
        message: `Object '${objectId}' depends on undefined parent '${parentId}'`,
      };
    }
    if (value.type !== expectedType) {
      return {
        type: "undefined",
        code: "parent_type_mismatch",
        message: `Object '${objectId}' expected '${parentId}' to evaluate as ${expectedType}`,
      };
    }
    return value as T;
  }
}

export function evaluateGeometryDocument(document: GeometryDocument): EvaluationMap {
  return new GeometryGraph(document).values;
}

export function moveFreePoint(
  document: GeometryDocument,
  pointId: GeometryObjectId,
  x: number,
  y: number,
): RecomputeResult {
  return new GeometryGraph(document).moveFreePoint(pointId, x, y);
}

export function moveConstrainedPoint(
  document: GeometryDocument,
  pointId: GeometryObjectId,
  x: number,
  y: number,
): RecomputeResult {
  return new GeometryGraph(document).moveConstrainedPoint(pointId, x, y);
}

// ─── Geometry helpers ──────────────────────────────────────────────────────

function lineThroughPoints(first: PointValue, second: PointValue): EvaluatedValue {
  const a = first.y - second.y;
  const b = second.x - first.x;
  const c = first.x * second.y - second.x * first.y;
  if (Math.hypot(a, b) <= GEOMETRY_EPSILON) {
    return { type: "undefined", code: "coincident_points", message: "A line requires two distinct points" };
  }
  return canonicalLine(a, b, c);
}

function canonicalLine(a: number, b: number, c: number): LineValue {
  const norm = Math.hypot(a, b);
  let na = a / norm;
  let nb = b / norm;
  let nc = c / norm;
  if (na < -GEOMETRY_EPSILON || (Math.abs(na) <= GEOMETRY_EPSILON && nb < 0)) {
    na *= -1; nb *= -1; nc *= -1;
  }
  return { type: "line", a: cleanZero(na), b: cleanZero(nb), c: cleanZero(nc) };
}

function intersectLines(lA: LineValue, lB: LineValue): EvaluatedValue {
  const det = lA.a * lB.b - lA.b * lB.a;
  if (Math.abs(det) <= GEOMETRY_EPSILON) {
    return { type: "undefined", code: "parallel_lines", message: "Lines are parallel or coincident" };
  }
  return {
    type: "point",
    x: cleanZero((lA.b * lB.c - lB.b * lA.c) / det),
    y: cleanZero((lB.a * lA.c - lA.a * lB.c) / det),
  };
}

function reflectPointOverLine(point: PointValue, line: LineValue): PointValue {
  const distance = line.a * point.x + line.b * point.y + line.c;
  return {
    type: "point",
    x: cleanZero(point.x - 2 * line.a * distance),
    y: cleanZero(point.y - 2 * line.b * distance),
  };
}

function reflectPointOverPoint(point: PointValue, center: PointValue): PointValue {
  return {
    type: "point",
    x: cleanZero(2 * center.x - point.x),
    y: cleanZero(2 * center.y - point.y),
  };
}

function samplePointsFromLine(line: LineValue): [PointValue, PointValue] {
  const base: PointValue = { type: "point", x: cleanZero(-line.a * line.c), y: cleanZero(-line.b * line.c) };
  const direction: PointValue = {
    type: "point",
    x: cleanZero(base.x - line.b),
    y: cleanZero(base.y + line.a),
  };
  return [base, direction];
}

function reflectValueOverLine(value: EvaluatedValue, mirror: LineValue): EvaluatedValue {
  switch (value.type) {
    case "point":
      return reflectPointOverLine(value, mirror);
    case "line": {
      const [first, second] = samplePointsFromLine(value);
      return lineThroughPoints(reflectPointOverLine(first, mirror), reflectPointOverLine(second, mirror));
    }
    case "segment": {
      const start = reflectPointOverLine({ type: "point", ...value.start }, mirror);
      const end = reflectPointOverLine({ type: "point", ...value.end }, mirror);
      return { type: "segment", start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
    }
    case "circle": {
      const center = reflectPointOverLine({ type: "point", ...value.center }, mirror);
      return { type: "circle", center: { x: center.x, y: center.y }, radius: value.radius };
    }
    case "polygon":
      return {
        type: "polygon",
        vertices: value.vertices.map((vertex) => {
          const reflected = reflectPointOverLine({ type: "point", ...vertex }, mirror);
          return { x: reflected.x, y: reflected.y };
        }),
      };
    default:
      throw new GeometryValidationError(`Reflection over line is unsupported for evaluated type '${value.type}'`);
  }
}

function reflectValueOverPoint(value: EvaluatedValue, center: PointValue): EvaluatedValue {
  switch (value.type) {
    case "point":
      return reflectPointOverPoint(value, center);
    case "line": {
      const [first, second] = samplePointsFromLine(value);
      return lineThroughPoints(reflectPointOverPoint(first, center), reflectPointOverPoint(second, center));
    }
    case "segment": {
      const start = reflectPointOverPoint({ type: "point", ...value.start }, center);
      const end = reflectPointOverPoint({ type: "point", ...value.end }, center);
      return { type: "segment", start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
    }
    case "circle": {
      const reflectedCenter = reflectPointOverPoint({ type: "point", ...value.center }, center);
      return { type: "circle", center: { x: reflectedCenter.x, y: reflectedCenter.y }, radius: value.radius };
    }
    case "polygon":
      return {
        type: "polygon",
        vertices: value.vertices.map((vertex) => {
          const reflected = reflectPointOverPoint({ type: "point", ...vertex }, center);
          return { x: reflected.x, y: reflected.y };
        }),
      };
    default:
      throw new GeometryValidationError(`Reflection over point is unsupported for evaluated type '${value.type}'`);
  }
}

function rotatePoint(pt: PointValue, ctr: PointValue, degrees: number): PointValue {
  const theta = (degrees * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const dx = pt.x - ctr.x;
  const dy = pt.y - ctr.y;
  return {
    type: "point",
    x: cleanZero(ctr.x + dx * cos - dy * sin),
    y: cleanZero(ctr.y + dx * sin + dy * cos),
  };
}

function translateValue(value: EvaluatedValue, dx: number, dy: number): EvaluatedValue {
  switch (value.type) {
    case "point":
      return { type: "point", x: cleanZero(value.x + dx), y: cleanZero(value.y + dy) };
    case "line": {
      const [first, second] = samplePointsFromLine(value);
      return lineThroughPoints(
        { type: "point", x: cleanZero(first.x + dx), y: cleanZero(first.y + dy) },
        { type: "point", x: cleanZero(second.x + dx), y: cleanZero(second.y + dy) },
      );
    }
    case "segment":
      return {
        type: "segment",
        start: { x: cleanZero(value.start.x + dx), y: cleanZero(value.start.y + dy) },
        end: { x: cleanZero(value.end.x + dx), y: cleanZero(value.end.y + dy) },
      };
    case "circle":
      return {
        type: "circle",
        center: { x: cleanZero(value.center.x + dx), y: cleanZero(value.center.y + dy) },
        radius: value.radius,
      };
    case "polygon":
      return {
        type: "polygon",
        vertices: value.vertices.map((vertex) => ({
          x: cleanZero(vertex.x + dx),
          y: cleanZero(vertex.y + dy),
        })),
      };
    default:
      throw new GeometryValidationError(`Translation is unsupported for evaluated type '${value.type}'`);
  }
}

function rotateValue(value: EvaluatedValue, center: PointValue, degrees: number): EvaluatedValue {
  switch (value.type) {
    case "point":
      return rotatePoint(value, center, degrees);
    case "line": {
      const [first, second] = samplePointsFromLine(value);
      return lineThroughPoints(rotatePoint(first, center, degrees), rotatePoint(second, center, degrees));
    }
    case "segment": {
      const start = rotatePoint({ type: "point", ...value.start }, center, degrees);
      const end = rotatePoint({ type: "point", ...value.end }, center, degrees);
      return { type: "segment", start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
    }
    case "circle": {
      const rotatedCenter = rotatePoint({ type: "point", ...value.center }, center, degrees);
      return { type: "circle", center: { x: rotatedCenter.x, y: rotatedCenter.y }, radius: value.radius };
    }
    case "polygon":
      return {
        type: "polygon",
        vertices: value.vertices.map((vertex) => {
          const rotated = rotatePoint({ type: "point", ...vertex }, center, degrees);
          return { x: rotated.x, y: rotated.y };
        }),
      };
    default:
      throw new GeometryValidationError(`Rotation is unsupported for evaluated type '${value.type}'`);
  }
}

function scalePoint(point: PointValue, center: PointValue, ratio: number): PointValue {
  return {
    type: "point",
    x: cleanZero(center.x + ratio * (point.x - center.x)),
    y: cleanZero(center.y + ratio * (point.y - center.y)),
  };
}

function scaleValue(value: EvaluatedValue, center: PointValue, ratio: number): EvaluatedValue {
  switch (value.type) {
    case "point":
      return scalePoint(value, center, ratio);
    case "line": {
      const [first, second] = samplePointsFromLine(value);
      return lineThroughPoints(scalePoint(first, center, ratio), scalePoint(second, center, ratio));
    }
    case "segment": {
      const start = scalePoint({ type: "point", ...value.start }, center, ratio);
      const end = scalePoint({ type: "point", ...value.end }, center, ratio);
      return { type: "segment", start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
    }
    case "circle": {
      const scaledCenter = scalePoint({ type: "point", ...value.center }, center, ratio);
      return { type: "circle", center: { x: scaledCenter.x, y: scaledCenter.y }, radius: Math.abs(ratio) * value.radius };
    }
    case "polygon":
      return {
        type: "polygon",
        vertices: value.vertices.map((vertex) => {
          const scaled = scalePoint({ type: "point", ...vertex }, center, ratio);
          return { x: scaled.x, y: scaled.y };
        }),
      };
    default:
      throw new GeometryValidationError(`Homothety is unsupported for evaluated type '${value.type}'`);
  }
}

export function referencePointForRatio(value: EvaluatedValue, center: PointValue): PointValue {
  switch (value.type) {
    case "point":
      return value;
    case "line": {
      const d = value.a * center.x + value.b * center.y + value.c;
      return { type: "point", x: cleanZero(center.x - value.a * d), y: cleanZero(center.y - value.b * d) };
    }
    case "segment":
      return {
        type: "point",
        x: cleanZero((value.start.x + value.end.x) / 2),
        y: cleanZero((value.start.y + value.end.y) / 2),
      };
    case "circle":
      return { type: "point", x: value.center.x, y: value.center.y };
    case "polygon": {
      const count = value.vertices.length;
      return {
        type: "point",
        x: cleanZero(value.vertices.reduce((sum, vertex) => sum + vertex.x, 0) / count),
        y: cleanZero(value.vertices.reduce((sum, vertex) => sum + vertex.y, 0) / count),
      };
    }
    default:
      throw new GeometryValidationError(`Homothety is unsupported for evaluated type '${value.type}'`);
  }
}

function asPointValue(value: EvaluatedValue, context: string): PointValue {
  if (value.type !== "point") {
    throw new GeometryValidationError(`Expected '${context}' to evaluate as a point`);
  }
  return value;
}

function asLineValue(value: EvaluatedValue, context: string): LineValue {
  if (value.type !== "line") {
    throw new GeometryValidationError(`Expected '${context}' to evaluate as a line`);
  }
  return value;
}

function invertPoint(point: PointValue, circle: CircleValue): PointValue | UndefinedValue {
  const dx = point.x - circle.center.x;
  const dy = point.y - circle.center.y;
  const d2 = dx * dx + dy * dy;
  if (d2 <= GEOMETRY_EPSILON * GEOMETRY_EPSILON) {
    return { type: "undefined", code: "point_at_center", message: "Inversion is undefined at the center of the circle" };
  }
  const r2 = circle.radius * circle.radius;
  return { type: "point", x: cleanZero(circle.center.x + (r2 * dx) / d2), y: cleanZero(circle.center.y + (r2 * dy) / d2) };
}

function invertLine(line: LineValue, circle: CircleValue, declaredKind: string): EvaluatedValue {
  const signedDistance = line.a * circle.center.x + line.b * circle.center.y + line.c;
  if (Math.abs(signedDistance) <= GEOMETRY_EPSILON) {
    if (declaredKind !== "line") {
      return { type: "undefined", code: "line_through_center", message: "A line through the inversion center maps to itself, not a circle" };
    }
    return { type: "line", a: line.a, b: line.b, c: line.c };
  }
  if (declaredKind !== "circle") {
    return { type: "undefined", code: "not_through_center", message: "Only a line through the inversion center inverts to a line" };
  }
  const foot: PointValue = {
    type: "point",
    x: circle.center.x - line.a * signedDistance,
    y: circle.center.y - line.b * signedDistance,
  };
  const invertedFoot = invertPoint(foot, circle);
  if (isUndefined(invertedFoot)) return invertedFoot;
  const centerX = (circle.center.x + invertedFoot.x) / 2;
  const centerY = (circle.center.y + invertedFoot.y) / 2;
  const radius = Math.hypot(centerX - circle.center.x, centerY - circle.center.y);
  return { type: "circle", center: { x: cleanZero(centerX), y: cleanZero(centerY) }, radius: cleanZero(radius) };
}

function invertCircle(source: CircleValue, circle: CircleValue, declaredKind: string): EvaluatedValue {
  const dx = source.center.x - circle.center.x;
  const dy = source.center.y - circle.center.y;
  const centerDistance = Math.hypot(dx, dy);

  if (centerDistance <= GEOMETRY_EPSILON) {
    if (declaredKind !== "circle") {
      return { type: "undefined", code: "concentric_source", message: "A circle concentric with the inversion circle maps to another concentric circle" };
    }
    return { type: "circle", center: circle.center, radius: cleanZero((circle.radius * circle.radius) / source.radius) };
  }

  if (Math.abs(centerDistance - source.radius) <= GEOMETRY_EPSILON) {
    if (declaredKind !== "line") {
      return { type: "undefined", code: "circle_through_center", message: "A circle through the inversion center maps to a line, not a circle" };
    }
    const sourceCenterPoint: PointValue = { type: "point", x: source.center.x, y: source.center.y };
    const invertedCenter = invertPoint(sourceCenterPoint, circle);
    if (isUndefined(invertedCenter)) return invertedCenter;
    const midX = (circle.center.x + invertedCenter.x) / 2;
    const midY = (circle.center.y + invertedCenter.y) / 2;
    return canonicalLine(dx, dy, -(dx * midX + dy * midY));
  }

  if (declaredKind !== "circle") {
    return { type: "undefined", code: "not_through_center", message: "Only a circle through the inversion center inverts to a line" };
  }
  const centerLineValue = lineThroughPoints(
    { type: "point", x: circle.center.x, y: circle.center.y },
    { type: "point", x: source.center.x, y: source.center.y },
  );
  if (isUndefined(centerLineValue)) return centerLineValue;
  const centerLine = asLineValue(centerLineValue, "inversion center line");
  const firstValue = intersectLineCircle(centerLine, source, 1, undefined);
  if (isUndefined(firstValue)) return firstValue;
  const first = asPointValue(firstValue, "first center-line intersection");
  const secondValue = intersectLineCircle(centerLine, source, 2, undefined);
  if (isUndefined(secondValue)) return secondValue;
  const second = asPointValue(secondValue, "second center-line intersection");
  const invertedFirst = invertPoint(first, circle);
  if (isUndefined(invertedFirst)) return invertedFirst;
  const invertedSecond = invertPoint(second, circle);
  if (isUndefined(invertedSecond)) return invertedSecond;
  // `first`/`second` are diametrically opposite on the source circle (the
  // center-line passes through its center), so their images are
  // diametrically opposite on the result circle too.
  const resultCenterX = (invertedFirst.x + invertedSecond.x) / 2;
  const resultCenterY = (invertedFirst.y + invertedSecond.y) / 2;
  const radius = Math.hypot(resultCenterX - invertedFirst.x, resultCenterY - invertedFirst.y);
  return { type: "circle", center: { x: cleanZero(resultCenterX), y: cleanZero(resultCenterY) }, radius: cleanZero(radius) };
}

function isSamePoint(a: PointValue, b: PointValue): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= GEOMETRY_EPSILON;
}

function pointOnSegment(point: PointValue, start: PointValue, end: PointValue): boolean {
  return (
    point.x >= Math.min(start.x, end.x) - GEOMETRY_EPSILON &&
    point.x <= Math.max(start.x, end.x) + GEOMETRY_EPSILON &&
    point.y >= Math.min(start.y, end.y) - GEOMETRY_EPSILON &&
    point.y <= Math.max(start.y, end.y) + GEOMETRY_EPSILON
  );
}

function invertSegment(segment: SegmentValue, circle: CircleValue, declaredKind: string): EvaluatedValue {
  const start: PointValue = { type: "point", x: segment.start.x, y: segment.start.y };
  const end: PointValue = { type: "point", x: segment.end.x, y: segment.end.y };
  const center: PointValue = { type: "point", x: circle.center.x, y: circle.center.y };
  if (isSamePoint(start, center) || isSamePoint(end, center)) {
    return { type: "undefined", code: "edge_touches_center", message: "Inversion of a segment touching the inversion center is undefined" };
  }
  const invertedStart = invertPoint(start, circle);
  if (isUndefined(invertedStart)) return invertedStart;
  const invertedEnd = invertPoint(end, circle);
  if (isUndefined(invertedEnd)) return invertedEnd;

  const cross = (start.x - center.x) * (end.y - center.y) - (start.y - center.y) * (end.x - center.x);
  if (Math.abs(cross) <= GEOMETRY_EPSILON) {
    if (pointOnSegment(center, start, end)) {
      return { type: "undefined", code: "edge_crosses_center", message: "Inversion of a segment crossing the inversion center is undefined" };
    }
    if (declaredKind !== "segment") {
      return { type: "undefined", code: "collinear_with_center", message: "A segment collinear with the inversion center inverts to a segment, not an arc" };
    }
    return {
      type: "segment",
      start: { x: invertedStart.x, y: invertedStart.y },
      end: { x: invertedEnd.x, y: invertedEnd.y },
    };
  }

  if (declaredKind !== "arc") {
    return { type: "undefined", code: "not_collinear_with_center", message: "Only a segment collinear with the inversion center inverts to a segment" };
  }
  const midpoint: PointValue = { type: "point", x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const invertedMid = invertPoint(midpoint, circle);
  if (isUndefined(invertedMid)) return invertedMid;
  const circumscribed = circleFromThreePoints(invertedStart, invertedMid, invertedEnd);
  if (isUndefined(circumscribed)) return circumscribed;
  return {
    type: "arc",
    center: circumscribed.center,
    radius: circumscribed.radius,
    start: { x: invertedStart.x, y: invertedStart.y },
    mid: { x: invertedMid.x, y: invertedMid.y },
    end: { x: invertedEnd.x, y: invertedEnd.y },
  };
}

function invertValue(source: EvaluatedValue, circle: CircleValue, declaredKind: string): EvaluatedValue {
  switch (source.type) {
    case "point":
      return invertPoint(source, circle);
    case "line":
      return invertLine(source, circle, declaredKind);
    case "circle":
      return invertCircle(source, circle, declaredKind);
    case "segment":
      return invertSegment(source, circle, declaredKind);
    default:
      return { type: "undefined", code: "not_invertible", message: `Cannot invert a value of type '${source.type}'` };
  }
}

export function inferInversionResultKind(sourceValue: EvaluatedValue, circleValue: CircleValue): string | undefined {
  switch (sourceValue.type) {
    case "point":
      return "point";
    case "line": {
      const signedDistance = sourceValue.a * circleValue.center.x + sourceValue.b * circleValue.center.y + sourceValue.c;
      return Math.abs(signedDistance) <= GEOMETRY_EPSILON ? "line" : "circle";
    }
    case "circle": {
      const dx = sourceValue.center.x - circleValue.center.x;
      const dy = sourceValue.center.y - circleValue.center.y;
      const centerDistance = Math.hypot(dx, dy);
      return Math.abs(centerDistance - sourceValue.radius) <= GEOMETRY_EPSILON ? "line" : "circle";
    }
    case "segment": {
      const cx = circleValue.center.x;
      const cy = circleValue.center.y;
      const cross = (sourceValue.start.x - cx) * (sourceValue.end.y - cy) - (sourceValue.start.y - cy) * (sourceValue.end.x - cx);
      return Math.abs(cross) <= GEOMETRY_EPSILON ? "segment" : "arc";
    }
    default:
      return undefined;
  }
}

function intersectLineCircle(
  ln: LineValue,
  cr: CircleValue,
  index?: 1 | 2 | null,
  selector?: "first" | "second" | "left" | "right" | null,
): EvaluatedValue {
  // ln is normalized (a²+b²=1). signed distance from center to line:
  const dSigned = ln.a * cr.center.x + ln.b * cr.center.y + ln.c;
  const d2 = dSigned * dSigned;
  const r2 = cr.radius * cr.radius;
  const h2 = r2 - d2;
  if (h2 < -GEOMETRY_EPSILON) {
    return { type: "undefined", code: "no_intersection", message: "Line and circle do not intersect" };
  }
  const h = Math.sqrt(Math.max(0, h2));
  const fx = cr.center.x - ln.a * dSigned;
  const fy = cr.center.y - ln.b * dSigned;
  // Two candidate points: foot ± h * tangent direction (-b, a)
  const p1 = { x: fx - ln.b * h, y: fy + ln.a * h };
  const p2 = { x: fx + ln.b * h, y: fy - ln.a * h };
  const pt = selectIntersection(p1, p2, index, selector);
  if ("type" in pt) return pt;
  return { type: "point", x: cleanZero(pt.x), y: cleanZero(pt.y) };
}

function intersectCircleCircle(
  cA: CircleValue,
  cB: CircleValue,
  index?: 1 | 2 | null,
  selector?: "upper" | "lower" | "left" | "right" | null,
): EvaluatedValue {
  const dx = cB.center.x - cA.center.x;
  const dy = cB.center.y - cA.center.y;
  const d = Math.hypot(dx, dy);
  if (d <= GEOMETRY_EPSILON) {
    return { type: "undefined", code: "concentric_circles", message: "Circles are concentric" };
  }
  if (d > cA.radius + cB.radius + GEOMETRY_EPSILON || d < Math.abs(cA.radius - cB.radius) - GEOMETRY_EPSILON) {
    return { type: "undefined", code: "no_intersection", message: "Circles do not intersect" };
  }
  const a = (cA.radius * cA.radius - cB.radius * cB.radius + d * d) / (2 * d);
  const h2 = cA.radius * cA.radius - a * a;
  const h = Math.sqrt(Math.max(0, h2));
  const ex = dx / d;
  const ey = dy / d;
  const fx = cA.center.x + a * ex;
  const fy = cA.center.y + a * ey;
  const p1 = { x: fx - h * ey, y: fy + h * ex };
  const p2 = { x: fx + h * ey, y: fy - h * ex };
  const pt = selectIntersection(p1, p2, index, selector);
  if ("type" in pt) return pt;
  return { type: "point", x: cleanZero(pt.x), y: cleanZero(pt.y) };
}

function perpendicularBisector(a: PointValue, b: PointValue): EvaluatedValue {
  const da = b.x - a.x;
  const db = b.y - a.y;
  if (Math.hypot(da, db) <= GEOMETRY_EPSILON) {
    return { type: "undefined", code: "coincident_points", message: "Perpendicular bisector requires two distinct points" };
  }
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // Normal direction = AB direction; line passes through midpoint
  return canonicalLine(da, db, -(da * mx + db * my));
}

function angleBisector(armA: PointValue, vertex: PointValue, armB: PointValue): EvaluatedValue {
  const dax = armA.x - vertex.x;
  const day = armA.y - vertex.y;
  const dbx = armB.x - vertex.x;
  const dby = armB.y - vertex.y;
  const na = Math.hypot(dax, day);
  const nb = Math.hypot(dbx, dby);
  if (na <= GEOMETRY_EPSILON || nb <= GEOMETRY_EPSILON) {
    return { type: "undefined", code: "coincident_points", message: "Angle bisector requires distinct arm endpoints" };
  }
  let dirX = dax / na + dbx / nb;
  let dirY = day / na + dby / nb;
  if (Math.hypot(dirX, dirY) <= GEOMETRY_EPSILON) {
    // Supplementary angle: bisector is perpendicular to arms
    dirX = -day / na;
    dirY = dax / na;
  }
  // Line through vertex with direction (dirX, dirY): normal = (-dirY, dirX)
  return canonicalLine(-dirY, dirX, dirY * vertex.x - dirX * vertex.y);
}

function circumscribedCircle(a: PointValue, b: PointValue, c: PointValue): EvaluatedValue {
  return circleFromThreePoints(a, b, c);
}

function circleFromThreePoints(
  a: PointValue,
  b: PointValue,
  c: PointValue,
): CircleValue | UndefinedValue {
  // Intersect perpendicular bisectors of AB and BC
  const a1 = b.x - a.x;
  const b1 = b.y - a.y;
  const c1 = -(a1 * (a.x + b.x) / 2 + b1 * (a.y + b.y) / 2);
  const a2 = c.x - b.x;
  const b2 = c.y - b.y;
  const c2 = -(a2 * (b.x + c.x) / 2 + b2 * (b.y + c.y) / 2);
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) <= GEOMETRY_EPSILON) {
    return { type: "undefined", code: "collinear_points", message: "Circumscribed circle requires three non-collinear points" };
  }
  const cx = (b1 * c2 - b2 * c1) / det;
  const cy = (a2 * c1 - a1 * c2) / det;
  return {
    type: "circle",
    center: { x: cleanZero(cx), y: cleanZero(cy) },
    radius: cleanZero(Math.hypot(a.x - cx, a.y - cy)),
  };
}

/** Sort two points: index 0 = higher y, tie → smaller x (canonical for two intersection solutions). */
function sortedPair(
  p: { x: number; y: number },
  q: { x: number; y: number },
): [{ x: number; y: number }, { x: number; y: number }] {
  const pFirst =
    p.y > q.y + GEOMETRY_EPSILON ||
    (Math.abs(p.y - q.y) <= GEOMETRY_EPSILON && p.x <= q.x);
  return pFirst ? [p, q] : [q, p];
}

function selectIntersection(
  p: { x: number; y: number },
  q: { x: number; y: number },
  index?: 1 | 2 | null,
  selector?: string | null,
): { x: number; y: number } | Extract<EvaluatedValue, { type: "undefined" }> {
  if (Math.hypot(p.x - q.x, p.y - q.y) <= GEOMETRY_EPSILON) return p;
  const [first, second] = sortedPair(p, q);
  if (index != null) return index === 1 ? first : second;
  if (selector === "first") return first;
  if (selector === "second") return second;
  if (selector === "upper" || selector === "lower") {
    if (Math.abs(p.y - q.y) <= GEOMETRY_EPSILON) {
      return { type: "undefined", code: "ambiguous_selector", message: `Selector '${selector}' cannot distinguish intersections with equal y` };
    }
    return selector === "upper" ? (p.y > q.y ? p : q) : (p.y < q.y ? p : q);
  }
  if (selector === "left" || selector === "right") {
    if (Math.abs(p.x - q.x) <= GEOMETRY_EPSILON) {
      return { type: "undefined", code: "ambiguous_selector", message: `Selector '${selector}' cannot distinguish intersections with equal x` };
    }
    return selector === "left" ? (p.x < q.x ? p : q) : (p.x > q.x ? p : q);
  }
  return { type: "undefined", code: "invalid_selector", message: "Intersection selector is invalid" };
}

function cleanZero(value: number): number {
  return Math.abs(value) <= GEOMETRY_EPSILON ? 0 : value;
}

/**
 * Compute vertices of a regular n-gon whose first edge is A→B.
 * Vertices are generated counter-clockwise (exterior angle 2π/n),
 * matching the Python backend and GeoGebra's convention.
 */
function regularPolygonVertices(pA: PointValue, pB: PointValue, n: number): EvaluatedValue {
  if (n < 3) {
    return { type: "undefined", code: "invalid_sides", message: "Regular polygon requires at least 3 sides" };
  }
  const angle = (2 * Math.PI) / n;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  let vx = pB.x - pA.x;
  let vy = pB.y - pA.y;
  const vertices: { x: number; y: number }[] = [{ x: pA.x, y: pA.y }, { x: pB.x, y: pB.y }];
  let curX = pB.x;
  let curY = pB.y;
  for (let i = 0; i < n - 2; i++) {
    const newVx = vx * cosA - vy * sinA;
    const newVy = vx * sinA + vy * cosA;
    vx = newVx;
    vy = newVy;
    curX = cleanZero(curX + vx);
    curY = cleanZero(curY + vy);
    vertices.push({ x: curX, y: curY });
  }
  return { type: "polygon", vertices };
}

function isUndefined<T>(value: T | EvaluatedValue): value is Extract<EvaluatedValue, { type: "undefined" }> {
  return typeof value === "object" && value !== null && "type" in value && value.type === "undefined";
}

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new GeometryValidationError(`${field} must be a finite number`);
  }
}

function isFreePoint(object: GeometryObject): object is Point {
  return object.kind === "point" && object.definition.type === "free";
}

function cloneGeometryDocument(document: GeometryDocument): GeometryDocument {
  return structuredClone(document);
}
