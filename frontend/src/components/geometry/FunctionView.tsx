import type { PointerEvent as ReactPointerEvent } from "react";

import { compileFunctionExpression } from "../../geometry/functionExpression";
import { getWorldBounds, worldToScreen } from "../../geometry/viewport";
import type { CanvasSize, WorldBounds } from "../../geometry/viewport";
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
const INTERMEDIATE_SAMPLE_RATIOS = [0.25, 0.5, 0.75] as const;

export function buildFunctionPathData(
  object: FunctionGraph,
  viewport: GeometryViewport,
  size: CanvasSize,
): string | null {
  const evaluator = compileFunctionExpression(object.definition.expression);
  const bounds = getWorldBounds(viewport, size);
  const points: string[] = [];
  let previousSample: { x: number; y: number } | null = null;

  for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
    const x = bounds.minX + (index / SAMPLE_COUNT) * (bounds.maxX - bounds.minX);
    const y = sampleFunctionY(evaluator, x);
    if (y === null) {
      previousSample = null;
      continue;
    }

    const shouldBreak =
      previousSample !== null &&
      (Math.abs(y - previousSample.y) > (bounds.maxY - bounds.minY) * 0.75 ||
        hasSegmentDiscontinuity(previousSample, { x, y }, evaluator, bounds));

    const screen = worldToScreen({ x, y }, viewport, size);
    if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) {
      previousSample = null;
      continue;
    }

    const command = points.length === 0 || shouldBreak ? "M" : "L";
    points.push(`${command} ${screen.x.toFixed(2)} ${screen.y.toFixed(2)}`);
    previousSample = { x, y };
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

function hasSegmentDiscontinuity(
  previousSample: { x: number; y: number },
  nextSample: { x: number; y: number },
  evaluator: (x: number) => number,
  bounds: WorldBounds,
): boolean {
  const visibleYRange = bounds.maxY - bounds.minY;
  const endpointMagnitude = Math.max(
    Math.abs(previousSample.y),
    Math.abs(nextSample.y),
    visibleYRange,
  );

  if (
    previousSample.y * nextSample.y < 0 &&
    Math.abs(previousSample.y) > visibleYRange &&
    Math.abs(nextSample.y) > visibleYRange
  ) {
    return true;
  }

  for (const ratio of INTERMEDIATE_SAMPLE_RATIOS) {
    const x = previousSample.x + (nextSample.x - previousSample.x) * ratio;
    const y = sampleFunctionY(evaluator, x);
    if (y === null) {
      return true;
    }
    if (Math.abs(y) > endpointMagnitude * 4) {
      return true;
    }
  }

  return false;
}
