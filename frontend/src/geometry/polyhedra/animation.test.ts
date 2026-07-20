import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { transformedVertices } from "./animation";
import { TETRAHEDRON } from "./tetrahedron";
import { matrixForElement, type Vec3 } from "./types";

function close(a: Vec3, b: Vec3): boolean {
  return new Vector3(...a).distanceTo(new Vector3(...b)) < 1e-9;
}

describe("transformedVertices", () => {
  it("progress 0 returns the original vertices", () => {
    const el = TETRAHEDRON.symmetry.reflections[0];
    const out = transformedVertices(TETRAHEDRON.vertices, el, 0);
    out.forEach((v, i) => expect(close(v, TETRAHEDRON.vertices[i])).toBe(true));
  });

  it("progress 1 maps each vertex to matrixForElement image", () => {
    const el = TETRAHEDRON.symmetry.reflections[0];
    const m = matrixForElement(el);
    const out = transformedVertices(TETRAHEDRON.vertices, el, 1);
    out.forEach((v, i) => {
      const expected = new Vector3(...TETRAHEDRON.vertices[i]).applyMatrix4(m);
      expect(new Vector3(...v).distanceTo(expected)).toBeLessThan(1e-9);
    });
  });

  it("rotation at progress 1 lands on a permuted vertex (still on unit sphere)", () => {
    const el = TETRAHEDRON.symmetry.rotations3[0];
    const out = transformedVertices(TETRAHEDRON.vertices, el, 1);
    out.forEach((v) => expect(new Vector3(...v).length()).toBeCloseTo(1, 9));
  });
});
