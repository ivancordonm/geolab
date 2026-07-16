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
    expect(screen.getByRole("button", { name: "Inversion in circle" })).not.toHaveAttribute(
      "aria-keyshortcuts",
    );
  });

  it("shows the shortcut key in the Select tool's tooltip", async () => {
    const user = userEvent.setup();
    render(<ConstructionToolbar activeTool="select" onActivateTool={() => undefined} />);

    await user.hover(screen.getByRole("button", { name: "Select" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("(P)");
  });

  it("groups the polygon tools under a single flyout button", async () => {
    const user = userEvent.setup();
    const onActivateTool = vi.fn();
    render(<ConstructionToolbar activeTool="select" onActivateTool={onActivateTool} />);

    expect(screen.queryByRole("button", { name: "Polygon" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regular polygon" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vector polygon" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Polygons" }));
    await user.click(screen.getByRole("menuitem", { name: "Regular polygon" }));

    expect(onActivateTool).toHaveBeenCalledWith("regular_polygon");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("still shows the Sides input while regular_polygon is active from the group", () => {
    render(
      <ConstructionToolbar
        activeTool="regular_polygon"
        onActivateTool={() => undefined}
        regularPolygonSides={5}
        onRegularPolygonSidesChange={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Sides")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Polygons" })).toHaveAttribute("aria-pressed", "true");
  });

  it("groups the homothety tools under a single flyout button", async () => {
    const user = userEvent.setup();
    const onActivateTool = vi.fn();
    render(<ConstructionToolbar activeTool="select" onActivateTool={onActivateTool} />);

    expect(screen.queryByRole("button", { name: "Homothety (point ratio)" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Homothety (numeric ratio)" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Homothety" }));
    await user.click(screen.getByRole("menuitem", { name: "Homothety (numeric ratio)" }));

    expect(onActivateTool).toHaveBeenCalledWith("homothety_scalar");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("still shows the Ratio input while homothety_scalar is active from the group", () => {
    render(
      <ConstructionToolbar
        activeTool="homothety_scalar"
        onActivateTool={() => undefined}
        homothetyRatio={1}
        onHomothetyRatioChange={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Ratio")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Homothety" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("groups the basic shape tools under a single flyout button", async () => {
    const user = userEvent.setup();
    const onActivateTool = vi.fn();
    render(<ConstructionToolbar activeTool="select" onActivateTool={onActivateTool} />);

    expect(screen.queryByRole("button", { name: "Point" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Segment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Line" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Circle" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Basic shapes" }));
    await user.click(screen.getByRole("menuitem", { name: "Circle" }));

    expect(onActivateTool).toHaveBeenCalledWith("circle");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks the Basic shapes group button pressed while segment is active from the group", () => {
    render(<ConstructionToolbar activeTool="segment" onActivateTool={() => undefined} />);

    expect(screen.getByRole("button", { name: "Basic shapes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("groups the transformation tools under a single flyout button", async () => {
    const user = userEvent.setup();
    const onActivateTool = vi.fn();
    render(<ConstructionToolbar activeTool="select" onActivateTool={onActivateTool} />);

    expect(screen.queryByRole("button", { name: "Reflect over line" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reflect over point" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Translation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rotate" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Transformations" }));
    await user.click(screen.getByRole("menuitem", { name: "Rotate" }));

    expect(onActivateTool).toHaveBeenCalledWith("rotation");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("still shows the Angle input while rotation is active from the group", () => {
    render(
      <ConstructionToolbar
        activeTool="rotation"
        onActivateTool={() => undefined}
        rotationAngle={45}
        onRotationAngleChange={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Angle (°)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transformations" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("groups the parallel and perpendicular tools under a single flyout button", async () => {
    const user = userEvent.setup();
    const onActivateTool = vi.fn();
    render(<ConstructionToolbar activeTool="select" onActivateTool={onActivateTool} />);

    expect(screen.queryByRole("button", { name: "Parallel line" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Perpendicular line" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Parallel & perpendicular" }));
    await user.click(screen.getByRole("menuitem", { name: "Perpendicular line" }));

    expect(onActivateTool).toHaveBeenCalledWith("perpendicular");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks the Parallel & perpendicular group button pressed while parallel is active from the group", () => {
    render(<ConstructionToolbar activeTool="parallel" onActivateTool={() => undefined} />);

    expect(screen.getByRole("button", { name: "Parallel & perpendicular" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("groups the midpoint and bisector tools under a single flyout button", async () => {
    const user = userEvent.setup();
    const onActivateTool = vi.fn();
    render(<ConstructionToolbar activeTool="select" onActivateTool={onActivateTool} />);

    expect(screen.queryByRole("button", { name: "Midpoint" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Perpendicular bisector" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Angle bisector" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Midpoint & bisectors" }));
    await user.click(screen.getByRole("menuitem", { name: "Perpendicular bisector" }));

    expect(onActivateTool).toHaveBeenCalledWith("perp_bisector");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks the Midpoint & bisectors group button pressed while midpoint is active from the group", () => {
    render(<ConstructionToolbar activeTool="midpoint" onActivateTool={() => undefined} />);

    expect(screen.getByRole("button", { name: "Midpoint & bisectors" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
