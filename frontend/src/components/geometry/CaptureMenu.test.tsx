import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CaptureMenu } from "./CaptureMenu";

describe("CaptureMenu", () => {
  it("uses toolbar tooltips for the capture trigger and both capture options", async () => {
    const user = userEvent.setup();
    render(<CaptureMenu onCaptureFull={vi.fn()} onCaptureArea={vi.fn()} />);

    await user.hover(screen.getByRole("button", { name: "Capture menu" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Export the construction as an image");

    await user.click(screen.getByRole("button", { name: "Capture menu" }));
    await user.hover(screen.getByRole("button", { name: "Capture full" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Export the complete canvas");

    await user.hover(screen.getByRole("button", { name: "Capture area" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Select an area of the canvas to export");
  });
});
