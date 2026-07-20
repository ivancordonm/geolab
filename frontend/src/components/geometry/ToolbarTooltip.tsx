import type { ReactNode } from "react";
import { useState } from "react";
import { createPortal } from "react-dom";

interface TooltipPosition {
  top: number;
  left: number;
}

interface ToolbarTooltipProps {
  label: string;
  instruction: string;
  children: ReactNode;
}

/** Renders the toolbar's portal tooltip for controls that are not construction tools. */
export function ToolbarTooltip({ label, instruction, children }: ToolbarTooltipProps) {
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const showTooltip = (event: React.MouseEvent<HTMLSpanElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const rawTop = rect.top + rect.height / 2;
    setPosition({
      top: Math.max(30, Math.min(rawTop, window.innerHeight - 30)),
      left: rect.right + 10,
    });
  };

  return (
    <>
      <span className="contents" onMouseEnter={showTooltip} onMouseLeave={() => setPosition(null)}>
        {children}
      </span>
      {position &&
        createPortal(
          <div
            role="tooltip"
            style={{ position: "fixed", top: position.top, left: position.left, transform: "translateY(-50%)" }}
            className="pointer-events-none z-50 w-max max-w-52 rounded-lg border border-edge bg-surface px-3 py-2 shadow-card"
          >
            <p className="text-xs font-semibold text-content">{label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">{instruction}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
