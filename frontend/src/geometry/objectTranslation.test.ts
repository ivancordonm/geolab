import { describe, expect, it } from "vitest";

import { GeometryGraph } from "./engine";
import { exampleGeometryDocument } from "./example";
import { collectFreePointAncestorIds, translateObjectDocument } from "./objectTranslation";

describe("collectFreePointAncestorIds", () => {
  it("collects the free points that define a derived line", () => {
    expect(collectFreePointAncestorIds(exampleGeometryDocument, "AB").sort()).toEqual(["A", "B"]);
  });

  it("walks transitive dependencies for derived constructions", () => {
    expect(collectFreePointAncestorIds(exampleGeometryDocument, "parallel").sort()).toEqual(["A", "B", "C"]);
  });
});

describe("translateObjectDocument", () => {
  it("translates all free ancestor points of the selected object", () => {
    const translated = translateObjectDocument(exampleGeometryDocument, "AB", 1.5, -2);
    const graph = new GeometryGraph(translated);

    expect(graph.values.get("A")).toEqual({ type: "point", x: -0.5, y: -3 });
    expect(graph.values.get("B")).toEqual({ type: "point", x: 5.5, y: -3 });
    expect(graph.values.get("AB")).toEqual({ type: "line", a: 0, b: 1, c: 3 });
    expect(graph.values.get("M")).toEqual({ type: "point", x: 2.5, y: -3 });
  });

  it("returns the original document when the object has no free ancestors", () => {
    const document = {
      ...exampleGeometryDocument,
      objects: exampleGeometryDocument.objects.filter((object) => !["A", "B", "C"].includes(object.id)),
    };

    expect(translateObjectDocument(document, "missing", 1, 1)).toBe(document);
  });
});
