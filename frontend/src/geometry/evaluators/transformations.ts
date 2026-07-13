import type {
  CircleValue,
  EvaluatedValue,
  EvaluationMap,
  GeometryObject,
  LineValue,
  PointValue,
} from "../../types/geometry";
import { GEOMETRY_EPSILON, GeometryValidationError, cleanZero, isUndefined, requireValue } from "./shared";
import { lineThroughPoints } from "./lines";

/**
 * Handles the "transformations" family of definitions: reflection_over_line,
 * reflection_over_point, homothety_scalar, homothety_point,
 * inversion_in_circle, translation, rotation. Only ever called by
 * `GeometryGraph.evaluateObject` for objects whose `definition.type` is one
 * of these; the `default` branch is unreachable in practice.
 */
export function evaluateTransformationFamily(object: GeometryObject, values: EvaluationMap): EvaluatedValue {
  const def = object.definition;
  switch (def.type) {
    case "reflection_over_line": {
      const ln = requireValue<LineValue>(values, object.id, def.line, "line");
      if (isUndefined(ln)) return ln;
      const sourceId = def.object ?? def.point!;
      const source = requireValue<EvaluatedValue>(
        values,
        object.id,
        sourceId,
        object.kind as Exclude<typeof object.kind, "slider" | "measure">,
      );
      if (isUndefined(source)) return source;
      return reflectValueOverLine(source, ln);
    }

    case "reflection_over_point": {
      const ctr = requireValue<PointValue>(values, object.id, def.center, "point");
      if (isUndefined(ctr)) return ctr;
      const sourceId = def.object ?? def.point!;
      const source = requireValue<EvaluatedValue>(
        values,
        object.id,
        sourceId,
        object.kind as Exclude<typeof object.kind, "slider" | "measure">,
      );
      if (isUndefined(source)) return source;
      return reflectValueOverPoint(source, ctr);
    }

    case "homothety_scalar": {
      const ctr = requireValue<PointValue>(values, object.id, def.center, "point");
      if (isUndefined(ctr)) return ctr;
      const pt = requireValue<PointValue>(values, object.id, def.point, "point");
      if (isUndefined(pt)) return pt;
      const k = def.ratio;
      return {
        type: "point",
        x: cleanZero(ctr.x + k * (pt.x - ctr.x)),
        y: cleanZero(ctr.y + k * (pt.y - ctr.y)),
      };
    }

    case "homothety_point": {
      const ctr = requireValue<PointValue>(values, object.id, def.center, "point");
      if (isUndefined(ctr)) return ctr;
      const pt = requireValue<PointValue>(values, object.id, def.point, "point");
      if (isUndefined(pt)) return pt;
      const rp = requireValue<PointValue>(values, object.id, def.ratioPoint, "point");
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
      const pt = requireValue<PointValue>(values, object.id, def.point, "point");
      if (isUndefined(pt)) return pt;
      const cr = requireValue<CircleValue>(values, object.id, def.circle, "circle");
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
      const sourceId = def.object ?? def.point!;
      const source = requireValue<EvaluatedValue>(
        values,
        object.id,
        sourceId,
        object.kind as Exclude<typeof object.kind, "slider" | "measure">,
      );
      if (isUndefined(source)) return source;
      const from = requireValue<PointValue>(values, object.id, def.from, "point");
      if (isUndefined(from)) return from;
      const to = requireValue<PointValue>(values, object.id, def.to, "point");
      if (isUndefined(to)) return to;
      return translateValue(source, to.x - from.x, to.y - from.y);
    }

    case "rotation": {
      const ctr = requireValue<PointValue>(values, object.id, def.center, "point");
      if (isUndefined(ctr)) return ctr;
      const sourceId = def.object ?? def.point!;
      const source = requireValue<EvaluatedValue>(
        values,
        object.id,
        sourceId,
        object.kind as Exclude<typeof object.kind, "slider" | "measure">,
      );
      if (isUndefined(source)) return source;
      return rotateValue(source, ctr, def.degrees);
    }

    default:
      throw new Error(`evaluateTransformationFamily called with unsupported definition type '${def.type}'`);
  }
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
