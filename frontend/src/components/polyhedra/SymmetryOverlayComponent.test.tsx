import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { SymmetryOverlay } from "./SymmetryOverlay";
import { TETRAHEDRON } from "../../geometry/polyhedra/tetrahedron";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("SymmetryOverlay rotation arrows", () => {
  it("renders rotation arrows in black (#000000) color", () => {
    const { container } = render(
      <SymmetryOverlay
        definition={TETRAHEDRON}
        visibleClasses={new Set(["rotations3"])}
        reflectionMode="individual"
        selectedReflectionIndex={0}
        showOtherReflections={false}
        color="#3b82f6"
      />
    );

    // Look for lineBasicMaterial or meshBasicMaterial elements with color "#000000"
    const lineMaterials = container.querySelectorAll("lineBasicMaterial");
    const blackLineMaterials = Array.from(lineMaterials).filter(
      (el) => el.getAttribute("color") === "#000000"
    );
    expect(blackLineMaterials.length).toBeGreaterThan(0);

    const meshMaterials = container.querySelectorAll("meshBasicMaterial");
    const blackMeshMaterials = Array.from(meshMaterials).filter(
      (el) => el.getAttribute("color") === "#000000"
    );
    expect(blackMeshMaterials.length).toBeGreaterThan(0);
  });
});
