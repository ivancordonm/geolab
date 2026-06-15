import type { PointerEvent as ReactPointerEvent } from "react";

import type { CircleValue } from "../../types/geometry";
import type { Coordinate } from "../../geometry/viewport";
import { geometryColors } from "../../geometry/colors";
import { ObjectLabel } from "./ObjectLabel";

interface CircleViewProps {
  objectId: string;
  label: string;
  value: CircleValue;
  center: Coordinate;
  radius: number;
  color?: string;
  strokeWidth?: number;
  dashed?: boolean;
  selected: boolean;
  labelOffset?: { x: number; y: number };
  onPointerDown: (objectId: string, event: ReactPointerEvent<SVGElement>) => void;
  onLabelOffsetChange?: (offsetX: number, offsetY: number) => void;
}

export function CircleView({
  objectId,
  label,
  value,
  center,
  radius,
  color,
  strokeWidth = 2,
  dashed = false,
  selected,
  labelOffset,
  onPointerDown,
  onLabelOffsetChange,
}: CircleViewProps) {
  return (
    <g
      data-object-id={objectId}
      data-object-kind="circle"
      className={selected ? "geometry-object--selected" : undefined}
      onPointerDown={(event) => onPointerDown(objectId, event)}
    >
      <circle
        className="geometry-hit-target"
        cx={center.x}
        cy={center.y}
        r={radius}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
      />
      <circle
        className="geometry-circle"
        cx={center.x}
        cy={center.y}
        r={radius}
        fill="none"
        style={color ? { stroke: color } : undefined}
        strokeWidth={strokeWidth}
        strokeDasharray={dashed ? "10 8" : undefined}
        aria-label={`Circle ${label}, radius ${value.radius.toFixed(2)}`}
      />
      <ObjectLabel
        x={center.x + radius * 0.72 + 8}
        y={center.y - radius * 0.72 - 5}
        label={label}
        color={color ?? geometryColors.circle}
        offsetX={labelOffset?.x}
        offsetY={labelOffset?.y}
        onOffsetChange={onLabelOffsetChange}
      />
    </g>
  );
}
