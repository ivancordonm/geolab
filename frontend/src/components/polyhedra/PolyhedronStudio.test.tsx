import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: ReactNode }) => <div data-testid="canvas">{children}</div>,
}));
vi.mock("@react-three/drei", () => ({
  OrbitControls: () => <div data-testid="orbit-controls" />,
}));
vi.mock("./PolyhedronMesh", () => ({
  PolyhedronMesh: () => <div data-testid="polyhedron-mesh" />,
}));
vi.mock("./SymmetryOverlay", () => ({
  SymmetryOverlay: () => <div data-testid="symmetry-overlay" />,
}));
vi.mock("./SymmetryMenu", () => ({
  SymmetryMenu: ({ axisThickness, planeThickness }: { axisThickness: number; planeThickness: number }) => (
    <div
      data-testid="symmetry-menu"
      data-axis-thickness={axisThickness}
      data-plane-thickness={planeThickness}
    />
  ),
}));

import PolyhedronStudio from "./PolyhedronStudio";
import { ICOSAHEDRON } from "../../geometry/polyhedra/icosahedron";

describe("PolyhedronStudio", () => {
  it("shows the complete symmetry studio for Icosahedron", () => {
    render(<PolyhedronStudio definition={ICOSAHEDRON} onExit={() => undefined} />);

    expect(screen.getByTestId("polyhedron-mesh")).toBeInTheDocument();
    expect(screen.getByTestId("orbit-controls")).toBeInTheDocument();
    expect(screen.getByTestId("symmetry-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("symmetry-menu")).toBeInTheDocument();
    expect(screen.getByTestId("symmetry-menu")).toHaveAttribute("data-axis-thickness", "-0.25");
    expect(screen.getByTestId("symmetry-menu")).toHaveAttribute("data-plane-thickness", "-0.25");
    expect(screen.queryByText("(Under construction)")).not.toBeInTheDocument();
  });

  it("triggers onChangePolyhedron when selecting another polyhedron from a temporary study", async () => {
    const onChangePolyhedron = vi.fn();
    render(<PolyhedronStudio definition={{ ...ICOSAHEDRON, underConstruction: true }} onChangePolyhedron={onChangePolyhedron} onExit={() => undefined} />);

    const select = screen.getByRole("combobox", { name: "Select polyhedron" });
    await userEvent.selectOptions(select, "cube");

    expect(onChangePolyhedron).toHaveBeenCalledWith(expect.objectContaining({ id: "cube" }));
  });
});
