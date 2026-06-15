import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

interface ObjectLabelProps {
  x: number;
  y: number;
  label: string;
  color?: string;
  anchor?: "start" | "middle" | "end";
  offsetX?: number;
  offsetY?: number;
  onOffsetChange?: (offsetX: number, offsetY: number) => void;
}

export function ObjectLabel({
  x,
  y,
  label,
  color,
  anchor = "start",
  offsetX = 0,
  offsetY = 0,
  onOffsetChange,
}: ObjectLabelProps) {
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    initOffX: number;
    initOffY: number;
  } | null>(null);

  const draggable = onOffsetChange !== undefined;

  const handlePointerDown = (e: ReactPointerEvent<SVGTextElement>) => {
    if (!draggable) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      initOffX: offsetX,
      initOffY: offsetY,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGTextElement>) => {
    if (!draggable || dragRef.current === null) return;
    const dx = e.clientX - dragRef.current.startClientX;
    const dy = e.clientY - dragRef.current.startClientY;
    onOffsetChange!(dragRef.current.initOffX + dx, dragRef.current.initOffY + dy);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <text
      className="object-label"
      x={x + offsetX}
      y={y + offsetY}
      style={{
        fill: color ?? undefined,
        cursor: draggable ? "grab" : undefined,
        userSelect: "none",
        pointerEvents: draggable ? "all" : undefined,
      }}
      textAnchor={anchor}
      aria-hidden="true"
      onPointerDown={draggable ? handlePointerDown : undefined}
      onPointerMove={draggable ? handlePointerMove : undefined}
      onPointerUp={draggable ? handlePointerUp : undefined}
    >
      {label}
    </text>
  );
}
