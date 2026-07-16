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

  it("marks the trigger inactive when no member tool is active", () => {
    renderGroup("select");

    const trigger = screen.getByRole("button", { name: "Polygons" });
    expect(trigger).toHaveAttribute("aria-pressed", "false");
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

  it("focuses the first menuitem on open when no member tool is active", async () => {
    const user = userEvent.setup();
    renderGroup("select");

    await user.click(screen.getByRole("button", { name: "Polygons" }));

    expect(screen.getByRole("menuitem", { name: "Polygon" })).toHaveFocus();
  });

  it("focuses the active member's menuitem on open", async () => {
    const user = userEvent.setup();
    renderGroup("regular_polygon");

    await user.click(screen.getByRole("button", { name: "Polygons" }));

    expect(screen.getByRole("menuitem", { name: "Regular polygon" })).toHaveFocus();
  });

  it("moves focus with ArrowDown/ArrowUp and wraps around", async () => {
    const user = userEvent.setup();
    renderGroup();

    await user.click(screen.getByRole("button", { name: "Polygons" }));
    expect(screen.getByRole("menuitem", { name: "Polygon" })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Regular polygon" })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Vector polygon" })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Polygon" })).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Vector polygon" })).toHaveFocus();
  });

  it("jumps to first/last menuitem with Home/End", async () => {
    const user = userEvent.setup();
    renderGroup();

    await user.click(screen.getByRole("button", { name: "Polygons" }));

    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Vector polygon" })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Polygon" })).toHaveFocus();
  });

  it("returns focus to the trigger when the menu closes via Escape", async () => {
    const user = userEvent.setup();
    renderGroup();

    const trigger = screen.getByRole("button", { name: "Polygons" });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("activates a focused menuitem with Enter", async () => {
    const user = userEvent.setup();
    const { onActivateTool } = renderGroup();

    await user.click(screen.getByRole("button", { name: "Polygons" }));
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Regular polygon" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onActivateTool).toHaveBeenCalledWith("regular_polygon");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders nothing and does not throw when tools is empty", () => {
    const onActivateTool = vi.fn();
    expect(() =>
      render(
        <ToolGroupButton
          label="Empty"
          instruction="Nothing here"
          tools={[]}
          activeTool="select"
          onActivateTool={onActivateTool}
        />,
      ),
    ).not.toThrow();

    expect(screen.queryByRole("button", { name: "Empty" })).not.toBeInTheDocument();
  });
});
