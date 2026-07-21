import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { DODECAHEDRON } from "./dodecahedron";
import { axisCount, filterRotationsBySubtype, matrixForElement, type SymmetryElement } from "./types";

const EPS = 1e-8;

function allElements(): SymmetryElement[] {
  const s = DODECAHEDRON.symmetry;
  return [...s.identity, ...s.rotations3, ...s.halfTurns, ...s.inversion, ...s.reflections, ...s.rotoreflections];
}

function permutesVertices(matrix: Matrix4): boolean {
  const vertices = DODECAHEDRON.vertices.map((vertex) => new Vector3(...vertex));
  return vertices.every((vertex) => vertices.some((candidate) =>
    vertex.clone().applyMatrix4(matrix).distanceTo(candidate) < EPS,
  ));
}

describe("DODECAHEDRON definition", () => {
  it("has its complete geometry at unit circumradius", () => {
    expect(DODECAHEDRON.vertices).toHaveLength(20);
    expect(DODECAHEDRON.faces).toHaveLength(12);
    expect(DODECAHEDRON.edges).toHaveLength(30);
    DODECAHEDRON.vertices.forEach((vertex) =>
      expect(new Vector3(...vertex).length()).toBeCloseTo(1, 9),
    );
  });

  it("lists the 120 elements of Ih in the requested classes", () => {
    const s = DODECAHEDRON.symmetry;
    expect(s.identity).toHaveLength(1);
    expect(s.rotations3).toHaveLength(44);
    expect(s.halfTurns).toHaveLength(15);
    expect(s.inversion).toHaveLength(1);
    expect(s.reflections).toHaveLength(15);
    expect(s.rotoreflections).toHaveLength(44);
    expect(axisCount(s.rotations3.filter((element) => element.order === 5))).toBe(6);
    expect(axisCount(s.rotations3.filter((element) => element.order === 3))).toBe(10);
    expect(axisCount(s.halfTurns)).toBe(15);
    expect(filterRotationsBySubtype(s.rotations3, "c3")).toHaveLength(20);
    expect(filterRotationsBySubtype(s.rotations3, "c5")).toHaveLength(24);
    expect(allElements()).toHaveLength(120);
  });

  it("every listed symmetry permutes the dodecahedron vertices", () => {
    allElements().forEach((element) =>
      expect(permutesVertices(matrixForElement(element))).toBe(true),
    );
  });

  it("has the expected determinant sign for every class", () => {
    const s = DODECAHEDRON.symmetry;
    [...s.identity, ...s.rotations3, ...s.halfTurns].forEach((element) =>
      expect(matrixForElement(element).determinant()).toBeCloseTo(1, 9),
    );
    [...s.inversion, ...s.reflections, ...s.rotoreflections].forEach((element) =>
      expect(matrixForElement(element).determinant()).toBeCloseTo(-1, 9),
    );
  });

  it("generates a group of exactly 120 transformations", () => {
    const key = (matrix: Matrix4) => matrix.elements
      .map((value) => (Math.abs(value) < EPS ? 0 : value).toFixed(6)).join(",");
    const group = new Map<string, Matrix4>([[key(new Matrix4()), new Matrix4()]]);
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
    expect(group.size).toBe(120);
  });
});
