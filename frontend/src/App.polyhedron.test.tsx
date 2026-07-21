import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stub the heavy 3D studio so the test never loads three.js/WebGL.
vi.mock("./components/polyhedra/PolyhedronStudio", () => ({
  default: ({ definition, onExit }: { definition: { underConstruction?: boolean }; onExit: () => void }) => (
    <div data-testid="studio">
      {definition.underConstruction && <p>Under construction</p>}
      <button onClick={onExit}>Salir a 2D</button>
    </div>
  ),
}));

import { App } from "./App";

describe("polyhedron entry from toolbar", () => {
  it("opens the confirm dialog and then the 3D studio", async () => {
    render(<App />);
    // Open the "Regular polyhedra" tool group, then choose Tetrahedron.
    await userEvent.click(screen.getByRole("button", { name: "Regular polyhedra" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Tetrahedron" }));

    // Confirm dialog appears.
    const dialog = await screen.findByRole("dialog", { name: /open 3d studio/i });
    expect(dialog).toBeInTheDocument();

    // Accept -> studio renders.
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByTestId("studio")).toBeInTheDocument();
  });

  it.each(["Dodecahedron", "Icosahedron"])("opens the temporary figure for %s", async (tool) => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Regular polyhedra" }));
    await userEvent.click(screen.getByRole("menuitem", { name: tool }));
    await userEvent.click(await screen.findByRole("button", { name: /continue/i }));

    expect(await screen.findByText("Under construction")).toBeInTheDocument();
  });
});
