import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCloudDocuments } from "./useCloudDocuments";

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleDocument = {
  schemaVersion: 1 as const,
  id: "doc-1",
  title: "Triangle",
  objects: [],
};

describe("useCloudDocuments", () => {
  it("loads the document list when the panel opens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: "1", title: "A", updatedAt: "2026-01-01T00:00:00Z" }]), {
          status: 200,
        }),
      ),
    );

    const { result } = renderHook(() => useCloudDocuments(vi.fn()));
    act(() => result.current.openPanel());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.panelOpen).toBe(true);
  });

  it("saveAsNew stores the returned id as the current cloudId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: "new-id", title: "Triangle", document: sampleDocument, updatedAt: "2026-01-01T00:00:00Z" }),
          { status: 201 },
        ),
      ),
    );

    const { result } = renderHook(() => useCloudDocuments(vi.fn()));
    await act(async () => {
      await result.current.saveAsNew("Triangle", sampleDocument);
    });

    expect(result.current.cloudId).toBe("new-id");
  });

  it("deleteDocument clears cloudId when the deleted document was open", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "1", title: "Triangle", document: sampleDocument, updatedAt: "2026-01-01T00:00:00Z" }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCloudDocuments(vi.fn()));
    await act(async () => {
      await result.current.saveAsNew("Triangle", sampleDocument);
    });
    expect(result.current.cloudId).toBe("1");

    await act(async () => {
      await result.current.deleteDocument("1");
    });

    expect(result.current.cloudId).toBeNull();
  });

  it("calls onUnauthorized and sets an error on a 401 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const onUnauthorized = vi.fn();

    const { result } = renderHook(() => useCloudDocuments(onUnauthorized));
    act(() => result.current.openPanel());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(onUnauthorized).toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });
});
