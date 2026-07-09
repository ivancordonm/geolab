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
    expect(screen.getByLabelText("Sign in with Google")).toHaveClass("google-sign-in-button");
    const callback = initialize.mock.calls[0][0].callback as (r: { credential: string }) => void;
    callback({ credential: "fake-jwt" });
    expect(onCredential).toHaveBeenCalledWith("fake-jwt");
  });
});
