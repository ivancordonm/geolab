import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pentagon, Star, Waypoints } from "lucide-react";

import type { ConstructionTool } from "../../geometry/constructionTools";
import { ToolGroupButton } from "./ToolGroupButton";

const POLYGON_TOOLS = [
  { tool: "polygon", label: "Polygon", icon: Pentagon },
  { tool: "regular_polygon", label: "Regular polygon", icon: Star },
  { tool: "vector_polygon", label: "Vector polygon", icon: Waypoints },
] as const;

function renderGroup(activeTool: ConstructionTool = "select") {
  const onActivateTool = vi.fn();
  render(
    <ToolGroupButton
      label="Polygons"
      instruction="Choose a polygon tool"
      tools={POLYGON_TOOLS}
      activeTool={activeTool}
      onActivateTool={onActivateTool}
    />,
  );
  return { onActivateTool };
}

describe("ToolGroupButton", () => {
  it("opens the menu, activates the chosen tool, and remembers it as last used", async () => {
    const user = userEvent.setup();
    const { onActivateTool } = renderGroup();

    const trigger = screen.getByRole("button", { name: "Polygons" });
    expect(trigger).toHaveAttribute("data-displayed-tool", "polygon");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("menuitem", { name: "Vector polygon" }));

    expect(onActivateTool).toHaveBeenCalledWith("vector_polygon");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("data-displayed-tool", "vector_polygon");
  });

  it("marks the trigger active and shows the active member tool while one is active", () => {
    renderGroup("regular_polygon");

    const trigger = screen.getByRole("button", { name: "Polygons" });
    expect(trigger).toHaveAttribute("aria-pressed", "true");
    expect(trigger).toHaveAttribute("data-displayed-tool", "regular_polygon");
  });

  it("closes with Escape without activating anything", async () => {
    const user = userEvent.setup();
    const { onActivateTool } = renderGroup();

    await user.click(screen.getByRole("button", { name: "Polygons" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onActivateTool).not.toHaveBeenCalled();
  });

  it("closes when clicking outside the menu", async () => {
    const user = userEvent.setup();
    renderGroup();

    await user.click(screen.getByRole("button", { name: "Polygons" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
