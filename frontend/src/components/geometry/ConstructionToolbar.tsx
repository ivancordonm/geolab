import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  Circle,
  CircleDot,
  Compass,
  CornerDownRight,
  Crosshair,
  Diamond,
  Divide,
  Dot,
  Equal,
  Maximize2,
  Minus,
  MousePointer2,
  Move,
  Pentagon,
  Ratio,
  RefreshCcw,
  RefreshCw,
  RotateCw,
  Slash,
  Star,
  Waypoints,
} from "lucide-react";

import { TOOL_INSTRUCTIONS, type ConstructionTool } from "../../geometry/constructionTools";
import { ToolGroupButton, type GroupToolOption } from "./ToolGroupButton";

interface ConstructionToolbarProps {
  activeTool: ConstructionTool;
  onActivateTool: (tool: ConstructionTool) => void;
  regularPolygonSides?: number;
  onRegularPolygonSidesChange?: (sides: number) => void;
  rotationAngle?: number;
  onRotationAngleChange?: (angle: number) => void;
  homothetyRatio?: number;
  onHomothetyRatioChange?: (ratio: number) => void;
  /** Controles adicionales (tema, reset view, persistencia) que se colocan bajo un divisor. */
  controls?: ReactNode;
}

type ToolEntry =
  | { divider: true }
  | GroupToolOption
  | { group: string; label: string; instruction: string; tools: readonly GroupToolOption[] };

const TOOLS: readonly ToolEntry[] = [
  { tool: "select", label: "Select", icon: MousePointer2, shortcut: "p" },
  { divider: true },
  {
    group: "basic-shapes",
    label: "Basic shapes",
    instruction: "Choose a basic construction tool",
    tools: [
      { tool: "point", label: "Point", icon: Dot },
      { tool: "segment", label: "Segment", icon: Minus },
      { tool: "line", label: "Line", icon: Slash },
      { tool: "circle", label: "Circle", icon: Circle },
    ],
  },
  { divider: true },
  { tool: "midpoint", label: "Midpoint", icon: Diamond },
  {
    group: "parallel-perpendicular",
    label: "Parallel & perpendicular",
    instruction: "Choose a parallel or perpendicular line tool",
    tools: [
      { tool: "parallel", label: "Parallel line", icon: Equal },
      { tool: "perpendicular", label: "Perpendicular line", icon: CornerDownRight },
    ],
  },
  { tool: "perp_bisector", label: "Perpendicular bisector", icon: Divide },
  { tool: "angle_bisector", label: "Angle bisector", icon: Compass },
  { divider: true },
  { tool: "intersection", label: "Intersection", icon: Crosshair },
  { tool: "circumcircle", label: "Circumscribed circle", icon: CircleDot },
  { divider: true },
  {
    group: "transformations",
    label: "Transformations",
    instruction: "Choose a transformation tool",
    tools: [
      { tool: "reflect_line", label: "Reflect over line", icon: ArrowLeftRight },
      { tool: "reflect_point", label: "Reflect over point", icon: RefreshCcw },
      { tool: "translation", label: "Translation", icon: Move },
      { tool: "rotation", label: "Rotate", icon: RotateCw },
    ],
  },
  {
    group: "homothety",
    label: "Homothety",
    instruction: "Choose a homothety tool",
    tools: [
      { tool: "homothety", label: "Homothety (point ratio)", icon: Maximize2 },
      { tool: "homothety_scalar", label: "Homothety (numeric ratio)", icon: Ratio },
    ],
  },
  { tool: "inversion", label: "Inversion in circle", icon: RefreshCw },
  { divider: true },
  {
    group: "polygons",
    label: "Polygons",
    instruction: "Choose a polygon tool",
    tools: [
      { tool: "polygon", label: "Polygon", icon: Pentagon },
      { tool: "regular_polygon", label: "Regular polygon", icon: Star },
      { tool: "vector_polygon", label: "Vector polygon", icon: Waypoints },
    ],
  },
] as const;

function flattenEntries(entries: readonly ToolEntry[]): GroupToolOption[] {
  return entries.flatMap((entry) => {
    if ("divider" in entry) return [];
    if ("group" in entry) return [...entry.tools];
    return [entry];
  });
}

export const SHORTCUT_TO_TOOL: Readonly<Record<string, ConstructionTool>> = Object.fromEntries(
  flattenEntries(TOOLS)
    .filter((entry) => entry.shortcut !== undefined)
    .map((entry) => [entry.shortcut as string, entry.tool]),
);

interface TooltipState {
  label: string;
  instruction: string;
  shortcut?: string;
  top: number;
  left: number;
}

export function ConstructionToolbar({
  activeTool,
  onActivateTool,
  regularPolygonSides = 5,
  onRegularPolygonSidesChange,
  rotationAngle = 45,
  onRotationAngleChange,
  homothetyRatio = 1,
  onHomothetyRatioChange,
  controls,
}: ConstructionToolbarProps) {
  const hasInput =
    (activeTool === "rotation" && onRotationAngleChange !== undefined) ||
    (activeTool === "homothety_scalar" && onHomothetyRatioChange !== undefined) ||
    (activeTool === "regular_polygon" && onRegularPolygonSidesChange !== undefined);

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [homothetyRatioText, setHomothetyRatioText] = useState(String(homothetyRatio));
  const editingHomothetyRatioRef = useRef(false);
  const cancelHomothetyRatioEditRef = useRef(false);

  useEffect(() => {
    if (!editingHomothetyRatioRef.current) setHomothetyRatioText(String(homothetyRatio));
  }, [homothetyRatio]);

  const showTooltip = (
    e: React.MouseEvent<HTMLButtonElement>,
    label: string,
    instruction: string,
    shortcut?: string,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rawTop = rect.top + rect.height / 2;
    // Clamp so tooltip (≈50px tall) stays within the viewport
    const top = Math.max(30, Math.min(rawTop, window.innerHeight - 30));
    setTooltip({ label, instruction, shortcut, top, left: rect.right + 10 });
  };

  const hideTooltip = () => setTooltip(null);

  return (
    <>
      <div className={`absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-card border border-edge bg-surface/90 p-1.5 shadow-card backdrop-blur transition-[width] overflow-hidden max-h-[calc(100vh-1.5rem)] ${hasInput ? "w-[88px]" : "w-[52px]"}`}>
        {/* Scrollable tool list */}
        <div
          role="toolbar"
          aria-label="Geometry construction tools"
          style={{ scrollbarWidth: "none" }}
          className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden min-h-0 flex-1"
        >
          {TOOLS.map((entry, i) => {
            if ("divider" in entry) {
              return <div key={`div-${i}`} className="my-0.5 h-px bg-edge" role="separator" />;
            }
            if ("group" in entry) {
              return (
                <ToolGroupButton
                  key={`group-${entry.group}`}
                  label={entry.label}
                  instruction={entry.instruction}
                  tools={entry.tools}
                  activeTool={activeTool}
                  onActivateTool={onActivateTool}
                  onShowTooltip={showTooltip}
                  onHideTooltip={hideTooltip}
                />
              );
            }
            const { tool, label, icon: Icon, shortcut } = entry;
            const active = activeTool === tool;
            return (
              <button
                key={tool}
                type="button"
                aria-label={label}
                aria-pressed={active}
                aria-keyshortcuts={shortcut}
                onClick={() => onActivateTool(tool)}
                onMouseEnter={(e) => showTooltip(e, label, TOOL_INSTRUCTIONS[tool], shortcut)}
                onMouseLeave={hideTooltip}
                className={`w-full flex items-center justify-center rounded-lg p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                  active
                    ? "bg-brand-600 text-white"
                    : "text-muted hover:bg-accent-soft hover:text-accent-soft-fg"
                }`}
              >
                <Icon size={18} aria-hidden />
              </button>
            );
          })}
        </div>

        {activeTool === "regular_polygon" && onRegularPolygonSidesChange !== undefined && (
          <>
            <div className="my-0.5 h-px bg-edge" role="separator" />
            <div className="flex flex-col gap-1 px-1">
              <label className="text-[10px] font-semibold text-muted" htmlFor="polygon-sides">
                Sides
              </label>
              <input
                id="polygon-sides"
                type="number"
                min={3}
                max={20}
                value={regularPolygonSides}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v >= 3 && v <= 20) onRegularPolygonSidesChange(v);
                }}
                className="w-full rounded border border-edge bg-surface px-1.5 py-0.5 text-xs text-content focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </>
        )}
        {activeTool === "rotation" && onRotationAngleChange !== undefined && (
          <>
            <div className="my-0.5 h-px bg-edge" role="separator" />
            <div className="flex flex-col gap-1 px-1">
              <label className="text-[10px] font-semibold text-muted" htmlFor="rotation-angle">
                Angle (°)
              </label>
              <input
                id="rotation-angle"
                type="number"
                min={-360}
                max={360}
                value={rotationAngle}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) onRotationAngleChange(v);
                }}
                className="w-full rounded border border-edge bg-surface px-1.5 py-0.5 text-xs text-content focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </>
        )}
        {activeTool === "homothety_scalar" && onHomothetyRatioChange !== undefined && (
          <>
            <div className="my-0.5 h-px bg-edge" role="separator" />
            <div className="flex flex-col gap-1 px-1">
              <label className="text-[10px] font-semibold text-muted" htmlFor="homothety-ratio">
                Ratio
              </label>
              <input
                id="homothety-ratio"
                type="number"
                step="any"
                value={homothetyRatioText}
                onChange={(e) => {
                  setHomothetyRatioText(e.target.value);
                }}
                onFocus={() => { editingHomothetyRatioRef.current = true; }}
                onBlur={() => {
                  editingHomothetyRatioRef.current = false;
                  if (cancelHomothetyRatioEditRef.current) {
                    cancelHomothetyRatioEditRef.current = false;
                    return;
                  }
                  const v = Number(homothetyRatioText);
                  if (homothetyRatioText.trim() !== "" && Number.isFinite(v)) {
                    onHomothetyRatioChange(v);
                  } else {
                    setHomothetyRatioText(String(homothetyRatio));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    cancelHomothetyRatioEditRef.current = true;
                    setHomothetyRatioText(String(homothetyRatio));
                    e.currentTarget.blur();
                  }
                }}
                className="w-full rounded border border-edge bg-surface px-1.5 py-0.5 text-xs text-content focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </>
        )}
        {controls !== undefined && (
          <>
            <div className="my-0.5 h-px bg-edge" role="separator" />
            <div className="flex flex-col gap-1">{controls}</div>
          </>
        )}
      </div>

      {/* Tooltip rendered via portal so it's never clipped by the scroll container */}
      {tooltip &&
        createPortal(
          <div
            role="tooltip"
            style={{ position: "fixed", top: tooltip.top, left: tooltip.left, transform: "translateY(-50%)" }}
            className="pointer-events-none z-50 w-max max-w-52 rounded-lg border border-edge bg-surface px-3 py-2 shadow-card"
          >
            <p className="text-xs font-semibold text-content">
              {tooltip.label}
              {tooltip.shortcut !== undefined && ` (${tooltip.shortcut.toUpperCase()})`}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">{tooltip.instruction}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
