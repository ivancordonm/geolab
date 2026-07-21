import type {
  PolyhedronDefinition,
  SymmetryElementAxis,
  SymmetryElementImproper,
  SymmetryElementPlane,
  Vec3,
} from "./types";

const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;
const SCALE = Math.sqrt(3);
const ORIGIN: Vec3 = [0, 0, 0];
const normalize = ([x, y, z]: Vec3): Vec3 => [x / SCALE, y / SCALE, z / SCALE];

const vertices: Vec3[] = (
  [
    [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1], [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
    [0, -INV_PHI, -PHI], [0, -INV_PHI, PHI], [0, INV_PHI, -PHI], [0, INV_PHI, PHI],
    [-INV_PHI, -PHI, 0], [-INV_PHI, PHI, 0], [INV_PHI, -PHI, 0], [INV_PHI, PHI, 0],
    [-PHI, 0, -INV_PHI], [PHI, 0, -INV_PHI], [-PHI, 0, INV_PHI], [PHI, 0, INV_PHI],
  ] as Vec3[]
).map(normalize);

const faces = [
  [0, 8, 10, 2, 16], [0, 16, 18, 1, 12], [0, 12, 14, 4, 8], [1, 9, 11, 3, 18],
  [1, 12, 14, 5, 9], [2, 10, 6, 15, 13], [2, 13, 3, 18, 16], [3, 11, 7, 15, 13],
  [4, 14, 5, 19, 17], [4, 17, 6, 10, 8], [5, 9, 11, 7, 19], [6, 17, 19, 7, 15],
];

const edges = [
  [0, 8], [8, 10], [10, 2], [2, 16], [16, 0], [16, 18], [18, 1], [1, 12], [12, 0], [12, 14],
  [14, 4], [4, 8], [1, 9], [9, 11], [11, 3], [3, 18], [14, 5], [5, 9], [10, 6], [6, 15],
  [15, 13], [13, 2], [13, 3], [11, 7], [7, 15], [5, 19], [19, 17], [17, 4], [17, 6], [7, 19],
] as const;

function unit([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function canonicalDirection(direction: Vec3): Vec3 {
  const normalized = unit(direction);
  const firstNonZero = normalized.find((component) => Math.abs(component) > 1e-8) ?? 1;
  return firstNonZero < 0
    ? [-normalized[0], -normalized[1], -normalized[2]]
    : normalized;
}

function uniqueAxes(directions: readonly Vec3[]): Vec3[] {
  const axes = new Map<string, Vec3>();
  directions.forEach((direction) => {
    const axis = canonicalDirection(direction);
    axes.set(axis.map((component) => component.toFixed(8)).join(","), axis);
  });
  return [...axes.values()];
}

const FACE_AXES = uniqueAxes(faces.map((face) =>
  face.reduce<Vec3>((sum, index) => [
    sum[0] + vertices[index][0], sum[1] + vertices[index][1], sum[2] + vertices[index][2],
  ], [0, 0, 0]),
));
const VERTEX_AXES = uniqueAxes(vertices);
const EDGE_AXES = uniqueAxes(edges.map(([a, b]) => [
  vertices[a][0] + vertices[b][0], vertices[a][1] + vertices[b][1], vertices[a][2] + vertices[b][2],
]));

const rotations3: SymmetryElementAxis[] = [
  ...FACE_AXES.flatMap((direction, i) => [1, 2, -1, -2].map((turn) => ({
    kind: "axis" as const, point: ORIGIN, direction, angle: turn * (2 * Math.PI / 5),
    label: `C5(${i + 1})${turn > 0 ? "+" : "−"}${Math.abs(turn)}`,
    axisId: `face-axis-${i}`, axisDescription: { kind: "oppositeFaceCenters" as const, ordinal: i + 1 }, order: 5,
  }))),
  ...VERTEX_AXES.flatMap((direction, i) => [1, -1].map((turn) => ({
    kind: "axis" as const, point: ORIGIN, direction, angle: turn * (2 * Math.PI / 3),
    label: `C3(${i + 1})${turn > 0 ? "+" : "−"}`,
    axisId: `vertex-axis-${i}`, axisDescription: { kind: "oppositeVertices" as const, ordinal: i + 1 }, order: 3,
  }))),
];

const halfTurns: SymmetryElementAxis[] = EDGE_AXES.map((direction, i) => ({
  kind: "axis", point: ORIGIN, direction, angle: Math.PI, label: `C2(${i + 1})`,
  axisId: `edge-axis-${i}`, axisDescription: { kind: "oppositeEdgeMidpoints", ordinal: i + 1 }, order: 2,
}));

const reflections: SymmetryElementPlane[] = EDGE_AXES.map((normal, i) => ({
  kind: "plane", id: `edge-plane-${i}`, point: ORIGIN, normal, label: `σ(${i + 1})`,
}));

const rotoreflections: SymmetryElementImproper[] = [
  ...FACE_AXES.flatMap((direction, i) => [-3, 3, -1, 1].map((turn) => ({
    kind: "improper" as const, point: ORIGIN, direction, angle: turn * (Math.PI / 5),
    label: `S10(${i + 1})${turn > 0 ? "+" : "−"}${Math.abs(turn)}`,
    axisId: `face-axis-${i}`, axisDescription: { kind: "oppositeFaceCenters" as const, ordinal: i + 1 }, order: 10,
    rotationSense: turn > 0 ? "positive" as const : "negative" as const,
  }))),
  ...VERTEX_AXES.flatMap((direction, i) => [1, -1].map((turn) => ({
    kind: "improper" as const, point: ORIGIN, direction, angle: turn * (Math.PI / 3),
    label: `S6(${i + 1})${turn > 0 ? "+" : "−"}`,
    axisId: `vertex-axis-${i}`, axisDescription: { kind: "oppositeVertices" as const, ordinal: i + 1 }, order: 6,
    rotationSense: turn > 0 ? "positive" as const : "negative" as const,
  }))),
];

export const DODECAHEDRON: PolyhedronDefinition = {
  id: "dodecahedron",
  vertices,
  faces,
  edges,
  symmetry: {
    identity: [{ kind: "identity", label: "E" }],
    rotations3,
    halfTurns,
    inversion: [{ kind: "inversion", point: ORIGIN, label: "i" }],
    reflections,
    rotoreflections,
  },
  symmetryClassOrder: ["identity", "rotations3", "halfTurns", "inversion", "reflections", "rotoreflections"],
  defaultColor: "#8b5cf6",
};
