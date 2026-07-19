import { describe, expect, it } from "vitest";

import type { GeometryViewport } from "../types/geometry";
import {
  approximateVisibleCircleAsLine,
  chooseGridStep,
  clientToSvgScreen,
  clipImplicitLineToBounds,
  getEffectiveGridStep,
  getWorldBounds,
  MAX_VIEWPORT_SCALE,
  MIN_VIEWPORT_SCALE,
  screenToWorld,
  snapToGrid,
  worldToScreen,
  zoomViewportAtScreenPoint,
} from "./viewport";
import type { GridSettings } from "./viewport";

const viewport: GeometryViewport = { centerX: 2, centerY: 1, scale: 50 };
const size = { width: 1000, height: 700 };

describe("viewport coordinates", () => {
  it("converts world coordinates to screen coordinates and back", () => {
    const world = { x: 5.25, y: -2.5 };
    const screen = worldToScreen(world, viewport, size);

    expect(screen).toEqual({ x: 662.5, y: 525 });
    expect(screenToWorld(screen, viewport, size)).toEqual(world);
  });

  it("converts browser client coordinates into the SVG viewBox", () => {
    const screen = clientToSvgScreen(
      { x: 300, y: 250 },
      { left: 100, top: 50, width: 400, height: 350 },
      size,
    );

    expect(screen).toEqual({ x: 500, y: 400 });
  });

  it("keeps the world point under the cursor fixed while zooming", () => {
    const cursor = { x: 720, y: 180 };
    const before = screenToWorld(cursor, viewport, size);
    const zoomed = zoomViewportAtScreenPoint(viewport, cursor, size, 1.5);
    const after = screenToWorld(cursor, zoomed, size);

    expect(after.x).toBeCloseTo(before.x, 12);
    expect(after.y).toBeCloseTo(before.y, 12);
    expect(zoomed.scale).toBe(75);
  });

  it("allows a much wider view while preserving the cursor anchor at the zoom bounds", () => {
    const cursor = { x: 720, y: 180 };
    const wideViewport: GeometryViewport = { centerX: 2, centerY: 1, scale: MIN_VIEWPORT_SCALE };
    const before = screenToWorld(cursor, wideViewport, size);
    const zoomedOut = zoomViewportAtScreenPoint(wideViewport, cursor, size, 1 / 1.12);
    const after = screenToWorld(cursor, zoomedOut, size);

    expect(zoomedOut.scale).toBe(MIN_VIEWPORT_SCALE);
    expect(after.x).toBeCloseTo(before.x, 12);
    expect(after.y).toBeCloseTo(before.y, 12);
    expect(zoomViewportAtScreenPoint({ ...viewport, scale: MAX_VIEWPORT_SCALE }, cursor, size, 1.12).scale).toBe(MAX_VIEWPORT_SCALE);
  });

  it("clips implicit lines to visible world bounds", () => {
    const bounds = getWorldBounds({ centerX: 0, centerY: 0, scale: 50 }, size);
    const horizontal = clipImplicitLineToBounds(
      { type: "line", a: 0, b: 1, c: -2 },
      bounds,
    );
    const vertical = clipImplicitLineToBounds(
      { type: "line", a: 1, b: 0, c: 3 },
      bounds,
    );

    expect(horizontal).toEqual({ start: { x: -10, y: 2 }, end: { x: 10, y: 2 } });
    expect(vertical).toEqual({ start: { x: -3, y: -7 }, end: { x: -3, y: 7 } });
  });

  it("approximates a huge visible circle with a bounded sub-pixel tangent", () => {
    const center = { x: 344_000, y: -114_000 };
    const radius = 362_400;
    const circle = approximateVisibleCircleAsLine(
      center,
      radius,
      { width: 1117, height: 772 },
    );

    expect(circle).not.toBeNull();
    const toCanvas = { x: 1117 / 2 - center.x, y: 772 / 2 - center.y };
    const centerDistance = Math.hypot(toCanvas.x, toCanvas.y);
    const normal = { x: toCanvas.x / centerDistance, y: toCanvas.y / centerDistance };
    const tangentPoint = {
      x: center.x + normal.x * radius,
      y: center.y + normal.y * radius,
    };
    const tangent = { x: -normal.y, y: normal.x };
    for (const point of [circle!.start, circle!.end]) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1117);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(772);

      const fromTangentPoint = { x: point.x - tangentPoint.x, y: point.y - tangentPoint.y };
      expect(fromTangentPoint.x * normal.x + fromTangentPoint.y * normal.y).toBeCloseTo(0, 8);
      const alongTangent = Math.abs(fromTangentPoint.x * tangent.x + fromTangentPoint.y * tangent.y);
      const sagitta = (alongTangent * alongTangent) /
        (radius + Math.sqrt(radius * radius - alongTangent * alongTangent));
      expect(sagitta).toBeLessThanOrEqual(1);
    }
  });

  it("keeps visibly curved and off-screen circles out of the tangent fallback", () => {
    expect(approximateVisibleCircleAsLine({ x: 500, y: 350 }, 200, size)).toBeNull();
    expect(approximateVisibleCircleAsLine({ x: 50_000, y: 50_000 }, 100, size)).toBeNull();
  });

  it("keeps a near-threshold circle curved when tangent error exceeds one pixel", () => {
    expect(
      approximateVisibleCircleAsLine(
        { x: 500, y: -124_998 },
        124_999,
        size,
      ),
    ).toBeNull();
  });

  it("chooses stable human-readable grid steps", () => {
    expect(chooseGridStep(72)).toBe(1);
    expect(chooseGridStep(30)).toBe(5);
    expect(chooseGridStep(140)).toBe(1);
  });
});

describe("getEffectiveGridStep", () => {
  it("delegates to chooseGridStep when stepMode is auto", () => {
    const settings: GridSettings = {
      showGrid: true,
      showAxes: true,
      snapToGrid: false,
      stepMode: "auto",
      manualStep: 1,
    };
    expect(getEffectiveGridStep(settings, 50)).toBe(chooseGridStep(50));
  });

  it("returns manualStep when stepMode is manual, ignoring viewport scale", () => {
    const settings: GridSettings = {
      showGrid: true,
      showAxes: true,
      snapToGrid: true,
      stepMode: "manual",
      manualStep: 2.5,
    };
    expect(getEffectiveGridStep(settings, 10)).toBe(2.5);
    expect(getEffectiveGridStep(settings, 500)).toBe(2.5);
  });
});

describe("snapToGrid", () => {
  it("snaps both axes to the nearest grid node when within the pixel radius", () => {
    expect(snapToGrid({ x: 2.02, y: 4.98 }, 1, 50)).toEqual({ x: 2, y: 5 });
  });

  it("leaves a coordinate unsnapped when it is farther than the radius from any grid node", () => {
    expect(snapToGrid({ x: 2.3, y: 4.98 }, 1, 50)).toEqual({ x: 2.3, y: 5 });
  });

  it("shrinks the snap radius in world units as the viewport zooms in", () => {
    expect(snapToGrid({ x: 2.05, y: 0 }, 1, 200)).toEqual({ x: 2.05, y: 0 });
    expect(snapToGrid({ x: 2.02, y: 0 }, 1, 200)).toEqual({ x: 2, y: 0 });
  });

  it("accepts a custom snap radius in pixels", () => {
    expect(snapToGrid({ x: 2.3, y: 0 }, 1, 50, 20)).toEqual({ x: 2, y: 0 });
  });

  it("snaps to multiples of a non-1 step", () => {
    expect(snapToGrid({ x: 3.9, y: 0 }, 2, 50)).toEqual({ x: 4, y: 0 });
  });
});
