import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "./useAuth";
import { i18n } from "../i18n";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useAuth", () => {
  it("restores the session from /auth/me on mount", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }),
          { status: 200 },
        ),
      ),
    );

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.email).toBe("a@example.com");
  });

  it("stays signed out when there is no session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("signIn sets the user from a successful google login", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }),
            { status: 200 },
          ),
        ),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signIn("fake-id-token");
    });

    expect(result.current.user?.email).toBe("a@example.com");
  });

  it("signOut clears the user", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.user).toBeNull();
  });

  it("signOut clears the local user and exposes an error without rejecting on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 500 })),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await expect(
      act(async () => {
        await result.current.signOut();
      }),
    ).resolves.toBeUndefined();

    expect(result.current.user).toBeNull();
    expect(result.current.error).toBe("Unable to complete sign out on the server.");
  });

  it("localizes an existing sign-out error when the language changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 500 })),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      await result.current.signOut();
    });
    await act(async () => {
      await i18n.changeLanguage("es");
    });

    expect(result.current.error).toBe("No se pudo cerrar sesión en el servidor.");
  });
});
