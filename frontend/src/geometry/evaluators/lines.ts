import type { EvaluatedValue, EvaluationMap, GeometryObject, LineValue, PointValue } from "../../types/geometry";
import { GEOMETRY_EPSILON, cleanZero, isUndefined, requirePointValues, requireValue } from "./shared";

/**
 * Handles the "lines, segments, intersections" family of definitions:
 * through_points, between_points, parallel_through, perpendicular_through,
 * intersection_ll, perpendicular_bisector, angle_bisector. Only ever called
 * by `GeometryGraph.evaluateObject` for objects whose `definition.type` is
 * one of these; the `default` branch is unreachable in practice.
 */
export function evaluateLineFamily(object: GeometryObject, values: EvaluationMap): EvaluatedValue {
  const def = object.definition;
  switch (def.type) {
    case "through_points": {
      const pts = requirePointValues(values, object.id, [def.pointA, def.pointB]);
      return isUndefined(pts) ? pts : lineThroughPoints(pts[0], pts[1]);
    }

    case "between_points": {
      const pts = requirePointValues(values, object.id, [def.pointA, def.pointB]);
      return isUndefined(pts)
        ? pts
        : { type: "segment", start: { x: pts[0].x, y: pts[0].y }, end: { x: pts[1].x, y: pts[1].y } };
    }

    case "parallel_through": {
      const pt = requireValue<PointValue>(values, object.id, def.point, "point");
      if (isUndefined(pt)) return pt;
      const ln = requireValue<LineValue>(values, object.id, def.line, "line");
      return isUndefined(ln) ? ln : canonicalLine(ln.a, ln.b, -(ln.a * pt.x + ln.b * pt.y));
    }

    case "perpendicular_through": {
      const pt = requireValue<PointValue>(values, object.id, def.point, "point");
      if (isUndefined(pt)) return pt;
      const ln = requireValue<LineValue>(values, object.id, def.line, "line");
      return isUndefined(ln) ? ln : canonicalLine(-ln.b, ln.a, ln.b * pt.x - ln.a * pt.y);
    }

    case "intersection_ll": {
      const lA = requireValue<LineValue>(values, object.id, def.lineA, "line");
      if (isUndefined(lA)) return lA;
      const lB = requireValue<LineValue>(values, object.id, def.lineB, "line");
      if (isUndefined(lB)) return lB;
      return intersectLines(lA, lB);
    }

    case "perpendicular_bisector": {
      const pts = requirePointValues(values, object.id, [def.pointA, def.pointB]);
      if (isUndefined(pts)) return pts;
      return perpendicularBisector(pts[0], pts[1]);
    }

    case "angle_bisector": {
      const armA = requireValue<PointValue>(values, object.id, def.armA, "point");
      if (isUndefined(armA)) return armA;
      const vertex = requireValue<PointValue>(values, object.id, def.vertex, "point");
      if (isUndefined(vertex)) return vertex;
      const armB = requireValue<PointValue>(values, object.id, def.armB, "point");
      if (isUndefined(armB)) return armB;
      return angleBisector(armA, vertex, armB);
    }

    default:
      throw new Error(`evaluateLineFamily called with unsupported definition type '${def.type}'`);
  }
}

export function lineThroughPoints(first: PointValue, second: PointValue): EvaluatedValue {
  const a = first.y - second.y;
  const b = second.x - first.x;
  const c = first.x * second.y - second.x * first.y;
  if (Math.hypot(a, b) <= GEOMETRY_EPSILON) {
    return { type: "undefined", code: "coincident_points", message: "A line requires two distinct points" };
  }
  return canonicalLine(a, b, c);
}

export function canonicalLine(a: number, b: number, c: number): LineValue {
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
