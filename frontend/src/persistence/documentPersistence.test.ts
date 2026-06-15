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
