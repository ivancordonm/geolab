import type { PolyhedronDefinition, Vec3 } from "./types";

const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;
const SCALE = Math.sqrt(3);
const normalize = ([x, y, z]: Vec3): Vec3 => [x / SCALE, y / SCALE, z / SCALE];

export const DODECAHEDRON: PolyhedronDefinition = {
  id: "dodecahedron",
  name: "Dodecaedro",
  vertices: (
    [
      [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1], [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
      [0, -INV_PHI, -PHI], [0, -INV_PHI, PHI], [0, INV_PHI, -PHI], [0, INV_PHI, PHI],
      [-INV_PHI, -PHI, 0], [-INV_PHI, PHI, 0], [INV_PHI, -PHI, 0], [INV_PHI, PHI, 0],
      [-PHI, 0, -INV_PHI], [PHI, 0, -INV_PHI], [-PHI, 0, INV_PHI], [PHI, 0, INV_PHI],
    ] as Vec3[]
  ).map(normalize),
  faces: [
    [0, 8, 10, 2, 16], [0, 16, 18, 1, 12], [0, 12, 14, 4, 8], [1, 9, 11, 3, 18],
    [1, 12, 14, 5, 9], [2, 10, 6, 15, 13], [2, 13, 3, 18, 16], [3, 11, 7, 15, 13],
    [4, 14, 5, 19, 17], [4, 17, 6, 10, 8], [5, 9, 11, 7, 19], [6, 17, 19, 7, 15],
  ],
  edges: [
    [0, 8], [8, 10], [10, 2], [2, 16], [16, 0], [16, 18], [18, 1], [1, 12], [12, 0], [12, 14],
    [14, 4], [4, 8], [1, 9], [9, 11], [11, 3], [3, 18], [14, 5], [5, 9], [10, 6], [6, 15],
    [15, 13], [13, 2], [13, 3], [11, 7], [7, 15], [5, 19], [19, 17], [17, 4], [17, 6], [7, 19],
  ],
  symmetry: { identity: [], rotations3: [], halfTurns: [], inversion: [], reflections: [], rotoreflections: [] },
  symmetryClassOrder: [],
  defaultColor: "#8b5cf6",
  underConstruction: true,
};
