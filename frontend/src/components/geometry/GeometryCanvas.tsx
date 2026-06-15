import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import {
  clientToSvgScreen,
  clipImplicitLineToBounds,
  getWorldBounds,
  panViewport,
  screenToWorld,
  worldToScreen,
  zoomViewportAtScreenPoint,
} from "../../geometry/viewport";
import type { CanvasSize, Coordinate } from "../../geometry/viewport";
import type { ConstructionTool } from "../../geometry/constructionTools";
import type {
  ArcValue,
  CircleValue,
  EvaluatedValue,
  EvaluationMap,
  GeometryDocument,
  GeometryObject,
  GeometryViewport,
  LineValue,
  PolygonValue,
  PointValue,
  SegmentValue,
  StrokeDash,
} from "../../types/geometry";
import { ArcView } from "./ArcView";
import { CircleView } from "./CircleView";
import { Grid } from "./Grid";
import { LineView } from "./LineView";
import { PointView } from "./PointView";
import { PolygonView } from "./PolygonView";
import { SegmentView } from "./SegmentView";

interface GeometryCanvasProps {
  document: GeometryDocument;
  values: EvaluationMap;
  viewport: GeometryViewport;
  onMoveFreePoint: (pointId: string, x: number, y: number) => void;
  onTranslateObject?: (objectId: string, dx: number, dy: number) => void;
  onBeginFreePointMove?: () => void;
  onEndFreePointMove?: () => void;
  onViewportChange: (viewport: GeometryViewport) => void;
  activeTool: ConstructionTool;
  selectedObjectIds: readonly string[];
  selectedObjectId?: string | null;
  pointerWorld: Coordinate | null;
  onCanvasClick: (world: Coordinate) => void;
  onObjectClick: (objectId: string) => void;
  onPointerWorldChange: (world: Coordinate | null) => void;
  onSetLabelOffset?: (objectId: string, offsetX: number, offsetY: number) => void;
  panelOpen?: boolean;
}

export function GeometryCanvas({
  document,
  values,
  viewport,
  onMoveFreePoint,
  onTranslateObject,
  onBeginFreePointMove,
  onEndFreePointMove,
  onViewportChange,
  activeTool,
  selectedObjectIds,
  selectedObjectId = null,
  pointerWorld,
  onCanvasClick,
  onObjectClick,
  onPointerWorldChange,
  onSetLabelOffset,
  panelOpen = false,
}: GeometryCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggedPointRef = useRef<{ objectId: string; pointerId: number } | null>(null);
  const draggedObjectRef = useRef<{
    objectId: string;
    pointerId: number;
    lastWorld: Coordinate;
  } | null>(null);
  const canvasDragRef = useRef<{
    pointerId: number;
    lastClientX: number;
    lastClientY: number;
    hasMoved: boolean;
    worldAtDown: Coordinate;
  } | null>(null);

  // Tamaño real del SVG medido con ResizeObserver.
  // Con viewBox dinámico (px-SVG == px-pantalla), todas las conversiones de
  // coordenadas son exactas sin letterboxing ni factores de escala separados.
  const [size, setSize] = useState<CanvasSize>({ width: 1000, height: 700 });

  // Always-current viewport ref avoids stale-closure issues during high-frequency pan moves.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // Medir el SVG al montar y cada vez que cambie de tamaño (ventana/panel).
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return undefined;
    const update = () => {
      const { width, height } = svg.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setSize({ width: Math.round(width), height: Math.round(height) });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): Coordinate | null => {
      const svg = svgRef.current;
      if (svg === null) {
        return null;
      }
      const screen = clientToSvgScreen(
        { x: clientX, y: clientY },
        svg.getBoundingClientRect(),
        size,
      );
      return screenToWorld(screen, viewportRef.current, size);
    },
    [size],
  );

  const handleObjectPointerDown = useCallback(
    (objectId: string, event: ReactPointerEvent<SVGElement>) => {
      event.stopPropagation();
      onObjectClick(objectId);
      if (activeTool !== "select") {
        return;
      }
      const object = document.objects.find((candidate) => candidate.id === objectId);
      const isFreePoint = object?.kind === "point" && object.definition.type === "free";
      // Non-free-point objects can be translated directly by dragging (no pre-selection required).
      const canTranslate = !isFreePoint && onTranslateObject !== undefined;
      if (!isFreePoint && !canTranslate) {
        return;
      }
      const svg = svgRef.current;
      const world = clientToWorld(event.clientX, event.clientY);
      if (svg === null || world === null) {
        return;
      }
      event.preventDefault();
      svg.setPointerCapture(event.pointerId);
      onBeginFreePointMove?.();
      if (canTranslate) {
        draggedObjectRef.current = { objectId, pointerId: event.pointerId, lastWorld: world };
        return;
      }
      draggedPointRef.current = { objectId, pointerId: event.pointerId };
    },
    [activeTool, clientToWorld, document.objects, onBeginFreePointMove, onObjectClick, onTranslateObject],
  );

  const eventToWorld = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>): Coordinate | null => {
      const svg = svgRef.current;
      if (svg === null) {
        return null;
      }
      const screen = clientToSvgScreen(
        { x: event.clientX, y: event.clientY },
        svg.getBoundingClientRect(),
        size,
      );
      return screenToWorld(screen, viewport, size);
    },
    [size, viewport],
  );

  const handleCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const world = eventToWorld(event);
      if (world === null) return;
      // Capture the pointer so move and up events reach the SVG even if the cursor
      // leaves the element. The actual click (or pan) is decided on pointer up.
      event.currentTarget.setPointerCapture(event.pointerId);
      canvasDragRef.current = {
        pointerId: event.pointerId,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        hasMoved: false,
        worldAtDown: world,
      };
    },
    [eventToWorld],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const world = eventToWorld(event);
      if (world === null) return;

      // Point drag (select tool + free point).
      const pointDrag = draggedPointRef.current;
      if (pointDrag !== null && pointDrag.pointerId === event.pointerId) {
        onMoveFreePoint(pointDrag.objectId, world.x, world.y);
      }

      const objectDrag = draggedObjectRef.current;
      if (
        objectDrag !== null &&
        objectDrag.pointerId === event.pointerId &&
        onTranslateObject !== undefined
      ) {
        const dx = world.x - objectDrag.lastWorld.x;
        const dy = world.y - objectDrag.lastWorld.y;
        onTranslateObject(objectDrag.objectId, dx, dy);
        draggedObjectRef.current = { ...objectDrag, lastWorld: world };
      }

      // Canvas pan.
      const canvasDrag = canvasDragRef.current;
      if (canvasDrag !== null && canvasDrag.pointerId === event.pointerId) {
        const dClientX = event.clientX - canvasDrag.lastClientX;
        const dClientY = event.clientY - canvasDrag.lastClientY;
        if (!canvasDrag.hasMoved && (Math.abs(dClientX) > 3 || Math.abs(dClientY) > 3)) {
          canvasDrag.hasMoved = true;
          if (svgRef.current !== null) svgRef.current.style.cursor = "grabbing";
        }
        if (canvasDrag.hasMoved) {
          const svg = svgRef.current;
          if (svg !== null) {
            const rect = svg.getBoundingClientRect();
            // Con viewBox dinámico (size == rect), estos factores son ≈1 y el
            // pan sigue exactamente al cursor sin acumulación de error.
            const dSvgX = dClientX * (size.width / rect.width);
            const dSvgY = dClientY * (size.height / rect.height);
            onViewportChange(panViewport(viewportRef.current, dSvgX, dSvgY));
          }
          canvasDrag.lastClientX = event.clientX;
          canvasDrag.lastClientY = event.clientY;
        }
      }

      // Construction preview (suppress while panning so it doesn't jump).
      const isPanning = canvasDragRef.current?.hasMoved === true;
      const showsPreview =
        !isPanning &&
        selectedObjectIds.length === 1 &&
        (["segment", "line", "circle", "midpoint"] as ConstructionTool[]).includes(activeTool);
      if (showsPreview) {
        onPointerWorldChange(world);
      }
    },
    [activeTool, eventToWorld, onMoveFreePoint, onPointerWorldChange, onViewportChange, selectedObjectIds.length, size],
  );

  const stopDragging = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Point drag cleanup.
      const pointDrag = draggedPointRef.current;
      if (pointDrag?.pointerId === event.pointerId) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        draggedPointRef.current = null;
        onEndFreePointMove?.();
      }

      const objectDrag = draggedObjectRef.current;
      if (objectDrag?.pointerId === event.pointerId) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        draggedObjectRef.current = null;
        onEndFreePointMove?.();
      }

      // Canvas drag cleanup: treat as click if the pointer didn't move.
      const canvasDrag = canvasDragRef.current;
      if (canvasDrag?.pointerId === event.pointerId) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (svgRef.current !== null) svgRef.current.style.cursor = "";
        if (!canvasDrag.hasMoved) {
          onCanvasClick(canvasDrag.worldAtDown);
        }
        canvasDragRef.current = null;
      }
    },
    [onCanvasClick, onEndFreePointMove],
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const svg = svgRef.current;
      if (svg === null) {
        return;
      }
      const screen = clientToSvgScreen(
        { x: event.clientX, y: event.clientY },
        svg.getBoundingClientRect(),
        size,
      );
      onViewportChange(
        zoomViewportAtScreenPoint(viewport, screen, size, event.deltaY < 0 ? 1.12 : 1 / 1.12),
      );
    },
    [onViewportChange, size, viewport],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) {
      return undefined;
    }
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface">
      <svg
        ref={svgRef}
        className="geometry-canvas"
        viewBox={`0 0 ${size.width} ${size.height}`}
        style={{ cursor: "grab" }}
        role="img"
        aria-label="Interactive geometry coordinate plane. Drag the background to pan, scroll to zoom, drag circular free points to move them."
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onPointerLeave={() => { onPointerWorldChange(null); if (svgRef.current) svgRef.current.style.cursor = ""; }}
      >
        <rect className="canvas-background" width={size.width} height={size.height} />
        <Grid viewport={viewport} size={size} />
        <g className="geometry-objects">
          {document.objects.filter((object) => object.kind === "polygon").map((object) =>
            renderGeometryObject(
              object,
              values.get(object.id),
              viewport,
              size,
              activeTool,
              selectedObjectIds,
              selectedObjectId,
              handleObjectPointerDown,
              onMoveFreePoint,
              onSetLabelOffset,
            ),
          )}
          {document.objects.filter((object) => object.kind !== "point" && object.kind !== "polygon").map((object) =>
            renderGeometryObject(
              object,
              values.get(object.id),
              viewport,
              size,
              activeTool,
              selectedObjectIds,
              selectedObjectId,
              handleObjectPointerDown,
              onMoveFreePoint,
              onSetLabelOffset,
            ),
          )}
          {document.objects.filter((object) => object.kind === "point").map((object) =>
            renderGeometryObject(
              object,
              values.get(object.id),
              viewport,
              size,
              activeTool,
              selectedObjectIds,
              selectedObjectId,
              handleObjectPointerDown,
              onMoveFreePoint,
              onSetLabelOffset,
            ),
          )}
          <ConstructionPreview
            activeTool={activeTool}
            selectedObjectIds={selectedObjectIds}
            pointerWorld={pointerWorld}
            values={values}
            viewport={viewport}
            size={size}
          />
        </g>
      </svg>
      <div
        style={{ right: panelOpen ? "calc(23rem + 1.5rem)" : "0.75rem" }}
        className="pointer-events-none absolute bottom-3 flex items-center gap-1.5 rounded-lg border border-edge bg-surface/85 px-3 py-2 text-xs font-medium text-muted backdrop-blur transition-[right] duration-200"
        aria-hidden="true"
      >
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: "var(--geo-point)" }}
        />
        Drag free points
        <span
          className="ml-1.5 inline-block h-2.5 w-2.5 rotate-45 rounded-[1px]"
          style={{ background: "var(--geo-accent)" }}
        />
        Derived points
        <span className="ml-1.5 border-l border-edge pl-2.5">Drag to pan · Scroll to zoom</span>
      </div>
    </div>
  );
}

function renderGeometryObject(
  object: GeometryObject,
  value: EvaluatedValue | undefined,
  viewport: GeometryViewport,
  size: CanvasSize,
  activeTool: ConstructionTool,
  selectedObjectIds: readonly string[],
  selectedObjectId: string | null,
  onPointerDown: (objectId: string, event: ReactPointerEvent<SVGElement>) => void,
  onKeyboardMove: (objectId: string, x: number, y: number) => void,
  onSetLabelOffset?: (objectId: string, offsetX: number, offsetY: number) => void,
) {
  if (!object.visible || value === undefined || value.type === "undefined") {
    return null;
  }

  const color = object.style?.color;
  const strokeWidth = object.style?.strokeWidth;
  const strokeDash = object.style?.strokeDash;
  const labelOffset = object.style?.labelOffset;
  const onLabelOffsetChange = onSetLabelOffset
    ? (ox: number, oy: number) => onSetLabelOffset(object.id, ox, oy)
    : undefined;

  const selected = selectedObjectIds.includes(object.id) || selectedObjectId === object.id;

  if (value.type === "polygon") {
    return renderPolygon(object, value, viewport, size, color, strokeWidth, strokeDash, selected, labelOffset, onPointerDown, onLabelOffsetChange);
  }

  if (value.type === "arc") {
    return renderArc(
      object,
      value,
      viewport,
      size,
      color,
      strokeWidth,
      strokeDash,
      selected,
      labelOffset,
      onPointerDown,
      onLabelOffsetChange,
    );
  }

  if (value.type === "point") {
    return renderPoint(
      object,
      value,
      viewport,
      size,
      color,
      activeTool === "select",
      selected,
      labelOffset,
      onPointerDown,
      onKeyboardMove,
      onLabelOffsetChange,
    );
  }
  if (value.type === "line") {
    return renderLine(
      object,
      value,
      viewport,
      size,
      color,
      strokeWidth,
      strokeDash,
      selected,
      labelOffset,
      onPointerDown,
      onLabelOffsetChange,
    );
  }
  if (value.type === "segment") {
    return renderSegment(
      object,
      value,
      viewport,
      size,
      color,
      strokeWidth,
      strokeDash,
      selected,
      labelOffset,
      onPointerDown,
      onLabelOffsetChange,
    );
  }
  return renderCircle(
    object,
    value,
    viewport,
    size,
    color,
    strokeWidth,
    strokeDash,
    selected,
    labelOffset,
    onPointerDown,
    onLabelOffsetChange,
  );
}

function renderPoint(
  object: GeometryObject,
  value: PointValue,
  viewport: GeometryViewport,
  size: CanvasSize,
  color: string | undefined,
  moveEnabled: boolean,
  selected: boolean,
  labelOffset: { x: number; y: number } | undefined,
  onPointerDown: (objectId: string, event: ReactPointerEvent<SVGElement>) => void,
  onKeyboardMove: (objectId: string, x: number, y: number) => void,
  onLabelOffsetChange: ((ox: number, oy: number) => void) | undefined,
) {
  return (
    <PointView
      key={object.id}
      objectId={object.id}
      label={object.label}
      value={value}
      screenPoint={worldToScreen(value, viewport, size)}
      color={color}
      free={object.definition.type === "free"}
      draggable={moveEnabled && object.definition.type === "free"}
      selected={selected}
      labelOffset={labelOffset}
      onPointerDown={onPointerDown}
      onKeyboardMove={onKeyboardMove}
      onLabelOffsetChange={onLabelOffsetChange}
    />
  );
}

function renderLine(
  object: GeometryObject,
  value: LineValue,
  viewport: GeometryViewport,
  size: CanvasSize,
  color: string | undefined,
  strokeWidth: number | undefined,
  strokeDash: StrokeDash | undefined,
  selected: boolean,
  labelOffset: { x: number; y: number } | undefined,
  onPointerDown: (objectId: string, event: ReactPointerEvent<SVGElement>) => void,
  onLabelOffsetChange: ((ox: number, oy: number) => void) | undefined,
) {
  const clipped = clipImplicitLineToBounds(value, getWorldBounds(viewport, size));
  if (clipped === null) {
    return null;
  }
  return (
    <LineView
      key={object.id}
      objectId={object.id}
      label={object.label}
      value={value}
      screenStart={worldToScreen(clipped.start, viewport, size)}
      screenEnd={worldToScreen(clipped.end, viewport, size)}
      color={color}
      strokeWidth={strokeWidth}
      strokeDash={strokeDash}
      selected={selected}
      labelOffset={labelOffset}
      onPointerDown={onPointerDown}
      onLabelOffsetChange={onLabelOffsetChange}
    />
  );
}

function renderSegment(
  object: GeometryObject,
  value: SegmentValue,
  viewport: GeometryViewport,
  size: CanvasSize,
  color: string | undefined,
  strokeWidth: number | undefined,
  strokeDash: StrokeDash | undefined,
  selected: boolean,
  labelOffset: { x: number; y: number } | undefined,
  onPointerDown: (objectId: string, event: ReactPointerEvent<SVGElement>) => void,
  onLabelOffsetChange: ((ox: number, oy: number) => void) | undefined,
) {
  return (
    <SegmentView
      key={object.id}
      objectId={object.id}
      label={object.label}
      start={worldToScreen(value.start, viewport, size)}
      end={worldToScreen(value.end, viewport, size)}
      color={color}
      strokeWidth={strokeWidth}
      strokeDash={strokeDash}
      selected={selected}
      labelOffset={labelOffset}
      onPointerDown={onPointerDown}
      onLabelOffsetChange={onLabelOffsetChange}
    />
  );
}

function renderCircle(
  object: GeometryObject,
  value: CircleValue,
  viewport: GeometryViewport,
  size: CanvasSize,
  color: string | undefined,
  strokeWidth: number | undefined,
  strokeDash: StrokeDash | undefined,
  selected: boolean,
  labelOffset: { x: number; y: number } | undefined,
  onPointerDown: (objectId: string, event: ReactPointerEvent<SVGElement>) => void,
  onLabelOffsetChange: ((ox: number, oy: number) => void) | undefined,
) {
  return (
    <CircleView
      key={object.id}
      objectId={object.id}
      label={object.label}
      value={value}
      center={worldToScreen(value.center, viewport, size)}
      radius={value.radius * viewport.scale}
      color={color}
      strokeWidth={strokeWidth}
      strokeDash={strokeDash}
      selected={selected}
      labelOffset={labelOffset}
      onPointerDown={onPointerDown}
      onLabelOffsetChange={onLabelOffsetChange}
    />
  );
}

function renderArc(
  object: GeometryObject,
  value: ArcValue,
  viewport: GeometryViewport,
  size: CanvasSize,
  color: string | undefined,
  strokeWidth: number | undefined,
  strokeDash: StrokeDash | undefined,
  selected: boolean,
  labelOffset: { x: number; y: number } | undefined,
  onPointerDown: (objectId: string, event: ReactPointerEvent<SVGElement>) => void,
  onLabelOffsetChange: ((ox: number, oy: number) => void) | undefined,
) {
  return (
    <ArcView
      key={object.id}
      objectId={object.id}
      label={object.label}
      value={value}
      center={worldToScreen(value.center, viewport, size)}
      start={worldToScreen(value.start, viewport, size)}
      mid={worldToScreen(value.mid, viewport, size)}
      end={worldToScreen(value.end, viewport, size)}
      color={color}
      strokeWidth={strokeWidth}
      strokeDash={strokeDash}
      selected={selected}
      labelOffset={labelOffset}
      onPointerDown={onPointerDown}
      onLabelOffsetChange={onLabelOffsetChange}
    />
  );
}

function renderPolygon(
  object: GeometryObject,
  value: PolygonValue,
  viewport: GeometryViewport,
  size: CanvasSize,
  color: string | undefined,
  strokeWidth: number | undefined,
  strokeDash: StrokeDash | undefined,
  selected: boolean,
  labelOffset: { x: number; y: number } | undefined,
  onPointerDown: (objectId: string, event: ReactPointerEvent<SVGElement>) => void,
  onLabelOffsetChange: ((ox: number, oy: number) => void) | undefined,
) {
  const screenVertices = value.vertices.map((v) => worldToScreen(v, viewport, size));
  return (
    <PolygonView
      key={object.id}
      objectId={object.id}
      label={object.label}
      value={value}
      screenVertices={screenVertices}
      color={color}
      strokeWidth={strokeWidth}
      strokeDash={strokeDash}
      selected={selected}
      labelOffset={labelOffset}
      onPointerDown={onPointerDown}
      onLabelOffsetChange={onLabelOffsetChange}
    />
  );
}

interface ConstructionPreviewProps {
  activeTool: ConstructionTool;
  selectedObjectIds: readonly string[];
  pointerWorld: Coordinate | null;
  values: EvaluationMap;
  viewport: GeometryViewport;
  size: CanvasSize;
}

function ConstructionPreview({
  activeTool,
  selectedObjectIds,
  pointerWorld,
  values,
  viewport,
  size,
}: ConstructionPreviewProps) {
  if (selectedObjectIds.length !== 1 || pointerWorld === null) {
    return null;
  }
  if (!["segment", "line", "circle", "midpoint"].includes(activeTool)) {
    return null;
  }
  const first = values.get(selectedObjectIds[0]);
  if (first?.type !== "point") {
    return null;
  }
  const start = worldToScreen(first, viewport, size);
  const end = worldToScreen(pointerWorld, viewport, size);
  if (activeTool === "circle") {
    return (
      <circle
        className="construction-preview"
        cx={start.x}
        cy={start.y}
        r={Math.hypot(end.x - start.x, end.y - start.y)}
      />
    );
  }
  return (
    <line
      className="construction-preview"
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
    />
  );
}
