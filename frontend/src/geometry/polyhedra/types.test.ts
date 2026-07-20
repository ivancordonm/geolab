import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { matrixForElement } from "./types";

describe("matrixForElement", () => {
  it("axis rotation of 120deg about (1,1,1) has determinant +1", () => {
    const m = matrixForElement({
      kind: "axis",
      point: [0, 0, 0],
      direction: [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
      angle: (2 * Math.PI) / 3,
      label: "r",
    });
    expect(m.determinant()).toBeCloseTo(1, 9);
  });

  it("plane reflection has determinant -1 and is an involution", () => {
    const m = matrixForElement({
      kind: "plane",
      point: [0, 0, 0],
      normal: [0, 1 / Math.sqrt(2), -1 / Math.sqrt(2)],
      label: "m",
    });
    expect(m.determinant()).toBeCloseTo(-1, 9);
    const v = new Vector3(3, 5, 7).applyMatrix4(m).applyMatrix4(m);
    expect(v.distanceTo(new Vector3(3, 5, 7))).toBeLessThan(1e-9);
  });

  it("improper S4 about z has determinant -1", () => {
    const m = matrixForElement({
      kind: "improper",
      point: [0, 0, 0],
      direction: [0, 0, 1],
      angle: Math.PI / 2,
      label: "S4",
    });
    expect(m.determinant()).toBeCloseTo(-1, 9);
  });
});
