import { describe, expect, it } from "vitest";
import { reflectionIndicesToRender } from "./SymmetryOverlay";

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
