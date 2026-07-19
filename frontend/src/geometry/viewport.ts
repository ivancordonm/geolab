import type { GeometryViewport, LineValue } from "../types/geometry";

export interface CanvasSize {
  width: number;
  height: number;
}

export interface Coordinate {
  x: number;
  y: number;
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ClippedLine {
  start: Coordinate;
  end: Coordinate;
}

/** Interactive zoom bounds in screen pixels per world unit. */
export const MIN_VIEWPORT_SCALE = 2;
export const MAX_VIEWPORT_SCALE = 180;

export function worldToScreen(
  point: Coordinate,
  viewport: GeometryViewport,
  size: CanvasSize,
): Coordinate {
  return {
    x: size.width / 2 + (point.x - viewport.centerX) * viewport.scale,
    y: size.height / 2 - (point.y - viewport.centerY) * viewport.scale,
  };
}

export function screenToWorld(
  point: Coordinate,
  viewport: GeometryViewport,
  size: CanvasSize,
): Coordinate {
  return {
    x: viewport.centerX + (point.x - size.width / 2) / viewport.scale,
    y: viewport.centerY - (point.y - size.height / 2) / viewport.scale,
  };
}

export function getWorldBounds(viewport: GeometryViewport, size: CanvasSize): WorldBounds {
  const halfWidth = size.width / (2 * viewport.scale);
  const halfHeight = size.height / (2 * viewport.scale);
  return {
    minX: viewport.centerX - halfWidth,
    maxX: viewport.centerX + halfWidth,
    minY: viewport.centerY - halfHeight,
    maxY: viewport.centerY + halfHeight,
  };
}

export function clipImplicitLineToBounds(
  line: LineValue,
  bounds: WorldBounds,
): ClippedLine | null {
  const candidates: Coordinate[] = [];
  const addCandidate = (point: Coordinate): void => {
    const inside =
      point.x >= bounds.minX - 1e-9 &&
      point.x <= bounds.maxX + 1e-9 &&
      point.y >= bounds.minY - 1e-9 &&
      point.y <= bounds.maxY + 1e-9;
    const duplicate = candidates.some(
      (candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < 1e-9,
    );
    if (inside && !duplicate) {
      candidates.push(point);
    }
  };

  if (Math.abs(line.b) > 1e-12) {
    addCandidate({ x: bounds.minX, y: -(line.a * bounds.minX + line.c) / line.b });
    addCandidate({ x: bounds.maxX, y: -(line.a * bounds.maxX + line.c) / line.b });
  }
  if (Math.abs(line.a) > 1e-12) {
    addCandidate({ x: -(line.b * bounds.minY + line.c) / line.a, y: bounds.minY });
    addCandidate({ x: -(line.b * bounds.maxY + line.c) / line.a, y: bounds.maxY });
  }

  return candidates.length >= 2 ? { start: candidates[0], end: candidates[1] } : null;
}

/**
 * Approximate the visible part of a very large circle with its tangent when
 * the difference is sub-pixel. Keeping the rendered coordinates inside the
 * canvas avoids browser precision loss for circles centred far off-screen.
 */
export function approximateVisibleCircleAsLine(
  center: Coordinate,
  radius: number,
  size: CanvasSize,
  maxErrorPx = 1,
): ClippedLine | null {
  if (
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y) ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    size.width <= 0 ||
    size.height <= 0 ||
    maxErrorPx < 0
  ) {
    return null;
  }

  const minDx = center.x < 0 ? -center.x : center.x > size.width ? center.x - size.width : 0;
  const minDy = center.y < 0 ? -center.y : center.y > size.height ? center.y - size.height : 0;
  const minDistance = Math.hypot(minDx, minDy);
  const maxDistance = Math.max(
    Math.hypot(center.x, center.y),
    Math.hypot(center.x - size.width, center.y),
    Math.hypot(center.x, center.y - size.height),
    Math.hypot(center.x - size.width, center.y - size.height),
  );
  if (radius < minDistance || radius > maxDistance) {
    return null;
  }

  const canvasCenter = { x: size.width / 2, y: size.height / 2 };
  const toCanvasX = canvasCenter.x - center.x;
  const toCanvasY = canvasCenter.y - center.y;
  const centerDistance = Math.hypot(toCanvasX, toCanvasY);
  if (centerDistance === 0) {
    return null;
  }

  const normalX = toCanvasX / centerDistance;
  const normalY = toCanvasY / centerDistance;
  const tangentPoint = {
    x: center.x + normalX * radius,
    y: center.y + normalY * radius,
  };
  const clipped = clipImplicitLineToBounds(
    {
      type: "line",
      a: normalX,
      b: normalY,
      c: -(normalX * tangentPoint.x + normalY * tangentPoint.y),
    },
    { minX: 0, maxX: size.width, minY: 0, maxY: size.height },
  );
  if (clipped === null) {
    return null;
  }

  const tangentX = -normalY;
  const tangentY = normalX;
  const endpointError = (endpoint: Coordinate): number => {
    const alongTangent = Math.abs(
      (endpoint.x - tangentPoint.x) * tangentX + (endpoint.y - tangentPoint.y) * tangentY,
    );
    if (alongTangent >= radius) {
      return Number.POSITIVE_INFINITY;
    }
    const remainingRadius = Math.sqrt(Math.max(0, radius * radius - alongTangent * alongTangent));
    return (alongTangent * alongTangent) / (radius + remainingRadius);
  };

  return Math.max(endpointError(clipped.start), endpointError(clipped.end)) <= maxErrorPx
    ? clipped
    : null;
}

export function chooseGridStep(scale: number, targetPixels = 72): number {
  const rawStep = targetPixels / scale;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

export interface GridSettings {
  showGrid: boolean;
  showAxes: boolean;
  snapToGrid: boolean;
  stepMode: "auto" | "manual";
  manualStep: number;
}

export function getEffectiveGridStep(settings: GridSettings, viewportScale: number): number {
  return settings.stepMode === "manual" ? settings.manualStep : chooseGridStep(viewportScale);
}

const DEFAULT_SNAP_RADIUS_PX = 8;

export function snapToGrid(
  point: Coordinate,
  step: number,
  viewportScale: number,
  snapRadiusPx: number = DEFAULT_SNAP_RADIUS_PX,
): Coordinate {
  const worldRadius = snapRadiusPx / viewportScale;
  return {
    x: snapAxis(point.x, step, worldRadius),
    y: snapAxis(point.y, step, worldRadius),
  };
}

function snapAxis(value: number, step: number, worldRadius: number): number {
  const nearest = Math.round(value / step) * step;
  return Math.abs(value - nearest) <= worldRadius ? nearest : value;
}

export function clientToSvgScreen(
  client: Coordinate,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  size: CanvasSize,
): Coordinate {
  return {
    x: ((client.x - rect.left) / rect.width) * size.width,
    y: ((client.y - rect.top) / rect.height) * size.height,
  };
}

/**
 * Pan the viewport by the given delta in SVG-space pixels.
 * dSvgX > 0 shifts the view right (center moves left in world space).
 * dSvgY > 0 shifts the view down (center moves up in world space).
 */
export function panViewport(
  viewport: GeometryViewport,
  dSvgX: number,
  dSvgY: number,
): GeometryViewport {
  return {
    ...viewport,
    centerX: viewport.centerX - dSvgX / viewport.scale,
    centerY: viewport.centerY + dSvgY / viewport.scale,
  };
}

export function zoomViewportAtScreenPoint(
  viewport: GeometryViewport,
  screenPoint: Coordinate,
  size: CanvasSize,
  zoomFactor: number,
): GeometryViewport {
  const worldBefore = screenToWorld(screenPoint, viewport, size);
  const scale = Math.min(MAX_VIEWPORT_SCALE, Math.max(MIN_VIEWPORT_SCALE, viewport.scale * zoomFactor));
  const next = { ...viewport, scale };
  const worldAfter = screenToWorld(screenPoint, next, size);
  return {
    centerX: next.centerX + worldBefore.x - worldAfter.x,
    centerY: next.centerY + worldBefore.y - worldAfter.y,
    scale,
  };
}
