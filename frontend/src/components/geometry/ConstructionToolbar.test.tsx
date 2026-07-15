import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConstructionToolbar, SHORTCUT_TO_TOOL } from "./ConstructionToolbar";

describe("ConstructionToolbar", () => {
  it("accepts a decimal numeric homothety ratio without committing intermediate text", async () => {
    const user = userEvent.setup();
    const onHomothetyRatioChange = vi.fn();
    render(
      <ConstructionToolbar
        activeTool="homothety_scalar"
        onActivateTool={() => undefined}
        homothetyRatio={1}
        onHomothetyRatioChange={onHomothetyRatioChange}
      />,
    );

    const input = screen.getByLabelText("Ratio");
    await user.clear(input);
    await user.type(input, "-0.5");
    expect(input).toHaveValue(-0.5);
    expect(onHomothetyRatioChange).not.toHaveBeenCalled();

    await user.tab();
    expect(onHomothetyRatioChange).toHaveBeenCalledWith(-0.5);
  });

  it("exposes a p -> select keyboard shortcut and marks it on the button", () => {
    expect(SHORTCUT_TO_TOOL).toEqual({ p: "select" });

    render(<ConstructionToolbar activeTool="select" onActivateTool={() => undefined} />);

    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute(
      "aria-keyshortcuts",
      "p",
    );
    expect(screen.getByRole("button", { name: "Point" })).not.toHaveAttribute(
      "aria-keyshortcuts",
    );
  });

  it("shows the shortcut key in the Select tool's tooltip", async () => {
    const user = userEvent.setup();
    render(<ConstructionToolbar activeTool="select" onActivateTool={() => undefined} />);

    await user.hover(screen.getByRole("button", { name: "Select" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("(P)");
  });
});
