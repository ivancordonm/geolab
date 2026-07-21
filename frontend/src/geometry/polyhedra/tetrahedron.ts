import type {
  PolyhedronDefinition,
  SymmetryElementAxis,
  SymmetryElementImproper,
  SymmetryElementPlane,
  Vec3,
} from "./types";

const RAW: Vec3[] = [
  [1, 1, 1],
  [1, -1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
];

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

const V: Vec3[] = RAW.map(normalize);

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

const rotations3: SymmetryElementAxis[] = V.flatMap((dir, i) => [
  { kind: "axis", point: [0, 0, 0], direction: dir, angle: (2 * Math.PI) / 3, label: `C3(${i})+` },
  { kind: "axis", point: [0, 0, 0], direction: dir, angle: (-2 * Math.PI) / 3, label: `C3(${i})-` },
]);

const AXES: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

const HALF_TURN_PAIRS = ["AB_CD", "AC_BD", "AD_BC"] as const;

const halfTurns: SymmetryElementAxis[] = AXES.map((dir, i) => ({
  kind: "axis",
  point: [0, 0, 0],
  direction: dir,
  angle: Math.PI,
  label: `C2(${i})`,
  axisId: `half-turn-axis-${i}`,
  axisDescription: { kind: "tetrahedronOppositeEdgeMidpoints", pair: HALF_TURN_PAIRS[i] },
  order: 2,
}));

const PAIRS: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

const reflections: SymmetryElementPlane[] = PAIRS.map(([a, b], i) => ({
  kind: "plane",
  id: `reflection-${String.fromCharCode(65 + a)}${String.fromCharCode(65 + b)}`,
  point: [0, 0, 0],
  normal: normalize(cross(V[a], V[b])),
  label: `σ(${i})`,
  fixedVertices: [a, b].map((vertex) => String.fromCharCode(65 + vertex)),
  swappedVertices: [
    PAIRS[PAIRS.length - 1 - i].map((vertex) =>
      String.fromCharCode(65 + vertex),
    ) as [string, string],
  ],
  containedEdges: [
    `${String.fromCharCode(65 + a)}${String.fromCharCode(65 + b)}`,
  ],
  permutationLabel: `(${PAIRS[PAIRS.length - 1 - i]
    .map((vertex) => String.fromCharCode(65 + vertex))
    .join(" ")})`,
}));

const rotoreflections: SymmetryElementImproper[] = AXES.flatMap((dir, i) => [
  { kind: "improper", point: [0, 0, 0], direction: dir, angle: Math.PI / 2, label: `S4(${i})+`, axisId: `axis-${i}`, axisDescription: { kind: "generic", ordinal: i + 1 }, order: 4, rotationSense: "positive" },
  { kind: "improper", point: [0, 0, 0], direction: dir, angle: -Math.PI / 2, label: `S4(${i})-`, axisId: `axis-${i}`, axisDescription: { kind: "generic", ordinal: i + 1 }, order: 4, rotationSense: "negative" },
]);

export const TETRAHEDRON: PolyhedronDefinition = {
  id: "tetrahedron",
  vertices: V,
  faces: [
    [0, 1, 2],
    [0, 3, 1],
    [0, 2, 3],
    [1, 3, 2],
  ],
  edges: [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ],
  symmetry: { identity: [{ kind: "identity", label: "E" }], rotations3, halfTurns, inversion: [], reflections, rotoreflections },
  symmetryClassOrder: ["identity", "rotations3", "halfTurns", "reflections", "rotoreflections"],
  defaultColor: "#3b82f6",
};
