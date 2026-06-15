import type { PointerEvent as ReactPointerEvent } from "react";

import type { ArcValue, StrokeDash } from "../../types/geometry";
import type { Coordinate } from "../../geometry/viewport";
import { geometryColors } from "../../geometry/colors";
import { ObjectLabel } from "./ObjectLabel";
import { dashAttrs } from "./dashAttrs";

interface ArcViewProps {
  objectId: string;
  label: string;
  value: ArcValue;
  center: Coordinate;
  start: Coordinate;
  mid: Coordinate;
  end: Coordinate;
  color?: string;
  strokeWidth?: number;
  strokeDash?: StrokeDash;
  selected: boolean;
  labelOffset?: { x: number; y: number };
  onPointerDown: (objectId: string, event: ReactPointerEvent<SVGElement>) => void;
  onLabelOffsetChange?: (offsetX: number, offsetY: number) => void;
}

export function ArcView({
  objectId,
  label,
  value,
  center,
  start,
  mid,
  end,
  color,
  strokeWidth = 2.5,
  strokeDash,
  selected,
  labelOffset,
  onPointerDown,
  onLabelOffsetChange,
}: ArcViewProps) {
  const strokeColor = color ?? geometryColors.circle;
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  const sweepFlag = determineSweepFlag(center, start, mid, end);
  const largeArcFlag = determineLargeArcFlag(center, start, mid, end, sweepFlag);
  const path = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;

  return (
    <g
      data-object-id={objectId}
      data-object-kind="arc"
      className={selected ? "geometry-object--selected" : undefined}
      onPointerDown={(event) => onPointerDown(objectId, event)}
    >
      <path
        className="geometry-hit-target"
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
      />
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        {...dashAttrs(strokeDash)}
        aria-label={`Arc ${label}, radius ${value.radius.toFixed(2)}`}
      />
      <ObjectLabel
        x={mid.x}
        y={mid.y - 12}
        label={label}
        color={strokeColor}
        anchor="middle"
        offsetX={labelOffset?.x}
        offsetY={labelOffset?.y}
        onOffsetChange={onLabelOffsetChange}
      />
    </g>
  );
}

function angle(center: Coordinate, point: Coordinate): number {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

function normalize(angleValue: number): number {
  let result = angleValue % (Math.PI * 2);
  if (result < 0) result += Math.PI * 2;
  return result;
}

function ccwDelta(from: number, to: number): number {
  return normalize(to - from);
}

function determineSweepFlag(
  center: Coordinate,
  start: Coordinate,
  mid: Coordinate,
  end: Coordinate,
): 0 | 1 {
  const startAngle = angle(center, start);
  const midAngle = angle(center, mid);
  const endAngle = angle(center, end);
  const ccwToMid = ccwDelta(startAngle, midAngle);
  const ccwToEnd = ccwDelta(startAngle, endAngle);
  return ccwToMid <= ccwToEnd ? 1 : 0;
}

function determineLargeArcFlag(
  center: Coordinate,
  start: Coordinate,
  mid: Coordinate,
  end: Coordinate,
  sweepFlag: 0 | 1,
): 0 | 1 {
  const startAngle = angle(center, start);
  const midAngle = angle(center, mid);
  const endAngle = angle(center, end);
  const ccwToMid = ccwDelta(startAngle, midAngle);
  const ccwToEnd = ccwDelta(startAngle, endAngle);
  const arcAngle = sweepFlag === 1 ? ccwToEnd : Math.PI * 2 - ccwToEnd;
  const midOnArc = sweepFlag === 1 ? ccwToMid <= ccwToEnd : ccwToMid >= ccwToEnd;
  const finalArc = midOnArc ? arcAngle : Math.PI * 2 - arcAngle;
  return finalArc > Math.PI ? 1 : 0;
}
