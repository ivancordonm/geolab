import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import type { PointValue } from "../../types/geometry";
import type { Coordinate } from "../../geometry/viewport";
import { geometryColors } from "../../geometry/colors";
import { ObjectLabel } from "./ObjectLabel";

interface PointViewProps {
  objectId: string;
  label: string;
  value: PointValue;
  screenPoint: Coordinate;
  color?: string;
  free: boolean;
  draggable: boolean;
  selected: boolean;
  labelOffset?: { x: number; y: number };
  onPointerDown: (objectId: string, event: ReactPointerEvent<SVGElement>) => void;
  onKeyboardMove: (objectId: string, x: number, y: number) => void;
  onLabelOffsetChange?: (offsetX: number, offsetY: number) => void;
}

export function PointView({
  objectId,
  label,
  value,
  screenPoint,
  color,
  free,
  draggable,
  selected,
  labelOffset,
  onPointerDown,
  onKeyboardMove,
  onLabelOffsetChange,
}: PointViewProps) {
  const commonProps = {
    className: [
      "geometry-point",
      free ? "geometry-point--free" : "geometry-point--derived",
      selected ? "geometry-object--selected" : "",
    ].filter(Boolean).join(" "),
    style: color ? { fill: color } : undefined,
    tabIndex: 0,
    "aria-label": draggable
      ? `Point ${label} at ${formatCoordinate(value.x)}, ${formatCoordinate(value.y)}. Drag or use arrow keys to move.`
      : `Derived point ${label} at ${formatCoordinate(value.x)}, ${formatCoordinate(value.y)}.`,
    onPointerDown: (event: ReactPointerEvent<SVGElement>) => onPointerDown(objectId, event),
    onKeyDown: draggable
      ? (event: ReactKeyboardEvent<SVGElement>) => {
          const movement = keyboardMovement(event);
          if (movement === null) {
            return;
          }
          event.preventDefault();
          onKeyboardMove(objectId, value.x + movement.x, value.y + movement.y);
        }
      : undefined,
  };

  return (
    <g data-object-id={objectId} data-object-kind="point">
      {free ? (
        <circle {...commonProps} cx={screenPoint.x} cy={screenPoint.y} r={7} />
      ) : (
        <rect
          {...commonProps}
          x={screenPoint.x - 5.5}
          y={screenPoint.y - 5.5}
          width={11}
          height={11}
          rx={1.5}
          transform={`rotate(45 ${screenPoint.x} ${screenPoint.y})`}
        />
      )}
      <ObjectLabel
        x={screenPoint.x + 12}
        y={screenPoint.y - 12}
        label={label}
        color={color ?? geometryColors.point}
        offsetX={labelOffset?.x}
        offsetY={labelOffset?.y}
        onOffsetChange={onLabelOffsetChange}
      />
    </g>
  );
}

function keyboardMovement(event: ReactKeyboardEvent<SVGElement>): Coordinate | null {
  const step = event.shiftKey ? 0.5 : 0.1;
  switch (event.key) {
    case "ArrowLeft":
      return { x: -step, y: 0 };
    case "ArrowRight":
      return { x: step, y: 0 };
    case "ArrowUp":
      return { x: 0, y: step };
    case "ArrowDown":
      return { x: 0, y: -step };
    default:
      return null;
  }
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(2)).toString();
}
