import type { PointerEvent as ReactPointerEvent } from "react";

import type { LineValue, StrokeDash } from "../../types/geometry";
import type { Coordinate } from "../../geometry/viewport";
import { geometryColors } from "../../geometry/colors";
import { ObjectLabel } from "./ObjectLabel";
import { dashAttrs } from "./dashAttrs";

interface LineViewProps {
  objectId: string;
  label: string;
  value: LineValue;
  screenStart: Coordinate;
  screenEnd: Coordinate;
  color?: string;
  strokeWidth?: number;
  strokeDash?: StrokeDash;
  selected: boolean;
  labelOffset?: { x: number; y: number };
  onPointerDown: (objectId: string, event: ReactPointerEvent<SVGElement>) => void;
  onLabelOffsetChange?: (offsetX: number, offsetY: number) => void;
}

export function LineView({
  objectId,
  label,
  value,
  screenStart,
  screenEnd,
  color,
  strokeWidth = 2,
  strokeDash,
  selected,
  labelOffset,
  onPointerDown,
  onLabelOffsetChange,
}: LineViewProps) {
  const labelX = screenStart.x + (screenEnd.x - screenStart.x) * 0.18;
  const labelY = screenStart.y + (screenEnd.y - screenStart.y) * 0.18;

  return (
    <g
      data-object-id={objectId}
      data-object-kind="line"
      className={selected ? "geometry-object--selected" : undefined}
      onPointerDown={(event) => onPointerDown(objectId, event)}
    >
      <line
        className="geometry-hit-target"
        x1={screenStart.x}
        y1={screenStart.y}
        x2={screenEnd.x}
        y2={screenEnd.y}
        stroke="transparent"
        strokeWidth={16}
      />
      <line
        className="geometry-line"
        x1={screenStart.x}
        y1={screenStart.y}
        x2={screenEnd.x}
        y2={screenEnd.y}
        style={color ? { stroke: color } : undefined}
        strokeWidth={strokeWidth}
        {...dashAttrs(strokeDash)}
        aria-label={`Line ${label}: ${formatLine(value)}`}
      />
      <ObjectLabel
        x={labelX + 8}
        y={labelY - 8}
        label={label}
        color={color ?? geometryColors.line}
        offsetX={labelOffset?.x}
        offsetY={labelOffset?.y}
        onOffsetChange={onLabelOffsetChange}
      />
    </g>
  );
}

function formatLine(value: LineValue): string {
  return `${value.a.toFixed(2)}x + ${value.b.toFixed(2)}y + ${value.c.toFixed(2)} = 0`;
}
