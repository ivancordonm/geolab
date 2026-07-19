import type { PointerEvent as ReactPointerEvent } from "react";

import type { CircleValue, StrokeDash } from "../../types/geometry";
import type { Coordinate } from "../../geometry/viewport";
import { geometryColors } from "../../geometry/colors";
import { ObjectLabel } from "./ObjectLabel";
import { dashAttrs } from "./dashAttrs";

interface CircleViewProps {
  objectId: string;
  label: string;
  value: CircleValue;
  center: Coordinate;
  radius: number;
  screenLineApproximation?: { start: Coordinate; end: Coordinate } | null;
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
  screenLineApproximation,
  color,
  strokeWidth = 2,
  strokeDash,
  selected,
  labelOffset,
  onPointerDown,
  onLabelOffsetChange,
}: CircleViewProps) {
  const labelPoint = screenLineApproximation === null || screenLineApproximation === undefined
    ? { x: center.x + radius * 0.72 + 8, y: center.y - radius * 0.72 - 5 }
    : {
        x: screenLineApproximation.start.x +
          (screenLineApproximation.end.x - screenLineApproximation.start.x) * 0.18 + 8,
        y: screenLineApproximation.start.y +
          (screenLineApproximation.end.y - screenLineApproximation.start.y) * 0.18 - 8,
      };
  const shapeProps = screenLineApproximation === null || screenLineApproximation === undefined
    ? { cx: center.x, cy: center.y, r: radius }
    : {
        x1: screenLineApproximation.start.x,
        y1: screenLineApproximation.start.y,
        x2: screenLineApproximation.end.x,
        y2: screenLineApproximation.end.y,
      };
  const Shape = screenLineApproximation === null || screenLineApproximation === undefined ? "circle" : "line";

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
        fill={Shape === "circle" ? "none" : undefined}
        stroke="transparent"
        strokeWidth={16}
      />
      <Shape
        className="geometry-circle"
        {...shapeProps}
        fill={Shape === "circle" ? "none" : undefined}
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
