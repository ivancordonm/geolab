import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GeometryDocument, GeometryObject } from "../types/geometry";
import { ConstructionToolController } from "./constructionTools";
import { GeometryGraph } from "./engine";
import { useConstructionTools } from "./useConstructionTools";
import { useGeometryState } from "./useGeometryState";

const baseDocument: GeometryDocument = {
  schemaVersion: 1,
  id: "manual-tools",
  title: "Manual construction",
  objects: [
    freePoint("A", 0, 0),
    freePoint("B", 4, 0),
    freePoint("C", 2, 3),
    {
      id: "AB",
      label: "AB",
      kind: "line",
      visible: true,
      definition: { type: "through_points", pointA: "A", pointB: "B" },
    },
  ],
};

describe("ConstructionToolController", () => {
  it("creates a free point from a canvas click", () => {
    const controller = new ConstructionToolController();
    controller.activate("point");

    const result = controller.handleCanvasClick({ x: 1.25, y: -2.5 }, baseDocument);

    expect(result.createdObjects).toEqual([freePoint("D", 1.25, -2.5)]);
    expectValidAdditions(baseDocument, result.createdObjects!);
  });

  it.each([
    ["segment", "segment", "between_points"],
    ["line", "line", "through_points"],
    ["circle", "circle", "center_through_point"],
    ["midpoint", "point", "midpoint"],
  ] as const)("creates a %s by selecting two points", (tool, kind, definitionType) => {
    const controller = new ConstructionToolController();
    controller.activate(tool);

    expect(controller.handleObjectClick("A", baseDocument).createdObjects).toBeUndefined();
    const result = controller.handleObjectClick("C", baseDocument);

    expect(result.createdObjects).toHaveLength(1);
    expect(result.createdObjects![0].kind).toBe(kind);
    expect(result.createdObjects![0].definition.type).toBe(definitionType);
    expectValidAdditions(baseDocument, result.createdObjects!);
  });

  it.each([
    ["perpendicular", "perpendicular_through"],
    ["parallel", "parallel_through"],
  ] as const)("creates a %s line by selecting a point and line", (tool, definitionType) => {
    const controller = new ConstructionToolController();
    controller.activate(tool);

    controller.handleObjectClick("C", baseDocument);
    const result = controller.handleObjectClick("AB", baseDocument);

    expect(result.createdObjects).toHaveLength(1);
    expect(result.createdObjects![0].kind).toBe("line");
    expect(result.createdObjects![0].definition.type).toBe(definitionType);
    expectValidAdditions(baseDocument, result.createdObjects!);
  });

  it("cancels an in-progress multi-step construction", () => {
    const controller = new ConstructionToolController();
    controller.activate("segment");
    controller.handleObjectClick("A", baseDocument);

    const state = controller.cancel();

    expect(state.activeTool).toBe("segment");
    expect(state.selectedObjectIds).toEqual([]);
    expect(state.pointerWorld).toBeNull();
  });

  it("rejects objects of the wrong kind without mutating the selection", () => {
    const controller = new ConstructionToolController();
    controller.activate("perpendicular");

    const result = controller.handleObjectClick("AB", baseDocument);

    expect(result.createdObjects).toBeUndefined();
    expect(result.state.selectedObjectIds).toEqual([]);
    expect(result.state.error).toContain("Select a point");
  });

  // --- Auto-create points via canvas click ---

  it("creates two points and a segment from two canvas clicks on empty spots", () => {
    const controller = new ConstructionToolController();
    controller.activate("segment");

    // First click: creates point, advances selection.
    const firstResult = controller.handleCanvasClick({ x: 0, y: 0 }, baseDocument);
    expect(firstResult.createdObjects).toHaveLength(1);
    expect(firstResult.createdObjects![0].kind).toBe("point");
    const firstPoint = firstResult.createdObjects![0];

    // Simulate the document update after adding the first point.
    const docWithFirst: GeometryDocument = {
      ...baseDocument,
      objects: [...baseDocument.objects, firstPoint],
    };

    // Second click: creates another point AND the segment.
    const secondResult = controller.handleCanvasClick({ x: 4, y: 3 }, docWithFirst);
    expect(secondResult.createdObjects).toHaveLength(2);
    const [secondPoint, segment] = secondResult.createdObjects!;
    expect(secondPoint.kind).toBe("point");
    expect(segment.kind).toBe("segment");
    // Segment references the two auto-created points.
    expect(segment.definition).toMatchObject({
      type: "between_points",
      pointA: firstPoint.id,
      pointB: secondPoint.id,
    });
    expectValidAdditions(docWithFirst, secondResult.createdObjects!);
  });

  it("creates a segment from one existing point and one canvas click", () => {
    const controller = new ConstructionToolController();
    controller.activate("segment");

    // First step: select an existing point by object click.
    const firstResult = controller.handleObjectClick("A", baseDocument);
    expect(firstResult.createdObjects).toBeUndefined();

    // Second step: click on empty canvas — creates the new point and the segment.
    const secondResult = controller.handleCanvasClick({ x: 5, y: 5 }, baseDocument);
    expect(secondResult.createdObjects).toHaveLength(2);
    const [newPoint, segment] = secondResult.createdObjects!;
    expect(newPoint.kind).toBe("point");
    expect(segment.definition).toMatchObject({ type: "between_points", pointA: "A", pointB: newPoint.id });
    expectValidAdditions(baseDocument, secondResult.createdObjects!);
  });

  it("emits error when clicking empty canvas on a step that requires an existing line", () => {
    const controller = new ConstructionToolController();
    controller.activate("perpendicular");

    // First step (point) succeeds via object click.
    controller.handleObjectClick("A", baseDocument);

    // Second step requires a line — canvas click should fail.
    const result = controller.handleCanvasClick({ x: 1, y: 1 }, baseDocument);
    expect(result.createdObjects).toBeUndefined();
    expect(result.state.error).toContain("existing line");
    // Selection should remain unchanged (still has "A").
    expect(result.state.selectedObjectIds).toEqual(["A"]);
  });

  it("canvas click on empty spot does nothing when select tool is active", () => {
    const controller = new ConstructionToolController();
    // default tool is "select"
    const result = controller.handleCanvasClick({ x: 1, y: 1 }, baseDocument);
    expect(result.createdObjects).toBeUndefined();
  });

  it("removes auto-created non-anchor points when finishing a vector polygon", () => {
    const controller = new ConstructionToolController();
    controller.activate("vector_polygon");
    let document: GeometryDocument = {
      schemaVersion: 1,
      id: "vector-polygon",
      title: "Vector polygon",
      objects: [],
    };

    for (const coordinate of [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }]) {
      const result = controller.handleCanvasClick(coordinate, document);
      document = { ...document, objects: [...document.objects, ...result.createdObjects!] };
    }

    const result = controller.finish(document);

    expect(result.removedObjectIds).toEqual(["B", "C"]);
    expect(result.createdObjects).toHaveLength(1);
    expect(result.createdObjects![0].definition).toEqual({
      type: "vector_polygon",
      anchor: "A",
      offsets: [{ x: 4, y: 0 }, { x: 2, y: 3 }],
    });
  });

  it("preserves existing vector-polygon vertices and removes only auto-created ones", () => {
    const controller = new ConstructionToolController();
    controller.activate("vector_polygon");

    controller.handleObjectClick("A", baseDocument);
    controller.handleObjectClick("B", baseDocument);
    const pointResult = controller.handleCanvasClick({ x: 2, y: 3 }, baseDocument);
    const document = {
      ...baseDocument,
      objects: [...baseDocument.objects, ...pointResult.createdObjects!],
    };
    const result = controller.handleObjectClick("A", document);

    expect(result.removedObjectIds).toEqual(["D"]);
    expect(result.removedObjectIds).not.toContain("A");
    expect(result.removedObjectIds).not.toContain("B");
  });
});

describe("useConstructionTools", () => {
  it("cancels an in-progress tool when Escape is pressed", () => {
    const { result } = renderHook(() =>
      useConstructionTools({
        document: baseDocument,
        onApplyObjectChanges: vi.fn(),
        onSelectObject: vi.fn(),
      }),
    );

    act(() => result.current.activateTool("segment"));
    act(() => result.current.handleObjectClick("A"));
    expect(result.current.selectedObjectIds).toEqual(["A"]);

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    expect(result.current.activeTool).toBe("segment");
    expect(result.current.selectedObjectIds).toEqual([]);
  });
});

describe("useGeometryState", () => {
  it("applies vector-polygon creation and auxiliary-point removal atomically", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "vector-polygon-state",
      title: "Vector polygon state",
      objects: [freePoint("A", 0, 0), freePoint("B", 4, 0), freePoint("C", 2, 3)],
    };
    const polygon: GeometryObject = {
      id: "vpoly1",
      label: "vpoly1",
      kind: "polygon",
      visible: true,
      definition: {
        type: "vector_polygon",
        anchor: "A",
        offsets: [{ x: 4, y: 0 }, { x: 2, y: 3 }],
      },
    };
    const { result } = renderHook(() => useGeometryState(document));

    act(() => result.current.applyObjectChanges([polygon], ["B", "C"]));

    expect(result.current.document.objects.map((object) => object.id)).toEqual(["A", "vpoly1"]);
    expect(result.current.values.get("vpoly1")).toEqual({
      type: "polygon",
      vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }],
    });

    act(() => result.current.moveFreePoint("A", 1, -2));

    expect(result.current.values.get("vpoly1")).toEqual({
      type: "polygon",
      vertices: [{ x: 1, y: -2 }, { x: 5, y: -2 }, { x: 3, y: 1 }],
    });
  });

  it("removes an object together with its dependants", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "remove-object-state",
      title: "Remove object state",
      objects: [
        freePoint("A", 0, 0),
        freePoint("B", 4, 0),
        {
          id: "AB",
          label: "AB",
          kind: "line",
          visible: true,
          definition: { type: "through_points", pointA: "A", pointB: "B" },
        },
        {
          id: "M",
          label: "M",
          kind: "point",
          visible: true,
          definition: { type: "midpoint", pointA: "A", pointB: "B" },
        },
      ],
    };
    const { result } = renderHook(() => useGeometryState(document));

    act(() => result.current.removeObject("A"));

    expect(result.current.document.objects.map((object) => object.id)).toEqual(["B"]);
    expect(result.current.values.has("A")).toBe(false);
    expect(result.current.values.has("AB")).toBe(false);
    expect(result.current.values.has("M")).toBe(false);
  });

});

function freePoint(id: string, x: number, y: number): GeometryObject {
  return {
    id,
    label: id,
    kind: "point",
    visible: true,
    definition: { type: "free", x, y },
  };
}

function expectValidAdditions(document: GeometryDocument, objects: readonly GeometryObject[]): void {
  expect(
    () => new GeometryGraph({ ...document, objects: [...document.objects, ...objects] }),
  ).not.toThrow();
}
