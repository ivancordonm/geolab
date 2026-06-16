import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChangeEvent, ReactNode } from "react";
import {
  ChevronDown,
  Download,
  FileCode,
  FolderOpen,
  Save,
  Trash2,
  Upload,
} from "lucide-react";

interface PersistenceControlsProps {
  message: string | null;
  error: string | null;
  onSave: () => void;
  onLoad: () => void;
  onClear: () => void;
  onExportJson: () => void;
  onImportJson: (serialized: string) => void;
  onImportError: (error: Error) => void;
  onExportScript: () => void;
  /** Lado hacia el que se abre el menú desplegable. Por defecto "right" (abre hacia la derecha). */
  menuSide?: "right" | "left";
}

export function PersistenceControls({
  message,
  error,
  onSave,
  onLoad,
  onClear,
  onExportJson,
  onImportJson,
  onImportError,
  onExportScript,
  menuSide = "right",
}: PersistenceControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top?: number; left?: number; right?: number; bottom?: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      const inMenu = menuRef.current?.contains(target) ?? false;
      const inButton = buttonRef.current?.contains(target) ?? false;
      if (!inMenu && !inButton) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file !== undefined) {
      try {
        onImportJson(await readFileAsText(file));
      } catch (error) {
        onImportError(error instanceof Error ? error : new Error("Unable to read import file."));
      }
    }
  };

  const run = (action: () => void): void => {
    setOpen(false);
    action();
  };

  const MENU_HEIGHT_EST = 290;

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      if (menuSide === "right") {
        const fitsBelow = window.innerHeight - rect.top > MENU_HEIGHT_EST;
        if (fitsBelow) {
          setMenuPos({ top: rect.top, left: rect.right + 8 });
        } else {
          setMenuPos({ bottom: window.innerHeight - rect.bottom, left: rect.right + 8 });
        }
      } else {
        setMenuPos({ bottom: window.innerHeight - rect.top + 8, right: window.innerWidth - rect.right });
      }
    }
    setOpen((v) => !v);
  };

  return (
    <div className="relative flex flex-col items-center gap-2">
      <button
        ref={buttonRef}
        type="button"
        title="Actions"
        aria-label="Construction actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={handleToggle}
        className={`flex items-center justify-center rounded-lg p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
          open ? "bg-brand-600 text-white" : "text-muted hover:bg-accent-soft hover:text-accent-soft-fg"
        }`}
      >
        <ChevronDown
          size={18}
          aria-hidden
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Construction actions"
          style={{ position: "fixed", ...menuPos }}
          className="z-50 w-52 overflow-hidden rounded-xl border border-edge bg-surface p-1.5 shadow-pop"
        >
          <MenuItem icon={<Save size={16} aria-hidden />} onClick={() => run(onSave)}>
            Save
          </MenuItem>
          <MenuItem icon={<FolderOpen size={16} aria-hidden />} onClick={() => run(onLoad)}>
            Load
          </MenuItem>
          <MenuItem icon={<Download size={16} aria-hidden />} onClick={() => run(onExportJson)}>
            Export JSON
          </MenuItem>
          <MenuItem
            icon={<Upload size={16} aria-hidden />}
            onClick={() => run(() => inputRef.current?.click())}
          >
            Import JSON
          </MenuItem>
          <MenuItem icon={<FileCode size={16} aria-hidden />} onClick={() => run(onExportScript)}>
            Export Script
          </MenuItem>
          <div className="my-1 h-px bg-edge" role="separator" />
          <MenuItem
            icon={<Trash2 size={16} aria-hidden />}
            onClick={() => run(onClear)}
            tone="danger"
          >
            Clear
          </MenuItem>
        </div>,
        document.body,
      ) : null}

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        aria-label="Choose geometry JSON file"
        onChange={(event) => void handleImport(event)}
      />

      {error !== null ? (
        <p className="absolute top-full left-1/2 mt-1 -translate-x-1/2 max-w-[9rem] text-center text-xs font-semibold text-danger-fg" role="alert">
          {error}
        </p>
      ) : message !== null ? (
        <p className="absolute top-full left-1/2 mt-1 -translate-x-1/2 max-w-[9rem] text-center text-xs font-semibold text-success-fg" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  tone = "default",
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
        tone === "danger"
          ? "text-danger-fg hover:bg-danger-soft"
          : "text-content hover:bg-accent-soft hover:text-accent-soft-fg"
      }`}
    >
      <span className="text-muted">{icon}</span>
      {children}
    </button>
  );
}

function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read file.")));
    reader.readAsText(file);
  });
}
