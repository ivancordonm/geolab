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

export interface CirclePolyline {
  points: Coordinate[];
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
 * Approximate the visible arc of a very large circle with a bounded polyline.
 *
 * Chromium loses stroke precision when an SVG circle has a far-off-screen
 * centre and a correspondingly large radius. The points here are evaluated in
 * a local tangent frame, using a cancellation-free sagitta formula, and then
 * clipped to the canvas so the browser never receives those large values.
 */
export function approximateVisibleCircleAsPolyline(
  center: Coordinate,
  radius: number,
  size: CanvasSize,
  maxChordErrorPx = 0.25,
): CirclePolyline | null {
  if (
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y) ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    size.width <= 0 ||
    size.height <= 0 ||
    !Number.isFinite(maxChordErrorPx) ||
    maxChordErrorPx <= 0
  ) {
    return null;
  }

  // Keep native SVG circle rendering for normal construction-scale circles.
  // Large-coordinate circles are the only ones affected by browser precision.
  const canvasDiagonal = Math.hypot(size.width, size.height);
  if (radius < canvasDiagonal * 8) {
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
  const tangentX = -normalY;
  const tangentY = normalX;

  // Express the closest point in terms of the local canvas centre. This avoids
  // subtracting two ~radius-sized coordinates when the circle is almost a line.
  const tangentPoint = {
    x: canvasCenter.x + normalX * (radius - centerDistance),
    y: canvasCenter.y + normalY * (radius - centerDistance),
  };

  const corners = [
    { x: 0, y: 0 },
    { x: size.width, y: 0 },
    { x: 0, y: size.height },
    { x: size.width, y: size.height },
  ];
  const tangentOffsets = corners.map(
    (corner) =>
      (corner.x - tangentPoint.x) * tangentX +
      (corner.y - tangentPoint.y) * tangentY,
  );
  const minOffset = Math.max(-radius, Math.min(...tangentOffsets));
  const maxOffset = Math.min(radius, Math.max(...tangentOffsets));
  if (minOffset >= maxOffset) {
    return null;
  }

  const minAngle = Math.asin(minOffset / radius);
  const maxAngle = Math.asin(maxOffset / radius);
  // A chord spanning deltaAngle deviates from the arc by
  // 2r*sin^2(deltaAngle/4). Inverting that expression gives a strict segment
  // size for the requested screen-pixel error.
  // Divide before multiplying by 1/2 so `2 * radius` cannot overflow for a
  // finite radius near Number.MAX_VALUE.
  const maxAngleStep = 4 * Math.asin(Math.min(1, Math.sqrt((maxChordErrorPx / radius) / 2)));
  if (!Number.isFinite(maxAngleStep) || maxAngleStep <= 0) {
    return null;
  }
  const segmentCount = Math.max(1, Math.ceil((maxAngle - minAngle) / maxAngleStep));
  if (!Number.isFinite(segmentCount)) {
    return null;
  }
  const arcPoints: Coordinate[] = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const angle = minAngle + ((maxAngle - minAngle) * index) / segmentCount;
    const alongTangent = radius * Math.sin(angle);
    const tangentRatio = alongTangent / radius;
    const sagitta =
      (tangentRatio * alongTangent) /
      (1 + Math.sqrt(Math.max(0, 1 - tangentRatio * tangentRatio)));
    arcPoints.push({
      x: tangentPoint.x + tangentX * alongTangent - normalX * sagitta,
      y: tangentPoint.y + tangentY * alongTangent - normalY * sagitta,
    });
  }

  const points: Coordinate[] = [];
  for (let index = 1; index < arcPoints.length; index += 1) {
    const clipped = clipSegmentToCanvas(arcPoints[index - 1], arcPoints[index], size);
    if (clipped === null) {
      continue;
    }
    if (points.length === 0 || !coordinatesEqual(points[points.length - 1], clipped.start)) {
      points.push(clipped.start);
    }
    if (!coordinatesEqual(points[points.length - 1], clipped.end)) {
      points.push(clipped.end);
    }
  }

  return points.length >= 2 ? { points } : null;
}

function clipSegmentToCanvas(
  start: Coordinate,
  end: Coordinate,
  size: CanvasSize,
): ClippedLine | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let entry = 0;
  let exit = 1;

  const clips: Array<[number, number]> = [
    [-dx, start.x],
    [dx, size.width - start.x],
    [-dy, start.y],
    [dy, size.height - start.y],
  ];
  for (const [direction, distance] of clips) {
    if (direction === 0) {
      if (distance < 0) {
        return null;
      }
      continue;
    }
    const ratio = distance / direction;
    if (direction < 0) {
      entry = Math.max(entry, ratio);
    } else {
      exit = Math.min(exit, ratio);
    }
    if (entry > exit) {
      return null;
    }
  }

  const pointAt = (amount: number): Coordinate => ({
    x: Math.min(size.width, Math.max(0, start.x + dx * amount)),
    y: Math.min(size.height, Math.max(0, start.y + dy * amount)),
  });
  return { start: pointAt(entry), end: pointAt(exit) };
}

function coordinatesEqual(first: Coordinate, second: Coordinate): boolean {
  return Math.abs(first.x - second.x) < 1e-9 && Math.abs(first.y - second.y) < 1e-9;
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
