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
    const { container } = render(<GoogleSignInButton onCredential={vi.fn()} />);
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

    render(<GoogleSignInButton onCredential={onCredential} />);

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "test-client-id" }),
    );
    expect(renderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ type: "icon" }),
    );
    // The real Google button must render inside the invisible overlay host so
    // clicks land on it while our styled "G" glyph provides the visuals.
    const wrapper = screen.getByLabelText("Sign in with Google");
    expect(wrapper).toHaveClass("google-sign-in-button");
    const host = renderButton.mock.calls[0][0] as HTMLElement;
    expect(host).toHaveClass("gsi-host");
    expect(wrapper.contains(host)).toBe(true);

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

    const { rerender } = render(<GoogleSignInButton onCredential={vi.fn()} />);
    expect(initialize).toHaveBeenCalledTimes(1);

    // Simulate the parent (App) re-rendering with a brand-new inline callback,
    // e.g. after a canvas click updates unrelated state.
    const latestOnCredential = vi.fn();
    rerender(<GoogleSignInButton onCredential={latestOnCredential} />);

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(renderButton).toHaveBeenCalledTimes(1);

    const callback = initialize.mock.calls[0][0].callback as (r: { credential: string }) => void;
    callback({ credential: "fake-jwt" });
    expect(latestOnCredential).toHaveBeenCalledWith("fake-jwt");
  });
});
