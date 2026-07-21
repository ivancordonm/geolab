import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthControl } from "./AuthControl";

afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as { google?: unknown }).google;
});

describe("AuthControl", () => {
  it("shows the Google sign-in button when signed out", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client-id");
    render(<AuthControl user={null} onCredential={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByLabelText("Sign in with Google")).toBeInTheDocument();
  });

  it("shows the account menu and signs out when signed in", async () => {
    const onSignOut = vi.fn();
    render(
      <AuthControl
        user={{ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }}
        onCredential={vi.fn()}
        onSignOut={onSignOut}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));

    expect(onSignOut).toHaveBeenCalled();
  });

  it("uses the shared toolbar tooltip for the account trigger", async () => {
    const user = userEvent.setup();
    render(
      <AuthControl
        user={{ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }}
        onCredential={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Account menu" });
    expect(button).not.toHaveAttribute("title");
    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Open account options");
  });

  it("anchors the menu to the button's bottom edge when it would overflow the viewport", async () => {
    render(
      <AuthControl
        user={{ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }}
        onCredential={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    // Simulate the trigger sitting near the bottom of the viewport, where the
    // menu (~130px tall) cannot fit below the button's top edge.
    const trigger = screen.getByRole("button", { name: "Account menu" });
    const nearBottom = window.innerHeight - 40;
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: nearBottom,
      bottom: nearBottom + 32,
      left: 12,
      right: 44,
      width: 32,
      height: 32,
      x: 12,
      y: nearBottom,
      toJSON: () => ({}),
    } as DOMRect);

    await userEvent.click(trigger);

    const menu = screen.getByRole("menu", { name: "Account menu" });
    expect(menu.style.bottom).toBe(`${window.innerHeight - (nearBottom + 32)}px`);
    expect(menu.style.top).toBe("");
  });
});
