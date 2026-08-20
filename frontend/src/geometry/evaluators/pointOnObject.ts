import type { ArcValue, CircleValue, EvaluatedValue, LineValue, PointValue, SegmentValue } from "../../types/geometry";
import { GEOMETRY_EPSILON, cleanZero } from "./shared";

/**
 * Forward (parameter -> point) and reverse (point -> parameter) projections
 * for points constrained to a line, segment, circle, or arc. The forward
 * functions are the single source of truth for how `on_line`/`on_segment`/
 * `on_circle`/`on_arc` objects evaluate -- `engine.ts` and the Python
 * `engine.py` must stay bit-identical. The reverse functions are used only by
 * interactive creation, dragging, and hover preview in the frontend; the
 * backend never needs to invert a click position.
 */

// ─── Line: t is unbounded; direction (-b, a) is unit length since a²+b²=1 ──

export function pointOnLineFromT(line: LineValue, t: number): PointValue {
  const baseX = -line.a * line.c;
  const baseY = -line.b * line.c;
  return { type: "point", x: cleanZero(baseX - line.b * t), y: cleanZero(baseY + line.a * t) };
}

export function tForPointOnLine(line: LineValue, point: { x: number; y: number }): number {
  const baseX = -line.a * line.c;
  const baseY = -line.b * line.c;
  return -line.b * (point.x - baseX) + line.a * (point.y - baseY);
}

// ─── Segment: t clamped to [0, 1] ───────────────────────────────────────────

function clampUnit(t: number): number {
  return Math.min(1, Math.max(0, t));
}

export function pointOnSegmentFromT(segment: SegmentValue, t: number): PointValue {
  const clamped = clampUnit(t);
  return {
    type: "point",
    x: cleanZero(segment.start.x + clamped * (segment.end.x - segment.start.x)),
    y: cleanZero(segment.start.y + clamped * (segment.end.y - segment.start.y)),
  };
}

export function tForPointOnSegment(segment: SegmentValue, point: { x: number; y: number }): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= GEOMETRY_EPSILON * GEOMETRY_EPSILON) {
    return 0;
  }
  const t = ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared;
  return clampUnit(t);
}

// ─── Circle: angle in radians, unbounded (wraps naturally via cos/sin) ────

export function pointOnCircleFromAngle(circle: CircleValue, angle: number): PointValue {
  return {
    type: "point",
    x: cleanZero(circle.center.x + circle.radius * Math.cos(angle)),
    y: cleanZero(circle.center.y + circle.radius * Math.sin(angle)),
  };
}

export function angleOfFromCenter(center: { x: number; y: number }, point: { x: number; y: number }): number {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

export function angleForPointOnCircle(circle: CircleValue, point: { x: number; y: number }): number {
  return angleOfFromCenter(circle.center, point);
}

// ─── Arc: angle clamped to the arc's angular span (through start/mid/end) ─

function normalizeAngle(angle: number): number {
  const twoPi = 2 * Math.PI;
  let normalized = angle % twoPi;
  if (normalized < 0) normalized += twoPi;
  return normalized;
}

/** `sweep > 0`: the arc runs counter-clockwise from start to end (through mid). `sweep < 0`: clockwise. */
function arcAngularRange(arc: ArcValue): { startAngle: number; sweep: number } {
  const startAngle = angleOfFromCenter(arc.center, arc.start);
  const ccwToMid = normalizeAngle(angleOfFromCenter(arc.center, arc.mid) - startAngle);
  const ccwToEnd = normalizeAngle(angleOfFromCenter(arc.center, arc.end) - startAngle);
  if (ccwToMid <= ccwToEnd) {
    return { startAngle, sweep: ccwToEnd };
  }
  return { startAngle, sweep: ccwToEnd - 2 * Math.PI };
}

export function clampAngleToArc(arc: ArcValue, angle: number): number {
  const { startAngle, sweep } = arcAngularRange(arc);
  if (sweep >= 0) {
    const ccwFromStart = normalizeAngle(angle - startAngle);
    if (ccwFromStart <= sweep) return startAngle + ccwFromStart;
    const gapMidpoint = (sweep + 2 * Math.PI) / 2;
    return ccwFromStart <= gapMidpoint ? startAngle + sweep : startAngle;
  }
  const cwFromStart = normalizeAngle(startAngle - angle);
  const absSweep = -sweep;
  if (cwFromStart <= absSweep) return startAngle - cwFromStart;
  const gapMidpoint = (absSweep + 2 * Math.PI) / 2;
  return cwFromStart <= gapMidpoint ? startAngle + sweep : startAngle;
}

export function pointOnArcFromAngle(arc: ArcValue, angle: number): PointValue {
  const clamped = clampAngleToArc(arc, angle);
  return {
    type: "point",
    x: cleanZero(arc.center.x + arc.radius * Math.cos(clamped)),
    y: cleanZero(arc.center.y + arc.radius * Math.sin(clamped)),
  };
}

export function angleForPointOnArc(arc: ArcValue, point: { x: number; y: number }): number {
  return clampAngleToArc(arc, angleOfFromCenter(arc.center, point));
}

// ─── Interactive helper: reverse-then-forward projection for hover/click ──

export function projectPointerOntoObject(
  kind: "line" | "segment" | "circle" | "arc",
  value: EvaluatedValue | undefined,
  world: { x: number; y: number },
): PointValue | null {
  if (value === undefined || value.type !== kind) return null;
  switch (kind) {
    case "line":
      return pointOnLineFromT(value as LineValue, tForPointOnLine(value as LineValue, world));
    case "segment":
      return pointOnSegmentFromT(value as SegmentValue, tForPointOnSegment(value as SegmentValue, world));
    case "circle":
      return pointOnCircleFromAngle(value as CircleValue, angleForPointOnCircle(value as CircleValue, world));
    case "arc":
      return pointOnArcFromAngle(value as ArcValue, angleForPointOnArc(value as ArcValue, world));
  }
}
