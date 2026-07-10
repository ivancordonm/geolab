import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GeometryDocument, Point } from "../types/geometry";
import { MAX_HISTORY_SNAPSHOTS, useGeometryState } from "./useGeometryState";

const emptyDocument: GeometryDocument = {
  schemaVersion: 1,
  id: "history-test",
  title: "History test",
  objects: [],
};

describe("useGeometryState history", () => {
  it("synchronizes the cloud title without adding to or being reverted by undo history", () => {
    const { result } = renderHook(() => useGeometryState(emptyDocument));
    const point: Point = {
      id: "A",
      label: "A",
      kind: "point",
      visible: true,
      definition: { type: "free", x: 0, y: 0 },
    };

    act(() => result.current.addObject(point));
    act(() => result.current.setDocumentTitle("Cloud title"));
    act(() => result.current.undo());

    expect(result.current.document.objects).toHaveLength(0);
    expect(result.current.document.title).toBe("Cloud title");
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.redo());
    expect(result.current.document.title).toBe("Cloud title");
  });

  it("keeps at most the latest 100 undo snapshots", () => {
    const { result } = renderHook(() => useGeometryState(emptyDocument));
    const changeCount = MAX_HISTORY_SNAPSHOTS + 5;

    act(() => {
      for (let index = 0; index < changeCount; index += 1) {
        const point: Point = {
          id: `P_${index}`,
          label: `P_${index}`,
          kind: "point",
          visible: true,
          definition: { type: "free", x: index, y: index },
        };
        result.current.addObject(point);
      }
    });

    expect(result.current.document.objects).toHaveLength(changeCount);
    act(() => {
      for (let index = 0; index < MAX_HISTORY_SNAPSHOTS; index += 1) {
        result.current.undo();
      }
    });

    expect(result.current.document.objects).toHaveLength(5);
    expect(result.current.canUndo).toBe(false);
  });
});
