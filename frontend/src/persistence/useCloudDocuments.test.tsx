import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DocumentDetail } from "../types/documents";
import { type CloudActionResult, useCloudDocuments } from "./useCloudDocuments";

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleDocument = {
  schemaVersion: 1 as const,
  id: "doc-1",
  title: "Triangle",
  objects: [],
};

function detail(id: string, title = id) {
  return {
    id,
    title,
    document: { ...sampleDocument, id, title },
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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

  it("saveAsNew stores the returned id and returns the canonical detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(detail("new-id", "Canonical title")), { status: 201 }),
      ),
    );

    const { result } = renderHook(() => useCloudDocuments(vi.fn()));
    let saveResult;
    await act(async () => {
      saveResult = await result.current.saveAsNew("Canonical title", sampleDocument);
    });

    expect(result.current.cloudId).toBe("new-id");
    expect(saveResult).toEqual({
      status: "success",
      value: expect.objectContaining({ title: "Canonical title" }),
    });
  });

  it("serializes saveCurrent mutations and continues the queue after an error", async () => {
    const firstPut = deferred<Response>();
    const secondPut = deferred<Response>();
    const putBodies: Array<{ title: string }> = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/documents" && init?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify(detail("cloud-1", "Initial")), { status: 201 }),
        );
      }
      if (url === "/documents/cloud-1" && init?.method === "PUT") {
        putBodies.push(JSON.parse(init.body as string) as { title: string });
        return putBodies.length === 1 ? firstPut.promise : secondPut.promise;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCloudDocuments(vi.fn()));
    await act(async () => {
      await result.current.saveAsNew("Initial", sampleDocument);
    });

    let firstSave!: ReturnType<typeof result.current.saveCurrent>;
    let secondSave!: ReturnType<typeof result.current.saveCurrent>;
    act(() => {
      firstSave = result.current.saveCurrent("First", { ...sampleDocument, title: "First" });
      secondSave = result.current.saveCurrent("Second", { ...sampleDocument, title: "Second" });
    });

    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0].title).toBe("First");

    let firstResult!: CloudActionResult<DocumentDetail>;
    await act(async () => {
      firstPut.resolve(new Response(null, { status: 500 }));
      firstResult = await firstSave;
    });
    expect(firstResult).toEqual({ status: "superseded" });

    await waitFor(() => expect(putBodies).toHaveLength(2));
    expect(putBodies[1].title).toBe("Second");

    let secondResult!: CloudActionResult<DocumentDetail>;
    await act(async () => {
      secondPut.resolve(
        new Response(JSON.stringify(detail("cloud-1", "Second")), { status: 200 }),
      );
      secondResult = await secondSave;
    });

    expect(secondResult).toEqual({
      status: "success",
      value: expect.objectContaining({ id: "cloud-1", title: "Second" }),
    });
    expect(result.current.cloudId).toBe("cloud-1");
    expect(result.current.error).toBeNull();
  });

  it("keeps the newest open when A and B resolve out of order", async () => {
    const openA = deferred<Response>();
    const openB = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        (typeof input === "string" ? input : input.toString()).endsWith("/A")
          ? openA.promise
          : openB.promise,
      ),
    );
    const { result } = renderHook(() => useCloudDocuments(vi.fn()));

    let promiseA!: ReturnType<typeof result.current.openDocument>;
    let promiseB!: ReturnType<typeof result.current.openDocument>;
    act(() => {
      promiseA = result.current.openDocument("A");
      promiseB = result.current.openDocument("B");
    });

    let resultB!: CloudActionResult<DocumentDetail>;
    await act(async () => {
      openB.resolve(new Response(JSON.stringify(detail("B")), { status: 200 }));
      resultB = await promiseB;
    });
    expect(resultB.status).toBe("success");
    expect(result.current.cloudId).toBe("B");

    let resultA!: CloudActionResult<DocumentDetail>;
    await act(async () => {
      openA.resolve(new Response(JSON.stringify(detail("A")), { status: 200 }));
      resultA = await promiseA;
    });
    expect(resultA).toEqual({ status: "superseded" });
    expect(result.current.cloudId).toBe("B");
  });

  it("does not apply a stale rename while a newer document is opening", async () => {
    const renameA = deferred<Response>();
    const openB = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/A") && init?.method === "PUT") return renameA.promise;
      if (url.endsWith("/B")) return openB.promise;
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCloudDocuments(vi.fn()));

    let renamePromise!: ReturnType<typeof result.current.renameDocument>;
    let openPromise!: ReturnType<typeof result.current.openDocument>;
    act(() => {
      renamePromise = result.current.renameDocument("A", "Renamed A");
      openPromise = result.current.openDocument("B");
    });

    let renameResult!: CloudActionResult<DocumentDetail>;
    await act(async () => {
      renameA.resolve(new Response(JSON.stringify(detail("A", "Renamed A")), { status: 200 }));
      renameResult = await renamePromise;
    });
    expect(renameResult).toEqual({ status: "superseded" });
    expect(fetchMock).not.toHaveBeenCalledWith("/documents", expect.anything());

    await act(async () => {
      openB.resolve(new Response(JSON.stringify(detail("B")), { status: 200 }));
      await openPromise;
    });
    expect(result.current.cloudId).toBe("B");
  });

  it("keeps the newest list refresh when responses resolve out of order", async () => {
    const firstList = deferred<Response>();
    const secondList = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstList.promise)
      .mockReturnValueOnce(secondList.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCloudDocuments(vi.fn()));

    act(() => result.current.openPanel());
    act(() => result.current.openPanel());
    await act(async () => {
      secondList.resolve(
        new Response(
          JSON.stringify([{ id: "B", title: "B", updatedAt: "2026-01-01T00:00:00Z" }]),
          { status: 200 },
        ),
      );
      await secondList.promise;
    });
    await waitFor(() => expect(result.current.documents[0]?.id).toBe("B"));
    await act(async () => {
      firstList.resolve(
        new Response(
          JSON.stringify([{ id: "A", title: "A", updatedAt: "2026-01-01T00:00:00Z" }]),
          { status: 200 },
        ),
      );
      await firstList.promise;
    });

    expect(result.current.documents[0]?.id).toBe("B");
    expect(result.current.loading).toBe(false);
  });

  it("detachDocument prevents a pending cloud response from reattaching local content", async () => {
    const openB = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(openB.promise));
    const { result } = renderHook(() => useCloudDocuments(vi.fn()));

    let openPromise!: ReturnType<typeof result.current.openDocument>;
    act(() => {
      openPromise = result.current.openDocument("B");
    });
    act(() => result.current.detachDocument());
    let openResult!: CloudActionResult<DocumentDetail>;
    await act(async () => {
      openB.resolve(new Response(JSON.stringify(detail("B")), { status: 200 }));
      openResult = await openPromise;
    });

    expect(openResult).toEqual({ status: "superseded" });
    expect(result.current.cloudId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("deleteDocument clears cloudId when the deleted document was open", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(detail("1", "Triangle")), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCloudDocuments(vi.fn()));
    await act(async () => {
      await result.current.saveAsNew("Triangle", sampleDocument);
    });
    await act(async () => {
      await result.current.deleteDocument("1");
    });

    expect(result.current.cloudId).toBeNull();
  });

  it("calls onUnauthorized and returns the current request error explicitly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const onUnauthorized = vi.fn();
    const { result } = renderHook(() => useCloudDocuments(onUnauthorized));
    let saveResult;

    await act(async () => {
      saveResult = await result.current.saveAsNew("Triangle", sampleDocument);
    });

    expect(onUnauthorized).toHaveBeenCalled();
    expect(saveResult).toEqual({
      status: "error",
      error: "Your session expired. Please sign in again.",
    });
    expect(result.current.error).toBe("Your session expired. Please sign in again.");
  });
});
