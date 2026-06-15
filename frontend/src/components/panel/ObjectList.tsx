import { MoreVertical, Trash2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { getParentIds } from "../../geometry/engine";
import type { EvaluationMap, GeometryDocument, GeometryObject, GeometryStyle, StrokeDash } from "../../types/geometry";

interface ObjectListProps {
  document: GeometryDocument;
  values: EvaluationMap;
  selectedObjectId: string | null;
  onSelectObject: (objectId: string) => void;
  onToggleVisibility: (objectId: string) => void;
  onSetObjectLabel?: (objectId: string, label: string) => void;
  onSetObjectColor?: (objectId: string, color: string | null) => void;
  onSetObjectStyle?: (objectId: string, patch: Partial<GeometryStyle>) => void;
  onDeleteObject?: (objectId: string) => void;
}

const PALETTE: Array<{ label: string; value: string }> = [
  { label: "Red", value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Yellow", value: "#eab308" },
  { label: "Green", value: "#22c55e" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Pink", value: "#ec4899" },
];

const PALETTE_VALUES = new Set(PALETTE.map((p) => p.value));

interface MenuState {
  objectId: string;
  x: number;
  y: number;
}

const KIND_DOT_BG: Record<string, string> = {
  point: "var(--geo-point)",
  segment: "var(--geo-segment)",
  line: "var(--geo-line)",
  circle: "var(--geo-circle)",
  arc: "var(--geo-circle)",
};

function dotStyle(object: GeometryObject): React.CSSProperties {
  const customColor = object.style?.color;
  const base = KIND_DOT_BG[object.kind] ?? "var(--geo-line)";
  const color = customColor ?? base;

  if (object.kind === "circle") {
    return { border: `2px solid ${color}`, background: "transparent" };
  }
  return { background: color };
}

export function ObjectList({
  document,
  values,
  selectedObjectId,
  onSelectObject,
  onToggleVisibility,
  onSetObjectLabel,
  onSetObjectColor,
  onSetObjectStyle,
  onDeleteObject,
}: ObjectListProps) {
  const labelsById = new Map(document.objects.map((object) => [object.id, object.label]));
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (menu === null) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    window.addEventListener("mousedown", handler, { capture: true });
    return () => window.removeEventListener("mousedown", handler, { capture: true });
  }, [menu]);

  // Close menu on Escape
  useEffect(() => {
    if (menu === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [menu]);

  const POPOVER_WIDTH = 224; // w-56
  const openMenu = (objectId: string, trigger: HTMLElement) => {
    const rect = trigger.getBoundingClientRect();
    const x = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8));
    setMenu({ objectId, x, y: rect.bottom + 4 });
  };

  const menuObject = menu ? document.objects.find((o) => o.id === menu.objectId) : null;

  return (
    <section className="p-4" aria-labelledby="objects-heading">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.13em] text-brand-600">
            Construction graph
          </p>
          <h2 id="objects-heading" className="m-0 mt-0.5 text-lg font-bold tracking-tight text-content">
            Objects
          </h2>
        </div>
        <span
          className="grid h-9 min-w-9 place-items-center rounded-lg bg-accent-soft px-2 text-sm font-bold text-accent-soft-fg"
          aria-label={`${document.objects.length} objects`}
        >
          {document.objects.length}
        </span>
      </div>

      {document.objects.length === 0 ? (
        <p className="m-0 rounded-lg border border-dashed border-edge px-3 py-6 text-center text-sm text-muted">
          No objects yet. Run a script or use the tools to build a construction.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {document.objects.map((object) => {
            const dependencies = getParentIds(object).map((id) => labelsById.get(id) ?? id);
            const value = values.get(object.id);
            const selected = object.id === selectedObjectId;
            const undefinedValue = value?.type === "undefined";
            return (
              <li
                key={object.id}
                className={`flex items-stretch overflow-hidden rounded-lg border transition-colors ${
                  selected
                    ? "border-brand-400 bg-accent-soft"
                    : "border-transparent hover:bg-surface-muted"
                }`}
              >
                {/* Punto como toggle de visibilidad */}
                <button
                  type="button"
                  aria-label={`${object.visible ? "Hide" : "Show"} ${object.label}`}
                  aria-pressed={object.visible}
                  onClick={() => onToggleVisibility(object.id)}
                  className={`flex items-center pl-2.5 pr-1.5 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 ${
                    object.visible ? "opacity-100" : "opacity-30"
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={dotStyle(object)}
                  />
                </button>

                {/* Contenido del objeto */}
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectObject(object.id)}
                  className={`flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left transition-opacity focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 ${
                    object.visible ? "" : "opacity-40"
                  }`}
                >
                  <span className="block min-w-0">
                    <strong className="block truncate text-sm font-semibold text-content">
                      {object.label}
                    </strong>
                    <small className="block text-xs text-muted">{describeObject(object)}</small>
                    <small className="block text-xs text-subtle">
                      {dependencies.length > 0
                        ? `Depends on ${dependencies.join(", ")}`
                        : "Independent"}
                    </small>
                  </span>
                  <span
                    className={`ml-auto shrink-0 text-[0.65rem] font-bold uppercase tracking-wide ${
                      undefinedValue ? "text-danger-fg" : "text-success-fg"
                    }`}
                  >
                    {undefinedValue ? "undefined" : object.kind}
                  </span>
                </button>

                {/* Botón tres puntos */}
                {(onSetObjectLabel !== undefined || onSetObjectColor !== undefined || onSetObjectStyle !== undefined || onDeleteObject !== undefined) && (
                  <button
                    type="button"
                    aria-label={`Edit ${object.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (menu?.objectId === object.id) {
                        setMenu(null);
                      } else {
                        openMenu(object.id, e.currentTarget);
                      }
                    }}
                    className="flex items-center px-1.5 text-muted opacity-0 transition-opacity hover:text-content focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 [li:hover_&]:opacity-100"
                  >
                    <MoreVertical size={14} aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* Popover flotante */}
      {menu !== null && menuObject != null && (
        <ObjectMenu
          ref={menuRef}
          object={menuObject}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onSetLabel={
            onSetObjectLabel
              ? (label) => {
                  onSetObjectLabel(menu.objectId, label);
                }
              : undefined
          }
          onSetColor={
            onSetObjectColor
              ? (color) => {
                  onSetObjectColor(menu.objectId, color);
                }
              : undefined
          }
          onSetStyle={
            onSetObjectStyle
              ? (patch) => {
                  onSetObjectStyle(menu.objectId, patch);
                }
              : undefined
          }
          onDelete={
            onDeleteObject
              ? () => {
                  onDeleteObject(menu.objectId);
                  setMenu(null);
                }
              : undefined
          }
        />
      )}
    </section>
  );
}

const STROKE_WIDTHS: Array<{ label: string; value: number; svgWidth: number }> = [
  { label: "Fino", value: 1, svgWidth: 1 },
  { label: "Normal", value: 2, svgWidth: 2 },
  { label: "Grueso", value: 3.5, svgWidth: 3.5 },
  { label: "Negrita", value: 5, svgWidth: 5 },
];

const STROKE_DASHES: Array<{ label: string; value: StrokeDash; dasharray?: string; linecap?: string }> = [
  { label: "Sólida", value: "solid" },
  { label: "Guiones", value: "dashed", dasharray: "8 4" },
  { label: "Puntos", value: "dotted", dasharray: "1 4", linecap: "round" },
];

interface ObjectMenuProps {
  object: GeometryObject;
  x: number;
  y: number;
  onClose: () => void;
  onSetLabel?: (label: string) => void;
  onSetColor?: (color: string | null) => void;
  onSetStyle?: (patch: Partial<GeometryStyle>) => void;
  onDelete?: () => void;
  ref: React.RefObject<HTMLDivElement | null>;
}

function ObjectMenu({ object, x, y, onClose, onSetLabel, onSetColor, onSetStyle, onDelete, ref }: ObjectMenuProps) {
  const [label, setLabel] = useState(object.label);
  const inputRef = useRef<HTMLInputElement>(null);

  // Posición ajustada al viewport (se mide la altura real tras montar)
  const [box, setBox] = useState<{ top: number; left: number; maxHeight: number | undefined }>({
    top: y,
    left: x,
    maxHeight: undefined,
  });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commitLabel = () => {
    const trimmed = label.trim();
    if (trimmed && trimmed !== object.label) {
      onSetLabel?.(trimmed);
    } else {
      setLabel(object.label);
    }
  };

  const currentColor = object.style?.color ?? null;
  const isCustomColor = currentColor !== null && !PALETTE_VALUES.has(currentColor);
  const [showCustomInput, setShowCustomInput] = useState(isCustomColor);
  const [customHex, setCustomHex] = useState(isCustomColor ? currentColor : "");
  const currentStrokeWidth = object.style?.strokeWidth ?? null;
  const currentStrokeDash = object.style?.strokeDash ?? "solid";
  const hasStroke = object.kind !== "point";

  // Recalcular posición cuando el contenido cambia de tamaño (input hex, secciones de trazo)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 8;
    const height = el.offsetHeight;
    const maxHeight = window.innerHeight - margin * 2;
    const top =
      y + height > window.innerHeight - margin
        ? Math.max(margin, window.innerHeight - height - margin)
        : y;
    setBox({ top, left: x, maxHeight });
  }, [x, y, showCustomInput, hasStroke, ref]);

  const applyCustomHex = (raw: string) => {
    const hex = raw.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      onSetColor?.(hex);
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`Edit ${object.label}`}
      style={{
        position: "fixed",
        left: box.left,
        top: box.top,
        maxHeight: box.maxHeight,
        overflowY: "auto",
        zIndex: 9999,
      }}
      className="w-56 rounded-xl border border-edge bg-surface p-3 shadow-card"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Edit object
        </p>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded p-0.5 text-muted hover:bg-surface-muted hover:text-content"
        >
          <X size={12} aria-hidden />
        </button>
      </div>

      {onSetLabel !== undefined && (
        <div className="mb-3">
          <label className="mb-1 block text-xs text-muted">Label</label>
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitLabel();
                onClose();
              }
            }}
            className="w-full rounded-lg border border-edge bg-surface-muted px-2.5 py-1.5 text-sm text-content outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
          />
        </div>
      )}

      {onSetColor !== undefined && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs text-muted">Color</p>
          <div className="flex flex-wrap gap-1.5">
            {/* Botón Auto: resetea al color automático del objeto */}
            <button
              type="button"
              aria-label="Automático"
              aria-pressed={currentColor === null}
              title="Automático"
              onClick={() => { onSetColor(null); setShowCustomInput(false); setCustomHex(""); }}
              className={`h-5 w-5 rounded-full border-2 text-[0.5rem] font-bold leading-none transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 ${
                currentColor === null ? "border-content bg-surface-muted text-content" : "border-dashed border-edge text-muted"
              }`}
            >
              A
            </button>

            {/* Swatches de colores prefijados */}
            {PALETTE.map(({ label: colorLabel, value }) => {
              const active = value === currentColor;
              return (
                <button
                  key={colorLabel}
                  type="button"
                  aria-label={colorLabel}
                  aria-pressed={active}
                  title={colorLabel}
                  onClick={() => { onSetColor(value); setShowCustomInput(false); setCustomHex(""); }}
                  className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 ${
                    active ? "border-content" : "border-transparent"
                  }`}
                  style={{ background: value }}
                />
              );
            })}

            {/* Botón para abrir/cerrar el campo hex personalizado */}
            <button
              type="button"
              title="Color personalizado"
              aria-label="Color personalizado"
              aria-pressed={showCustomInput}
              onClick={() => setShowCustomInput((v) => !v)}
              className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 ${
                isCustomColor ? "border-content" : "border-transparent"
              }`}
              style={
                isCustomColor
                  ? { background: currentColor! }
                  : {
                      background:
                        "conic-gradient(#ef4444 0deg 60deg, #3b82f6 60deg 120deg, #22c55e 120deg 180deg, #eab308 180deg 240deg, #8b5cf6 240deg 300deg, #ec4899 300deg 360deg)",
                    }
              }
            />
          </div>

          {/* Campo hex inline, se muestra al pulsar el icono arcoíris */}
          {showCustomInput && (
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className="h-5 w-5 shrink-0 rounded-full border border-edge"
                style={{ background: /^#[0-9a-fA-F]{6}$/.test(customHex) ? customHex : "transparent" }}
              />
              <input
                type="text"
                value={customHex}
                placeholder="#rrggbb"
                maxLength={7}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomHex(v);
                  applyCustomHex(v);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") applyCustomHex(customHex); }}
                className="min-w-0 flex-1 rounded-lg border border-edge bg-surface-muted px-2 py-1 font-mono text-xs text-content focus:border-brand-400 focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/30"
              />
            </div>
          )}
        </div>
      )}

      {onDelete !== undefined && (
        <div className="mt-4 border-t border-edge pt-3">
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-danger-fg/20 bg-danger-fg/5 px-3 py-2 text-sm font-semibold text-danger-fg transition-colors hover:bg-danger-fg/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <Trash2 size={14} aria-hidden />
            Delete object
          </button>
        </div>
      )}

      {onSetStyle !== undefined && hasStroke && (
        <>
          <div className="mb-3">
            <p className="mb-1.5 text-xs text-muted">Grosor</p>
            <div className="flex gap-1">
              {STROKE_WIDTHS.map(({ label: wLabel, value: wValue, svgWidth }) => {
                const active = currentStrokeWidth === wValue || (currentStrokeWidth === null && wValue === 2);
                return (
                  <button
                    key={wLabel}
                    type="button"
                    title={wLabel}
                    aria-label={wLabel}
                    aria-pressed={active}
                    onClick={() => onSetStyle({ strokeWidth: wValue })}
                    className={`flex h-7 flex-1 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
                      active ? "border-brand-500 bg-brand-50" : "border-edge hover:border-brand-400"
                    }`}
                  >
                    <svg width="22" height="14" aria-hidden>
                      <line
                        x1="2" y1="7" x2="20" y2="7"
                        stroke="currentColor"
                        strokeWidth={svgWidth}
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs text-muted">Tipo de línea</p>
            <div className="flex gap-1">
              {STROKE_DASHES.map(({ label: dLabel, value: dValue, dasharray, linecap }) => {
                const active = currentStrokeDash === dValue;
                return (
                  <button
                    key={dLabel}
                    type="button"
                    title={dLabel}
                    aria-label={dLabel}
                    aria-pressed={active}
                    onClick={() => onSetStyle({ strokeDash: dValue })}
                    className={`flex h-7 flex-1 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
                      active ? "border-brand-500 bg-brand-50" : "border-edge hover:border-brand-400"
                    }`}
                  >
                    <svg width="28" height="14" aria-hidden>
                      <line
                        x1="2" y1="7" x2="26" y2="7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap={linecap as "round" | "butt" | undefined}
                        strokeDasharray={dasharray}
                      />
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

function describeObject(object: GeometryObject): string {
  const descriptions: Record<GeometryObject["definition"]["type"], string> = {
    free: "Free point",
    through_points: "Line through points",
    between_points: "Segment between points",
    midpoint: "Midpoint",
    center_through_point: "Circle",
    parallel_through: "Parallel line",
    perpendicular_through: "Perpendicular line",
    intersection_ll: "Intersection (line∩line)",
    intersection_lc: "Intersection (line∩circle)",
    intersection_cc: "Intersection (circle∩circle)",
    perpendicular_bisector: "Perpendicular bisector",
    angle_bisector: "Angle bisector",
    circumscribed: "Circumscribed circle",
    reflection_over_line: "Reflection over line",
    reflection_over_point: "Reflection over point",
    homothety_scalar: "Homothety (scalar)",
    homothety_point: "Homothety (point ratio)",
    inversion_in_circle: "Inversion in circle",
    polygon_vertex: "Polygon vertex",
    translation: "Translation",
    rotation: "Rotation",
    arc_through_points: "Arc through points",
    polygon: "Polygon",
    regular_polygon: "Regular polygon",
    vector_polygon: "Vector polygon",
  };
  return descriptions[object.definition.type];
}
