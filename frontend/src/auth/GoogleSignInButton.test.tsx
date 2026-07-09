import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GoogleSignInButton } from "./GoogleSignInButton";

afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as { google?: unknown }).google;
});

describe("GoogleSignInButton", () => {
  it("renders nothing when no Google client id is configured", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
    const { container } = render(<GoogleSignInButton onCredential={vi.fn()} theme="light" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("initializes Google Identity Services and forwards the credential", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client-id");
    const initialize = vi.fn();
    const renderButton = vi.fn();
    (window as unknown as { google: unknown }).google = {
      accounts: { id: { initialize, renderButton } },
    };
    const onCredential = vi.fn();

    render(<GoogleSignInButton onCredential={onCredential} theme="light" />);

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "test-client-id" }),
    );
    expect(renderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ type: "icon", theme: "outline" }),
    );
    expect(screen.getByLabelText("Sign in with Google")).toHaveClass("google-sign-in-button");
    const callback = initialize.mock.calls[0][0].callback as (r: { credential: string }) => void;
    callback({ credential: "fake-jwt" });
    expect(onCredential).toHaveBeenCalledWith("fake-jwt");
  });

  it("does not re-initialize when the parent re-renders with a new onCredential reference", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client-id");
    const initialize = vi.fn();
    const renderButton = vi.fn();
    (window as unknown as { google: unknown }).google = {
      accounts: { id: { initialize, renderButton } },
    };

    const { rerender } = render(<GoogleSignInButton onCredential={vi.fn()} theme="light" />);
    expect(initialize).toHaveBeenCalledTimes(1);

    // Simulate the parent (App) re-rendering with a brand-new inline callback,
    // e.g. after a canvas click updates unrelated state.
    const latestOnCredential = vi.fn();
    rerender(<GoogleSignInButton onCredential={latestOnCredential} theme="light" />);

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(renderButton).toHaveBeenCalledTimes(1);

    const callback = initialize.mock.calls[0][0].callback as (r: { credential: string }) => void;
    callback({ credential: "fake-jwt" });
    expect(latestOnCredential).toHaveBeenCalledWith("fake-jwt");
  });

  it("re-renders with a dark-matching theme when the app theme toggles, without re-initializing", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client-id");
    const initialize = vi.fn();
    const renderButton = vi.fn();
    (window as unknown as { google: unknown }).google = {
      accounts: { id: { initialize, renderButton } },
    };

    const { rerender } = render(<GoogleSignInButton onCredential={vi.fn()} theme="light" />);
    expect(renderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ theme: "outline" }),
    );

    rerender(<GoogleSignInButton onCredential={vi.fn()} theme="dark" />);

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(renderButton).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ theme: "filled_black" }),
    );
  });
});
