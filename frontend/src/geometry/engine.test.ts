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

  it("evaluates directional circle intersections and rejects ambiguous selectors", () => {
    const base: GeometryDocument = {
      schemaVersion: 1,
      id: "selectors",
      title: "Directional intersections",
      objects: [
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 4, y: 0 } },
        { id: "cA", label: "cA", kind: "circle", visible: true, definition: { type: "center_through_point", center: "A", point: "B" } },
        { id: "cB", label: "cB", kind: "circle", visible: true, definition: { type: "center_through_point", center: "B", point: "A" } },
        { id: "C", label: "C", kind: "point", visible: true, definition: { type: "intersection_cc", circleA: "cA", circleB: "cB", index: null, selector: "upper" } },
      ],
    };

    const upper = new GeometryGraph(base).values.get("C");
    expect(upper).toMatchObject({ type: "point", x: 2 });
    expect(upper?.type === "point" ? upper.y : Number.NaN).toBeCloseTo(3.464101615, 9);

    const ambiguous: GeometryDocument = {
      ...base,
      objects: base.objects.map((object) =>
        object.id === "C"
          ? { ...object, definition: { type: "intersection_cc", circleA: "cA", circleB: "cB", selector: "left" as const } }
          : object,
      ) as GeometryDocument["objects"],
    };
    expect(new GeometryGraph(ambiguous).values.get("C")).toMatchObject({
      type: "undefined",
      code: "ambiguous_selector",
    });
  });

  it("evaluates polygon vertices and arcs through three points", () => {
    const arcDoc: GeometryDocument = {
      schemaVersion: 1,
      id: "arc",
      title: "Arc",
      objects: [
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 0 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 0, y: 1 } },
        { id: "C", label: "C", kind: "point", visible: true, definition: { type: "free", x: -1, y: 0 } },
        { id: "poly", label: "poly", kind: "polygon", visible: true, definition: { type: "polygon", points: ["A", "B", "C"] } },
        { id: "V1", label: "V1", kind: "point", visible: true, definition: { type: "polygon_vertex", polygon: "poly", index: 1 } },
        { id: "arc1", label: "arc1", kind: "arc", visible: true, definition: { type: "arc_through_points", pointA: "A", pointMid: "B", pointB: "C" } },
      ],
    };

    const values = new GeometryGraph(arcDoc).values;
    expect(values.get("V1")).toMatchObject({ type: "point", x: 0, y: 1 });
    expect(values.get("arc1")).toMatchObject({
      type: "arc",
      center: { x: 0, y: 0 },
      radius: 1,
    });
  });

  it("reflects complete objects, not only points", () => {
    const doc: GeometryDocument = {
      schemaVersion: 1,
      id: "reflection-objects",
      title: "Reflection objects",
      objects: [
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 1 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 3, y: 1 } },
        { id: "C", label: "C", kind: "point", visible: true, definition: { type: "free", x: 1, y: 3 } },
        { id: "axisP", label: "axisP", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "axisQ", label: "axisQ", kind: "point", visible: true, definition: { type: "free", x: 0, y: 2 } },
        { id: "axis", label: "axis", kind: "line", visible: true, definition: { type: "through_points", pointA: "axisP", pointB: "axisQ" } },
        { id: "seg", label: "seg", kind: "segment", visible: true, definition: { type: "between_points", pointA: "A", pointB: "B" } },
        { id: "circle", label: "circle", kind: "circle", visible: true, definition: { type: "center_through_point", center: "A", point: "B" } },
        { id: "poly", label: "poly", kind: "polygon", visible: true, definition: { type: "polygon", points: ["A", "B", "C"] } },
        { id: "segR", label: "segR", kind: "segment", visible: true, definition: { type: "reflection_over_line", object: "seg", line: "axis" } },
        { id: "circleR", label: "circleR", kind: "circle", visible: true, definition: { type: "reflection_over_line", object: "circle", line: "axis" } },
        { id: "polyR", label: "polyR", kind: "polygon", visible: true, definition: { type: "reflection_over_point", object: "poly", center: "axisP" } },
      ],
    };

    const values = new GeometryGraph(doc).values;
    expect(values.get("segR")).toMatchObject({ type: "segment", start: { x: -1, y: 1 }, end: { x: -3, y: 1 } });
    expect(values.get("circleR")).toMatchObject({ type: "circle", center: { x: -1, y: 1 }, radius: 2 });
    expect(values.get("polyR")).toMatchObject({
      type: "polygon",
      vertices: [{ x: -1, y: -1 }, { x: -3, y: -1 }, { x: -1, y: -3 }],
    });
  });

  it("rotates complete objects, not only points", () => {
    const doc: GeometryDocument = {
      schemaVersion: 1,
      id: "rotation-objects",
      title: "Rotation objects",
      objects: [
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 1 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 3, y: 1 } },
        { id: "C", label: "C", kind: "point", visible: true, definition: { type: "free", x: 1, y: 3 } },
        { id: "center", label: "center", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "seg", label: "seg", kind: "segment", visible: true, definition: { type: "between_points", pointA: "A", pointB: "B" } },
        { id: "circle", label: "circle", kind: "circle", visible: true, definition: { type: "center_through_point", center: "A", point: "B" } },
        { id: "poly", label: "poly", kind: "polygon", visible: true, definition: { type: "polygon", points: ["A", "B", "C"] } },
        { id: "segRot", label: "segRot", kind: "segment", visible: true, definition: { type: "rotation", object: "seg", center: "center", degrees: 90 } },
        { id: "circleRot", label: "circleRot", kind: "circle", visible: true, definition: { type: "rotation", object: "circle", center: "center", degrees: 90 } },
        { id: "polyRot", label: "polyRot", kind: "polygon", visible: true, definition: { type: "rotation", object: "poly", center: "center", degrees: 90 } },
      ],
    };

    const values = new GeometryGraph(doc).values;

    const segRotVal = values.get("segRot");
    expect(segRotVal).toMatchObject({ type: "segment" });
    if (segRotVal?.type === "segment") {
      expect(segRotVal.start.x).toBeCloseTo(-1, 9);
      expect(segRotVal.start.y).toBeCloseTo(1, 9);
      expect(segRotVal.end.x).toBeCloseTo(-1, 9);
      expect(segRotVal.end.y).toBeCloseTo(3, 9);
    }

    const circleRotVal = values.get("circleRot");
    expect(circleRotVal).toMatchObject({ type: "circle" });
    if (circleRotVal?.type === "circle") {
      expect(circleRotVal.center.x).toBeCloseTo(-1, 9);
      expect(circleRotVal.center.y).toBeCloseTo(1, 9);
      expect(circleRotVal.radius).toBeCloseTo(2, 9);
    }

    const polyRotVal = values.get("polyRot");
    expect(polyRotVal).toMatchObject({ type: "polygon" });
    if (polyRotVal?.type === "polygon") {
      expect(polyRotVal.vertices[0].x).toBeCloseTo(-1, 9);
      expect(polyRotVal.vertices[0].y).toBeCloseTo(1, 9);
      expect(polyRotVal.vertices[1].x).toBeCloseTo(-1, 9);
      expect(polyRotVal.vertices[1].y).toBeCloseTo(3, 9);
      expect(polyRotVal.vertices[2].x).toBeCloseTo(-3, 9);
      expect(polyRotVal.vertices[2].y).toBeCloseTo(1, 9);
    }
  });
});

// ─── Conformance: polygon construction variants ──────────────────────────────

function makeDoc(objects: GeometryDocument["objects"]): GeometryDocument {
  return { schemaVersion: 1, id: "test", title: "test", objects };
}

describe("polygon conformance", () => {
  it("basic polygon copies free point coordinates as vertices", () => {
    const doc = makeDoc([
      { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
      { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 4, y: 0 } },
      { id: "C", label: "C", kind: "point", visible: true, definition: { type: "free", x: 2, y: 3 } },
      { id: "poly", label: "poly", kind: "polygon", visible: true, definition: { type: "polygon", points: ["A", "B", "C"] } },
    ]);

    const values = new GeometryGraph(doc).values;
    const v = values.get("poly");
    expect(v?.type).toBe("polygon");
    if (v?.type !== "polygon") return;
    expect(v.vertices).toHaveLength(3);
    expectNestedClose(v.vertices[0], { x: 0, y: 0 });
    expectNestedClose(v.vertices[1], { x: 4, y: 0 });
    expectNestedClose(v.vertices[2], { x: 2, y: 3 });
  });

  it("regular polygon (square) generates correct 4 vertices", () => {
    // A=(0,0), B=(1,0), 4 sides → CCW: (0,0),(1,0),(1,1),(0,1)
    const doc = makeDoc([
      { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
      { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 1, y: 0 } },
      { id: "poly", label: "poly", kind: "polygon", visible: true, definition: { type: "regular_polygon", pointA: "A", pointB: "B", sides: 4 } },
    ]);

    const values = new GeometryGraph(doc).values;
    const v = values.get("poly");
    expect(v?.type).toBe("polygon");
    if (v?.type !== "polygon") return;
    expect(v.vertices).toHaveLength(4);
    expectNestedClose(v.vertices[0], { x: 0, y: 0 });
    expectNestedClose(v.vertices[1], { x: 1, y: 0 });
    expectNestedClose(v.vertices[2], { x: 1, y: 1 });
    expectNestedClose(v.vertices[3], { x: 0, y: 1 });
  });

  it("regular polygon equilateral triangle has equal side lengths", () => {
    const doc = makeDoc([
      { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
      { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 2, y: 0 } },
      { id: "poly", label: "poly", kind: "polygon", visible: true, definition: { type: "regular_polygon", pointA: "A", pointB: "B", sides: 3 } },
    ]);

    const values = new GeometryGraph(doc).values;
    const v = values.get("poly");
    expect(v?.type).toBe("polygon");
    if (v?.type !== "polygon") return;
    expect(v.vertices).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const dx = v.vertices[j].x - v.vertices[i].x;
      const dy = v.vertices[j].y - v.vertices[i].y;
      expect(Math.sqrt(dx * dx + dy * dy)).toBeCloseTo(2.0, 9);
    }
  });

  it("vector polygon places vertices relative to anchor", () => {
    const doc = makeDoc([
      { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 1 } },
      { id: "poly", label: "poly", kind: "polygon", visible: true, definition: { type: "vector_polygon", anchor: "A", offsets: [{ x: 1, y: 0 }, { x: 0, y: 1 }] } },
    ]);

    const values = new GeometryGraph(doc).values;
    const v = values.get("poly");
    expect(v?.type).toBe("polygon");
    if (v?.type !== "polygon") return;
    expect(v.vertices).toHaveLength(3);
    expectNestedClose(v.vertices[0], { x: 1, y: 1 });
    expectNestedClose(v.vertices[1], { x: 2, y: 1 });
    expectNestedClose(v.vertices[2], { x: 1, y: 2 });
  });

  it("vector polygon translates all vertices when anchor moves", () => {
    const doc = makeDoc([
      { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 1 } },
      { id: "poly", label: "poly", kind: "polygon", visible: true, definition: { type: "vector_polygon", anchor: "A", offsets: [{ x: 1, y: 0 }, { x: 0, y: 1 }] } },
    ]);

    const { values } = new GeometryGraph(doc).moveFreePoint("A", 3, 4);
    const v = values.get("poly");
    expect(v?.type).toBe("polygon");
    if (v?.type !== "polygon") return;
    expectNestedClose(v.vertices[0], { x: 3, y: 4 });
    expectNestedClose(v.vertices[1], { x: 4, y: 4 });
    expectNestedClose(v.vertices[2], { x: 3, y: 5 });
  });
});
