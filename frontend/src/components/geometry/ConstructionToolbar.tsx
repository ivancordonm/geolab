import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  Box,
  Circle,
  CircleDot,
  Compass,
  CornerDownRight,
  Crosshair,
  Diamond,
  Divide,
  Dot,
  Equal,
  Hexagon,
  Maximize2,
  Minus,
  MousePointer2,
  Move,
  Octagon,
  Pentagon,
  Ratio,
  RefreshCcw,
  RefreshCw,
  RotateCw,
  Slash,
  Spline,
  Star,
  Triangle,
  Waypoints,
} from "lucide-react";

import type { ConstructionTool } from "../../geometry/constructionTools";
import type { ToolGroupKey } from "../../i18n/locales/en";
import { ToolGroupButton, type GroupToolOption } from "./ToolGroupButton";
import { useTranslation } from "react-i18next";

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

type ToolConfig = Omit<GroupToolOption, "label" | "instruction">;
type ToolEntry =
  | { divider: true }
  | ToolConfig
  | { group: ToolGroupKey; tools: readonly ToolConfig[] };

const TOOLS: readonly ToolEntry[] = [
  { tool: "select", icon: MousePointer2, shortcut: "p" },
  { divider: true },
  {
    group: "basic-shapes",
    tools: [
      { tool: "point", icon: Dot, shortcut: "o" },
      { tool: "segment", icon: Minus, shortcut: "s" },
      { tool: "line", icon: Slash, shortcut: "l" },
      { tool: "circle", icon: Circle, shortcut: "c" },
    ],
  },
  { divider: true },
  {
    group: "midpoint-bisectors",
    tools: [
      { tool: "midpoint", icon: Diamond },
      { tool: "perp_bisector", icon: Divide },
      { tool: "angle_bisector", icon: Compass },
    ],
  },
  {
    group: "parallel-perpendicular",
    tools: [
      { tool: "parallel", icon: Equal },
      { tool: "perpendicular", icon: CornerDownRight },
    ],
  },
  { divider: true },
  {
    group: "intersection-circumcircle",
    tools: [
      { tool: "intersection", icon: Crosshair },
      { tool: "tangent", icon: Spline },
      { tool: "circumcircle", icon: CircleDot },
    ],
  },
  { divider: true },
  {
    group: "transformations",
    tools: [
      { tool: "reflect_line", icon: ArrowLeftRight },
      { tool: "reflect_point", icon: RefreshCcw },
      { tool: "translation", icon: Move },
      { tool: "rotation", icon: RotateCw },
    ],
  },
  {
    group: "homothety",
    tools: [
      { tool: "homothety", icon: Maximize2 },
      { tool: "homothety_scalar", icon: Ratio },
    ],
  },
  { tool: "inversion", icon: RefreshCw, shortcut: "i" },
  { divider: true },
  {
    group: "polygons",
    tools: [
      { tool: "polygon", icon: Pentagon },
      { tool: "regular_polygon", icon: Star },
      { tool: "vector_polygon", icon: Waypoints },
    ],
  },
  { divider: true },
  {
    group: "regular-polyhedra",
    tools: [
      { tool: "tetrahedron", icon: Triangle },
      { tool: "cube", icon: Box },
      { tool: "octahedron", icon: Octagon },
      { tool: "dodecahedron", icon: Pentagon },
      { tool: "icosahedron", icon: Hexagon },
    ],
  },
] as const;

function flattenEntries(entries: readonly ToolEntry[]): ToolConfig[] {
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
  const { t } = useTranslation();
  const tools = TOOLS.map((entry) => {
    if ("divider" in entry) return entry;
    if ("group" in entry) {
      return {
        ...entry,
        label: t(`toolbar.groups.${entry.group}.label`),
        instruction: t(`toolbar.groups.${entry.group}.instruction`),
        tools: entry.tools.map((option) => ({
          ...option,
          label: t(`toolbar.tools.${option.tool}.label`),
          instruction: t(`toolbar.tools.${option.tool}.instruction`),
        })),
      };
    }
    return {
      ...entry,
      label: t(`toolbar.tools.${entry.tool}.label`),
      instruction: t(`toolbar.tools.${entry.tool}.instruction`),
    };
  });
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
          aria-label={t("toolbar.aria")}
          style={{ scrollbarWidth: "none" }}
          className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden min-h-0 flex-1"
        >
          {tools.map((entry, i) => {
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
                onMouseEnter={(e) => showTooltip(e, label, entry.instruction, shortcut)}
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
                {t("toolbar.sides")}
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
                {t("toolbar.angle")}
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
                {t("toolbar.ratio")}
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
