import { describe, expect, it } from "vitest";
import { Vector3, Matrix4 } from "three";
import { TETRAHEDRON } from "./tetrahedron";
import { matrixForElement, type SymmetryElement } from "./types";

const EPS = 1e-9;

function allElements(): SymmetryElement[] {
  const s = TETRAHEDRON.symmetry;
  return [...s.rotations3, ...s.halfTurns, ...s.reflections, ...s.rotoreflections];
}

function vertexVectors(): Vector3[] {
  return TETRAHEDRON.vertices.map((v) => new Vector3(v[0], v[1], v[2]));
}

function permutesVertices(m: Matrix4): boolean {
  const verts = vertexVectors();
  return verts.every((v) => {
    const mapped = v.clone().applyMatrix4(m);
    return verts.some((w) => mapped.distanceTo(w) < EPS);
  });
}

describe("TETRAHEDRON definition", () => {
  it("has 4 vertices, 4 faces, 6 edges, all unit length", () => {
    expect(TETRAHEDRON.vertices).toHaveLength(4);
    expect(TETRAHEDRON.faces).toHaveLength(4);
    expect(TETRAHEDRON.edges).toHaveLength(6);
    for (const v of vertexVectors()) expect(v.length()).toBeCloseTo(1, 9);
  });

  it("lists 8+3+6+6 = 23 non-identity elements", () => {
    expect(TETRAHEDRON.symmetry.rotations3).toHaveLength(8);
    expect(TETRAHEDRON.symmetry.halfTurns).toHaveLength(3);
    expect(TETRAHEDRON.symmetry.halfTurns.map((element) => element.axisId)).toEqual([
      "half-turn-axis-0",
      "half-turn-axis-1",
      "half-turn-axis-2",
    ]);
    expect(TETRAHEDRON.symmetry.halfTurns.map((element) => element.axisDescription)).toEqual([
      { kind: "tetrahedronOppositeEdgeMidpoints", pair: "AB_CD" },
      { kind: "tetrahedronOppositeEdgeMidpoints", pair: "AC_BD" },
      { kind: "tetrahedronOppositeEdgeMidpoints", pair: "AD_BC" },
    ]);
    expect(TETRAHEDRON.symmetry.reflections).toHaveLength(6);
    expect(TETRAHEDRON.symmetry.rotoreflections).toHaveLength(6);
    expect(allElements()).toHaveLength(23);
  });

  it("describes each reflection with its fixed edge and swapped vertices", () => {
    const reflections = TETRAHEDRON.symmetry.reflections;
    expect(reflections[0]).toMatchObject({
      kind: "plane",
      id: "reflection-AB",
      containedEdges: ["AB"],
      fixedVertices: ["A", "B"],
      swappedVertices: [["C", "D"]],
      permutationLabel: "(C D)",
    });
    expect(reflections[5]).toMatchObject({
      kind: "plane",
      id: "reflection-CD",
      containedEdges: ["CD"],
      fixedVertices: ["C", "D"],
      swappedVertices: [["A", "B"]],
      permutationLabel: "(A B)",
    });
  });

  it("every symmetry element permutes the vertex set", () => {
    for (const el of allElements()) {
      expect(permutesVertices(matrixForElement(el))).toBe(true);
    }
  });

  it("determinant signs: rotations +1, reflections/rotoreflections -1", () => {
    for (const el of TETRAHEDRON.symmetry.rotations3)
      expect(matrixForElement(el).determinant()).toBeCloseTo(1, 9);
    for (const el of TETRAHEDRON.symmetry.halfTurns)
      expect(matrixForElement(el).determinant()).toBeCloseTo(1, 9);
    for (const el of TETRAHEDRON.symmetry.reflections)
      expect(matrixForElement(el).determinant()).toBeCloseTo(-1, 9);
    for (const el of TETRAHEDRON.symmetry.rotoreflections)
      expect(matrixForElement(el).determinant()).toBeCloseTo(-1, 9);
  });

  it("the group generated (with identity) has exactly 24 elements", () => {
    const key = (m: Matrix4): string =>
      m.elements.map((x) => (Math.abs(x) < EPS ? 0 : x).toFixed(6)).join(",");
    const identity = new Matrix4();
    const group = new Map<string, Matrix4>([[key(identity), identity]]);
    const gens = allElements().map(matrixForElement);
    let changed = true;
    while (changed) {
      changed = false;
      for (const g of [...group.values()]) {
        for (const h of gens) {
          const p = new Matrix4().multiplyMatrices(g, h);
          const k = key(p);
          if (!group.has(k)) {
            group.set(k, p);
            changed = true;
          }
        }
      }
    }
    expect(group.size).toBe(24);
  });
});
