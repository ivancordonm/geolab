import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PersistenceControls } from "./PersistenceControls";

const baseProps = {
  message: null,
  error: null,
  onClear: vi.fn(),
  onExportJson: vi.fn(),
  onImportJson: vi.fn(),
  onImportError: vi.fn(),
  onExportScript: vi.fn(),
};

describe("PersistenceControls cloud actions", () => {
  it("uses the shared toolbar tooltip instead of a native title", async () => {
    const user = userEvent.setup();
    render(<PersistenceControls {...baseProps} />);

    const button = screen.getByRole("button", { name: "Construction actions" });
    expect(button).not.toHaveAttribute("title");

    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Import, export, save, share, or clear the construction");
  });

  it("hides cloud menu items when cloudEnabled is false", async () => {
    render(<PersistenceControls {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Construction actions" }));
    expect(screen.queryByRole("menuitem", { name: "Save as new..." })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Save locally" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Load local save" })).not.toBeInTheDocument();
  });

  it("shows cloud menu items and triggers callbacks when cloudEnabled is true", async () => {
    const onSaveToCloud = vi.fn();
    const onSaveAsNewToCloud = vi.fn();
    const onOpenCloudPanel = vi.fn();
    render(
      <PersistenceControls
        {...baseProps}
        cloudEnabled
        onSaveToCloud={onSaveToCloud}
        onSaveAsNewToCloud={onSaveAsNewToCloud}
        onOpenCloudPanel={onOpenCloudPanel}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Construction actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Save" }));
    expect(onSaveToCloud).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Construction actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Open" }));
    expect(onOpenCloudPanel).toHaveBeenCalled();
  });
});
