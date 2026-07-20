import { Matrix4, Vector3 } from "three";
import type { ConstructionTool } from "../constructionTools";

export type Vec3 = readonly [number, number, number];

export type SymmetryClass =
  | "rotations3"
  | "halfTurns"
  | "reflections"
  | "rotoreflections";

export interface SymmetryElementAxis {
  kind: "axis";
  point: Vec3;
  direction: Vec3;
  angle: number;
  label: string;
}

export interface SymmetryElementPlane {
  kind: "plane";
  point: Vec3;
  normal: Vec3;
  label: string;
}

export interface SymmetryElementImproper {
  kind: "improper";
  point: Vec3;
  direction: Vec3;
  angle: number;
  label: string;
}

export type SymmetryElement =
  | SymmetryElementAxis
  | SymmetryElementPlane
  | SymmetryElementImproper;

export interface PolyhedronDefinition {
  id: string;
  name: string;
  vertices: Vec3[];
  faces: number[][];
  edges: readonly (readonly [number, number])[];
  symmetry: Record<SymmetryClass, SymmetryElement[]>;
  defaultColor: string;
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
  }
}

export type { ConstructionTool };
