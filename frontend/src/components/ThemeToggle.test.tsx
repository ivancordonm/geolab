import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  it("uses the shared toolbar tooltip instead of a native title", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle theme="light" onToggle={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Switch to dark theme" });
    expect(button).not.toHaveAttribute("title");

    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Switch to the dark appearance");
  });
});
