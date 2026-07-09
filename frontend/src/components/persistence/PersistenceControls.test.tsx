import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PersistenceControls } from "./PersistenceControls";

const baseProps = {
  message: null,
  error: null,
  onSave: vi.fn(),
  onLoad: vi.fn(),
  onClear: vi.fn(),
  onExportJson: vi.fn(),
  onImportJson: vi.fn(),
  onImportError: vi.fn(),
  onExportScript: vi.fn(),
};

describe("PersistenceControls cloud actions", () => {
  it("hides cloud menu items when cloudEnabled is false", async () => {
    render(<PersistenceControls {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Construction actions" }));
    expect(screen.queryByRole("menuitem", { name: "Save as new..." })).not.toBeInTheDocument();
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
