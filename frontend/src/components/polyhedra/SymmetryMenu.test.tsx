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
    reflectionMode: "individual" as const,
    onReflectionModeChange: vi.fn(),
    selectedReflectionIndex: 0,
    reflectionCount: 6,
    selectedReflection: {
      kind: "plane" as const,
      point: [0, 0, 0] as const,
      normal: [1, 0, 0] as const,
      label: "σ(0)",
      containedEdges: ["AB"],
      fixedVertices: ["A", "B"],
      swappedVertices: [["C", "D"]] as [string, string][],
      permutationLabel: "(C D)",
    },
    onPreviousReflection: vi.fn(),
    onNextReflection: vi.fn(),
    showOtherReflections: false,
    onShowOtherReflectionsChange: vi.fn(),
    onResetView: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
  render(<SymmetryMenu {...(props as Parameters<typeof SymmetryMenu>[0])} />);
  return props as {
    onToggleClass: ReturnType<typeof vi.fn>;
    onExit: ReturnType<typeof vi.fn>;
    onReflectionModeChange: ReturnType<typeof vi.fn>;
    onPreviousReflection: ReturnType<typeof vi.fn>;
    onNextReflection: ReturnType<typeof vi.fn>;
    onShowOtherReflectionsChange: ReturnType<typeof vi.fn>;
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

  it("shows reflection controls and forwards their changes", async () => {
    const props = setup({ visibleClasses: new Set(["reflections"]) });

    await userEvent.selectOptions(screen.getByLabelText("Modo de reflexiones"), "cumulative");
    await userEvent.click(screen.getByRole("button", { name: "Plano anterior" }));
    await userEvent.click(screen.getByRole("button", { name: "Plano siguiente" }));
    await userEvent.click(screen.getByText("Mostrar los demás como referencia"));

    expect(props.onReflectionModeChange).toHaveBeenCalledWith("cumulative");
    expect(props.onPreviousReflection).toHaveBeenCalledOnce();
    expect(props.onNextReflection).toHaveBeenCalledOnce();
    expect(props.onShowOtherReflectionsChange).toHaveBeenCalledWith(true);
  });

  it("shows the selected reflection's data-driven description", () => {
    setup({ visibleClasses: new Set(["reflections"]) });

    expect(screen.getByText("Plano 1 de 6")).toBeInTheDocument();
    expect(screen.getByText("Contiene la arista AB.")).toBeInTheDocument();
    expect(screen.getByText("Deja fijos A y B.")).toBeInTheDocument();
    expect(screen.getByText("Intercambia C ↔ D.")).toBeInTheDocument();
    expect(screen.getByText("Permutación: (C D).")).toBeInTheDocument();
  });
});
