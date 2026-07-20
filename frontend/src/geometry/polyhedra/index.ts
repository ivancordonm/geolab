import type { ConstructionTool } from "../constructionTools";
import type { PolyhedronDefinition } from "./types";
import { TETRAHEDRON } from "./tetrahedron";
import { CUBE } from "./cube";
import { OCTAHEDRON } from "./octahedron";
import { DODECAHEDRON } from "./dodecahedron";
import { ICOSAHEDRON } from "./icosahedron";

export const POLYHEDRON_TOOLS: readonly ConstructionTool[] = [
  "tetrahedron",
  "cube",
  "octahedron",
  "dodecahedron",
  "icosahedron",
];

export const POLYHEDRON_DEFINITIONS: Partial<
  Record<ConstructionTool, PolyhedronDefinition>
> = {
  tetrahedron: TETRAHEDRON,
  cube: CUBE,
  octahedron: OCTAHEDRON,
  dodecahedron: DODECAHEDRON,
  icosahedron: ICOSAHEDRON,
};

export function polyhedronForTool(
  tool: ConstructionTool,
): PolyhedronDefinition | undefined {
  return POLYHEDRON_DEFINITIONS[tool];
}

export type { PolyhedronDefinition };
