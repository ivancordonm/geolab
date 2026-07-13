import type {
  EvaluatedValue,
  EvaluationMap,
  FunctionValue,
  GeometryObject,
  PointValue,
  PolygonValue,
} from "../../types/geometry";
import { cleanZero, isUndefined, requireValue } from "./shared";
import { normalizeFunctionExpression } from "../functionExpression";
import { circleFromThreePoints } from "./circles";

/**
 * Handles the "polygons, arcs, functions" family of definitions: polygon,
 * regular_polygon, vector_polygon, arc_through_points, function_expression.
 * Only ever called by `GeometryGraph.evaluateObject` for objects whose
 * `definition.type` is one of these; the `default` branch is unreachable in
 * practice.
 */
export function evaluatePolygonFamily(object: GeometryObject, values: EvaluationMap): EvaluatedValue {
  const def = object.definition;
  switch (def.type) {
    case "arc_through_points": {
      const pA = requireValue<PointValue>(values, object.id, def.pointA, "point");
      if (isUndefined(pA)) return pA;
      const pM = requireValue<PointValue>(values, object.id, def.pointMid, "point");
      if (isUndefined(pM)) return pM;
      const pB = requireValue<PointValue>(values, object.id, def.pointB, "point");
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

    case "polygon": {
      const vertices: { x: number; y: number }[] = [];
      for (const pid of def.points) {
        const pv = requireValue<PointValue>(values, object.id, pid, "point");
        if (isUndefined(pv)) return pv;
        vertices.push({ x: pv.x, y: pv.y });
      }
      return { type: "polygon", vertices } satisfies PolygonValue;
    }

    case "regular_polygon": {
      const pA = requireValue<PointValue>(values, object.id, def.pointA, "point");
      if (isUndefined(pA)) return pA;
      const pB = requireValue<PointValue>(values, object.id, def.pointB, "point");
      if (isUndefined(pB)) return pB;
      return regularPolygonVertices(pA, pB, def.sides);
    }

    case "vector_polygon": {
      const anchor = requireValue<PointValue>(values, object.id, def.anchor, "point");
      if (isUndefined(anchor)) return anchor;
      const ax = anchor.x;
      const ay = anchor.y;
      const vertices: { x: number; y: number }[] = [{ x: ax, y: ay }];
      for (const offset of def.offsets) {
        vertices.push({ x: cleanZero(ax + offset.x), y: cleanZero(ay + offset.y) });
      }
      return { type: "polygon", vertices } satisfies PolygonValue;
    }

    default:
      throw new Error(`evaluatePolygonFamily called with unsupported definition type '${def.type}'`);
  }
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
