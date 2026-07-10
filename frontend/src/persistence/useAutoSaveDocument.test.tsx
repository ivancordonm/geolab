import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exampleGeometryDocument } from "../geometry/example";
import type { Point } from "../types/geometry";
import { GEOMETRY_STORAGE_KEY } from "./documentPersistence";
import { AUTO_SAVE_DELAY_MS, useAutoSaveDocument } from "./useAutoSaveDocument";

describe("useAutoSaveDocument", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces changes and saves only the latest graph and viewport", () => {
    const setItem = vi.spyOn(window.localStorage, "setItem");
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

    rerender({ x: 3, scale: 70 });
    rerender({ x: 7, scale: 90 });
    expect(setItem).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(AUTO_SAVE_DELAY_MS));

    const saved = JSON.parse(window.localStorage.getItem(GEOMETRY_STORAGE_KEY) ?? "null");
    expect(saved.objects.find((object: { id: string }) => object.id === "A").definition.x).toBe(7);
    expect(saved.viewport.scale).toBe(90);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("flushes the latest pending save on unmount and cancels its timer", () => {
    const setItem = vi.spyOn(window.localStorage, "setItem");
    const { unmount } = renderHook(() =>
      useAutoSaveDocument(
        exampleGeometryDocument,
        { centerX: 4, centerY: 5, scale: 80 },
        vi.fn(),
      ),
    );

    unmount();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(GEOMETRY_STORAGE_KEY) ?? "null").viewport)
      .toEqual({ centerX: 4, centerY: 5, scale: 80 });

    act(() => vi.runAllTimers());
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
