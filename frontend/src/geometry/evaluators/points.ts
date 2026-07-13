import type { EvaluatedValue, EvaluationMap, GeometryObject, PolygonValue } from "../../types/geometry";
import { cleanZero, isUndefined, requirePointValues, requireValue } from "./shared";

/**
 * Handles the "points" family of definitions: free (free point), slider,
 * polygon_vertex, midpoint. Only ever called by
 * `GeometryGraph.evaluateObject` for objects whose `definition.type` is one
 * of these; the `default` branch is unreachable in practice.
 */
export function evaluatePointFamily(object: GeometryObject, values: EvaluationMap): EvaluatedValue {
  const def = object.definition;
  switch (def.type) {
    case "free":
      return { type: "point", x: def.x, y: def.y };

    case "slider":
      return { type: "scalar", value: def.value };

    case "polygon_vertex": {
      const polygon = requireValue<PolygonValue>(values, object.id, def.polygon, "polygon");
      if (isUndefined(polygon)) return polygon;
      const vertex = polygon.vertices[def.index];
      if (vertex === undefined) {
        return { type: "undefined", code: "vertex_out_of_range", message: `Polygon vertex ${def.index} is out of range` };
      }
      return { type: "point", x: cleanZero(vertex.x), y: cleanZero(vertex.y) };
    }

    case "midpoint": {
      const pts = requirePointValues(values, object.id, [def.pointA, def.pointB]);
      return isUndefined(pts)
        ? pts
        : { type: "point", x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }

    default:
      throw new Error(`evaluatePointFamily called with unsupported definition type '${def.type}'`);
  }
}
