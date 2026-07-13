import type { EvaluatedValue, EvaluationMap, GeometryObject, LineValue, PointValue, PolygonValue } from "../../types/geometry";
import { GEOMETRY_EPSILON, isUndefined, requirePointValues, requireValue } from "./shared";

/**
 * Handles the "measures" family of definitions (Task 2): distance, angle,
 * area, slope. Only ever called by `GeometryGraph.evaluateObject` for
 * objects whose `definition.type` is one of these; the `default` branch is
 * unreachable in practice.
 */
export function evaluateMeasureFamily(object: GeometryObject, values: EvaluationMap): EvaluatedValue {
  const def = object.definition;
  switch (def.type) {
    case "distance": {
      const pts = requirePointValues(values, object.id, [def.pointA, def.pointB]);
      if (isUndefined(pts)) return pts;
      return { type: "scalar", value: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) };
    }

    case "angle": {
      const pA = requireValue<PointValue>(values, object.id, def.pointA, "point");
      if (isUndefined(pA)) return pA;
      const vertex = requireValue<PointValue>(values, object.id, def.vertex, "point");
      if (isUndefined(vertex)) return vertex;
      const pB = requireValue<PointValue>(values, object.id, def.pointB, "point");
      if (isUndefined(pB)) return pB;
      return angleMeasure(pA, vertex, pB);
    }

    case "area": {
      const polygon = requireValue<PolygonValue>(values, object.id, def.polygon, "polygon");
      if (isUndefined(polygon)) return polygon;
      return { type: "scalar", value: polygonArea(polygon) };
    }

    case "slope": {
      const line = requireValue<LineValue>(values, object.id, def.line, "line");
      if (isUndefined(line)) return line;
      if (Math.abs(line.b) <= GEOMETRY_EPSILON) {
        return {
          type: "undefined",
          code: "vertical_line",
          message: `Slope '${object.id}' is undefined for a vertical line`,
        };
      }
      return { type: "scalar", value: -line.a / line.b };
    }

    default:
      throw new Error(`evaluateMeasureFamily called with unsupported definition type '${def.type}'`);
  }
}

/**
 * Unsigned angle at `vertex` between rays to `pointA` and `pointB`, in degrees, range [0, 180].
 * Uses atan2(|cross|, dot) of the two arm vectors, which is numerically stable
 * near 0 and 180 degrees and always non-negative (no directional/signed angle).
 */
function angleMeasure(pointA: PointValue, vertex: PointValue, pointB: PointValue): EvaluatedValue {
  const vax = pointA.x - vertex.x;
  const vay = pointA.y - vertex.y;
  const vbx = pointB.x - vertex.x;
  const vby = pointB.y - vertex.y;
  if (Math.hypot(vax, vay) <= GEOMETRY_EPSILON || Math.hypot(vbx, vby) <= GEOMETRY_EPSILON) {
    return { type: "undefined", code: "coincident_points", message: "Angle requires distinct vertex and arm points" };
  }
  const cross = vax * vby - vay * vbx;
  const dot = vax * vbx + vay * vby;
  const angleRad = Math.atan2(Math.abs(cross), dot);
  return { type: "scalar", value: (angleRad * 180) / Math.PI };
}

/** Shoelace formula; always non-negative regardless of vertex winding order. */
function polygonArea(polygon: PolygonValue): number {
  const vertices = polygon.vertices;
  const n = vertices.length;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    total += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  return Math.abs(total) / 2;
}
