import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { i18n } from "../../i18n";
import { CaptureOverlay } from "./CaptureOverlay";

describe("CaptureOverlay", () => {
  it("renders its instruction in the active language", async () => {
    await i18n.changeLanguage("es");
    render(<CaptureOverlay onCapture={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("Arrastra para seleccionar el área. Pulsa Esc para cancelar.")).toBeInTheDocument();
  });
});
