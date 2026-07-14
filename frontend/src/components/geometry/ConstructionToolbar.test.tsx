import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConstructionToolbar } from "./ConstructionToolbar";

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
});
