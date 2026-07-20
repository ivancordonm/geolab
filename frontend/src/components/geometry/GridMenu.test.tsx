import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_GRID_SETTINGS } from "../../geometry/useGridSettings";
import { GridMenu } from "./GridMenu";

describe("GridMenu", () => {
  it("uses the toolbar tooltip instead of a native title", async () => {
    const user = userEvent.setup();
    render(<GridMenu settings={DEFAULT_GRID_SETTINGS} onChange={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Grid settings" });
    expect(button).not.toHaveAttribute("title");

    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Configure the grid, axes, and snapping");
  });
});
