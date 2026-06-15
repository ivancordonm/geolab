import type { PointerEvent as ReactPointerEvent } from "react";

import type { PolygonValue, StrokeDash } from "../../types/geometry";
import type { Coordinate } from "../../geometry/viewport";
import { geometryColors } from "../../geometry/colors";
import { ObjectLabel } from "./ObjectLabel";
import { dashAttrs } from "./dashAttrs";

interface PolygonViewProps {
  objectId: string;
  label: string;
  value: PolygonValue;
  screenVertices: Coordinate[];
  color?: string;
  strokeWidth?: number;
  strokeDash?: StrokeDash;
  selected: boolean;
  labelOffset?: { x: number; y: number };
  onPointerDown: (objectId: string, event: ReactPointerEvent<SVGElement>) => void;
  onLabelOffsetChange?: (offsetX: number, offsetY: number) => void;
}

export function PolygonView({
  objectId,
  label,
  screenVertices,
  color,
  strokeWidth = 2.5,
  strokeDash,
  selected,
  labelOffset,
  onPointerDown,
  onLabelOffsetChange,
}: PolygonViewProps) {
  if (screenVertices.length < 2) return null;

  const points = screenVertices.map((v) => `${v.x},${v.y}`).join(" ");
  const strokeColor = color ?? geometryColors.polygon;

  // Centroid for label placement.
  const cx = screenVertices.reduce((s, v) => s + v.x, 0) / screenVertices.length;
  const cy = screenVertices.reduce((s, v) => s + v.y, 0) / screenVertices.length;

  return (
    <g
      data-object-id={objectId}
      data-object-kind="polygon"
      className={selected ? "geometry-object--selected" : undefined}
      onPointerDown={(event) => onPointerDown(objectId, event)}
    >
      {/* Transparent hit-target so the interior is clickable */}
      <polygon
        className="geometry-hit-target"
        points={points}
        fill="transparent"
        stroke="transparent"
        strokeWidth={16}
      />
      <polygon
        className="geometry-polygon"
        points={points}
        fill={strokeColor}
        fillOpacity={0.12}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        style={color ? { fill: color, stroke: color } : undefined}
        {...dashAttrs(strokeDash)}
        aria-label={`Polygon ${label}`}
      />
      <ObjectLabel
        x={cx}
        y={cy}
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
