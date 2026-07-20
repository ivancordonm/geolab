import { describe, expect, it } from "vitest";
import { POLYHEDRON_TOOLS, polyhedronForTool } from "./index";

describe("polyhedron registry", () => {
  it("lists the five polyhedron tools", () => {
    expect(POLYHEDRON_TOOLS).toEqual([
      "tetrahedron",
      "cube",
      "octahedron",
      "dodecahedron",
      "icosahedron",
    ]);
  });

  it("resolves the tetrahedron and returns undefined for unimplemented ones", () => {
    expect(polyhedronForTool("tetrahedron")?.id).toBe("tetrahedron");
    expect(polyhedronForTool("cube")).toBeUndefined();
    expect(polyhedronForTool("point")).toBeUndefined();
  });
});
