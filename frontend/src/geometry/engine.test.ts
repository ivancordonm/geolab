import { describe, expect, it } from "vitest";

import fixture from "../../../shared/fixtures/basic-geometry.json";
import measuresFixture from "../../../shared/fixtures/measures.json";
import slidersFixture from "../../../shared/fixtures/sliders.json";
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

  it("scales complete objects with a numeric homothety", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "homothety-objects",
      title: "Homothety objects",
      objects: [
        { id: "O", label: "O", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 2 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 3, y: 2 } },
        { id: "S", label: "S", kind: "segment", visible: true, definition: { type: "between_points", pointA: "A", pointB: "B" } },
        { id: "HS", label: "HS", kind: "segment", visible: true, definition: { type: "homothety_scalar", center: "O", object: "S", ratio: -2 } },
      ],
    };

    expect(new GeometryGraph(document).values.get("HS")).toEqual({
      type: "segment", start: { x: -2, y: -4 }, end: { x: -6, y: -4 },
    });
  });

  it("rejects a zero numeric homothety for non-point objects", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "zero-homothety",
      title: "Zero homothety",
      objects: [
        { id: "O", label: "O", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 0 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 2, y: 0 } },
        { id: "S", label: "S", kind: "segment", visible: true, definition: { type: "between_points", pointA: "A", pointB: "B" } },
        { id: "HS", label: "HS", kind: "segment", visible: true, definition: { type: "homothety_scalar", center: "O", object: "S", ratio: 0 } },
      ],
    };

    expect(() => new GeometryGraph(document)).toThrow("ratio must be non-zero");
  });

  it("scales a complete object with a point-ratio homothety", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "point-ratio-homothety-objects",
      title: "Point-ratio homothety objects",
      objects: [
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 1 } },
        { id: "D", label: "D", kind: "point", visible: true, definition: { type: "free", x: 2, y: -1 } },
        { id: "V", label: "V", kind: "point", visible: true, definition: { type: "free", x: 3, y: 0 } },
        { id: "S", label: "S", kind: "segment", visible: true, definition: { type: "between_points", pointA: "A", pointB: "D" } },
        { id: "HP", label: "HP", kind: "segment", visible: true, definition: { type: "homothety_point", center: "B", object: "S", ratioPoint: "V" } },
      ],
    };

    expect(new GeometryGraph(document).values.get("HP")).toEqual({
      type: "segment", start: { x: 2, y: 2 }, end: { x: 4, y: -2 },
    });
  });

  it("marks a point-ratio homothety zero_ratio for a non-point with a coincident ratio point", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "zero-point-ratio-homothety",
      title: "Zero point-ratio homothety",
      objects: [
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 1 } },
        { id: "D", label: "D", kind: "point", visible: true, definition: { type: "free", x: 2, y: -1 } },
        { id: "S", label: "S", kind: "segment", visible: true, definition: { type: "between_points", pointA: "A", pointB: "D" } },
        { id: "HP", label: "HP", kind: "segment", visible: true, definition: { type: "homothety_point", center: "B", object: "S", ratioPoint: "B" } },
      ],
    };

    const value = new GeometryGraph(document).values.get("HP");
    expect(value?.type).toBe("undefined");
    expect((value as { code: string }).code).toBe("zero_ratio");
  });

  it("rejects a point-ratio homothety kind mismatch", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "mismatch-point-ratio-homothety",
      title: "Mismatch point-ratio homothety",
      objects: [
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 0 } },
        { id: "D", label: "D", kind: "point", visible: true, definition: { type: "free", x: 2, y: 1 } },
        { id: "V", label: "V", kind: "point", visible: true, definition: { type: "free", x: 3, y: 0 } },
        { id: "S", label: "S", kind: "segment", visible: true, definition: { type: "between_points", pointA: "A", pointB: "D" } },
        { id: "HP", label: "HP", kind: "point", visible: true, definition: { type: "homothety_point", center: "B", object: "S", ratioPoint: "V" } },
      ],
    };

    expect(() => new GeometryGraph(document)).toThrow("must keep the scaled kind");
  });

  it("translates complete objects, not only points", () => {
    const doc: GeometryDocument = {
      schemaVersion: 1,
      id: "translation-objects",
      title: "Translation objects",
      objects: [
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 1 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 3, y: 1 } },
        { id: "C", label: "C", kind: "point", visible: true, definition: { type: "free", x: 1, y: 3 } },
        { id: "from", label: "from", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "to", label: "to", kind: "point", visible: true, definition: { type: "free", x: 2, y: -1 } },
        { id: "seg", label: "seg", kind: "segment", visible: true, definition: { type: "between_points", pointA: "A", pointB: "B" } },
        { id: "circle", label: "circle", kind: "circle", visible: true, definition: { type: "center_through_point", center: "A", point: "B" } },
        { id: "poly", label: "poly", kind: "polygon", visible: true, definition: { type: "polygon", points: ["A", "B", "C"] } },
        { id: "segTr", label: "segTr", kind: "segment", visible: true, definition: { type: "translation", object: "seg", from: "from", to: "to" } },
        { id: "circleTr", label: "circleTr", kind: "circle", visible: true, definition: { type: "translation", object: "circle", from: "from", to: "to" } },
        { id: "polyTr", label: "polyTr", kind: "polygon", visible: true, definition: { type: "translation", object: "poly", from: "from", to: "to" } },
      ],
    };

    const values = new GeometryGraph(doc).values;

    expect(values.get("segTr")).toMatchObject({
      type: "segment",
      start: { x: 3, y: 0 },
      end: { x: 5, y: 0 },
    });
    expect(values.get("circleTr")).toMatchObject({
      type: "circle",
      center: { x: 3, y: 0 },
      radius: 2,
    });
    expect(values.get("polyTr")).toMatchObject({
      type: "polygon",
      vertices: [{ x: 3, y: 0 }, { x: 5, y: 0 }, { x: 3, y: 2 }],
    });
  });

  it("accepts legacy point-based translation definitions", () => {
    const doc: GeometryDocument = {
      schemaVersion: 1,
      id: "translation-legacy",
      title: "Translation legacy",
      objects: [
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 1 } },
        { id: "from", label: "from", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "to", label: "to", kind: "point", visible: true, definition: { type: "free", x: 2, y: -1 } },
        { id: "ATr", label: "ATr", kind: "point", visible: true, definition: { type: "translation", point: "A", from: "from", to: "to" } },
      ],
    };

    expect(new GeometryGraph(doc).values.get("ATr")).toMatchObject({ type: "point", x: 3, y: 0 });
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

describe("sliders conformance", () => {
  const slidersDocument = slidersFixture.document as GeometryDocument;

  it("evaluates a circle whose radius comes from a slider's scalar value", () => {
    const values = plainValues(evaluateGeometryDocument(slidersDocument));

    expect(slidersDocument.objects[2].definition.type).toBe("center_radius");
    expectNestedClose(values, slidersFixture.initialValues);
  });

  it("recomputes the circle's center but keeps the slider-derived radius after moving the point", () => {
    const graph = new GeometryGraph(slidersDocument);
    const result = graph.moveFreePoint(
      slidersFixture.move.pointId,
      slidersFixture.move.x,
      slidersFixture.move.y,
    );
    const values = plainValues(result.values);

    expect(result.recomputedObjectIds).toEqual(slidersFixture.move.expectedRecomputed);
    for (const [objectId, expected] of Object.entries(slidersFixture.move.expectedValues)) {
      expectNestedClose(values[objectId], expected);
    }
  });

  it("rejects a center_radius circle whose radius parent is not a slider", () => {
    const invalid: GeometryDocument = {
      ...slidersDocument,
      objects: [
        slidersDocument.objects[0],
        slidersDocument.objects[1],
        {
          id: "c",
          label: "c",
          kind: "circle",
          visible: true,
          definition: { type: "center_radius", center: "p", radius: "p" },
        },
      ],
    };

    expect(() => new GeometryGraph(invalid)).toThrow(GeometryValidationError);
  });

  it("rejects a slider with NaN/Infinity parameters", () => {
    const invalidValue: GeometryDocument = {
      schemaVersion: 1,
      id: "invalid-slider-value",
      title: "Invalid slider",
      objects: [
        {
          id: "s",
          label: "s",
          kind: "slider",
          visible: true,
          definition: { type: "slider", min: 0, max: 10, value: NaN, step: 1 },
        },
      ],
    };

    expect(() => new GeometryGraph(invalidValue)).toThrow(GeometryValidationError);

    const invalidMin: GeometryDocument = {
      schemaVersion: 1,
      id: "invalid-slider-min",
      title: "Invalid slider",
      objects: [
        {
          id: "s",
          label: "s",
          kind: "slider",
          visible: true,
          definition: { type: "slider", min: Infinity, max: 10, value: 5, step: 1 },
        },
      ],
    };

    expect(() => new GeometryGraph(invalidMin)).toThrow(GeometryValidationError);
  });
});

describe("measures conformance", () => {
  const measuresDocument = measuresFixture.document as GeometryDocument;

  it("evaluates all four measure variants from the shared fixture", () => {
    const values = plainValues(evaluateGeometryDocument(measuresDocument));
    expectNestedClose(values, measuresFixture.initialValues);
  });

  it("computes distance as Euclidean distance between two points", () => {
    const doc: GeometryDocument = {
      schemaVersion: 1,
      id: "distance-test",
      title: "Distance",
      objects: [
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 3, y: 4 } },
        { id: "d", label: "d", kind: "measure", visible: true, definition: { type: "distance", pointA: "A", pointB: "B" } },
      ],
    };
    const values = plainValues(evaluateGeometryDocument(doc));
    expect(values.d.type).toBe("scalar");
    expect((values.d as { value: number }).value).toBeCloseTo(5, 12);
  });

  it("computes a right angle (90 degrees) between two perpendicular rays", () => {
    const doc: GeometryDocument = {
      schemaVersion: 1,
      id: "angle-test",
      title: "Angle",
      objects: [
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 0 } },
        { id: "O", label: "O", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 0, y: 1 } },
        { id: "ang", label: "ang", kind: "measure", visible: true, definition: { type: "angle", pointA: "A", vertex: "O", pointB: "B" } },
      ],
    };
    const values = plainValues(evaluateGeometryDocument(doc));
    expect(values.ang.type).toBe("scalar");
    expect((values.ang as { value: number }).value).toBeCloseTo(90, 12);
  });

  it("computes a straight angle (180 degrees) between opposite rays", () => {
    const doc: GeometryDocument = {
      schemaVersion: 1,
      id: "angle-straight-test",
      title: "Angle straight",
      objects: [
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 1, y: 0 } },
        { id: "O", label: "O", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "C", label: "C", kind: "point", visible: true, definition: { type: "free", x: -1, y: 0 } },
        { id: "ang", label: "ang", kind: "measure", visible: true, definition: { type: "angle", pointA: "A", vertex: "O", pointB: "C" } },
      ],
    };
    const values = plainValues(evaluateGeometryDocument(doc));
    expect(values.ang.type).toBe("scalar");
    expect((values.ang as { value: number }).value).toBeCloseTo(180, 12);
  });

  it("marks angle undefined when the vertex coincides with an arm point", () => {
    const doc: GeometryDocument = {
      schemaVersion: 1,
      id: "angle-degenerate-test",
      title: "Angle degenerate",
      objects: [
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "O", label: "O", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 0, y: 1 } },
        { id: "ang", label: "ang", kind: "measure", visible: true, definition: { type: "angle", pointA: "A", vertex: "O", pointB: "B" } },
      ],
    };
    const values = plainValues(evaluateGeometryDocument(doc));
    expect(values.ang.type).toBe("undefined");
    expect((values.ang as { code: string }).code).toBe("coincident_points");
  });

  it("computes polygon area via the shoelace formula for a right triangle", () => {
    const doc: GeometryDocument = {
      schemaVersion: 1,
      id: "area-test",
      title: "Area",
      objects: [
        { id: "T1", label: "T1", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "T2", label: "T2", kind: "point", visible: true, definition: { type: "free", x: 4, y: 0 } },
        { id: "T3", label: "T3", kind: "point", visible: true, definition: { type: "free", x: 0, y: 3 } },
        { id: "tri", label: "tri", kind: "polygon", visible: true, definition: { type: "polygon", points: ["T1", "T2", "T3"] } },
        { id: "area", label: "area", kind: "measure", visible: true, definition: { type: "area", polygon: "tri" } },
      ],
    };
    const values = plainValues(evaluateGeometryDocument(doc));
    expect(values.area.type).toBe("scalar");
    expect((values.area as { value: number }).value).toBeCloseTo(6, 12);
  });

  it("returns a non-negative area regardless of vertex winding order", () => {
    const doc: GeometryDocument = {
      schemaVersion: 1,
      id: "area-winding-test",
      title: "Area winding",
      objects: [
        { id: "T1", label: "T1", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "T2", label: "T2", kind: "point", visible: true, definition: { type: "free", x: 0, y: 3 } },
        { id: "T3", label: "T3", kind: "point", visible: true, definition: { type: "free", x: 4, y: 0 } },
        { id: "tri", label: "tri", kind: "polygon", visible: true, definition: { type: "polygon", points: ["T1", "T2", "T3"] } },
        { id: "area", label: "area", kind: "measure", visible: true, definition: { type: "area", polygon: "tri" } },
      ],
    };
    const values = plainValues(evaluateGeometryDocument(doc));
    const value = (values.area as { value: number }).value;
    expect(value).toBeCloseTo(6, 12);
    expect(value).toBeGreaterThan(0);
  });

  it("computes slope as -a/b from the normalized line", () => {
    const doc: GeometryDocument = {
      schemaVersion: 1,
      id: "slope-test",
      title: "Slope",
      objects: [
        { id: "L1", label: "L1", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "L2", label: "L2", kind: "point", visible: true, definition: { type: "free", x: 1, y: 1 } },
        { id: "ln", label: "ln", kind: "line", visible: true, definition: { type: "through_points", pointA: "L1", pointB: "L2" } },
        { id: "slope", label: "slope", kind: "measure", visible: true, definition: { type: "slope", line: "ln" } },
      ],
    };
    const values = plainValues(evaluateGeometryDocument(doc));
    expect(values.slope.type).toBe("scalar");
    expect((values.slope as { value: number }).value).toBeCloseTo(1, 12);
  });

  it("marks slope undefined for a vertical line", () => {
    const doc: GeometryDocument = {
      schemaVersion: 1,
      id: "slope-vertical-test",
      title: "Slope vertical",
      objects: [
        { id: "V1", label: "V1", kind: "point", visible: true, definition: { type: "free", x: 2, y: 0 } },
        { id: "V2", label: "V2", kind: "point", visible: true, definition: { type: "free", x: 2, y: 5 } },
        { id: "vln", label: "vln", kind: "line", visible: true, definition: { type: "through_points", pointA: "V1", pointB: "V2" } },
        { id: "slope", label: "slope", kind: "measure", visible: true, definition: { type: "slope", line: "vln" } },
      ],
    };
    const values = plainValues(evaluateGeometryDocument(doc));
    expect(values.slope.type).toBe("undefined");
    expect((values.slope as { code: string }).code).toBe("vertical_line");
  });

  it("rejects a distance measure whose parent is not a point", () => {
    const invalid: GeometryDocument = {
      schemaVersion: 1,
      id: "measure-invalid-parent",
      title: "Invalid measure parent",
      objects: [
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 1, y: 0 } },
        { id: "ln", label: "ln", kind: "line", visible: true, definition: { type: "through_points", pointA: "A", pointB: "B" } },
        { id: "d", label: "d", kind: "measure", visible: true, definition: { type: "distance", pointA: "A", pointB: "ln" } },
      ],
    };
    expect(() => new GeometryGraph(invalid)).toThrow(GeometryValidationError);
  });
});

function freePoint(id: string, x: number, y: number) {
  return { id, label: id, kind: "point" as const, visible: true, definition: { type: "free" as const, x, y } };
}

describe("generalized inversion", () => {
  const baseDocument: GeometryDocument = {
    schemaVersion: 1,
    id: "inversion-tests",
    title: "Inversion",
    objects: [
      freePoint("B", 0, 0),
      freePoint("U", 1, 0),
      {
        id: "c1",
        label: "c1",
        kind: "circle",
        visible: true,
        definition: { type: "center_through_point", center: "B", point: "U" },
      },
    ],
  };

  it("inverts a line not through the center into a circle", () => {
    const document: GeometryDocument = {
      ...baseDocument,
      objects: [
        ...baseDocument.objects,
        freePoint("E", 1, 2),
        freePoint("F", 3, 2),
        { id: "r", label: "r", kind: "line", visible: true, definition: { type: "through_points", pointA: "E", pointB: "F" } },
        {
          id: "C1",
          label: "C1",
          kind: "circle",
          visible: true,
          definition: { type: "inversion_in_circle", object: "r", circle: "c1" },
        },
      ],
    };

    const values = evaluateGeometryDocument(document);
    const result = values.get("C1");
    expect(result).toEqual({ type: "circle", center: { x: 0, y: 0.25 }, radius: 0.25 });
  });

  it("keeps a line through the center as itself", () => {
    const document: GeometryDocument = {
      ...baseDocument,
      objects: [
        ...baseDocument.objects,
        freePoint("E", 0, 1),
        freePoint("F", 0, 2),
        { id: "r", label: "r", kind: "line", visible: true, definition: { type: "through_points", pointA: "E", pointB: "F" } },
        {
          id: "C1",
          label: "C1",
          kind: "line",
          visible: true,
          definition: { type: "inversion_in_circle", object: "r", circle: "c1" },
        },
      ],
    };

    const values = evaluateGeometryDocument(document);
    const result = values.get("C1");
    expect(result?.type).toBe("line");
    if (result?.type === "line") {
      expect(result.a).toBeCloseTo(1, 12);
      expect(result.b).toBeCloseTo(0, 12);
      expect(result.c).toBeCloseTo(0, 12);
    }
  });

  it("reads the legacy `point` field on inversion_in_circle", () => {
    const document: GeometryDocument = {
      ...baseDocument,
      objects: [
        ...baseDocument.objects,
        {
          id: "Inv",
          label: "Inv",
          kind: "point",
          visible: true,
          // Legacy shape: `point` instead of `object`.
          definition: { type: "inversion_in_circle", point: "U", circle: "c1" } as never,
        },
      ],
    };

    const values = evaluateGeometryDocument(document);
    expect(values.get("Inv")).toEqual({ type: "point", x: 1, y: 0 });
  });
});
