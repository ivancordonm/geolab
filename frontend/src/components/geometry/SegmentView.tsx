import type { PointerEvent as ReactPointerEvent } from "react";

import type { Coordinate } from "../../geometry/viewport";
import { geometryColors } from "../../geometry/colors";
import { ObjectLabel } from "./ObjectLabel";

interface SegmentViewProps {
  objectId: string;
  label: string;
  start: Coordinate;
  end: Coordinate;
  color?: string;
  strokeWidth?: number;
  selected: boolean;
  labelOffset?: { x: number; y: number };
  onPointerDown: (objectId: string, event: ReactPointerEvent<SVGElement>) => void;
  onLabelOffsetChange?: (offsetX: number, offsetY: number) => void;
}

export function SegmentView({
  objectId,
  label,
  start,
  end,
  color,
  strokeWidth = 3,
  selected,
  labelOffset,
  onPointerDown,
  onLabelOffsetChange,
}: SegmentViewProps) {
  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;
  return (
    <g
      data-object-id={objectId}
      data-object-kind="segment"
      className={selected ? "geometry-object--selected" : undefined}
      onPointerDown={(event) => onPointerDown(objectId, event)}
    >
      <line
        className="geometry-hit-target"
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke="transparent"
        strokeWidth={16}
      />
      <line
        className="geometry-segment"
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        style={color ? { stroke: color } : undefined}
        strokeWidth={strokeWidth}
        aria-label={`Segment ${label}`}
      />
      <ObjectLabel
        x={centerX}
        y={centerY - 12}
        label={label}
        color={color ?? geometryColors.segment}
        anchor="middle"
        offsetX={labelOffset?.x}
        offsetY={labelOffset?.y}
        onOffsetChange={onLabelOffsetChange}
      />
    </g>
  );
}
