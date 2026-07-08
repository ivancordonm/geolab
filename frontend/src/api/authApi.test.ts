import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthError, fetchCurrentUser, loginWithGoogle, logout } from "./authApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authApi", () => {
  it("returns the profile on successful google login", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const profile = await loginWithGoogle("fake-id-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/google",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(profile.email).toBe("a@example.com");
  });

  it("returns null from fetchCurrentUser when unauthenticated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it("throws AuthError when google login fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(loginWithGoogle("bad-token")).rejects.toBeInstanceOf(AuthError);
  });

  it("resolves when logout succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(logout()).resolves.toBeUndefined();
  });
});
