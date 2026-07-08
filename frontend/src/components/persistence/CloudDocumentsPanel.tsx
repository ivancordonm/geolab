import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Pencil, Trash2, X } from "lucide-react";

import type { DocumentSummary } from "../../types/documents";

interface CloudDocumentsPanelProps {
  open: boolean;
  documents: DocumentSummary[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onOpenDocument: (id: string) => void;
  onRenameDocument: (id: string, title: string) => void;
  onDeleteDocument: (id: string) => void;
}

export function CloudDocumentsPanel({
  open,
  documents,
  loading,
  error,
  onClose,
  onOpenDocument,
  onRenameDocument,
  onDeleteDocument,
}: CloudDocumentsPanelProps) {
  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="My documents"
    >
      <div className="flex max-h-[80vh] w-[28rem] flex-col overflow-hidden rounded-card border border-edge bg-surface shadow-pop">
        <div className="flex shrink-0 items-center justify-between border-b border-edge px-4 py-3">
          <h2 className="text-sm font-semibold text-content">My documents</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-accent-soft"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" aria-hidden />
              Loading...
            </div>
          ) : error !== null ? (
            <p className="px-2 py-4 text-sm text-danger-fg" role="alert">
              {error}
            </p>
          ) : documents.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted">No saved documents yet.</p>
          ) : (
            <ul role="list" className="flex flex-col gap-1">
              {documents.map((document) => (
                <DocumentRow
                  key={document.id}
                  document={document}
                  onOpen={() => onOpenDocument(document.id)}
                  onRename={(title) => onRenameDocument(document.id, title)}
                  onDelete={() => onDeleteDocument(document.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DocumentRow({
  document,
  onOpen,
  onRename,
  onDelete,
}: {
  document: DocumentSummary;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(document.title);

  useEffect(() => {
    setTitle(document.title);
  }, [document.title]);

  if (renaming) {
    return (
      <li className="flex items-center gap-2 rounded-lg px-2 py-1.5">
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && title.trim() !== "") {
              onRename(title.trim());
              setRenaming(false);
            }
            if (event.key === "Escape") {
              setTitle(document.title);
              setRenaming(false);
            }
          }}
          className="flex-1 rounded-md border border-edge bg-surface px-2 py-1 text-sm text-content"
        />
        <button
          type="button"
          onClick={() => {
            if (title.trim() !== "") {
              onRename(title.trim());
            }
            setRenaming(false);
          }}
          className="rounded-md border border-edge px-2 py-1 text-xs font-medium text-content hover:bg-accent-soft"
        >
          Save
        </button>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent-soft">
      <button type="button" onClick={onOpen} className="flex-1 truncate text-left text-sm text-content">
        {document.title}
        <span className="ml-2 text-xs text-muted">{new Date(document.updatedAt).toLocaleString()}</span>
      </button>
      <button
        type="button"
        aria-label={`Rename ${document.title}`}
        onClick={() => setRenaming(true)}
        className="rounded-md p-1 text-muted opacity-0 transition-opacity hover:bg-accent-soft group-hover:opacity-100"
      >
        <Pencil size={14} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Delete ${document.title}`}
        onClick={onDelete}
        className="rounded-md p-1 text-muted opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger-fg group-hover:opacity-100"
      >
        <Trash2 size={14} aria-hidden />
      </button>
    </li>
  );
}
