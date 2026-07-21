import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CaptureBounds } from "../../geometry/exportImage";

interface CaptureOverlayProps {
  onCapture: (bounds: CaptureBounds) => void;
  onCancel: () => void;
}

export function CaptureOverlay({ onCapture, onCancel }: CaptureOverlayProps) {
  const { t } = useTranslation();
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handlePointerDown = (event: React.PointerEvent) => {
    // Only capture primary button (left click)
    if (event.button !== 0) return;
    setStart({ x: event.clientX, y: event.clientY });
    setCurrent({ x: event.clientX, y: event.clientY });
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (start === null) return;
    setCurrent({ x: event.clientX, y: event.clientY });
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (start === null || current === null) return;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);

    if (width > 10 && height > 10) {
      onCapture({ x, y, width, height });
    } else {
      // Too small, just cancel
      onCancel();
    }
  };

  // SVG-based overlay to create a "cutout" effect
  // We use a full screen SVG with a mask. The mask is white everywhere, but black over the selection rectangle.
  // The rect itself is filled with a dark semi-transparent color, masked out where the selection is.
  return (
    <div 
      className="fixed inset-0 z-50 cursor-crosshair touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={onCancel}
    >
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="capture-mask">
            <rect width="100%" height="100%" fill="white" />
            {start !== null && current !== null && (
              <rect
                x={Math.min(start.x, current.x)}
                y={Math.min(start.y, current.y)}
                width={Math.abs(current.x - start.x)}
                height={Math.abs(current.y - start.y)}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.4)"
          mask="url(#capture-mask)"
        />
        {start !== null && current !== null && (
          <rect
            x={Math.min(start.x, current.x)}
            y={Math.min(start.y, current.y)}
            width={Math.abs(current.x - start.x)}
            height={Math.abs(current.y - start.y)}
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        )}
      </svg>
      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-surface px-4 py-2 text-sm font-medium text-content shadow-lg border border-edge">
        {t("capture.overlayInstruction")}
      </div>
    </div>
  );
}
