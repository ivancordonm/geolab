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

export function FunctionView({ object, viewport, size, selected, onPointerDown }: FunctionViewProps) {
  const evaluator = compileFunctionExpression(object.definition.expression);
  const bounds = getWorldBounds(viewport, size);
  const points: string[] = [];
  let previousY: number | null = null;

  for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
    const x = bounds.minX + (index / SAMPLE_COUNT) * (bounds.maxX - bounds.minX);
    let y: number;
    try {
      y = evaluator(x);
    } catch {
      previousY = null;
      continue;
    }
    if (!Number.isFinite(y) || Math.abs(y) > 1e6) {
      previousY = null;
      continue;
    }
    const shouldBreak =
      previousY !== null &&
      Math.abs(y - previousY) > (bounds.maxY - bounds.minY) * 0.75;
    const screen = worldToScreen({ x, y }, viewport, size);
    if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) {
      previousY = null;
      continue;
    }
    const command = points.length === 0 || shouldBreak ? "M" : "L";
    points.push(`${command} ${screen.x.toFixed(2)} ${screen.y.toFixed(2)}`);
    previousY = y;
  }

  if (points.length < 2) {
    return null;
  }

  const strokeWidth = object.style?.strokeWidth ?? 2.5;
  return (
    <path
      data-object-id={object.id}
      className={selected ? "geometry-object--selected geometry-function" : "geometry-function"}
      d={points.join(" ")}
      fill="none"
      stroke={object.style?.color}
      strokeWidth={strokeWidth}
      {...dashAttrs(object.style?.strokeDash)}
      onPointerDown={onPointerDown}
    />
  );
}
