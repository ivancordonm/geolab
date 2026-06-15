import { describe, expect, it } from "vitest";

import fixture from "../../../shared/fixtures/basic-geometry.json";
import type { EvaluatedValue, GeometryDocument, Line } from "../types/geometry";
import {
  GeometryGraph,
  GeometryValidationError,
  evaluateGeometryDocument,
} from "./engine";
import { deserializeGeometryDocument, serializeGeometryDocument } from "./serialization";

const document = fixture.document as GeometryDocument;

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

describe("GeometryGraph", () => {
  it("evaluates every supported construction using the shared fixture", () => {
    const values = plainValues(evaluateGeometryDocument(document));

    expectNestedClose(values, fixture.initialValues);
  });

  it("recomputes transitive dependants after a free point moves", () => {
    const graph = new GeometryGraph(document);
    const result = graph.moveFreePoint(
      fixture.move.pointId,
      fixture.move.x,
      fixture.move.y,
    );
    const values = plainValues(result.values);

    expect(result.recomputedObjectIds).toEqual(fixture.move.expectedRecomputed);
    for (const [objectId, expected] of Object.entries(fixture.move.expectedValues)) {
      expectNestedClose(values[objectId], expected);
    }
    expectNestedClose(values.c1, fixture.initialValues.c1);
  });

  it("keeps construction definitions JSON serializable", () => {
    const serialized = serializeGeometryDocument(document);
    const restored = deserializeGeometryDocument(serialized);

    expect(restored).toEqual(document);
  });

  it("marks a line through coincident points and its dependants undefined", () => {
    const graph = new GeometryGraph(document);
    const result = graph.moveFreePoint("B", 0, 0);

    expect(result.values.get("l1")).toMatchObject({
      type: "undefined",
      code: "coincident_points",
    });
    expect(result.values.get("p")).toMatchObject({
      type: "undefined",
      code: "parent_undefined",
    });
  });

  it("rejects missing parents and attempts to move derived points", () => {
    const invalidLine: Line = {
      id: "l1",
      label: "l1",
      kind: "line",
      visible: true,
      definition: {
        type: "through_points",
        pointA: "missing",
        pointB: "B",
      },
    };
    const invalid: GeometryDocument = {
      ...document,
      objects: document.objects.map((object) =>
        object.id === "l1" ? invalidLine : object,
      ),
    };

    expect(() => new GeometryGraph(invalid)).toThrow(GeometryValidationError);
    expect(() => new GeometryGraph(document).moveFreePoint("M", 1, 1)).toThrow(
      "is not a free point",
    );
  });

  it("rejects dependency cycles", () => {
    const cyclic: GeometryDocument = {
      schemaVersion: 1,
      id: "cyclic",
      title: "Cyclic lines",
      objects: [
        {
          id: "A",
          label: "A",
          kind: "point",
          visible: true,
          definition: { type: "free", x: 0, y: 0 },
        },
        {
          id: "p",
          label: "p",
          kind: "line",
          visible: true,
          definition: { type: "parallel_through", point: "A", line: "q" },
        },
        {
          id: "q",
          label: "q",
          kind: "line",
          visible: true,
          definition: { type: "parallel_through", point: "A", line: "p" },
        },
      ],
    };

    expect(() => new GeometryGraph(cyclic)).toThrow("Dependency cycle detected");
  });
});
