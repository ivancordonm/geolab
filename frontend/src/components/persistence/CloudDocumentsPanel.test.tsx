import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CloudDocumentsPanel } from "./CloudDocumentsPanel";

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
});
