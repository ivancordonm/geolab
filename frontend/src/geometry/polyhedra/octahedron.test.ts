import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { OCTAHEDRON } from "./octahedron";
import { matrixForElement, type SymmetryElement } from "./types";

const EPS = 1e-8;

function allElements(): SymmetryElement[] {
  const s = OCTAHEDRON.symmetry;
  return [
    ...s.identity,
    ...s.rotations3,
    ...s.halfTurns,
    ...s.inversion,
    ...s.reflections,
    ...s.rotoreflections,
  ];
}

function permutesVertices(matrix: Matrix4): boolean {
  const vertices = OCTAHEDRON.vertices.map((vertex) => new Vector3(...vertex));
  return vertices.every((vertex) =>
    vertices.some(
      (candidate) =>
        vertex.clone().applyMatrix4(matrix).distanceTo(candidate) < EPS
    )
  );
}

describe("OCTAHEDRON definition", () => {
  it("has its complete geometry at unit circumradius", () => {
    expect(OCTAHEDRON.vertices).toHaveLength(6);
    expect(OCTAHEDRON.faces).toHaveLength(8);
    expect(OCTAHEDRON.edges).toHaveLength(12);
    OCTAHEDRON.vertices.forEach((vertex) =>
      expect(new Vector3(...vertex).length()).toBeCloseTo(1, 9)
    );
  });

  it("lists the 48 elements of Oh in the requested classes", () => {
    const s = OCTAHEDRON.symmetry;
    expect(s.identity).toHaveLength(1);
    expect(s.rotations3).toHaveLength(14);
    expect(s.halfTurns).toHaveLength(9);
    expect(s.inversion).toHaveLength(1);
    expect(s.reflections).toHaveLength(9);
    expect(s.rotoreflections).toHaveLength(14);
    expect(allElements()).toHaveLength(48);
  });

  it("every listed symmetry permutes the octahedron vertices", () => {
    allElements().forEach((element) =>
      expect(permutesVertices(matrixForElement(element))).toBe(true)
    );
  });

  it("has the expected determinant sign for every class", () => {
    const s = OCTAHEDRON.symmetry;
    [...s.identity, ...s.rotations3, ...s.halfTurns].forEach((element) =>
      expect(matrixForElement(element).determinant()).toBeCloseTo(1, 9)
    );
    [...s.inversion, ...s.reflections, ...s.rotoreflections].forEach(
      (element) =>
        expect(matrixForElement(element).determinant()).toBeCloseTo(-1, 9)
    );
  });

  it("generates a group of exactly 48 transformations", () => {
    const key = (matrix: Matrix4) =>
      matrix.elements
        .map((value) => (Math.abs(value) < EPS ? 0 : value).toFixed(6))
        .join(",");
    const group = new Map<string, Matrix4>([
      [key(new Matrix4()), new Matrix4()],
    ]);
    const generators = allElements().map(matrixForElement);
    let changed = true;
    while (changed) {
      changed = false;
      for (const left of [...group.values()]) {
        for (const right of generators) {
          const product = new Matrix4().multiplyMatrices(left, right);
          if (!group.has(key(product))) {
            group.set(key(product), product);
            changed = true;
          }
        }
      }
    }
    expect(group.size).toBe(48);
  });
});
