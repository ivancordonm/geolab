import type {
  CircleValue,
  EvaluatedValue,
  EvaluationMap,
  GeometryObject,
  LineValue,
  PointValue,
  ScalarValue,
  UndefinedValue,
} from "../../types/geometry";
import { GEOMETRY_EPSILON, cleanZero, isUndefined, requirePointValues, requireValue } from "./shared";

/**
 * Handles the "circles, intersections" family of definitions: center_radius,
 * center_through_point, circumscribed, intersection_lc, intersection_cc.
 * Only ever called by `GeometryGraph.evaluateObject` for objects whose
 * `definition.type` is one of these; the `default` branch is unreachable in
 * practice.
 */
export function evaluateCircleFamily(object: GeometryObject, values: EvaluationMap): EvaluatedValue {
  const def = object.definition;
  switch (def.type) {
    case "center_radius": {
      const center = requireValue<PointValue>(values, object.id, def.center, "point");
      if (isUndefined(center)) return center;
      const radius = requireValue<ScalarValue>(values, object.id, def.radius, "scalar");
      if (isUndefined(radius)) return radius;
      if (radius.value < 0) {
        return { type: "undefined", code: "negative_radius", message: `Circle '${object.id}' radius must be non-negative` };
      }
      return { type: "circle", center: { x: center.x, y: center.y }, radius: radius.value };
    }

    case "center_through_point": {
      const pts = requirePointValues(values, object.id, [def.center, def.point]);
      if (isUndefined(pts)) return pts;
      return {
        type: "circle",
        center: { x: pts[0].x, y: pts[0].y },
        radius: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
      };
    }

    case "intersection_lc": {
      const ln = requireValue<LineValue>(values, object.id, def.line, "line");
      if (isUndefined(ln)) return ln;
      const cr = requireValue<CircleValue>(values, object.id, def.circle, "circle");
      if (isUndefined(cr)) return cr;
      return intersectLineCircle(ln, cr, def.index, def.selector);
    }

    case "intersection_cc": {
      const cA = requireValue<CircleValue>(values, object.id, def.circleA, "circle");
      if (isUndefined(cA)) return cA;
      const cB = requireValue<CircleValue>(values, object.id, def.circleB, "circle");
      if (isUndefined(cB)) return cB;
      return intersectCircleCircle(cA, cB, def.index, def.selector);
    }

    case "circumscribed": {
      const pA = requireValue<PointValue>(values, object.id, def.pointA, "point");
      if (isUndefined(pA)) return pA;
      const pB = requireValue<PointValue>(values, object.id, def.pointB, "point");
      if (isUndefined(pB)) return pB;
      const pC = requireValue<PointValue>(values, object.id, def.pointC, "point");
      if (isUndefined(pC)) return pC;
      return circumscribedCircle(pA, pB, pC);
    }

    default:
      throw new Error(`evaluateCircleFamily called with unsupported definition type '${def.type}'`);
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

function circumscribedCircle(a: PointValue, b: PointValue, c: PointValue): EvaluatedValue {
  return circleFromThreePoints(a, b, c);
}

/** Also used by evaluators/polygons.ts for arc_through_points. */
export function circleFromThreePoints(
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
