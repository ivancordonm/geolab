import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { axisCount, axisKeyForElement, axisOrdinal, matrixForElement, wrapReflectionIndex } from "./types";

describe("wrapReflectionIndex", () => {
  it("wraps previous from the first reflection to the last", () => {
    expect(wrapReflectionIndex(0, -1, 6)).toBe(5);
  });

  it("wraps next from the last reflection to the first", () => {
    expect(wrapReflectionIndex(5, 1, 6)).toBe(0);
  });

  it("wraps rotation and half-turn selections with their own family totals", () => {
    expect(wrapReflectionIndex(0, -1, 8)).toBe(7);
    expect(wrapReflectionIndex(2, 1, 3)).toBe(0);
  });
});

describe("axis grouping", () => {
  it("uses one physical-axis key for opposite directions", () => {
    expect(axisKeyForElement({ direction: [1, 2, 3] })).toBe(
      axisKeyForElement({ direction: [-1, -2, -3] }),
    );
  });

  it("prefers an explicit axis id and counts each physical axis once", () => {
    const axes = [
      { direction: [1, 0, 0] as const, axisId: "x" },
      { direction: [-1, 0, 0] as const, axisId: "x" },
      { direction: [0, 1, 0] as const, axisId: "y" },
    ];
    expect(axisCount(axes)).toBe(2);
    expect(axisOrdinal(axes, 1)).toBe(1);
    expect(axisOrdinal(axes, 2)).toBe(2);
  });
});

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
