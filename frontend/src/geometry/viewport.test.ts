import { describe, expect, it } from "vitest";

import type { GeometryViewport } from "../types/geometry";
import {
  chooseGridStep,
  clientToSvgScreen,
  clipImplicitLineToBounds,
  getWorldBounds,
  screenToWorld,
  worldToScreen,
  zoomViewportAtScreenPoint,
} from "./viewport";

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

  it("chooses stable human-readable grid steps", () => {
    expect(chooseGridStep(72)).toBe(1);
    expect(chooseGridStep(30)).toBe(5);
    expect(chooseGridStep(140)).toBe(1);
  });
});

