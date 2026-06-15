import { describe, expect, it } from "vitest";

import { exampleGeometryDocument } from "./example";
import { GeometryGraph } from "./engine";
import { panViewport, screenToWorld, worldToScreen } from "./viewport";

describe("canvas drag geometry integration", () => {
  it("moves free points using screen-to-world coordinates", () => {
    const viewport = exampleGeometryDocument.viewport!;
    const size = { width: 1000, height: 700 };
    const intendedWorldPosition = { x: -1.25, y: 2.5 };
    const pointerPosition = worldToScreen(intendedWorldPosition, viewport, size);
    const worldPosition = screenToWorld(pointerPosition, viewport, size);
    const graph = new GeometryGraph(exampleGeometryDocument);

    const result = graph.moveFreePoint("A", worldPosition.x, worldPosition.y);

    expect(result.values.get("A")).toEqual({ type: "point", x: -1.25, y: 2.5 });
  });

  it("updates dependent objects after a free-point drag", () => {
    const graph = new GeometryGraph(exampleGeometryDocument);
    const result = graph.moveFreePoint("B", 2, 3);

    expect(result.recomputedObjectIds).toEqual([
      "B",
      "AB",
      "base",
      "M",
      "parallel",
      "altitude",
    ]);
    expect(result.values.get("M")).toEqual({ type: "point", x: 0, y: 1 });
    expect(result.values.get("base")).toEqual({
      type: "segment",
      start: { x: -2, y: -1 },
      end: { x: 2, y: 3 },
    });
    expect(result.values.get("circumference")).toEqual(
      new GeometryGraph(exampleGeometryDocument).values.get("circumference"),
    );
  });

  it("does not allow derived midpoint dragging", () => {
    const graph = new GeometryGraph(exampleGeometryDocument);

    expect(() => graph.moveFreePoint("M", 0, 0)).toThrow("is not a free point");
  });
});

describe("panViewport", () => {
  const viewport = { centerX: 0, centerY: 0, scale: 60 };

  it("panning right (positive dSvgX) shifts center left in world space", () => {
    const result = panViewport(viewport, 60, 0);
    expect(result.centerX).toBeCloseTo(-1);
    expect(result.centerY).toBeCloseTo(0);
    expect(result.scale).toBe(60);
  });

  it("panning down (positive dSvgY) shifts center up in world space", () => {
    const result = panViewport(viewport, 0, 60);
    expect(result.centerX).toBeCloseTo(0);
    expect(result.centerY).toBeCloseTo(1);
    expect(result.scale).toBe(60);
  });

  it("world point under cursor stays fixed after pan", () => {
    const size = { width: 1000, height: 700 };
    const worldPoint = { x: 2, y: -1 };
    const screenBefore = worldToScreen(worldPoint, viewport, size);

    // Simulate dragging 30px to the right and 20px down.
    const dSvgX = 30;
    const dSvgY = 20;
    const panned = panViewport(viewport, dSvgX, dSvgY);

    // The world point under the original screen position should have shifted by the drag.
    const screenAfter = worldToScreen(worldPoint, panned, size);
    expect(screenAfter.x).toBeCloseTo(screenBefore.x + dSvgX);
    expect(screenAfter.y).toBeCloseTo(screenBefore.y + dSvgY);
  });

  it("preserves scale", () => {
    const result = panViewport({ centerX: 1, centerY: -2, scale: 120 }, 100, 50);
    expect(result.scale).toBe(120);
  });
});

