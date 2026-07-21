import type {
  PolyhedronDefinition,
  SymmetryElementAxis,
  SymmetryElementImproper,
  SymmetryElementPlane,
  Vec3,
} from "./types";

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
};

const vertices: Vec3[] = (
  [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ] as Vec3[]
).map(normalize);

const FACE_AXES: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const BODY_AXES: Vec3[] = (
  [
    [1, 1, 1],
    [1, 1, -1],
    [1, -1, 1],
    [-1, 1, 1],
  ] as Vec3[]
).map(normalize);
const EDGE_AXES: Vec3[] = (
  [
    [1, 1, 0],
    [1, -1, 0],
    [1, 0, 1],
    [1, 0, -1],
    [0, 1, 1],
    [0, 1, -1],
  ] as Vec3[]
).map(normalize);

const rotations3: SymmetryElementAxis[] = [
  ...BODY_AXES.flatMap((direction, i) => [
    {
      kind: "axis" as const,
      point: [0, 0, 0] as Vec3,
      direction,
      angle: (2 * Math.PI) / 3,
      label: `C3(${i + 1})+`,
      axisId: `body-axis-${i}`,
      axisDescription: { kind: "bodyDiagonal" as const, ordinal: i + 1 },
      order: 3,
    },
    {
      kind: "axis" as const,
      point: [0, 0, 0] as Vec3,
      direction,
      angle: (-2 * Math.PI) / 3,
      label: `C3(${i + 1})−`,
      axisId: `body-axis-${i}`,
      axisDescription: { kind: "bodyDiagonal" as const, ordinal: i + 1 },
      order: 3,
    },
  ]),
  ...FACE_AXES.flatMap((direction, i) => [
    {
      kind: "axis" as const,
      point: [0, 0, 0] as Vec3,
      direction,
      angle: Math.PI / 2,
      label: `C4(${i + 1})+`,
      axisId: `face-axis-${i}`,
      axisDescription: { kind: "oppositeFaceCenters" as const, ordinal: i + 1 },
      order: 4,
    },
    {
      kind: "axis" as const,
      point: [0, 0, 0] as Vec3,
      direction,
      angle: -Math.PI / 2,
      label: `C4(${i + 1})−`,
      axisId: `face-axis-${i}`,
      axisDescription: { kind: "oppositeFaceCenters" as const, ordinal: i + 1 },
      order: 4,
    },
  ]),
];

const halfTurns: SymmetryElementAxis[] = [
  ...FACE_AXES.map((direction, i) => ({
    kind: "axis" as const,
    point: [0, 0, 0] as Vec3,
    direction,
    angle: Math.PI,
    label: `C2(f${i + 1})`,
    axisId: `half-face-axis-${i}`,
    axisDescription: { kind: "oppositeFaceCenters" as const, ordinal: i + 1 },
    order: 2,
  })),
  ...EDGE_AXES.map((direction, i) => ({
    kind: "axis" as const,
    point: [0, 0, 0] as Vec3,
    direction,
    angle: Math.PI,
    label: `C2(e${i + 1})`,
    axisId: `half-edge-axis-${i}`,
    axisDescription: { kind: "oppositeEdgeMidpoints" as const, ordinal: i + 1 },
    order: 2,
  })),
];

const reflections: SymmetryElementPlane[] = [
  ...FACE_AXES.map((normal, i) => ({
    kind: "plane" as const,
    id: `coordinate-plane-${i}`,
    point: [0, 0, 0] as Vec3,
    normal,
    label: `σ${["x", "y", "z"][i]}`,
  })),
  ...EDGE_AXES.map((normal, i) => ({
    kind: "plane" as const,
    id: `diagonal-plane-${i}`,
    point: [0, 0, 0] as Vec3,
    normal,
    label: `σd(${i + 1})`,
  })),
];

const rotoreflections: SymmetryElementImproper[] = [
  ...FACE_AXES.flatMap((direction, i) => [
    {
      kind: "improper" as const,
      point: [0, 0, 0] as Vec3,
      direction,
      angle: Math.PI / 2,
      label: `S4(${i + 1})+`,
      axisId: `s4-axis-${i}`,
      axisDescription: { kind: "oppositeFaceCenters" as const, ordinal: i + 1 },
      order: 4,
      rotationSense: "positive" as const,
    },
    {
      kind: "improper" as const,
      point: [0, 0, 0] as Vec3,
      direction,
      angle: -Math.PI / 2,
      label: `S4(${i + 1})−`,
      axisId: `s4-axis-${i}`,
      axisDescription: { kind: "oppositeFaceCenters" as const, ordinal: i + 1 },
      order: 4,
      rotationSense: "negative" as const,
    },
  ]),
  ...BODY_AXES.flatMap((direction, i) => [
    {
      kind: "improper" as const,
      point: [0, 0, 0] as Vec3,
      direction,
      angle: Math.PI / 3,
      label: `S6(${i + 1})+`,
      axisId: `s6-axis-${i}`,
      axisDescription: { kind: "bodyDiagonal" as const, ordinal: i + 1 },
      order: 6,
      rotationSense: "positive" as const,
    },
    {
      kind: "improper" as const,
      point: [0, 0, 0] as Vec3,
      direction,
      angle: -Math.PI / 3,
      label: `S6(${i + 1})−`,
      axisId: `s6-axis-${i}`,
      axisDescription: { kind: "bodyDiagonal" as const, ordinal: i + 1 },
      order: 6,
      rotationSense: "negative" as const,
    },
  ]),
];

export const CUBE: PolyhedronDefinition = {
  id: "cube",
  vertices,
  faces: [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ],
  symmetry: {
    identity: [{ kind: "identity", label: "E" }],
    rotations3,
    halfTurns,
    inversion: [{ kind: "inversion", point: [0, 0, 0], label: "i" }],
    reflections,
    rotoreflections,
  },
  symmetryClassOrder: [
    "identity",
    "rotations3",
    "halfTurns",
    "inversion",
    "reflections",
    "rotoreflections",
  ],
  defaultColor: "#3b82f6",
};
