import type {
  PolyhedronDefinition,
  SymmetryElementAxis,
  SymmetryElementImproper,
  SymmetryElementPlane,
  Vec3,
} from "./types";

const FACE_AXES: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const BODY_AXES: Vec3[] = [
  [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
  [1 / Math.sqrt(3), 1 / Math.sqrt(3), -1 / Math.sqrt(3)],
  [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)],
  [-1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
];
const EDGE_AXES: Vec3[] = [
  [1 / Math.sqrt(2), 1 / Math.sqrt(2), 0],
  [1 / Math.sqrt(2), -1 / Math.sqrt(2), 0],
  [1 / Math.sqrt(2), 0, 1 / Math.sqrt(2)],
  [1 / Math.sqrt(2), 0, -1 / Math.sqrt(2)],
  [0, 1 / Math.sqrt(2), 1 / Math.sqrt(2)],
  [0, 1 / Math.sqrt(2), -1 / Math.sqrt(2)],
];

const rotations3: SymmetryElementAxis[] = [
  ...BODY_AXES.flatMap((direction, i) => [
    {
      kind: "axis" as const,
      point: [0, 0, 0] as Vec3,
      direction,
      angle: (2 * Math.PI) / 3,
      label: `C3(${i + 1})+`,
      axisId: `face-centre-axis-${i}`,
      axisLabel: `Centros de caras opuestas ${i + 1}`,
      order: 3,
    },
    {
      kind: "axis" as const,
      point: [0, 0, 0] as Vec3,
      direction,
      angle: (-2 * Math.PI) / 3,
      label: `C3(${i + 1})−`,
      axisId: `face-centre-axis-${i}`,
      axisLabel: `Centros de caras opuestas ${i + 1}`,
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
      axisId: `vertex-axis-${i}`,
      axisLabel: `Vértices opuestos ${i + 1}`,
      order: 4,
    },
    {
      kind: "axis" as const,
      point: [0, 0, 0] as Vec3,
      direction,
      angle: -Math.PI / 2,
      label: `C4(${i + 1})−`,
      axisId: `vertex-axis-${i}`,
      axisLabel: `Vértices opuestos ${i + 1}`,
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
    label: `C2(v${i + 1})`,
    axisId: `half-vertex-axis-${i}`,
    axisLabel: `Vértices opuestos ${i + 1}`,
    order: 2,
  })),
  ...EDGE_AXES.map((direction, i) => ({
    kind: "axis" as const,
    point: [0, 0, 0] as Vec3,
    direction,
    angle: Math.PI,
    label: `C2(e${i + 1})`,
    axisId: `half-edge-axis-${i}`,
    axisLabel: `Puntos medios de aristas opuestas ${i + 1}`,
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
      axisId: `s4-vertex-axis-${i}`,
      axisLabel: `Vértices opuestos ${i + 1}`,
      order: 4,
      rotationSense: "positive" as const,
    },
    {
      kind: "improper" as const,
      point: [0, 0, 0] as Vec3,
      direction,
      angle: -Math.PI / 2,
      label: `S4(${i + 1})−`,
      axisId: `s4-vertex-axis-${i}`,
      axisLabel: `Vértices opuestos ${i + 1}`,
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
      axisId: `s6-face-centre-axis-${i}`,
      axisLabel: `Centros de caras opuestas ${i + 1}`,
      order: 6,
      rotationSense: "positive" as const,
    },
    {
      kind: "improper" as const,
      point: [0, 0, 0] as Vec3,
      direction,
      angle: -Math.PI / 3,
      label: `S6(${i + 1})−`,
      axisId: `s6-face-centre-axis-${i}`,
      axisLabel: `Centros de caras opuestas ${i + 1}`,
      order: 6,
      rotationSense: "negative" as const,
    },
  ]),
];

export const OCTAHEDRON: PolyhedronDefinition = {
  id: "octahedron",
  name: "Octaedro",
  vertices: [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ],
  faces: [
    [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
    [0, 5, 2], [2, 5, 1], [1, 5, 3], [3, 5, 0],
  ],
  edges: [
    [0, 2], [0, 3], [0, 4], [0, 5],
    [1, 2], [1, 3], [1, 4], [1, 5],
    [2, 4], [2, 5], [3, 4], [3, 5],
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
    "identity", "rotations3", "halfTurns", "inversion", "reflections", "rotoreflections",
  ],
  symmetryLabels: {
    rotations3: "Rotaciones (C3 y C4)",
    inversion: "Simetría central",
  },
  defaultColor: "#3b82f6",
};
