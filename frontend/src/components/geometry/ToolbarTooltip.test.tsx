import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ToolbarTooltip } from "./ToolbarTooltip";

describe("ToolbarTooltip", () => {
  it("anchors the portal tooltip beside its interactive child", async () => {
    const user = userEvent.setup();
    render(
      <ToolbarTooltip label="Control" instruction="Use the control">
        <button type="button" aria-label="Control trigger">Control</button>
      </ToolbarTooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Control trigger" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: 120,
      right: 48,
      height: 32,
    } as DOMRect);

    await user.hover(trigger);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveStyle({ top: "136px", left: "58px" });
  });
});
