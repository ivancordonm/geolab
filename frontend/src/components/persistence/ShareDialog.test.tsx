import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShareDialog } from "./ShareDialog";
import { i18n } from "../../i18n";

const url = "https://geolab.example/?share=abc123";

describe("ShareDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <ShareDialog open={false} url={url} onClose={vi.fn()} onStopSharing={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is no url", () => {
    const { container } = render(
      <ShareDialog open url={null} onClose={vi.fn()} onStopSharing={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the share link in a readable, selectable field", () => {
    render(<ShareDialog open url={url} onClose={vi.fn()} onStopSharing={vi.fn()} />);
    expect(screen.getByLabelText("Share link")).toHaveValue(url);
  });

  it("localizes visible and accessible sharing controls in Spanish", async () => {
    await i18n.changeLanguage("es");
    render(<ShareDialog open url={url} onClose={vi.fn()} onStopSharing={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Compartir construcción" })).toBeInTheDocument();
    expect(screen.getByLabelText("Enlace para compartir")).toHaveValue(url);
    expect(screen.getByRole("button", { name: "Copiar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dejar de compartir" })).toBeInTheDocument();
  });

  it("copies the link to the clipboard on click", async () => {
    render(<ShareDialog open url={url} onClose={vi.fn()} onStopSharing={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(url);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("stops sharing and closes", async () => {
    const onStopSharing = vi.fn();
    const onClose = vi.fn();
    render(<ShareDialog open url={url} onClose={onClose} onStopSharing={onStopSharing} />);

    await userEvent.click(screen.getByRole("button", { name: "Stop sharing" }));

    expect(onStopSharing).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
