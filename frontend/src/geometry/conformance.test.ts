import { describe, expect, it } from "vitest";

import basicGeometry from "../../../shared/fixtures/basic-geometry.json";
import derivedConstructions from "../../../shared/fixtures/derived-constructions.json";
import polygonsArcs from "../../../shared/fixtures/polygons-arcs.json";
import transformations from "../../../shared/fixtures/transformations.json";
import type { EvaluatedValue, GeometryDocument } from "../types/geometry";
import { evaluateGeometryDocument } from "./engine";

interface ConformanceFixture {
  document: GeometryDocument;
  initialValues: Record<string, unknown>;
}

const FIXTURES: ReadonlyArray<readonly [string, ConformanceFixture]> = [
  ["basic-geometry", basicGeometry as unknown as ConformanceFixture],
  ["transformations", transformations as unknown as ConformanceFixture],
  ["derived-constructions", derivedConstructions as unknown as ConformanceFixture],
  ["polygons-arcs", polygonsArcs as unknown as ConformanceFixture],
];

function plainValues(values: ReadonlyMap<string, EvaluatedValue>): Record<string, EvaluatedValue> {
  return Object.fromEntries(values);
}

function expectNestedClose(actual: unknown, expected: unknown): void {
  if (typeof expected === "number") {
    expect(actual).toBeTypeOf("number");
    expect(actual as number).toBeCloseTo(expected, 12);
    return;
  }
  if (Array.isArray(expected)) {
    expect(actual).toBeInstanceOf(Array);
    expect(actual as unknown[]).toHaveLength(expected.length);
    expected.forEach((item, index) => expectNestedClose((actual as unknown[])[index], item));
    return;
  }
  if (typeof expected === "object" && expected !== null) {
    expect(typeof actual).toBe("object");
    expect(actual).not.toBeNull();
    expect(Object.keys(actual as object)).toEqual(Object.keys(expected));
    for (const [key, value] of Object.entries(expected)) {
      expectNestedClose((actual as Record<string, unknown>)[key], value);
    }
    return;
  }
  expect(actual).toBe(expected);
}

describe("cross-runtime conformance", () => {
  it.each(FIXTURES)("matches the Python engine for %s", (_name, fixture) => {
    const values = plainValues(evaluateGeometryDocument(fixture.document));

    expectNestedClose(values, fixture.initialValues);
  });
});
