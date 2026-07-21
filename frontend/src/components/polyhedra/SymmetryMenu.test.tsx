import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SymmetryMenu } from "./SymmetryMenu";
import { i18n } from "../../i18n";

function setup(overrides: Record<string, unknown> = {}, language: "es" | "en" = "es") {
  void i18n.changeLanguage(language);
  const props = {
    polyhedronId: "tetrahedron",
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
    symmetryClassOrder: ["identity", "rotations3", "halfTurns", "reflections", "rotoreflections"] as const,
    symmetryCounts: {
      identity: 1,
      rotations3: 8,
      halfTurns: 3,
      reflections: 6,
      rotoreflections: 6,
    },
    selectedRotationIndex: 0,
    rotationCount: 8,
    rotationAxisCount: 4,
    rotationAxisOrdinal: 1,
    selectedRotation: {
      kind: "axis" as const,
      point: [0, 0, 0] as const,
      direction: [1, 1, 1] as const,
      angle: (2 * Math.PI) / 3,
      label: "C3+",
    },
    onPreviousRotation: vi.fn(),
    onNextRotation: vi.fn(),
    showOtherRotationAxes: false,
    onShowOtherRotationAxesChange: vi.fn(),
    selectedHalfTurnIndex: 0,
    halfTurnCount: 3,
    halfTurnAxisCount: 3,
    halfTurnAxisOrdinal: 1,
    selectedHalfTurn: {
      kind: "axis" as const,
      point: [0, 0, 0] as const,
      direction: [1, 0, 0] as const,
      angle: Math.PI,
      label: "C2",
      axisId: "half-turn-axis-0",
      axisDescription: { kind: "tetrahedronOppositeEdgeMidpoints" as const, pair: "AB_CD" as const },
      order: 2,
    },
    onPreviousHalfTurn: vi.fn(),
    onNextHalfTurn: vi.fn(),
    showOtherHalfTurnAxes: false,
    onShowOtherHalfTurnAxesChange: vi.fn(),
    rotoreflectionCount: 6,
    rotoreflectionAxisCount: 3,
    selectedRotoreflectionIndex: 0,
    selectedRotoreflection: { kind: "improper" as const, point: [0,0,0] as const, direction: [1,0,0] as const, angle: Math.PI/2, label: "S4+", axisId: "axis-0", axisDescription: { kind: "generic" as const, ordinal: 1 }, order: 4, rotationSense: "positive" as const },
    onPreviousRotoreflection: vi.fn(),
    onNextRotoreflection: vi.fn(),
    showOtherRotoreflectionAxes: false,
    onShowOtherRotoreflectionAxesChange: vi.fn(),
    showRotoreflectionPlane: true,
    onShowRotoreflectionPlaneChange: vi.fn(),
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
    onNextRotation: ReturnType<typeof vi.fn>;
    onShowOtherRotationAxesChange: ReturnType<typeof vi.fn>;
    onNextHalfTurn: ReturnType<typeof vi.fn>;
    onShowOtherHalfTurnAxesChange: ReturnType<typeof vi.fn>;
    onNextRotoreflection: ReturnType<typeof vi.fn>;
    onShowOtherReflectionsChange: ReturnType<typeof vi.fn>;
  };
}

describe("SymmetryMenu", () => {
  it("toggles a symmetry class", async () => {
    const props = setup();
    await userEvent.click(screen.getByLabelText("Reflexiones (6)"));
    expect(props.onToggleClass).toHaveBeenCalledWith("reflections");
  });

  it("calls onExit when the exit button is clicked", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: /salir a 2d/i }));
    expect(props.onExit).toHaveBeenCalled();
  });

  it("shows all five tetrahedron symmetry classes and the polyhedron name", () => {
    setup();
    expect(screen.getByText("Tetraedro")).toBeInTheDocument();
    expect(screen.getByLabelText("Identidad (1)")).toBeInTheDocument();
    expect(screen.getByLabelText("Rotaciones ±120° (8)")).toBeInTheDocument();
    expect(screen.getByLabelText("Medias vueltas 180° (3)")).toBeInTheDocument();
    expect(screen.getByLabelText("Reflexiones (6)")).toBeInTheDocument();
    expect(screen.getByLabelText("Rotorreflexiones ±90° (6)")).toBeInTheDocument();
  });

  it("uses a polyhedron's declared symmetry-class order", () => {
    setup({
      polyhedronName: "Cubo",
      symmetryClassOrder: ["identity", "inversion"],
      symmetryCounts: { identity: 1, inversion: 1 },
    });
    expect(screen.getByLabelText("Identidad (1)")).toBeInTheDocument();
    expect(screen.getByLabelText("Simetría central (1)")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Reflexiones/)).not.toBeInTheDocument();
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

  it("shows rotorreflections controls", async () => {
    const props = setup({ visibleClasses: new Set(["rotoreflections"]) });
    expect(screen.getByLabelText("Rotorreflexiones ±90° (6)")).toBeInTheDocument();
    expect(screen.getByText("Rotorreflexión 1 de 6")).toBeInTheDocument();
    expect(screen.getByText(/Eje 1 de 3/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rotorreflexión siguiente" }));
    expect(props.onNextRotoreflection).toHaveBeenCalled();
  });

  it("shows rotation controls and forwards navigation and references", async () => {
    const props = setup({ visibleClasses: new Set(["rotations3"]) });

    expect(screen.getByText("Rotación 1 de 8")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rotación siguiente" }));
    await userEvent.click(screen.getByText("Mostrar los demás ejes como referencia"));

    expect(props.onNextRotation).toHaveBeenCalledOnce();
    expect(props.onShowOtherRotationAxesChange).toHaveBeenCalledWith(true);
  });

  it("shows half-turn controls and forwards navigation and references", async () => {
    const props = setup({ visibleClasses: new Set(["halfTurns"]) });

    expect(screen.getByText("Media vuelta 1 de 3")).toBeInTheDocument();
    expect(screen.getByText("Eje: puntos medios de AB y CD")).toBeInTheDocument();
    expect(screen.getByText("Ángulo: 180°")).toBeInTheDocument();
    expect(screen.getByText("Orden: 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Media vuelta siguiente" }));
    await userEvent.click(screen.getByText("Mostrar los demás ejes como referencia"));

    expect(props.onNextHalfTurn).toHaveBeenCalledOnce();
    expect(props.onShowOtherHalfTurnAxesChange).toHaveBeenCalledWith(true);
  });

  it("translates axis descriptions from stable ids instead of leaking data labels", () => {
    setup({ polyhedronName: "Tetrahedron", visibleClasses: new Set(["halfTurns"]) }, "en");

    expect(screen.getByText("Axis: midpoints of AB and CD")).toBeInTheDocument();
    expect(screen.queryByText(/puntos medios/i)).not.toBeInTheDocument();
  });

  it.each([
    [{ kind: "oppositeFaceCenters" as const, ordinal: 1 }, "Opposite face centers 1"],
    [{ kind: "bodyDiagonal" as const, ordinal: 2 }, "Body diagonal 2"],
  ])("renders the translated cube description from semantic metadata", (axisDescription, description) => {
    setup({
      polyhedronId: "cube",
      polyhedronName: "Cube",
      visibleClasses: new Set(["rotoreflections"]),
      selectedRotoreflection: {
        kind: "improper" as const,
        point: [0, 0, 0] as const,
        direction: [1, 0, 0] as const,
        angle: Math.PI / 2,
        label: "S",
        axisId: "stable-axis-id",
        axisDescription,
        order: 4,
        rotationSense: "positive" as const,
      },
    }, "en");

    expect(screen.getByText(new RegExp(`${description} of 3`))).toBeInTheDocument();
  });
});
