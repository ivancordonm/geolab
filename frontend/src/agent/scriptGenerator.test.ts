import { describe, expect, it } from "vitest";

import { exampleGeometryDocument } from "../geometry/example";
import { GeometryGraph } from "../geometry/engine";
import { scriptGenerator } from "./scriptGenerator";

describe("GeometryDocumentScriptGenerator", () => {
  it("generates a complete reproducible script from the current document", () => {
    const script = scriptGenerator.generate(exampleGeometryDocument);

    expect(script).toContain("A = Point(-2, -1)");
    expect(script).toContain("AB = Line(A, B)");
    expect(script).toContain("M = Midpoint(A, B)");
    expect(script).toContain("altitude = PerpendicularLine(C, AB)");
    expect(() => new GeometryGraph(exampleGeometryDocument)).not.toThrow();
  });

  it("prefers generic Intersection syntax for selector-based documents", () => {
    const document = {
      ...exampleGeometryDocument,
      objects: [
        ...exampleGeometryDocument.objects,
        {
          id: "selected",
          label: "selected",
          kind: "point" as const,
          visible: true,
          definition: {
            type: "intersection_lc" as const,
            line: "AB",
            circle: "circumference",
            selector: "left" as const,
          },
        },
      ],
    };

    expect(scriptGenerator.generate(document)).toContain(
      "selected = Intersection(AB, circumference, left)",
    );
  });
});
