import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CloudDocumentsPanel } from "./CloudDocumentsPanel";
import { i18n } from "../../i18n";

const documents = [
  { id: "1", title: "Triangle", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "2", title: "Circle proof", updatedAt: "2026-02-01T00:00:00Z" },
];

describe("CloudDocumentsPanel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CloudDocumentsPanel
        open={false}
        documents={[]}
        loading={false}
        error={null}
        onClose={vi.fn()}
        onOpenDocument={vi.fn()}
        onRenameDocument={vi.fn()}
        onDeleteDocument={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists documents and opens one on click", async () => {
    const onOpenDocument = vi.fn();
    render(
      <CloudDocumentsPanel
        open
        documents={documents}
        loading={false}
        error={null}
        onClose={vi.fn()}
        onOpenDocument={onOpenDocument}
        onRenameDocument={vi.fn()}
        onDeleteDocument={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Triangle"));

    expect(onOpenDocument).toHaveBeenCalledWith("1");
  });

  it("shows an empty state when there are no documents", () => {
    render(
      <CloudDocumentsPanel
        open
        documents={[]}
        loading={false}
        error={null}
        onClose={vi.fn()}
        onOpenDocument={vi.fn()}
        onRenameDocument={vi.fn()}
        onDeleteDocument={vi.fn()}
      />,
    );
    expect(screen.getByText("No saved documents yet.")).toBeInTheDocument();
  });

  it("localizes the document dialog, its empty state, and row actions in Spanish", async () => {
    await i18n.changeLanguage("es");
    const { rerender } = render(
      <CloudDocumentsPanel
        open
        documents={[]}
        loading={false}
        error={null}
        onClose={vi.fn()}
        onOpenDocument={vi.fn()}
        onRenameDocument={vi.fn()}
        onDeleteDocument={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Mis documentos" })).toBeInTheDocument();
    expect(screen.getByText("Aún no hay documentos guardados.")).toBeInTheDocument();

    rerender(
      <CloudDocumentsPanel
        open
        documents={documents}
        loading={false}
        error={null}
        onClose={vi.fn()}
        onOpenDocument={vi.fn()}
        onRenameDocument={vi.fn()}
        onDeleteDocument={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Renombrar Triangle")).toBeInTheDocument();
    expect(screen.getByLabelText("Eliminar Triangle")).toBeInTheDocument();
  });

  it("deletes a document", async () => {
    const onDeleteDocument = vi.fn();
    render(
      <CloudDocumentsPanel
        open
        documents={documents}
        loading={false}
        error={null}
        onClose={vi.fn()}
        onOpenDocument={vi.fn()}
        onRenameDocument={vi.fn()}
        onDeleteDocument={onDeleteDocument}
      />,
    );

    await userEvent.click(screen.getByLabelText("Delete Triangle"));

    expect(onDeleteDocument).toHaveBeenCalledWith("1");
  });

  it("does not show a Load more button when hasMore is false", () => {
    render(
      <CloudDocumentsPanel
        open
        documents={documents}
        loading={false}
        hasMore={false}
        error={null}
        onClose={vi.fn()}
        onOpenDocument={vi.fn()}
        onRenameDocument={vi.fn()}
        onDeleteDocument={vi.fn()}
      />,
    );
    expect(screen.queryByText("Load more")).not.toBeInTheDocument();
  });

  it("shows a Load more button when hasMore is true and calls onLoadMore on click", async () => {
    const onLoadMore = vi.fn();
    render(
      <CloudDocumentsPanel
        open
        documents={documents}
        loading={false}
        hasMore
        onLoadMore={onLoadMore}
        error={null}
        onClose={vi.fn()}
        onOpenDocument={vi.fn()}
        onRenameDocument={vi.fn()}
        onDeleteDocument={vi.fn()}
      />,
    );

    const button = screen.getByText("Load more");
    expect(button).toBeInTheDocument();
    await userEvent.click(button);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("disables the Load more button while loadingMore is true", () => {
    render(
      <CloudDocumentsPanel
        open
        documents={documents}
        loading={false}
        hasMore
        loadingMore
        onLoadMore={vi.fn()}
        error={null}
        onClose={vi.fn()}
        onOpenDocument={vi.fn()}
        onRenameDocument={vi.fn()}
        onDeleteDocument={vi.fn()}
      />,
    );

    expect(screen.getByText("Load more").closest("button")).toBeDisabled();
  });
});
