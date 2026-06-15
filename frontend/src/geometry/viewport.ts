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

export function chooseGridStep(scale: number, targetPixels = 72): number {
  const rawStep = targetPixels / scale;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
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
  const scale = Math.min(180, Math.max(24, viewport.scale * zoomFactor));
  const next = { ...viewport, scale };
  const worldAfter = screenToWorld(screenPoint, next, size);
  return {
    centerX: next.centerX + worldBefore.x - worldAfter.x,
    centerY: next.centerY + worldBefore.y - worldAfter.y,
    scale,
  };
}

