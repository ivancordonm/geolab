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
  RefreshCcw,
  RefreshCw,
  RotateCw,
  Slash,
} from "lucide-react";

import { TOOL_INSTRUCTIONS, type ConstructionTool } from "../../geometry/constructionTools";

interface ConstructionToolbarProps {
  activeTool: ConstructionTool;
  onActivateTool: (tool: ConstructionTool) => void;
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
  { tool: "rotation90", label: "Rotate 90°", icon: RotateCw },
];

export function ConstructionToolbar({
  activeTool,
  onActivateTool,
  controls,
}: ConstructionToolbarProps) {
  return (
    <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-card border border-edge bg-surface/90 p-1.5 shadow-card backdrop-blur">
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
                className={`flex items-center justify-center rounded-lg p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
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

      {controls !== undefined && (
        <>
          <div className="my-0.5 h-px bg-edge" role="separator" />
          <div className="flex flex-col gap-1">{controls}</div>
        </>
      )}
    </div>
  );
}
