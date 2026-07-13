import { describe, expect, it } from "vitest";

import { exampleGeometryDocument } from "../geometry/example";
import type { GeometryDocument } from "../types/geometry";
import {
  clearDocument,
  documentToScript,
  exportDocumentJson,
  GEOMETRY_STORAGE_KEY,
  importDocumentJson,
  loadDocument,
  saveDocument,
} from "./documentPersistence";

describe("document persistence", () => {
  it("saves, restores, and clears a validated document in localStorage", () => {
    saveDocument(exampleGeometryDocument);

    expect(loadDocument()).toEqual(exampleGeometryDocument);
    expect(window.localStorage.getItem(GEOMETRY_STORAGE_KEY)).toContain('"schemaVersion": 1');

    clearDocument();
    expect(loadDocument()).toBeNull();
  });

  it("imports a valid geometry document", () => {
    const imported = importDocumentJson(JSON.stringify(exampleGeometryDocument));

    expect(imported.id).toBe("interactive_demo");
    expect(imported.objects).toHaveLength(9);
  });

  it("rejects malformed or geometrically invalid imported documents", () => {
    expect(() => importDocumentJson("not-json")).toThrow("not valid JSON");
    expect(() => importDocumentJson('{"schemaVersion":1}')).toThrow("document.id");

    const invalid: GeometryDocument = {
      schemaVersion: 1,
      id: "invalid",
      title: "Invalid",
      objects: [
        {
          id: "AB",
          label: "AB",
          kind: "line",
          visible: true,
          definition: { type: "through_points", pointA: "A", pointB: "B" },
        },
      ],
    };
    expect(() => importDocumentJson(JSON.stringify(invalid))).toThrow("missing parent 'A'");
  });

  it("exports the complete document as readable JSON", () => {
    const serialized = exportDocumentJson(exampleGeometryDocument);
    const parsed = JSON.parse(serialized) as GeometryDocument;

    expect(serialized).toContain("\n  \"schemaVersion\"");
    expect(parsed).toEqual(exampleGeometryDocument);
    expect(parsed.viewport).toEqual({ centerX: 1.5, centerY: 1.4, scale: 72 });
  });

  it("exports supported objects as a dependency-ordered construction script", () => {
    const script = documentToScript({
      ...exampleGeometryDocument,
      objects: [...exampleGeometryDocument.objects].reverse(),
    });

    expect(script).toContain("A = Point(-2, -1)");
    expect(script).toContain("AB = Line(A, B)");
    expect(script).toContain("s = Segment(A, B)");
    expect(script).toContain("M = Midpoint(A, B)");
    expect(script).toContain("p = ParallelLine(C, AB)");
    expect(script).toContain("h = PerpendicularLine(C, AB)");
    expect(script).toContain("circumference = Circle(A, C)");
    expect(script.indexOf("A = Point")).toBeLessThan(script.indexOf("AB = Line"));
  });

  it("creates safe variables for object ids and labels that are not script identifiers", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "invalid-script-identifiers",
      title: "Invalid script identifiers",
      objects: [
        {
          id: "point-a",
          label: "Point A",
          kind: "point",
          visible: true,
          definition: { type: "free", x: 0, y: 0 },
        },
        {
          id: "point-b",
          label: "Point B",
          kind: "point",
          visible: true,
          definition: { type: "free", x: 1, y: 1 },
        },
        {
          id: "line-a-b",
          label: "Line A B",
          kind: "line",
          visible: true,
          definition: { type: "through_points", pointA: "point-a", pointB: "point-b" },
        },
      ],
    };

    expect(documentToScript(document)).toBe(
      "object_1 = Point(0, 0)\n" +
        "object_2 = Point(1, 1)\n" +
        "object_3 = Line(object_1, object_2)\n",
    );
  });

  it("preserves directional intersection selectors in JSON and script exports", () => {
    const selected: GeometryDocument = {
      ...exampleGeometryDocument,
      objects: [
        ...exampleGeometryDocument.objects,
        {
          id: "selected",
          label: "selected",
          kind: "point",
          visible: true,
          definition: {
            type: "intersection_lc",
            line: "AB",
            circle: "circumference",
            selector: "left",
          },
        },
      ],
    };

    expect(importDocumentJson(exportDocumentJson(selected))).toEqual(selected);
    expect(documentToScript(selected)).toContain(
      "selected = Intersection(AB, circumference, left)",
    );
  });

  it("exports polygon vertices and arcs in backend-compatible dependency order", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "vertex-arc-export",
      title: "Vertex and arc export",
      objects: [
        { id: "V", label: "V", kind: "point", visible: true, definition: { type: "polygon_vertex", polygon: "poly", index: 1 } },
        { id: "arc", label: "arc", kind: "arc", visible: true, definition: { type: "arc_through_points", pointA: "A", pointMid: "C", pointB: "B" } },
        { id: "poly", label: "poly", kind: "polygon", visible: true, definition: { type: "polygon", points: ["A", "B", "C"] } },
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 4, y: 0 } },
        { id: "C", label: "C", kind: "point", visible: true, definition: { type: "free", x: 2, y: 3 } },
      ],
    };

    const script = documentToScript(document);

    expect(script).toContain("poly = Polygon(A, B, C)\nV = Vertex(poly, 1)");
    expect(script).toContain("arc = Arc(A, C, B)");
    expect(script.indexOf("A = Point")).toBeLessThan(script.indexOf("arc = Arc"));
  });

  it("exports a slider followed by a scalar-radius circle as a backend-parseable script", () => {
    // Regression test (Finding 2): documentToScript's switch is exhaustive over
    // every definition type, so any document containing a slider emits a
    // `Slider(...)` statement. Before the fix, the backend script parser did not
    // recognize the `Slider` command, so re-submitting this exact script text
    // (as happens whenever the object command bar round-trips through the
    // backend) failed with "Unknown command 'Slider'". This test pins down the
    // exact script text so a backend conformance test (test_sliders.py) can
    // replay it and prove the backend now accepts it end-to-end.
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "slider-circle-export",
      title: "Slider circle export",
      objects: [
        {
          id: "s1",
          label: "s1",
          kind: "slider",
          visible: true,
          definition: { type: "slider", min: 0, max: 10, value: 5, step: 0.5 },
        },
        { id: "p", label: "p", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        {
          id: "c",
          label: "c",
          kind: "circle",
          visible: true,
          definition: { type: "center_radius", center: "p", radius: "s1" },
        },
      ],
    };

    const script = documentToScript(document);

    expect(script).toBe(
      "s1 = Slider(0, 10, 5, 0.5)\n" + "p = Point(0, 0)\n" + "c = Circle(p, s1)\n",
    );
  });

  it("exports every measure variant as a backend-parseable script", () => {
    // Regression test (Task 2 fix, mirroring the slider regression above):
    // documentToScript's switch is exhaustive over every definition type, so any
    // document containing a measure emits a `Distance(...)`, `Angle(...)`,
    // `Area(...)`, or `Slope(...)` statement. Before this fix, the backend script
    // parser did not recognize any of the four measure commands, so re-submitting
    // this exact script text (as happens whenever the object command bar
    // round-trips through the backend) failed with "Unknown command 'Distance'"
    // (or Angle/Area/Slope). This test pins down the exact script text so a
    // backend conformance test (test_measures.py) can replay it and prove the
    // backend now accepts it end-to-end.
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "measures-export",
      title: "Measures export",
      objects: [
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 4, y: 0 } },
        { id: "C", label: "C", kind: "point", visible: true, definition: { type: "free", x: 2, y: 3 } },
        { id: "AB", label: "AB", kind: "line", visible: true, definition: { type: "through_points", pointA: "A", pointB: "B" } },
        { id: "poly", label: "poly", kind: "polygon", visible: true, definition: { type: "polygon", points: ["A", "B", "C"] } },
        { id: "d", label: "d", kind: "measure", visible: true, definition: { type: "distance", pointA: "A", pointB: "B" } },
        { id: "ang", label: "ang", kind: "measure", visible: true, definition: { type: "angle", pointA: "A", vertex: "B", pointB: "C" } },
        { id: "ar", label: "ar", kind: "measure", visible: true, definition: { type: "area", polygon: "poly" } },
        { id: "sl", label: "sl", kind: "measure", visible: true, definition: { type: "slope", line: "AB" } },
      ],
    };

    const script = documentToScript(document);

    expect(script).toBe(
      "A = Point(0, 0)\n" +
        "B = Point(4, 0)\n" +
        "C = Point(2, 3)\n" +
        "AB = Line(A, B)\n" +
        "poly = Polygon(A, B, C)\n" +
        "d = Distance(A, B)\n" +
        "ang = Angle(A, B, C)\n" +
        "ar = Area(poly)\n" +
        "sl = Slope(AB)\n",
    );
  });

  it("saves and restores every polygon variant", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "polygon-persistence",
      title: "Polygon persistence",
      objects: [
        { id: "A", label: "A", kind: "point", visible: true, definition: { type: "free", x: 0, y: 0 } },
        { id: "B", label: "B", kind: "point", visible: true, definition: { type: "free", x: 4, y: 0 } },
        { id: "C", label: "C", kind: "point", visible: true, definition: { type: "free", x: 2, y: 3 } },
        { id: "poly", label: "poly", kind: "polygon", visible: true, definition: { type: "polygon", points: ["A", "B", "C"] } },
        { id: "regular", label: "regular", kind: "polygon", visible: true, definition: { type: "regular_polygon", pointA: "A", pointB: "B", sides: 5 } },
        { id: "vector", label: "vector", kind: "polygon", visible: true, definition: { type: "vector_polygon", anchor: "A", offsets: [{ x: 4, y: 0 }, { x: 2, y: 3 }] } },
      ],
    };

    saveDocument(document);

    expect(loadDocument()).toEqual(document);
    expect(importDocumentJson(exportDocumentJson(document))).toEqual(document);
  });
});
