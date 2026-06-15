import type {
  CircleValue,
  EvaluatedValue,
  EvaluationMap,
  GeometryDocument,
  GeometryObject,
  GeometryObjectId,
  LineValue,
  Point,
  PointValue,
  UndefinedValue,
} from "../types/geometry";

export const GEOMETRY_EPSILON = 1e-9;

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
    case "through_points":
    case "between_points":
    case "midpoint":
    case "perpendicular_bisector":
      return [object.definition.pointA, object.definition.pointB];
    case "center_through_point":
      return [object.definition.center, object.definition.point];
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
      return [object.definition.point, object.definition.line];
    case "reflection_over_point":
      return [object.definition.point, object.definition.center];
    case "homothety_scalar":
      return [object.definition.center, object.definition.point];
    case "homothety_point":
      return [object.definition.center, object.definition.point, object.definition.ratioPoint];
    case "inversion_in_circle":
      return [object.definition.point, object.definition.circle];
    case "translation":
      return [object.definition.point, object.definition.from, object.definition.to];
    case "rotation":
      return [object.definition.point, object.definition.center];
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
        return;
      case "intersection_cc":
        requireKind(def.circleA, "circle");
        requireKind(def.circleB, "circle");
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
        requireKind(def.point, "point");
        requireKind(def.line, "line");
        return;
      case "reflection_over_point":
        requireKind(def.point, "point");
        requireKind(def.center, "point");
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
        requireKind(def.point, "point");
        requireKind(def.from, "point");
        requireKind(def.to, "point");
        return;
      case "rotation":
        requireKind(def.point, "point");
        requireKind(def.center, "point");
        assertFiniteNumber(def.degrees, `${object.id}.degrees`);
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

  // eslint-disable-next-line complexity
  private evaluateObject(object: GeometryObject): EvaluatedValue {
    const def = object.definition;
    switch (def.type) {
      case "free":
        return { type: "point", x: def.x, y: def.y };

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
        return intersectLineCircle(ln, cr, def.index);
      }

      case "intersection_cc": {
        const cA = this.requireValue<CircleValue>(object.id, def.circleA, "circle");
        if (isUndefined(cA)) return cA;
        const cB = this.requireValue<CircleValue>(object.id, def.circleB, "circle");
        if (isUndefined(cB)) return cB;
        return intersectCircleCircle(cA, cB, def.index);
      }

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
        const pt = this.requireValue<PointValue>(object.id, def.point, "point");
        if (isUndefined(pt)) return pt;
        const ln = this.requireValue<LineValue>(object.id, def.line, "line");
        if (isUndefined(ln)) return ln;
        const d = ln.a * pt.x + ln.b * pt.y + ln.c;
        return { type: "point", x: cleanZero(pt.x - 2 * ln.a * d), y: cleanZero(pt.y - 2 * ln.b * d) };
      }

      case "reflection_over_point": {
        const pt = this.requireValue<PointValue>(object.id, def.point, "point");
        if (isUndefined(pt)) return pt;
        const ctr = this.requireValue<PointValue>(object.id, def.center, "point");
        if (isUndefined(ctr)) return ctr;
        return { type: "point", x: cleanZero(2 * ctr.x - pt.x), y: cleanZero(2 * ctr.y - pt.y) };
      }

      case "homothety_scalar": {
        const ctr = this.requireValue<PointValue>(object.id, def.center, "point");
        if (isUndefined(ctr)) return ctr;
        const pt = this.requireValue<PointValue>(object.id, def.point, "point");
        if (isUndefined(pt)) return pt;
        const k = def.ratio;
        return {
          type: "point",
          x: cleanZero(ctr.x + k * (pt.x - ctr.x)),
          y: cleanZero(ctr.y + k * (pt.y - ctr.y)),
        };
      }

      case "homothety_point": {
        const ctr = this.requireValue<PointValue>(object.id, def.center, "point");
        if (isUndefined(ctr)) return ctr;
        const pt = this.requireValue<PointValue>(object.id, def.point, "point");
        if (isUndefined(pt)) return pt;
        const rp = this.requireValue<PointValue>(object.id, def.ratioPoint, "point");
        if (isUndefined(rp)) return rp;
        const dop = Math.hypot(pt.x - ctr.x, pt.y - ctr.y);
        const dor = Math.hypot(rp.x - ctr.x, rp.y - ctr.y);
        if (dop <= GEOMETRY_EPSILON) {
          return { type: "undefined", code: "coincident_points", message: "Center and source point coincide" };
        }
        const k = dor / dop;
        return {
          type: "point",
          x: cleanZero(ctr.x + k * (pt.x - ctr.x)),
          y: cleanZero(ctr.y + k * (pt.y - ctr.y)),
        };
      }

      case "inversion_in_circle": {
        const pt = this.requireValue<PointValue>(object.id, def.point, "point");
        if (isUndefined(pt)) return pt;
        const cr = this.requireValue<CircleValue>(object.id, def.circle, "circle");
        if (isUndefined(cr)) return cr;
        const dx = pt.x - cr.center.x;
        const dy = pt.y - cr.center.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= GEOMETRY_EPSILON * GEOMETRY_EPSILON) {
          return { type: "undefined", code: "point_at_center", message: "Inversion is undefined at the center of the circle" };
        }
        const r2 = cr.radius * cr.radius;
        return {
          type: "point",
          x: cleanZero(cr.center.x + r2 * dx / d2),
          y: cleanZero(cr.center.y + r2 * dy / d2),
        };
      }

      case "translation": {
        const pt = this.requireValue<PointValue>(object.id, def.point, "point");
        if (isUndefined(pt)) return pt;
        const from = this.requireValue<PointValue>(object.id, def.from, "point");
        if (isUndefined(from)) return from;
        const to = this.requireValue<PointValue>(object.id, def.to, "point");
        if (isUndefined(to)) return to;
        return {
          type: "point",
          x: cleanZero(pt.x + to.x - from.x),
          y: cleanZero(pt.y + to.y - from.y),
        };
      }

      case "rotation": {
        const pt = this.requireValue<PointValue>(object.id, def.point, "point");
        if (isUndefined(pt)) return pt;
        const ctr = this.requireValue<PointValue>(object.id, def.center, "point");
        if (isUndefined(ctr)) return ctr;
        const theta = (def.degrees * Math.PI) / 180;
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
    }
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

function intersectLineCircle(ln: LineValue, cr: CircleValue, index: 1 | 2): EvaluatedValue {
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
  const [hi, lo] = sortedPair(p1, p2);
  const pt = index === 1 ? hi : lo;
  return { type: "point", x: cleanZero(pt.x), y: cleanZero(pt.y) };
}

function intersectCircleCircle(cA: CircleValue, cB: CircleValue, index: 1 | 2): EvaluatedValue {
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
  const [hi, lo] = sortedPair(p1, p2);
  const pt = index === 1 ? hi : lo;
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

function cleanZero(value: number): number {
  return Math.abs(value) <= GEOMETRY_EPSILON ? 0 : value;
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
