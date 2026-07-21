import { Matrix4, Vector3 } from "three";
import type { ConstructionTool } from "../constructionTools";

export type Vec3 = readonly [number, number, number];

export type SymmetryClass =
  | "identity"
  | "rotations3"
  | "halfTurns"
  | "inversion"
  | "reflections"
  | "rotoreflections";

export type ReflectionDisplayMode = "individual" | "cumulative" | "all";

export type RotationSubtype = "c3" | "c4";

export type SymmetryAxisDescription =
  | { kind: "bodyDiagonal"; ordinal: number }
  | { kind: "oppositeFaceCenters"; ordinal: number }
  | { kind: "oppositeVertices"; ordinal: number }
  | { kind: "oppositeEdgeMidpoints"; ordinal: number }
  | { kind: "tetrahedronOppositeEdgeMidpoints"; pair: "AB_CD" | "AC_BD" | "AD_BC" }
  | { kind: "generic"; ordinal: number };

export interface SymmetryElementAxis {
  kind: "axis";
  point: Vec3;
  direction: Vec3;
  angle: number;
  label: string;
  /** Order of the rotation represented by this element. */
  order?: number;
  /** Identifies a physical axis shared by multiple transformations, when known. */
  axisId?: string;
  /** Language-neutral geometry used to create the visible axis description. */
  axisDescription?: SymmetryAxisDescription;
}

export interface SymmetryElementPlane {
  kind: "plane";
  id?: string;
  point: Vec3;
  normal: Vec3;
  label: string;
  fixedVertices?: string[];
  swappedVertices?: [string, string][];
  containedEdges?: string[];
  permutationLabel?: string;
}

export interface SymmetryElementImproper {
  kind: "improper";
  point: Vec3;
  direction: Vec3;
  angle: number;
  label: string;
  axisId?: string;
  axisDescription?: SymmetryAxisDescription;
  order?: number;
  rotationSense?: "positive" | "negative";
}

export interface SymmetryElementIdentity {
  kind: "identity";
  label: string;
}

export interface SymmetryElementInversion {
  kind: "inversion";
  point: Vec3;
  label: string;
}

export type SymmetryElement =
  | SymmetryElementAxis
  | SymmetryElementPlane
  | SymmetryElementImproper
  | SymmetryElementIdentity
  | SymmetryElementInversion;

export interface PolyhedronDefinition {
  id: string;
  vertices: Vec3[];
  faces: number[][];
  edges: readonly (readonly [number, number])[];
  symmetry: {
    identity: SymmetryElementIdentity[];
    rotations3: SymmetryElementAxis[];
    halfTurns: SymmetryElementAxis[];
    inversion: SymmetryElementInversion[];
    reflections: SymmetryElementPlane[];
    rotoreflections: SymmetryElementImproper[];
  };
  /** Classes to expose in this polyhedron's study menu. */
  symmetryClassOrder: readonly SymmetryClass[];
  defaultColor: string;
  /** Temporary mesh-only entry while its symmetry study is being prepared. */
  underConstruction?: boolean;
}

export function wrapReflectionIndex(
  currentIndex: number,
  delta: -1 | 1,
  count: number,
): number {
  if (count <= 0) return 0;
  return (currentIndex + delta + count) % count;
}

type AxisBearingElement = Pick<SymmetryElementAxis, "direction" | "axisId"> | Pick<SymmetryElementImproper, "direction" | "axisId">;

/**
 * Returns a stable physical-axis key. Opposite direction vectors describe the
 * same geometric line, so their sign is canonicalised when no data id exists.
 */
export function axisKeyForElement(element: AxisBearingElement): string {
  if (element.axisId) return element.axisId;

  const direction = new Vector3(...element.direction).normalize();
  const components = [direction.x, direction.y, direction.z];
  const firstNonZero = components.find((component) => Math.abs(component) > 1e-8) ?? 1;
  const sign = firstNonZero < 0 ? -1 : 1;
  return components.map((component) => (component * sign).toFixed(4)).join(",");
}

export function axisCount(elements: readonly AxisBearingElement[]): number {
  return new Set(elements.map(axisKeyForElement)).size;
}

export function axisOrdinal(
  elements: readonly AxisBearingElement[],
  selectedIndex: number,
): number {
  if (elements.length === 0) return 0;
  const selected = Math.min(Math.max(selectedIndex, 0), elements.length - 1);
  const selectedKey = axisKeyForElement(elements[selected]);
  return [...new Set(elements.map(axisKeyForElement))].indexOf(selectedKey) + 1;
}

/**
 * Keeps the selected transformation and, optionally, one representative of
 * every other physical axis. This prevents +θ and −θ from duplicating an axis.
 */
export function axisIndicesToRender(
  elements: readonly AxisBearingElement[],
  selectedIndex: number,
  showOthers: boolean,
): number[] {
  if (elements.length === 0) return [];
  const selected = Math.min(Math.max(selectedIndex, 0), elements.length - 1);
  if (!showOthers) return [selected];

  const selectedAxisKey = axisKeyForElement(elements[selected]);
  const seen = new Set<string>([selectedAxisKey]);
  const references: number[] = [];
  elements.forEach((element, index) => {
    const key = axisKeyForElement(element);
    if (key !== selectedAxisKey && !seen.has(key)) {
      seen.add(key);
      references.push(index);
    }
  });
  return [selected, ...references];
}

// Reflection (Householder) as a 4x4 linear matrix: I - 2 n n^T.
function reflectionMatrix(normal: Vec3): Matrix4 {
  const n = new Vector3(normal[0], normal[1], normal[2]).normalize();
  // prettier-ignore
  return new Matrix4().set(
    1 - 2 * n.x * n.x, -2 * n.x * n.y,     -2 * n.x * n.z,     0,
    -2 * n.x * n.y,     1 - 2 * n.y * n.y, -2 * n.y * n.z,     0,
    -2 * n.x * n.z,    -2 * n.y * n.z,      1 - 2 * n.z * n.z, 0,
    0,                  0,                  0,                  1,
  );
}

function rotationMatrix(direction: Vec3, angle: number): Matrix4 {
  const axis = new Vector3(direction[0], direction[1], direction[2]).normalize();
  return new Matrix4().makeRotationAxis(axis, angle);
}

// Linear 3x3 matrix (as Matrix4) for a symmetry element, centered at origin.
export function matrixForElement(element: SymmetryElement): Matrix4 {
  switch (element.kind) {
    case "identity":
      return new Matrix4();
    case "axis":
      return rotationMatrix(element.direction, element.angle);
    case "plane":
      return reflectionMatrix(element.normal);
    case "improper": {
      // Rotate about the axis, then reflect in the plane perpendicular to it.
      const rot = rotationMatrix(element.direction, element.angle);
      const mirror = reflectionMatrix(element.direction);
      return mirror.multiply(rot);
    }
    case "inversion":
      // Central inversion sends every vector v to −v.
      return new Matrix4().makeScale(-1, -1, -1);
  }
}

export function filterRotationsBySubtype(
  rotations: readonly SymmetryElementAxis[],
  subtype: RotationSubtype,
): SymmetryElementAxis[] {
  if (subtype === "c4") {
    return rotations.filter((el) => el.order === 4);
  }
  return rotations.filter((el) => el.order === 3 || el.order === undefined);
}

export type { ConstructionTool };

