import { describe, expect, it } from "vitest";
import { axisIndicesToRender } from "../../geometry/polyhedra/types";
import { reflectionIndicesToRender, rotoreflectionAxisIndicesToRender } from "./SymmetryOverlay";

describe("reflectionIndicesToRender", () => {
  it("renders only the selected reflection in individual mode", () => {
    expect(reflectionIndicesToRender(6, 2, "individual", false)).toEqual([2]);
  });

  it("renders reflections through the selection in cumulative mode", () => {
    expect(reflectionIndicesToRender(6, 2, "cumulative", false)).toEqual([0, 1, 2]);
  });

  it("renders every reflection in all mode or when references are enabled", () => {
    expect(reflectionIndicesToRender(6, 2, "all", false)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(reflectionIndicesToRender(6, 2, "individual", true)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("axis selection", () => {
  const rotations = [
    { kind: "axis" as const, point: [0, 0, 0] as const, direction: [1, 0, 0] as const, angle: 1, label: "+x" },
    { kind: "axis" as const, point: [0, 0, 0] as const, direction: [-1, 0, 0] as const, angle: -1, label: "-x" },
    { kind: "axis" as const, point: [0, 0, 0] as const, direction: [0, 1, 0] as const, angle: 1, label: "+y" },
    { kind: "axis" as const, point: [0, 0, 0] as const, direction: [0, 0, 1] as const, angle: 1, label: "+z" },
  ];

  it("renders only the selected transformation when references are disabled", () => {
    expect(axisIndicesToRender(rotations, 1, false)).toEqual([1]);
  });

  it("keeps the selected transformation and one reference per physical axis", () => {
    expect(axisIndicesToRender(rotations, 1, true)).toEqual([1, 2, 3]);
  });

  it("uses the same canonical grouping for rotorreflections", () => {
    const impropers = rotations.map((rotation) => ({ ...rotation, kind: "improper" as const }));
    expect(rotoreflectionAxisIndicesToRender(impropers, 0, true)).toEqual([0, 2, 3]);
  });
});
