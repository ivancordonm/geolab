import { Matrix4, Vector3 } from "three";
import { matrixForElement, type SymmetryElement, type Vec3 } from "./types";

function toVec3(v: Vector3): Vec3 {
  return [v.x, v.y, v.z];
}

// Returns vertex positions at the given animation progress in [0,1].
// Proper rotations animate as a real rotation; improper transforms
// (reflections, rotoreflections) animate by linear vertex interpolation.
export function transformedVertices(
  vertices: Vec3[],
  element: SymmetryElement,
  progress: number,
): Vec3[] {
  const t = Math.min(1, Math.max(0, progress));
  if (element.kind === "axis") {
    const axis = new Vector3(
      element.direction[0],
      element.direction[1],
      element.direction[2],
    ).normalize();
    const m = new Matrix4().makeRotationAxis(axis, element.angle * t);
    return vertices.map((v) => toVec3(new Vector3(...v).applyMatrix4(m)));
  }
  const m = matrixForElement(element);
  return vertices.map((v) => {
    const start = new Vector3(...v);
    const end = start.clone().applyMatrix4(m);
    return toVec3(start.lerp(end, t));
  });
}
