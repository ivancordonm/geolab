import type { ComponentType, ReactNode } from "react";
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
  RefreshCcw,
  RefreshCw,
  RotateCw,
  Slash,
  Star,
  Waypoints,
} from "lucide-react";

import { TOOL_INSTRUCTIONS, type ConstructionTool } from "../../geometry/constructionTools";

interface ConstructionToolbarProps {
  activeTool: ConstructionTool;
  onActivateTool: (tool: ConstructionTool) => void;
  regularPolygonSides?: number;
  onRegularPolygonSidesChange?: (sides: number) => void;
  rotationAngle?: number;
  onRotationAngleChange?: (angle: number) => void;
  /** Controles adicionales (tema, reset view, persistencia) que se colocan bajo un divisor. */
  controls?: ReactNode;
}

interface IconProps {
  size?: number | string;
  "aria-hidden"?: boolean;
}

type ToolEntry =
  | { divider: true }
  | { tool: ConstructionTool; label: string; icon: ComponentType<IconProps> };

const TOOLS: readonly ToolEntry[] = [
  { tool: "select", label: "Select", icon: MousePointer2 },
  { divider: true },
  { tool: "point", label: "Point", icon: Dot },
  { tool: "segment", label: "Segment", icon: Minus },
  { tool: "line", label: "Line", icon: Slash },
  { tool: "circle", label: "Circle", icon: Circle },
  { divider: true },
  { tool: "midpoint", label: "Midpoint", icon: Diamond },
  { tool: "parallel", label: "Parallel line", icon: Equal },
  { tool: "perpendicular", label: "Perpendicular line", icon: CornerDownRight },
  { tool: "perp_bisector", label: "Perpendicular bisector", icon: Divide },
  { tool: "angle_bisector", label: "Angle bisector", icon: Compass },
  { divider: true },
  { tool: "intersection", label: "Intersection", icon: Crosshair },
  { tool: "circumcircle", label: "Circumscribed circle", icon: CircleDot },
  { divider: true },
  { tool: "reflect_line", label: "Reflect over line", icon: ArrowLeftRight },
  { tool: "reflect_point", label: "Reflect over point", icon: RefreshCcw },
  { tool: "homothety", label: "Homothety (point ratio)", icon: Maximize2 },
  { tool: "inversion", label: "Inversion in circle", icon: RefreshCw },
  { tool: "translation", label: "Translation", icon: Move },
  { tool: "rotation", label: "Rotate", icon: RotateCw },
  { divider: true },
  { tool: "polygon", label: "Polygon", icon: Pentagon },
  { tool: "regular_polygon", label: "Regular polygon", icon: Star },
  { tool: "vector_polygon", label: "Vector polygon", icon: Waypoints },
] as const;

export function ConstructionToolbar({
  activeTool,
  onActivateTool,
  regularPolygonSides = 5,
  onRegularPolygonSidesChange,
  rotationAngle = 45,
  onRotationAngleChange,
  controls,
}: ConstructionToolbarProps) {
  const hasInput =
    (activeTool === "rotation" && onRotationAngleChange !== undefined) ||
    (activeTool === "regular_polygon" && onRegularPolygonSidesChange !== undefined);

  return (
    <div style={{ scrollbarWidth: "none" }} className={`absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-card border border-edge bg-surface/90 p-1.5 shadow-card backdrop-blur transition-[width] overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden max-h-[calc(100vh-1.5rem)] ${hasInput ? "w-[88px]" : "w-[52px]"}`}>
      <div role="toolbar" aria-label="Geometry construction tools" className="flex flex-col gap-1">
        {TOOLS.map((entry, i) => {
          if ("divider" in entry) {
            return <div key={`div-${i}`} className="my-0.5 h-px bg-edge" role="separator" />;
          }
          const { tool, label, icon: Icon } = entry;
          const active = activeTool === tool;
          return (
            <div key={tool} className="group relative">
              <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={() => onActivateTool(tool)}
                className={`w-full flex items-center justify-center rounded-lg p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                  active
                    ? "bg-brand-600 text-white"
                    : "text-muted hover:bg-accent-soft hover:text-accent-soft-fg"
                }`}
              >
                <Icon size={18} aria-hidden />
              </button>
              <div
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 w-max max-w-52 rounded-lg border border-edge bg-surface px-3 py-2 shadow-card invisible opacity-0 transition-opacity duration-100 group-hover:visible group-hover:opacity-100"
              >
                <p className="text-xs font-semibold text-content">{label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{TOOL_INSTRUCTIONS[tool]}</p>
              </div>
            </div>
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
      {controls !== undefined && (
        <>
          <div className="my-0.5 h-px bg-edge" role="separator" />
          <div className="flex flex-col gap-1">{controls}</div>
        </>
      )}
    </div>
  );
}
