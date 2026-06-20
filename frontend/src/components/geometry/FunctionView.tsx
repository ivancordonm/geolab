import type { PointerEvent as ReactPointerEvent } from "react";

import { compileFunctionExpression } from "../../geometry/functionExpression";
import { getWorldBounds, worldToScreen } from "../../geometry/viewport";
import type { CanvasSize } from "../../geometry/viewport";
import type { FunctionGraph, GeometryViewport } from "../../types/geometry";
import { dashAttrs } from "./dashAttrs";

interface FunctionViewProps {
  object: FunctionGraph;
  viewport: GeometryViewport;
  size: CanvasSize;
  selected: boolean;
  onPointerDown?: (event: ReactPointerEvent<SVGPathElement>) => void;
}

const SAMPLE_COUNT = 240;
const MAX_ABS_Y = 1e6;
// Depth needed: step ≈ 0.04 at lowest zoom (scale 60); to reach |y| > MAX_ABS_Y
// near a pole (e.g. 1/x), we need the interval < 1e-6, so ~16 halvings minimum.
// 20 gives comfortable headroom. At most 20 evaluations per suspicious segment.
const BISECTION_MAX_DEPTH = 20;

export function buildFunctionPathData(
  object: FunctionGraph,
  viewport: GeometryViewport,
  size: CanvasSize,
): string | null {
  const evaluator = compileFunctionExpression(object.definition.expression);
  const bounds = getWorldBounds(viewport, size);
  const points: string[] = [];
  // previousSample / previousScreen are null when the last valid point is unknown
  // (start of path, after a null sample, or after an off-screen point).
  let previousSample: { x: number; y: number } | null = null;
  let previousScreen: { x: number; y: number } | null = null;

  for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
    const x = bounds.minX + (index / SAMPLE_COUNT) * (bounds.maxX - bounds.minX);
    const y = sampleFunctionY(evaluator, x);
    if (y === null) {
      previousSample = null;
      previousScreen = null;
      continue;
    }

    const screen = worldToScreen({ x, y }, viewport, size);
    if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) {
      previousSample = null;
      previousScreen = null;
      continue;
    }

    // Three cases for the path command to emit:
    //
    // 1. First point, or previous sample was null/off-screen → "M" (start new sub-path).
    // 2. Previous sample valid, but the segment between them contains a pole → break and extend.
    // 3. Normal connected sample → "L".
    //
    // Case 1: gap from null domain or off-screen.
    if (points.length === 0 || previousSample === null) {
      points.push(`M ${screen.x.toFixed(2)} ${screen.y.toFixed(2)}`);
      previousSample = { x, y };
      previousScreen = screen;
      continue;
    }

    // Case 2: check for a pole between two valid consecutive samples.
    // Gate: only bisect when the screen-space jump exceeds one canvas height
    // (poles produce huge screen jumps; smooth steep curves stay bounded).
    const suspicious =
      previousScreen !== null &&
      Math.abs(screen.y - previousScreen.y) > size.height;

    if (suspicious && segmentHasPole(previousSample, { x, y }, evaluator)) {
      // Extend previous branch toward the pole (so it visually reaches the edge).
      const approachPrev = bisectTowardPole(previousSample, { x, y }, evaluator, viewport, size);
      for (const pt of approachPrev) {
        points.push(`L ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`);
      }

      // Start new sub-path: extend current branch back toward the pole from this side.
      const approachNext = bisectTowardPole({ x, y }, previousSample, evaluator, viewport, size);
      // approachNext is ordered toward the pole; reverse to order from edge toward sample.
      const reversed = approachNext.slice().reverse();
      const startPt = reversed[0] ?? screen;
      points.push(`M ${startPt.x.toFixed(2)} ${startPt.y.toFixed(2)}`);
      for (let i = 1; i < reversed.length; i++) {
        points.push(`L ${reversed[i]!.x.toFixed(2)} ${reversed[i]!.y.toFixed(2)}`);
      }
      points.push(`L ${screen.x.toFixed(2)} ${screen.y.toFixed(2)}`);
    } else {
      // Case 3: normal connected sample.
      points.push(`L ${screen.x.toFixed(2)} ${screen.y.toFixed(2)}`);
    }

    previousSample = { x, y };
    previousScreen = screen;
  }

  return points.length < 2 ? null : points.join(" ");
}

export function FunctionView({ object, viewport, size, selected, onPointerDown }: FunctionViewProps) {
  const pathData = buildFunctionPathData(object, viewport, size);
  if (pathData === null) {
    return null;
  }

  const strokeWidth = object.style?.strokeWidth ?? 2.5;
  return (
    <path
      data-object-id={object.id}
      className={selected ? "geometry-object--selected geometry-function" : "geometry-function"}
      d={pathData}
      fill="none"
      stroke={object.style?.color}
      strokeWidth={strokeWidth}
      {...dashAttrs(object.style?.strokeDash)}
      onPointerDown={onPointerDown}
    />
  );
}

function sampleFunctionY(evaluator: (x: number) => number, x: number): number | null {
  try {
    const y = evaluator(x);
    if (!Number.isFinite(y) || Math.abs(y) > MAX_ABS_Y) {
      return null;
    }
    return y;
  } catch {
    return null;
  }
}

/**
 * Viewport-independent pole detector using bisection.
 * Returns true when the segment [prev, next] contains a vertical asymptote.
 *
 * Strategy:
 * - SIGN-CHANGE segment (prev.y and next.y have opposite signs): always recurse
 *   into the half that contains the sign change.  We do NOT early-exit on bounded
 *   magnitude because both a zero crossing (y=x) and a pole (1/x) look similar at
 *   first; the only definitive distinguisher is reaching a null sample (non-finite y).
 *   With depth=20 we narrow the interval to ~1e-6 of the original step, which is
 *   small enough to hit the pole singularity.
 *
 * - SAME-SIGN segment (e.g. 1/x²): always recurse toward the endpoint with larger
 *   |y| (closer to the pole).  A finite hump reaches depth=0 without producing null;
 *   a pole diverges to null before depth is exhausted.
 *
 * This handles sign-changing poles (1/x, tan), same-sign poles (1/x²), and
 * correctly passes through zero crossings (y=x, x³) and steep-but-continuous curves.
 */
function segmentHasPole(
  prev: { x: number; y: number },
  next: { x: number; y: number },
  evaluator: (x: number) => number,
  depth = BISECTION_MAX_DEPTH,
): boolean {
  const xm = (prev.x + next.x) / 2;
  const ym = sampleFunctionY(evaluator, xm);

  // A null midpoint (non-finite or |y| > MAX_ABS_Y) confirms a pole.
  if (ym === null) return true;

  // Depth exhausted without finding null → treat as continuous (zero crossing or finite hump).
  if (depth === 0) return false;

  // Sign-change segment: recurse into whichever half contains the sign change.
  // No bounded-magnitude early-exit here — we need enough halvings to detect null.
  if (prev.y * ym < 0) {
    return segmentHasPole(prev, { x: xm, y: ym }, evaluator, depth - 1);
  }
  if (ym * next.y < 0) {
    return segmentHasPole({ x: xm, y: ym }, next, evaluator, depth - 1);
  }

  // Same-sign segment: recurse toward the endpoint with larger |y| (nearer the pole).
  // A finite hump stays bounded and returns false at depth=0; a pole diverges to null.
  if (Math.abs(prev.y) >= Math.abs(next.y)) {
    return segmentHasPole(prev, { x: xm, y: ym }, evaluator, depth - 1);
  }
  return segmentHasPole({ x: xm, y: ym }, next, evaluator, depth - 1);
}

/**
 * Walk bisection steps from `start` toward the pole (located between `start`
 * and `other`) and collect screen-space points, so each branch visually reaches
 * the canvas edge.  Returns points in order from `start` toward the pole.
 */
function bisectTowardPole(
  start: { x: number; y: number },
  other: { x: number; y: number },
  evaluator: (x: number) => number,
  viewport: GeometryViewport,
  size: CanvasSize,
): Array<{ x: number; y: number }> {
  const result: Array<{ x: number; y: number }> = [];
  // We walk from `start` toward the pole. The pole is on the `other` side, so
  // we keep `a = start` and shrink `b` toward the midpoint as long as |y| grows.
  let a = start;
  let b = other;

  for (let d = 0; d < BISECTION_MAX_DEPTH; d++) {
    const xm = (a.x + b.x) / 2;
    const ym = sampleFunctionY(evaluator, xm);
    if (ym === null) break; // reached the pole region

    const sc = worldToScreen({ x: xm, y: ym }, viewport, size);
    if (!Number.isFinite(sc.x) || !Number.isFinite(sc.y)) break;

    result.push(sc);

    // Move toward the pole: the side with larger |y| is nearer the pole.
    if (Math.abs(ym) > Math.abs(a.y)) {
      // midpoint is closer to pole than `a` — narrow toward midpoint from `a` side
      a = { x: xm, y: ym };
    } else {
      b = { x: xm, y: ym };
    }
  }
  return result;
}
