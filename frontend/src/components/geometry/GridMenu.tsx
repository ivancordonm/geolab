import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Grid3x3 } from "lucide-react";

import type { GridSettings } from "../../geometry/viewport";

interface GridMenuProps {
  settings: GridSettings;
  onChange: (next: GridSettings) => void;
}

interface MenuPos {
  top: number;
  left: number;
}

const MENU_WIDTH = 220;
// Panel content is ~6 rows tall; used to keep it on-screen when the trigger
// sits near the bottom of the viewport (it lives in a tall vertical toolbar).
const MENU_HEIGHT_ESTIMATE = 250;

export function GridMenu({ settings, onChange }: GridMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [manualStepText, setManualStepText] = useState(String(settings.manualStep));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setManualStepText(String(settings.manualStep));
  }, [settings.manualStep]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insidePanel = panelRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insidePanel) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleToggle = (): void => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const left = Math.min(rect.right + 8, window.innerWidth - MENU_WIDTH - 8);
      const top = Math.max(8, Math.min(rect.top, window.innerHeight - MENU_HEIGHT_ESTIMATE - 8));
      setPos({ top, left });
    }
    setOpen((value) => !value);
  };

  const handleManualStepChange = (text: string): void => {
    setManualStepText(text);
    const value = Number(text);
    if (Number.isFinite(value) && value > 0) {
      onChange({ ...settings, manualStep: value });
    }
  };

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        title="Cuadrícula"
        aria-label="Grid settings"
        aria-expanded={open}
        onClick={handleToggle}
        className="flex items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent-soft-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <Grid3x3 size={18} aria-hidden />
      </button>

      {open && pos !== null
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Grid settings"
              style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH, zIndex: 9999 }}
              className="rounded-xl border border-edge bg-surface p-3 shadow-pop"
            >
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
                Cuadrícula
              </p>
              <label className="mb-2 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.showGrid}
                  onChange={(event) => onChange({ ...settings, showGrid: event.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-brand-600"
                />
                <span className="text-xs text-content">Mostrar cuadrícula</span>
              </label>
              <label className="mb-2 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.showAxes}
                  onChange={(event) => onChange({ ...settings, showAxes: event.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-brand-600"
                />
                <span className="text-xs text-content">Mostrar ejes</span>
              </label>
              <label className="mb-3 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.snapToGrid}
                  onChange={(event) => onChange({ ...settings, snapToGrid: event.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-brand-600"
                />
                <span className="text-xs text-content">Ajustar a cuadrícula</span>
              </label>

              <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
                Paso
              </p>
              <label className="mb-1.5 flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="grid-step-mode"
                  checked={settings.stepMode === "auto"}
                  onChange={() => onChange({ ...settings, stepMode: "auto" })}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                <span className="text-xs text-content">Automático</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="grid-step-mode"
                  checked={settings.stepMode === "manual"}
                  onChange={() => onChange({ ...settings, stepMode: "manual" })}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                <span className="text-xs text-content">Manual:</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  disabled={settings.stepMode !== "manual"}
                  value={manualStepText}
                  onChange={(event) => handleManualStepChange(event.target.value)}
                  className="w-16 rounded-md border border-edge bg-surface-muted px-1.5 py-0.5 text-xs text-content disabled:opacity-40"
                />
              </label>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
