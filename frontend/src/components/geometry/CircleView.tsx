import type { PointerEvent as ReactPointerEvent } from "react";

import type { CircleValue, StrokeDash } from "../../types/geometry";
import type { CirclePolyline, Coordinate } from "../../geometry/viewport";
import { geometryColors } from "../../geometry/colors";
import { ObjectLabel } from "./ObjectLabel";
import { dashAttrs } from "./dashAttrs";

interface CircleViewProps {
  objectId: string;
  label: string;
  value: CircleValue;
  center: Coordinate;
  radius: number;
  screenPolylineApproximation?: CirclePolyline | null;
  color?: string;
  strokeWidth?: number;
  strokeDash?: StrokeDash;
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
  screenPolylineApproximation,
  color,
  strokeWidth = 2,
  strokeDash,
  selected,
  labelOffset,
  onPointerDown,
  onLabelOffsetChange,
}: CircleViewProps) {
  const approximationPoints = screenPolylineApproximation?.points;
  const isApproximated = approximationPoints !== undefined && approximationPoints.length >= 2;
  const labelPoint = !isApproximated
    ? { x: center.x + radius * 0.72 + 8, y: center.y - radius * 0.72 - 5 }
    : getPolylineLabelPoint(approximationPoints);
  const shapeProps = !isApproximated
    ? { cx: center.x, cy: center.y, r: radius }
    : { points: approximationPoints.map((point) => `${point.x},${point.y}`).join(" ") };
  const Shape = isApproximated ? "polyline" : "circle";

  return (
    <g
      data-object-id={objectId}
      data-object-kind="circle"
      className={selected ? "geometry-object--selected" : undefined}
      onPointerDown={(event) => onPointerDown(objectId, event)}
    >
      <Shape
        className="geometry-hit-target"
        {...shapeProps}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
      />
      <Shape
        className="geometry-circle"
        {...shapeProps}
        fill="none"
        style={color ? { stroke: color } : undefined}
        strokeWidth={strokeWidth}
        {...dashAttrs(strokeDash)}
        aria-label={`Circle ${label}, radius ${value.radius.toFixed(2)}`}
      />
      <ObjectLabel
        x={labelPoint.x}
        y={labelPoint.y}
        label={label}
        color={color ?? geometryColors.circle}
        offsetX={labelOffset?.x}
        offsetY={labelOffset?.y}
        onOffsetChange={onLabelOffsetChange}
      />
    </g>
  );
}

function getPolylineLabelPoint(points: Coordinate[]): Coordinate {
  const position = (points.length - 1) * 0.18;
  const startIndex = Math.floor(position);
  const endIndex = Math.min(points.length - 1, startIndex + 1);
  const fraction = position - startIndex;
  return {
    x: points[startIndex].x + (points[endIndex].x - points[startIndex].x) * fraction + 8,
    y: points[startIndex].y + (points[endIndex].y - points[startIndex].y) * fraction - 8,
  };
}
