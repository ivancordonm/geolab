import type {
  PolyhedronDefinition,
  SymmetryElementAxis,
  SymmetryElementImproper,
  SymmetryElementPlane,
  Vec3,
} from "./types";

const PHI = (1 + Math.sqrt(5)) / 2;
const SCALE = Math.hypot(1, PHI);
const ORIGIN: Vec3 = [0, 0, 0];
const normalize = ([x, y, z]: Vec3): Vec3 => [x / SCALE, y / SCALE, z / SCALE];

const vertices: Vec3[] = (
  [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ] as Vec3[]
).map(normalize);

const faces = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

const edges = [
  [0, 11], [0, 5], [0, 1], [0, 7], [0, 10], [1, 5], [5, 11], [11, 10], [10, 7], [7, 1],
  [1, 9], [5, 4], [11, 2], [10, 6], [7, 8], [3, 9], [3, 4], [3, 2], [3, 6], [3, 8],
  [9, 4], [4, 2], [2, 6], [6, 8], [8, 9], [4, 11], [2, 10], [6, 7], [8, 1], [9, 5],
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
  ...FACE_AXES.flatMap((direction, i) => [1, -1].map((turn) => ({
    kind: "axis" as const, point: ORIGIN, direction, angle: turn * (2 * Math.PI / 3),
    label: `C3(${i + 1})${turn > 0 ? "+" : "−"}`,
    axisId: `face-axis-${i}`, axisDescription: { kind: "oppositeFaceCenters" as const, ordinal: i + 1 }, order: 3,
  }))),
  ...VERTEX_AXES.flatMap((direction, i) => [1, 2, -1, -2].map((turn) => ({
    kind: "axis" as const, point: ORIGIN, direction, angle: turn * (2 * Math.PI / 5),
    label: `C5(${i + 1})${turn > 0 ? "+" : "−"}${Math.abs(turn)}`,
    axisId: `vertex-axis-${i}`, axisDescription: { kind: "oppositeVertices" as const, ordinal: i + 1 }, order: 5,
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
  ...FACE_AXES.flatMap((direction, i) => [1, -1].map((turn) => ({
    kind: "improper" as const, point: ORIGIN, direction, angle: turn * (Math.PI / 3),
    label: `S6(${i + 1})${turn > 0 ? "+" : "−"}`,
    axisId: `face-axis-${i}`, axisDescription: { kind: "oppositeFaceCenters" as const, ordinal: i + 1 }, order: 6,
    rotationSense: turn > 0 ? "positive" as const : "negative" as const,
  }))),
  ...VERTEX_AXES.flatMap((direction, i) => [-3, 3, -1, 1].map((turn) => ({
    kind: "improper" as const, point: ORIGIN, direction, angle: turn * (Math.PI / 5),
    label: `S10(${i + 1})${turn > 0 ? "+" : "−"}${Math.abs(turn)}`,
    axisId: `vertex-axis-${i}`, axisDescription: { kind: "oppositeVertices" as const, ordinal: i + 1 }, order: 10,
    rotationSense: turn > 0 ? "positive" as const : "negative" as const,
  }))),
];

export const ICOSAHEDRON: PolyhedronDefinition = {
  id: "icosahedron",
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
  defaultColor: "#f59e0b",
};
