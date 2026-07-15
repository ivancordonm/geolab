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

  it("creates a numeric homothety of a complete transformable object", () => {
    const controller = new ConstructionToolController();
    controller.activate("homothety_scalar");
    controller.setHomothetyRatio(-2);

    controller.handleObjectClick("A", baseDocument);
    const result = controller.handleObjectClick("AB", baseDocument);

    expect(result.createdObjects).toEqual([
      expect.objectContaining({
        kind: "line",
        definition: { type: "homothety_scalar", center: "A", object: "AB", ratio: -2 },
      }),
    ]);
    expectValidAdditions(baseDocument, result.createdObjects!);
  });

  it("creates a point-ratio homothety of a complete transformable object", () => {
    const controller = new ConstructionToolController();
    controller.activate("homothety");

    controller.handleObjectClick("A", baseDocument);
    controller.handleObjectClick("AB", baseDocument);
    const result = controller.handleObjectClick("C", baseDocument);

    expect(result.createdObjects).toEqual([
      expect.objectContaining({
        kind: "line",
        definition: { type: "homothety_point", center: "A", object: "AB", ratioPoint: "C" },
      }),
    ]);
    expectValidAdditions(baseDocument, result.createdObjects!);
  });

  it("reports a validation error instead of throwing for zero scaling of a non-point", () => {
    const controller = new ConstructionToolController();
    controller.activate("homothety_scalar");
    controller.setHomothetyRatio(0);
    controller.handleObjectClick("A", baseDocument);

    const result = controller.handleObjectClick("AB", baseDocument);

    expect(result.createdObjects).toBeUndefined();
    expect(result.state.error).toContain("zero homothety ratio");
  });

  it("inverts a line into a circle when the inversion center is off the line", () => {
    const controller = new ConstructionToolController();
    controller.activate("inversion");
    const document: GeometryDocument = {
      ...baseDocument,
      objects: [
        ...baseDocument.objects,
        {
          id: "invCircle",
          label: "invCircle",
          kind: "circle",
          visible: true,
          definition: { type: "center_through_point", center: "C", point: "A" },
        },
      ],
    };

    controller.handleObjectClick("AB", document);
    const result = controller.handleObjectClick("invCircle", document);

    expect(result.createdObjects?.at(-1)?.kind).toBe("circle");
    expectValidAdditions(document, result.createdObjects!);
  });

  it("reflects a segment as a segment instead of forcing a point result", () => {
    const controller = new ConstructionToolController();
    controller.activate("reflect_line");
    const document: GeometryDocument = {
      ...baseDocument,
      objects: [
        ...baseDocument.objects,
        {
          id: "seg1",
          label: "seg1",
          kind: "segment",
          visible: true,
          definition: { type: "between_points", pointA: "A", pointB: "C" },
        },
      ],
    };

    controller.handleObjectClick("seg1", document);
    const result = controller.handleObjectClick("AB", document);

    expect(result.createdObjects).toHaveLength(1);
    expect(result.createdObjects![0]).toMatchObject({
      kind: "segment",
      definition: { type: "reflection_over_line", object: "seg1", line: "AB" },
    });
    expectValidAdditions(document, result.createdObjects!);
  });

  it("translates a segment as a segment instead of forcing a point result", () => {
    const controller = new ConstructionToolController();
    controller.activate("translation");
    const document: GeometryDocument = {
      ...baseDocument,
      objects: [
        ...baseDocument.objects,
        {
          id: "seg1",
          label: "seg1",
          kind: "segment",
          visible: true,
          definition: { type: "between_points", pointA: "A", pointB: "C" },
        },
      ],
    };

    controller.handleObjectClick("seg1", document);
    controller.handleObjectClick("A", document);
    const result = controller.handleObjectClick("B", document);

    expect(result.createdObjects).toHaveLength(1);
    expect(result.createdObjects![0]).toMatchObject({
      kind: "segment",
      definition: { type: "translation", object: "seg1", from: "A", to: "B" },
    });
    expectValidAdditions(document, result.createdObjects!);
  });

  it("inverts a circle through the inversion center into a line", () => {
    const controller = new ConstructionToolController();
    controller.activate("inversion");
    const document: GeometryDocument = {
      ...baseDocument,
      objects: [
        ...baseDocument.objects,
        {
          id: "srcCircle",
          label: "srcCircle",
          kind: "circle",
          visible: true,
          definition: { type: "center_through_point", center: "C", point: "A" },
        },
        {
          id: "invCircle",
          label: "invCircle",
          kind: "circle",
          visible: true,
          definition: { type: "center_through_point", center: "A", point: "B" },
        },
      ],
    };

    controller.handleObjectClick("srcCircle", document);
    const result = controller.handleObjectClick("invCircle", document);

    expect(result.createdObjects?.at(-1)?.kind).toBe("line");
    expectValidAdditions(document, result.createdObjects!);
  });

  it("inverts a polygon into exact arc edges", () => {
    const controller = new ConstructionToolController();
    controller.activate("inversion");
    const document: GeometryDocument = {
      ...baseDocument,
      objects: [
        ...baseDocument.objects,
        {
          id: "poly1",
          label: "poly1",
          kind: "polygon",
          visible: true,
          definition: { type: "polygon", points: ["A", "B", "C"] },
        },
        freePoint("D", -3, 1),
        {
          id: "invCircle",
          label: "invCircle",
          kind: "circle",
          visible: true,
          definition: { type: "center_through_point", center: "D", point: "A" },
        },
      ],
    };

    controller.handleObjectClick("poly1", document);
    const result = controller.handleObjectClick("invCircle", document);

    const visibleKinds = result.createdObjects?.filter((object) => object.visible).map((object) => object.kind);
    expect(visibleKinds).toEqual(["arc", "arc", "arc"]);
    expectValidAdditions(document, result.createdObjects!);
  });

  it("cancels an in-progress multi-step construction", () => {
    const controller = new ConstructionToolController();
    controller.activate("segment");
    controller.handleObjectClick("A", baseDocument);

    const result = controller.cancel();

    expect(result.state.activeTool).toBe("segment");
    expect(result.state.selectedObjectIds).toEqual([]);
    expect(result.state.pointerWorld).toBeNull();
    expect(result.removedObjectIds).toEqual([]);
  });

  it("removes points auto-created on empty-spot clicks when the construction is cancelled", () => {
    const controller = new ConstructionToolController();
    controller.activate("circle");

    const clickResult = controller.handleCanvasClick({ x: 5, y: 5 }, baseDocument);
    const centerId = clickResult.createdObjects![0].id;

    const cancelResult = controller.cancel();

    expect(cancelResult.removedObjectIds).toEqual([centerId]);
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

  it("clears the current selection when clicking empty canvas with the select tool", () => {
    const controller = new ConstructionToolController();
    controller.handleObjectClick("AB", baseDocument);

    const result = controller.handleCanvasClick({ x: 1, y: 1 }, baseDocument);

    expect(result.selectedObjectId).toBeNull();
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
  it("edits a graphical homothety into a numeric one and supports undo", () => {
    const document: GeometryDocument = {
      ...baseDocument,
      objects: [
        ...baseDocument.objects,
        {
          id: "H",
          label: "H",
          kind: "point",
          visible: true,
          definition: { type: "homothety_point", center: "A", point: "B", ratioPoint: "C" },
        },
      ],
    };
    const { result } = renderHook(() => useGeometryState(document));

    act(() => result.current.updateHomothetyRatio("H", -0.5));

    expect(result.current.document.objects.find((object) => object.id === "H")?.definition).toEqual({
      type: "homothety_scalar", center: "A", object: "B", ratio: -0.5,
    });
    expect(result.current.values.get("H")).toEqual({ type: "point", x: -2, y: 0 });

    act(() => result.current.undo());
    expect(result.current.document.objects.find((object) => object.id === "H")?.definition.type).toBe("homothety_point");
  });
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

  it("toggles and deletes a construction group atomically", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "group-state",
      title: "Group state",
      objects: [
        freePoint("A", 0, 0),
        freePoint("B", 2, 0),
        { id: "c1", label: "c1", kind: "circle", visible: true, definition: { type: "center_through_point", center: "A", point: "B" } },
        { id: "helper", label: "helper", kind: "line", visible: false, definition: { type: "through_points", pointA: "A", pointB: "B" } },
      ],
      groups: [{
        id: "g1",
        label: "Circle",
        members: [
          { objectId: "A", role: "input" },
          { objectId: "B", role: "input" },
          { objectId: "c1", role: "primary" },
          { objectId: "helper", role: "helper" },
        ],
      }],
    };
    const { result } = renderHook(() => useGeometryState(document));

    act(() => result.current.toggleObjectGroupVisibility("g1"));
    expect(result.current.document.objects.every((object) => !object.visible)).toBe(true);
    act(() => result.current.toggleObjectGroupVisibility("g1"));
    expect(result.current.document.objects.filter((object) => object.id !== "helper").every((object) => object.visible)).toBe(true);
    expect(result.current.document.objects.find((object) => object.id === "helper")?.visible).toBe(false);

    act(() => result.current.removeObjectGroup("g1"));
    expect(result.current.document.objects).toEqual([]);
    expect(result.current.document.groups).toBeUndefined();

    act(() => result.current.undo());
    expect(result.current.document.objects).toHaveLength(4);
    expect(result.current.document.groups?.[0].id).toBe("g1");
  });

  it("dissolves a group when deleting a child also removes its primary", () => {
    const document: GeometryDocument = {
      schemaVersion: 1,
      id: "group-child-delete",
      title: "Group child delete",
      objects: [
        freePoint("A", 0, 0),
        freePoint("B", 2, 0),
        { id: "c1", label: "c1", kind: "circle", visible: true, definition: { type: "center_through_point", center: "A", point: "B" } },
      ],
      groups: [{ id: "g1", label: "Circle", members: [
        { objectId: "A", role: "input" },
        { objectId: "B", role: "input" },
        { objectId: "c1", role: "primary" },
      ] }],
    };
    const { result } = renderHook(() => useGeometryState(document));
    act(() => result.current.removeObject("A"));
    expect(result.current.document.objects.map((object) => object.id)).toEqual(["B"]);
    expect(result.current.document.groups).toBeUndefined();
  });

});

describe("construction groups", () => {
  it("groups points created across clicks under the completed circle", () => {
    const controller = new ConstructionToolController();
    controller.activate("circle");
    const first = controller.handleCanvasClick({ x: 0, y: 0 }, baseDocument);
    const document = { ...baseDocument, objects: [...baseDocument.objects, ...first.createdObjects!] };
    const second = controller.handleCanvasClick({ x: 2, y: 0 }, document);

    expect(second.createdGroup).toEqual({
      id: "g1",
      label: "Circle",
      members: [
        { objectId: first.createdObjects![0].id, role: "input" },
        { objectId: second.createdObjects![0].id, role: "input" },
        { objectId: second.createdObjects![1].id, role: "primary" },
      ],
    });
  });

  it("does not adopt existing inputs into a group", () => {
    const controller = new ConstructionToolController();
    controller.activate("circle");
    controller.handleObjectClick("A", baseDocument);
    const result = controller.handleCanvasClick({ x: 2, y: 0 }, baseDocument);
    expect(result.createdGroup?.members.map((member) => member.objectId)).toEqual([
      result.createdObjects![0].id,
      result.createdObjects![1].id,
    ]);
    expect(result.createdGroup?.members.some((member) => member.objectId === "A")).toBe(false);
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
