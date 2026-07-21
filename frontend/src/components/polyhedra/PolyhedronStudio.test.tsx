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
  SymmetryMenu: () => <div data-testid="symmetry-menu" />,
}));

import PolyhedronStudio from "./PolyhedronStudio";
import { ICOSAHEDRON } from "../../geometry/polyhedra/icosahedron";

describe("PolyhedronStudio temporary mode", () => {
  it("shows only the figure and under-construction notice for incomplete studies", () => {
    render(<PolyhedronStudio definition={ICOSAHEDRON} onExit={() => undefined} />);

    expect(screen.getByText("(Under construction)")).toBeInTheDocument();
    expect(screen.getByTestId("polyhedron-mesh")).toBeInTheDocument();
    expect(screen.getByTestId("orbit-controls")).toBeInTheDocument();
    expect(screen.queryByTestId("symmetry-overlay")).not.toBeInTheDocument();
    expect(screen.queryByTestId("symmetry-menu")).not.toBeInTheDocument();
  });

  it("triggers onChangePolyhedron when selecting another polyhedron from the dropdown", async () => {
    const onChangePolyhedron = vi.fn();
    render(<PolyhedronStudio definition={ICOSAHEDRON} onChangePolyhedron={onChangePolyhedron} onExit={() => undefined} />);

    const select = screen.getByRole("combobox", { name: "Select polyhedron" });
    await userEvent.selectOptions(select, "cube");

    expect(onChangePolyhedron).toHaveBeenCalledWith(expect.objectContaining({ id: "cube" }));
  });
});
