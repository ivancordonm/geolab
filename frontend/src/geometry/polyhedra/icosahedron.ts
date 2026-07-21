import type { PolyhedronDefinition, Vec3 } from "./types";

const PHI = (1 + Math.sqrt(5)) / 2;
const SCALE = Math.hypot(1, PHI);
const normalize = ([x, y, z]: Vec3): Vec3 => [x / SCALE, y / SCALE, z / SCALE];

export const ICOSAHEDRON: PolyhedronDefinition = {
  id: "icosahedron",
  vertices: (
    [
      [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
      [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
      [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
    ] as Vec3[]
  ).map(normalize),
  faces: [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ],
  edges: [
    [0, 11], [0, 5], [0, 1], [0, 7], [0, 10], [1, 5], [5, 11], [11, 10], [10, 7], [7, 1],
    [1, 9], [5, 4], [11, 2], [10, 6], [7, 8], [3, 9], [3, 4], [3, 2], [3, 6], [3, 8],
    [9, 4], [4, 2], [2, 6], [6, 8], [8, 9], [4, 11], [2, 10], [6, 7], [8, 1], [9, 5],
  ],
  symmetry: { identity: [], rotations3: [], halfTurns: [], inversion: [], reflections: [], rotoreflections: [] },
  symmetryClassOrder: [],
  defaultColor: "#f59e0b",
  underConstruction: true,
};
