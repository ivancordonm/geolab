import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PersistenceControls } from "./PersistenceControls";
import { i18n } from "../../i18n";

const baseProps = {
  message: null,
  error: null,
  onClear: vi.fn(),
  onExportJson: vi.fn(),
  onImportJson: vi.fn(),
  onImportError: vi.fn(),
  onExportScript: vi.fn(),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PersistenceControls cloud actions", () => {
  it("localizes the actions menu and its accessible labels in Spanish", async () => {
    await i18n.changeLanguage("es");
    render(<PersistenceControls {...baseProps} cloudEnabled shared />);

    const button = screen.getByRole("button", { name: "Acciones de construcción" });
    await userEvent.click(button);

    expect(screen.getByRole("menuitem", { name: "Exportar JSON" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Dejar de compartir" })).toBeInTheDocument();
    expect(screen.getByLabelText("Elegir archivo JSON de geometría")).toBeInTheDocument();
  });

  it("uses the shared toolbar tooltip instead of a native title", async () => {
    const user = userEvent.setup();
    render(<PersistenceControls {...baseProps} />);

    const button = screen.getByRole("button", { name: "Construction actions" });
    expect(button).not.toHaveAttribute("title");

    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Import, export, save, share, or clear the construction");
  });

  it("hides cloud menu items when cloudEnabled is false", async () => {
    render(<PersistenceControls {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Construction actions" }));
    expect(screen.queryByRole("menuitem", { name: "Save as new..." })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Save locally" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Load local save" })).not.toBeInTheDocument();
  });

  it("shows cloud menu items and triggers callbacks when cloudEnabled is true", async () => {
    const onSaveToCloud = vi.fn();
    const onSaveAsNewToCloud = vi.fn();
    const onOpenCloudPanel = vi.fn();
    render(
      <PersistenceControls
        {...baseProps}
        cloudEnabled
        onSaveToCloud={onSaveToCloud}
        onSaveAsNewToCloud={onSaveAsNewToCloud}
        onOpenCloudPanel={onOpenCloudPanel}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Construction actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Save" }));
    expect(onSaveToCloud).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Construction actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Open" }));
    expect(onOpenCloudPanel).toHaveBeenCalled();
  });

  it("imports JSON through File.text when it is available", async () => {
    const onImportJson = vi.fn();
    render(<PersistenceControls {...baseProps} onImportJson={onImportJson} />);

    await userEvent.click(screen.getByRole("button", { name: "Construction actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Import JSON" }));

    const file = new File(["{\"objects\":[]}"], "construction.json", { type: "application/json" });
    const text = vi.fn().mockResolvedValue("{\"objects\":[]}");
    Object.defineProperty(file, "text", { value: text });
    fireEvent.change(screen.getByLabelText("Choose geometry JSON file"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(onImportJson).toHaveBeenCalledWith("{\"objects\":[]}"));
    expect(text).toHaveBeenCalledOnce();
  });

  it("falls back to FileReader when File.text is unavailable", async () => {
    const onImportJson = vi.fn();
    const loadListeners: Array<() => void> = [];
    class MockFileReader {
      result: string | null = null;
      error: DOMException | null = null;

      addEventListener(event: string, listener: () => void): void {
        if (event === "load") loadListeners.push(listener);
      }

      readAsText(): void {
        this.result = "{\"fallback\":true}";
        loadListeners.forEach((listener) => listener());
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);
    render(<PersistenceControls {...baseProps} onImportJson={onImportJson} />);

    await userEvent.click(screen.getByRole("button", { name: "Construction actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Import JSON" }));

    const file = new File(["unused"], "construction.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: undefined });
    fireEvent.change(screen.getByLabelText("Choose geometry JSON file"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(onImportJson).toHaveBeenCalledWith("{\"fallback\":true}"));
  });

  it("localizes the fallback FileReader import error", async () => {
    await i18n.changeLanguage("es");
    const onImportError = vi.fn();
    const errorListeners: Array<() => void> = [];
    class MockFileReader {
      result: string | null = null;
      error: DOMException | null = null;

      addEventListener(event: string, listener: () => void): void {
        if (event === "error") errorListeners.push(listener);
      }

      readAsText(): void {
        errorListeners.forEach((listener) => listener());
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);
    render(<PersistenceControls {...baseProps} onImportError={onImportError} />);

    await userEvent.click(screen.getByRole("button", { name: "Acciones de construcción" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Importar JSON" }));

    const file = new File(["unused"], "construction.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: undefined });
    fireEvent.change(screen.getByLabelText("Elegir archivo JSON de geometría"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(onImportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "No se pudo leer el archivo de importación." }),
    ));
  });
});
