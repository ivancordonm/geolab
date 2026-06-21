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

/**
 * Returns true if the path contains a segment that connects a point above the
 * top edge (screen.y < 0) directly to a point below the bottom edge
 * (screen.y > canvasHeight) — the signature of the "connecting line" bug across
 * a vertical asymptote.
 */
function hasVerticalCrossing(pathData: string | null, canvasHeight: number): boolean {
  if (!pathData) return false;
  // Parse tokens: each command is "M x y" or "L x y"
  const tokens = pathData.trim().split(/\s+/);
  const cmds: { cmd: string; y: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "M" || t === "L") {
      const y = parseFloat(tokens[i + 2] ?? "0");
      cmds.push({ cmd: t, y });
      i += 2;
    }
  }
  for (let i = 1; i < cmds.length; i++) {
    const prev = cmds[i - 1]!;
    const cur = cmds[i]!;
    if (cur.cmd !== "L") continue;
    const prevAbove = prev.y < 0;
    const prevBelow = prev.y > canvasHeight;
    const curAbove = cur.y < 0;
    const curBelow = cur.y > canvasHeight;
    if ((prevAbove && curBelow) || (prevBelow && curAbove)) return true;
  }
  return false;
}

describe("buildFunctionPathData", () => {
  it("keeps a continuous curve in a single path segment", () => {
    const pathData = buildFunctionPathData(makeFunction("x^2"), viewport, size);

    expect(pathData).not.toBeNull();
    expect(moveCount(pathData)).toBe(1);
  });

  it("breaks the path across a vertical asymptote (pole on sample grid)", () => {
    const pathData = buildFunctionPathData(makeFunction("1/x"), viewport, size);

    expect(pathData).not.toBeNull();
    expect(moveCount(pathData)).toBeGreaterThan(1);
  });

  it("breaks 1/x with pole off the sample grid (off-center viewport)", () => {
    // centerX: 0.37 means no sample lands exactly on x=0; bisection must catch it
    const offCenter: GeometryViewport = { centerX: 0.37, centerY: 0, scale: 100 };
    const pathData = buildFunctionPathData(makeFunction("1/x"), offCenter, size);

    expect(pathData).not.toBeNull();
    expect(moveCount(pathData)).toBeGreaterThan(1);
  });

  it("breaks 1/x when zoomed in with pole off the sample grid", () => {
    const zoomed: GeometryViewport = { centerX: 0.05, centerY: 0, scale: 180 };
    const pathData = buildFunctionPathData(makeFunction("1/x"), zoomed, size);

    expect(pathData).not.toBeNull();
    expect(moveCount(pathData)).toBeGreaterThan(1);
  });

  it("breaks 1/(x-5) with pole displaced from origin", () => {
    const shifted: GeometryViewport = { centerX: 5, centerY: 0, scale: 100 };
    const pathData = buildFunctionPathData(makeFunction("1/(x-5)"), shifted, size);

    expect(pathData).not.toBeNull();
    expect(moveCount(pathData)).toBeGreaterThan(1);
  });

  it("breaks 1/x^2 — same-sign pole (no sign change across asymptote)", () => {
    const pathData = buildFunctionPathData(makeFunction("1/x^2"), viewport, size);

    expect(pathData).not.toBeNull();
    expect(moveCount(pathData)).toBeGreaterThan(1);
  });

  it("breaks 1/x^2 with pole off the sample grid", () => {
    const offCenter: GeometryViewport = { centerX: 0.37, centerY: 0, scale: 100 };
    const pathData = buildFunctionPathData(makeFunction("1/x^2"), offCenter, size);

    expect(pathData).not.toBeNull();
    expect(moveCount(pathData)).toBeGreaterThan(1);
  });

  it("breaks tan(x) at multiple poles within view", () => {
    // scale: 60 makes the view wide enough to include -π/2 and π/2
    const wide: GeometryViewport = { centerX: 0, centerY: 0, scale: 60 };
    const pathData = buildFunctionPathData(makeFunction("tan(x)"), wide, size);

    expect(pathData).not.toBeNull();
    expect(moveCount(pathData)).toBeGreaterThanOrEqual(3);
  });

  it("does NOT break y = x (continuous zero crossing)", () => {
    const pathData = buildFunctionPathData(makeFunction("x"), viewport, size);

    expect(pathData).not.toBeNull();
    expect(moveCount(pathData)).toBe(1);
  });

  it("does NOT break steep continuous curve 100*x when zoomed", () => {
    const zoomed: GeometryViewport = { centerX: 0, centerY: 0, scale: 180 };
    const pathData = buildFunctionPathData(makeFunction("100*x"), zoomed, size);

    expect(pathData).not.toBeNull();
    expect(moveCount(pathData)).toBe(1);
  });

  it("does NOT break x^3 (steep continuous, crosses zero)", () => {
    const zoomed: GeometryViewport = { centerX: 0, centerY: 0, scale: 180 };
    const pathData = buildFunctionPathData(makeFunction("x^3"), zoomed, size);

    expect(pathData).not.toBeNull();
    expect(moveCount(pathData)).toBe(1);
  });

  it("handles sqrt(x) domain — returns non-null path for x > 0 half", () => {
    // viewport shows both sides; only x > 0 has valid samples
    const pathData = buildFunctionPathData(makeFunction("sqrt(x)"), viewport, size);

    expect(pathData).not.toBeNull();
  });

  // ─── No "connecting line" across the asymptote ────────────────────────────
  // hasVerticalCrossing detects the specific artifact: a single "L" segment
  // joining a point above the top edge to one below the bottom edge.

  it("1/x centered: no vertical crossing line across the asymptote", () => {
    const pathData = buildFunctionPathData(makeFunction("1/x"), viewport, size);
    expect(hasVerticalCrossing(pathData, size.height)).toBe(false);
  });

  it("1/x off-center: no vertical crossing line", () => {
    const offCenter: GeometryViewport = { centerX: 0.37, centerY: 0, scale: 100 };
    const pathData = buildFunctionPathData(makeFunction("1/x"), offCenter, size);
    expect(hasVerticalCrossing(pathData, size.height)).toBe(false);
  });

  it("1/x zoomed in: no vertical crossing line", () => {
    const zoomed: GeometryViewport = { centerX: 0.05, centerY: 0, scale: 180 };
    const pathData = buildFunctionPathData(makeFunction("1/x"), zoomed, size);
    expect(hasVerticalCrossing(pathData, size.height)).toBe(false);
  });

  it("1/x zoomed out (wide view as in screenshot): no vertical crossing line", () => {
    const wide: GeometryViewport = { centerX: 5, centerY: 0, scale: 30 };
    const pathData = buildFunctionPathData(makeFunction("1/x"), wide, size);
    expect(hasVerticalCrossing(pathData, size.height)).toBe(false);
  });

  it("1/(x-5): no vertical crossing line", () => {
    const shifted: GeometryViewport = { centerX: 5, centerY: 0, scale: 100 };
    const pathData = buildFunctionPathData(makeFunction("1/(x-5)"), shifted, size);
    expect(hasVerticalCrossing(pathData, size.height)).toBe(false);
  });

  it("1/x^2 same-sign pole: no vertical crossing line", () => {
    const pathData = buildFunctionPathData(makeFunction("1/x^2"), viewport, size);
    expect(hasVerticalCrossing(pathData, size.height)).toBe(false);
  });

  it("tan(x): no vertical crossing line across any pole", () => {
    const wide: GeometryViewport = { centerX: 0, centerY: 0, scale: 60 };
    const pathData = buildFunctionPathData(makeFunction("tan(x)"), wide, size);
    expect(hasVerticalCrossing(pathData, size.height)).toBe(false);
  });
});
