import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { exampleGeometryDocument } from "../geometry/example";
import type { Point } from "../types/geometry";
import { GEOMETRY_STORAGE_KEY } from "./documentPersistence";
import { useAutoSaveDocument } from "./useAutoSaveDocument";

describe("useAutoSaveDocument", () => {
  it("auto-saves the current graph and viewport whenever they change", async () => {
    const onError = vi.fn();
    const { rerender } = renderHook(
      ({ x, scale }) =>
        useAutoSaveDocument(
          {
            ...exampleGeometryDocument,
            objects: exampleGeometryDocument.objects.map((object) =>
              object.id === "A" && object.kind === "point" && object.definition.type === "free"
                ? ({ ...object, definition: { ...object.definition, x } } satisfies Point)
                : object,
            ),
          },
          { centerX: 0, centerY: 0, scale },
          onError,
        ),
      { initialProps: { x: -2, scale: 60 } },
    );

    rerender({ x: 7, scale: 90 });

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(GEOMETRY_STORAGE_KEY) ?? "null");
      expect(saved.objects.find((object: { id: string }) => object.id === "A").definition.x).toBe(7);
      expect(saved.viewport.scale).toBe(90);
    });
    expect(onError).not.toHaveBeenCalled();
  });
});
