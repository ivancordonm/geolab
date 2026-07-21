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

  it("resolves all implemented polyhedra", () => {
    expect(polyhedronForTool("tetrahedron")?.id).toBe("tetrahedron");
    expect(polyhedronForTool("cube")?.id).toBe("cube");
    expect(polyhedronForTool("octahedron")?.id).toBe("octahedron");
    expect(polyhedronForTool("dodecahedron")).toMatchObject({ id: "dodecahedron" });
    expect(polyhedronForTool("dodecahedron")?.underConstruction).toBeUndefined();
    expect(polyhedronForTool("icosahedron")).toMatchObject({ id: "icosahedron" });
    expect(polyhedronForTool("icosahedron")?.underConstruction).toBeUndefined();
    expect(polyhedronForTool("point")).toBeUndefined();
  });
});
