import { describe, expect, it } from "vitest";

import type { ArcValue, CircleValue, LineValue, SegmentValue } from "../../types/geometry";
import {
  angleForPointOnArc,
  angleForPointOnCircle,
  clampAngleToArc,
  pointOnArcFromAngle,
  pointOnCircleFromAngle,
  pointOnLineFromT,
  pointOnSegmentFromT,
  projectPointerOntoObject,
  tForPointOnLine,
  tForPointOnSegment,
} from "./pointOnObject";

describe("point on line", () => {
  const horizontalAxis: LineValue = { type: "line", a: 0, b: 1, c: 0 };

  it("round-trips t -> point -> t", () => {
    const point = pointOnLineFromT(horizontalAxis, 2);
    expect(point).toEqual({ type: "point", x: -2, y: 0 });
    expect(tForPointOnLine(horizontalAxis, point)).toBeCloseTo(2, 9);
  });

  it("t is unbounded (a line has no endpoints)", () => {
    expect(tForPointOnLine(horizontalAxis, { x: -1000, y: 0 })).toBeCloseTo(1000, 9);
  });
});

describe("point on segment", () => {
  const segment: SegmentValue = { type: "segment", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } };

  it("projects an off-segment point perpendicularly", () => {
    expect(tForPointOnSegment(segment, { x: 2, y: 3 })).toBeCloseTo(0.5, 9);
    expect(pointOnSegmentFromT(segment, 0.5)).toEqual({ type: "point", x: 2, y: 0 });
  });

  it("clamps t to [0, 1] past either endpoint", () => {
    expect(tForPointOnSegment(segment, { x: 10, y: 0 })).toBeCloseTo(1, 9);
    expect(tForPointOnSegment(segment, { x: -10, y: 0 })).toBeCloseTo(0, 9);
    expect(pointOnSegmentFromT(segment, 5)).toEqual({ type: "point", x: 4, y: 0 });
    expect(pointOnSegmentFromT(segment, -5)).toEqual({ type: "point", x: 0, y: 0 });
  });
});

describe("point on circle", () => {
  const circle: CircleValue = { type: "circle", center: { x: 0, y: 0 }, radius: 5 };

  it("round-trips angle -> point -> angle", () => {
    const point = pointOnCircleFromAngle(circle, Math.PI / 2);
    expect(point.x).toBeCloseTo(0, 9);
    expect(point.y).toBeCloseTo(5, 9);
    expect(angleForPointOnCircle(circle, point)).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe("point on arc", () => {
  // Upper half-circle: start=(5,0) angle 0, mid=(0,5) angle pi/2, end=(-5,0) angle pi. CCW sweep.
  const ccwArc: ArcValue = {
    type: "arc",
    center: { x: 0, y: 0 },
    radius: 5,
    start: { x: 5, y: 0 },
    mid: { x: 0, y: 5 },
    end: { x: -5, y: 0 },
  };

  it("keeps an angle already inside the arc's range", () => {
    expect(clampAngleToArc(ccwArc, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("clamps to the nearer endpoint when the angle falls in the excluded (lower) half", () => {
    expect(clampAngleToArc(ccwArc, -Math.PI / 4)).toBeCloseTo(0, 9); // closer to start
    expect(clampAngleToArc(ccwArc, Math.PI + Math.PI / 4)).toBeCloseTo(Math.PI, 9); // closer to end
  });

  it("angleForPointOnArc round-trips a point on the arc", () => {
    const point = pointOnArcFromAngle(ccwArc, Math.PI / 2);
    expect(angleForPointOnArc(ccwArc, point)).toBeCloseTo(Math.PI / 2, 9);
  });

  // Lower half-circle: start=(5,0) angle 0, mid=(0,-5) angle -pi/2, end=(-5,0) angle pi. CW sweep.
  const cwArc: ArcValue = {
    type: "arc",
    center: { x: 0, y: 0 },
    radius: 5,
    start: { x: 5, y: 0 },
    mid: { x: 0, y: -5 },
    end: { x: -5, y: 0 },
  };

  it("handles a clockwise arc's angular range", () => {
    expect(clampAngleToArc(cwArc, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 9); // mid itself
    expect(clampAngleToArc(cwArc, Math.PI / 4)).toBeCloseTo(0, 9); // in the excluded upper half, nearer start
  });
});

describe("projectPointerOntoObject", () => {
  it("returns null when the value is missing or of a different type", () => {
    expect(projectPointerOntoObject("line", undefined, { x: 0, y: 0 })).toBeNull();
    expect(
      projectPointerOntoObject("line", { type: "circle", center: { x: 0, y: 0 }, radius: 1 }, { x: 0, y: 0 }),
    ).toBeNull();
  });

  it("projects onto a line", () => {
    const value: LineValue = { type: "line", a: 0, b: 1, c: 0 };
    expect(projectPointerOntoObject("line", value, { x: -3, y: 7 })).toEqual({ type: "point", x: -3, y: 0 });
  });
});
