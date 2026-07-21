import type { TFunction } from "i18next";

const polyhedronNameKeys = {
  tetrahedron: "polyhedra.names.tetrahedron",
  cube: "polyhedra.names.cube",
  octahedron: "polyhedra.names.octahedron",
  dodecahedron: "polyhedra.names.dodecahedron",
  icosahedron: "polyhedra.names.icosahedron",
} as const;

export function translatePolyhedronName(t: TFunction, id: string): string {
  return id in polyhedronNameKeys
    ? t(polyhedronNameKeys[id as keyof typeof polyhedronNameKeys])
    : id;
}
