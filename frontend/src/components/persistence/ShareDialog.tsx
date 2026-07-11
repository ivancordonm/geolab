import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, X } from "lucide-react";

interface ShareDialogProps {
  open: boolean;
  url: string | null;
  onClose: () => void;
  onStopSharing: () => void;
}

export function ShareDialog({ open, url, onClose, onStopSharing }: ShareDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setCopied(false);
    // Preselecciona la URL para copiar con teclado o clic manual.
    const input = inputRef.current;
    if (input !== null) {
      input.focus();
      input.select();
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, url, onClose]);

  if (!open || url === null) {
    return null;
  }

  // El copiado ocurre dentro del gesto del clic para preservar la activación
  // transitoria (Safari rechaza clipboard.writeText fuera de un gesto de usuario).
  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback: selecciona el texto para que el usuario copie manualmente.
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Share construction"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex w-[28rem] max-w-[90vw] flex-col overflow-hidden rounded-card border border-edge bg-surface shadow-pop">
        <div className="flex shrink-0 items-center justify-between border-b border-edge px-4 py-3">
          <h2 className="text-sm font-semibold text-content">Share construction</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-accent-soft"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm text-muted">Anyone with this link can view this construction.</p>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              readOnly
              value={url}
              onFocus={(event) => event.target.select()}
              className="flex-1 rounded-md border border-edge bg-canvas px-2.5 py-1.5 text-sm text-content"
              aria-label="Share link"
            />
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-content hover:bg-accent-soft"
            >
              {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex justify-end border-t border-edge pt-3">
            <button
              type="button"
              onClick={() => {
                onStopSharing();
                onClose();
              }}
              className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-danger-fg hover:bg-danger-soft"
            >
              Stop sharing
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
