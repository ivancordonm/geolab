import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stub the heavy 3D studio so the test never loads three.js/WebGL.
vi.mock("./components/polyhedra/PolyhedronStudio", () => ({
  default: ({ onExit }: { onExit: () => void }) => (
    <div data-testid="studio">
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
    const dialog = await screen.findByRole("dialog", { name: /abrir visor 3d/i });
    expect(dialog).toBeInTheDocument();

    // Accept -> studio renders.
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(await screen.findByTestId("studio")).toBeInTheDocument();
  });
});
