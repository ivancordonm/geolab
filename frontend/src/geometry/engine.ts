import type {
  EvaluatedValue,
  EvaluationMap,
  GeometryDocument,
  GeometryObject,
  GeometryObjectId,
  Point,
} from "../types/geometry";
import { normalizeFunctionExpression } from "./functionExpression";
import { GEOMETRY_EPSILON, GeometryValidationError } from "./evaluators/shared";
import { evaluatePointFamily } from "./evaluators/points";
import { evaluateLineFamily } from "./evaluators/lines";
import { evaluateCircleFamily } from "./evaluators/circles";
import { evaluateTransformationFamily } from "./evaluators/transformations";
import { evaluatePolygonFamily } from "./evaluators/polygons";
import { evaluateMeasureFamily } from "./evaluators/measures";

// Re-exported so existing frontend imports of `GEOMETRY_EPSILON` and
// `GeometryValidationError` from "./engine" keep working unchanged.
export { GEOMETRY_EPSILON, GeometryValidationError };

export interface RecomputeResult {
  document: GeometryDocument;
  values: EvaluationMap;
  recomputedObjectIds: GeometryObjectId[];
}

export function getParentIds(object: GeometryObject): GeometryObjectId[] {
  switch (object.definition.type) {
    case "free":
    case "slider":
      return [];
    case "polygon_vertex":
      return [object.definition.polygon];
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
    case "angle_bisector":
      return [object.definition.armA, object.definition.vertex, object.definition.armB];
    case "circumscribed":
      return [object.definition.pointA, object.definition.pointB, object.definition.pointC];
    case "reflection_over_line":
      return [object.definition.object ?? object.definition.point!, object.definition.line];
    case "reflection_over_point":
      return [object.definition.object ?? object.definition.point!, object.definition.center];
    case "homothety_scalar":
      return [object.definition.center, object.definition.point];
    case "homothety_point":
      return [object.definition.center, object.definition.point, object.definition.ratioPoint];
    case "inversion_in_circle":
      return [object.definition.point, object.definition.circle];
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
    // ─── Measures ─────────────────────────────────────────────────────────
    case "distance":
      return [object.definition.pointA, object.definition.pointB];
    case "angle":
      return [object.definition.pointA, object.definition.vertex, object.definition.pointB];
    case "area":
      return [object.definition.polygon];
    case "slope":
      return [object.definition.line];
  }
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
          throw new GeometryValidationError(
            `Object '${object.id}' requires parent '${def.radius}' to produce a scalar value`,
          );
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
        requireKind(def.center, "point");
        requireKind(def.point, "point");
        assertFiniteNumber(def.ratio, `${object.id}.ratio`);
        return;
      case "homothety_point":
        requireKind(def.center, "point");
        requireKind(def.point, "point");
        requireKind(def.ratioPoint, "point");
        return;
      case "inversion_in_circle":
        requireKind(def.point, "point");
        requireKind(def.circle, "circle");
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
        return;
      // ─── Measures ───────────────────────────────────────────────────────
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

  /**
   * Slim dispatcher delegating to the per-family evaluator functions in
   * `./evaluators/*`. Each family function reads `this.evaluatedValues`
   * (passed explicitly, since those functions are plain, class-free
   * functions) instead of reaching back into `this`.
   */
  private evaluateObject(object: GeometryObject): EvaluatedValue {
    switch (object.definition.type) {
      // ─── Points (free, slider, polygon vertex, midpoint) ────────────────
      case "free":
      case "slider":
      case "polygon_vertex":
      case "midpoint":
        return evaluatePointFamily(object, this.evaluatedValues);

      // ─── Lines, segments, intersections of lines ────────────────────────
      case "through_points":
      case "between_points":
      case "parallel_through":
      case "perpendicular_through":
      case "intersection_ll":
      case "perpendicular_bisector":
      case "angle_bisector":
        return evaluateLineFamily(object, this.evaluatedValues);

      // ─── Circles and their intersections ────────────────────────────────
      case "center_radius":
      case "center_through_point":
      case "intersection_lc":
      case "intersection_cc":
      case "circumscribed":
        return evaluateCircleFamily(object, this.evaluatedValues);

      // ─── Transformations ─────────────────────────────────────────────────
      case "reflection_over_line":
      case "reflection_over_point":
      case "homothety_scalar":
      case "homothety_point":
      case "inversion_in_circle":
      case "translation":
      case "rotation":
        return evaluateTransformationFamily(object, this.evaluatedValues);

      // ─── Polygons, arcs, functions ───────────────────────────────────────
      case "arc_through_points":
      case "function_expression":
      case "polygon":
      case "regular_polygon":
      case "vector_polygon":
        return evaluatePolygonFamily(object, this.evaluatedValues);

      // ─── Measures ────────────────────────────────────────────────────────
      case "distance":
      case "angle":
      case "area":
      case "slope":
        return evaluateMeasureFamily(object, this.evaluatedValues);
    }
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
