import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Fullscreen, Crop } from "lucide-react";
import { ToolbarTooltip } from "./ToolbarTooltip";
import { useTranslation } from "react-i18next";

interface CaptureMenuProps {
  onCaptureFull: () => void;
  onCaptureArea: () => void;
}

interface MenuPos {
  top: number;
  left: number;
}

const MENU_WIDTH = 220;
const MENU_HEIGHT_ESTIMATE = 100;

export function CaptureMenu({ onCaptureFull, onCaptureArea }: CaptureMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  const handleFullClick = () => {
    setOpen(false);
    onCaptureFull();
  };

  const handleAreaClick = () => {
    setOpen(false);
    onCaptureArea();
  };

  return (
    <div>
      <ToolbarTooltip label={t("capture.title")} instruction={t("capture.instruction")}>
        <button
          ref={triggerRef}
          type="button"
          aria-label={t("capture.menu")}
          aria-expanded={open}
          onClick={handleToggle}
          className="flex items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent-soft-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <Camera size={18} aria-hidden />
        </button>
      </ToolbarTooltip>

      {open && pos !== null
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={t("capture.options")}
              style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH, zIndex: 9999 }}
              className="flex flex-col gap-1 rounded-xl border border-edge bg-surface p-2 shadow-pop"
            >
              <ToolbarTooltip label={t("capture.full")} instruction={t("capture.fullInstruction")}>
                <button
                  type="button"
                  onClick={handleFullClick}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-content hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                >
                  <Fullscreen size={16} className="text-muted" />
                  {t("capture.full")}
                </button>
              </ToolbarTooltip>
              <ToolbarTooltip label={t("capture.area")} instruction={t("capture.areaInstruction")}>
                <button
                  type="button"
                  onClick={handleAreaClick}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-content hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                >
                  <Crop size={16} className="text-muted" />
                  {t("capture.area")}
                </button>
              </ToolbarTooltip>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
