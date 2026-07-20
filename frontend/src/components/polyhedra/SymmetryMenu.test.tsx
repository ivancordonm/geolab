import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SymmetryMenu } from "./SymmetryMenu";

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    polyhedronName: "Tetraedro",
    visibleClasses: new Set<string>(),
    onToggleClass: vi.fn(),
    opacity: 0.6,
    onOpacityChange: vi.fn(),
    color: "#3b82f6",
    onColorChange: vi.fn(),
    onResetView: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
  render(<SymmetryMenu {...(props as Parameters<typeof SymmetryMenu>[0])} />);
  return props as {
    onToggleClass: ReturnType<typeof vi.fn>;
    onExit: ReturnType<typeof vi.fn>;
  };
}

describe("SymmetryMenu", () => {
  it("toggles a symmetry class", async () => {
    const props = setup();
    await userEvent.click(screen.getByLabelText("Reflexiones"));
    expect(props.onToggleClass).toHaveBeenCalledWith("reflections");
  });

  it("calls onExit when the exit button is clicked", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: /salir a 2d/i }));
    expect(props.onExit).toHaveBeenCalled();
  });

  it("shows all four symmetry classes and the polyhedron name", () => {
    setup();
    expect(screen.getByText("Tetraedro")).toBeInTheDocument();
    expect(screen.getByLabelText("Rotaciones ±120°")).toBeInTheDocument();
    expect(screen.getByLabelText("Medias vueltas (180°)")).toBeInTheDocument();
    expect(screen.getByLabelText("Reflexiones")).toBeInTheDocument();
    expect(screen.getByLabelText("Rotoreflexiones (S4)")).toBeInTheDocument();
  });
});
