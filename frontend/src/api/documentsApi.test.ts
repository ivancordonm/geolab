import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DocumentsApiError,
  createDocument,
  deleteDocument,
  fetchSharedDocument,
  getDocument,
  listDocuments,
  shareDocument,
  unshareDocument,
  updateDocument,
} from "./documentsApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleDocument = {
  schemaVersion: 1 as const,
  id: "doc-1",
  title: "Triangle",
  objects: [],
};

describe("documentsApi", () => {
  it("lists documents with credentials included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([{ id: "1", title: "A", updatedAt: "2026-01-01T00:00:00Z" }]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listDocuments();

    expect(fetchMock).toHaveBeenCalledWith(
      "/documents",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result).toEqual([{ id: "1", title: "A", updatedAt: "2026-01-01T00:00:00Z" }]);
  });

  it("creates a document with the given title and payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "1",
          title: "Triangle",
          document: sampleDocument,
          updatedAt: "2026-01-01T00:00:00Z",
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDocument("Triangle", sampleDocument);

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      title: "Triangle",
      document: sampleDocument,
    });
    expect(result.id).toBe("1");
  });

  it("deletes a document and resolves without a body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(deleteDocument("1")).resolves.toBeUndefined();
  });

  it("throws DocumentsApiError on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(getDocument("missing")).rejects.toBeInstanceOf(DocumentsApiError);
  });

  it("sends partial updates for title-only changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "1",
          title: "Renamed",
          document: sampleDocument,
          updatedAt: "2026-01-01T00:00:00Z",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateDocument("1", { title: "Renamed" });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ title: "Renamed" });
  });

  it("shares a document and returns the token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: "abc123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await shareDocument("doc-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/documents/doc-1/share",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(result).toEqual({ token: "abc123" });
  });

  it("unshares a document", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await unshareDocument("doc-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/documents/doc-1/share",
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
  });

  it("fetches a shared document by token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Shared",
          document: sampleDocument,
          updatedAt: "2026-01-01T00:00:00Z",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchSharedDocument("tok");

    expect(fetchMock).toHaveBeenCalledWith(
      "/documents/shared/tok",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result.title).toBe("Shared");
  });

  it("throws DocumentsApiError for an unknown shared token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSharedDocument("nope")).rejects.toBeInstanceOf(DocumentsApiError);
  });
});
