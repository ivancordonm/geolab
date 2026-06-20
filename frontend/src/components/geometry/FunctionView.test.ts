import { describe, expect, it } from "vitest";

import type { FunctionGraph, GeometryViewport } from "../../types/geometry";
import type { CanvasSize } from "../../geometry/viewport";
import { buildFunctionPathData } from "./FunctionView";

const viewport: GeometryViewport = { centerX: 0, centerY: 0, scale: 100 };
const size: CanvasSize = { width: 600, height: 600 };

function makeFunction(expression: string): FunctionGraph {
  return {
    id: "f",
    label: "f",
    kind: "function",
    visible: true,
    definition: { type: "function_expression", expression },
  };
}

function moveCount(pathData: string | null): number {
  return pathData?.match(/M/g)?.length ?? 0;
}

describe("buildFunctionPathData", () => {
  it("keeps a continuous curve in a single path segment", () => {
    const pathData = buildFunctionPathData(makeFunction("x^2"), viewport, size);

    expect(pathData).not.toBeNull();
    expect(moveCount(pathData)).toBe(1);
  });

  it("breaks the path across a vertical asymptote", () => {
    const pathData = buildFunctionPathData(makeFunction("1/x"), viewport, size);

    expect(pathData).not.toBeNull();
    expect(moveCount(pathData)).toBeGreaterThan(1);
  });
});
