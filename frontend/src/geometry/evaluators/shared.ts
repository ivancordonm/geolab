import type {
  EvaluatedValue,
  EvaluationMap,
  GeometryObjectId,
  PointValue,
  UndefinedValue,
} from "../../types/geometry";

export const GEOMETRY_EPSILON = 1e-9;

export class GeometryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeometryValidationError";
  }
}

/**
 * Look up an already-evaluated parent value, guarding against an undefined
 * parent or a type mismatch. Mirrors the previous `GeometryGraph.requireValue`
 * private method, but takes the evaluated-values map explicitly instead of
 * reading `this.evaluatedValues`.
 */
export function requireValue<T extends EvaluatedValue>(
  values: EvaluationMap,
  objectId: GeometryObjectId,
  parentId: GeometryObjectId,
  expectedType: T["type"],
): T | UndefinedValue {
  const value = values.get(parentId);
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

/**
 * Convenience wrapper for the very common "two point parents" shape. Mirrors
 * the previous `GeometryGraph.requirePointValues` private method.
 */
export function requirePointValues(
  values: EvaluationMap,
  objectId: GeometryObjectId,
  parentIds: [GeometryObjectId, GeometryObjectId],
): [PointValue, PointValue] | UndefinedValue {
  const first = requireValue<PointValue>(values, objectId, parentIds[0], "point");
  if (isUndefined(first)) {
    return first;
  }
  const second = requireValue<PointValue>(values, objectId, parentIds[1], "point");
  return isUndefined(second) ? second : [first, second];
}

export function cleanZero(value: number): number {
  return Math.abs(value) <= GEOMETRY_EPSILON ? 0 : value;
}

export function isUndefined<T>(value: T | EvaluatedValue): value is Extract<EvaluatedValue, { type: "undefined" }> {
  return typeof value === "object" && value !== null && "type" in value && value.type === "undefined";
}
