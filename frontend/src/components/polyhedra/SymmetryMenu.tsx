import type {
  ReflectionDisplayMode,
  SymmetryClass,
  SymmetryElementPlane,
  SymmetryElementImproper,
} from "../../geometry/polyhedra/types";

interface SymmetryMenuProps {
  polyhedronName: string;
  visibleClasses: ReadonlySet<SymmetryClass>;
  onToggleClass: (cls: SymmetryClass) => void;
  opacity: number;
  onOpacityChange: (value: number) => void;
  color: string;
  onColorChange: (value: string) => void;
  reflectionMode: ReflectionDisplayMode;
  onReflectionModeChange: (mode: ReflectionDisplayMode) => void;
  selectedReflectionIndex: number;
  reflectionCount: number;
  selectedReflection?: SymmetryElementPlane;
  onPreviousReflection: () => void;
  onNextReflection: () => void;
  showOtherReflections: boolean;
  onShowOtherReflectionsChange: (value: boolean) => void;
  onResetView: () => void;
  onExit: () => void;
  rotoreflectionLabel?: string;
  selectedRotoreflectionIndex?: number;
  rotoreflectionCount?: number;
  rotoreflectionAxisCount?: number;
  selectedRotoreflection?: SymmetryElementImproper;
  onPreviousRotoreflection?: () => void;
  onNextRotoreflection?: () => void;
  showOtherRotoreflectionAxes?: boolean;
  onShowOtherRotoreflectionAxesChange?: (value: boolean) => void;
  showRotoreflectionPlane?: boolean;
  onShowRotoreflectionPlaneChange?: (value: boolean) => void;
}

const CLASS_LABELS: Record<SymmetryClass, string> = {
  rotations3: "Rotaciones ±120°",
  halfTurns: "Medias vueltas (180°)",
  reflections: "Reflexiones",
  rotoreflections: "Rotorreflexiones",
};

const CLASS_ORDER: SymmetryClass[] = [
  "rotations3",
  "halfTurns",
  "reflections",
  "rotoreflections",
];

export function SymmetryMenu({
  polyhedronName,
  visibleClasses,
  onToggleClass,
  opacity,
  onOpacityChange,
  color,
  onColorChange,
  reflectionMode,
  onReflectionModeChange,
  selectedReflectionIndex,
  reflectionCount,
  selectedReflection,
  onPreviousReflection,
  onNextReflection,
  showOtherReflections,
  onShowOtherReflectionsChange,
  onResetView,
  onExit,
  rotoreflectionLabel,
  selectedRotoreflectionIndex = 0,
  rotoreflectionCount = 0,
  rotoreflectionAxisCount = 0,
  selectedRotoreflection,
  onPreviousRotoreflection,
  onNextRotoreflection,
  showOtherRotoreflectionAxes = false,
  onShowOtherRotoreflectionAxesChange,
  showRotoreflectionPlane = true,
  onShowRotoreflectionPlaneChange,
}: SymmetryMenuProps) {
  const labels = { ...CLASS_LABELS, rotoreflections: rotoreflectionLabel ?? CLASS_LABELS.rotoreflections };
  return (
    <div
      role="dialog"
      aria-label="Estudio de simetrías"
      className="absolute left-4 top-4 z-10 max-h-[calc(100vh-2rem)] w-60 overflow-y-auto rounded-xl border border-edge bg-surface/95 p-3 shadow-pop backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-content">{polyhedronName}</p>
        <button
          type="button"
          onClick={onExit}
          className="rounded-md border border-edge px-2 py-0.5 text-xs font-semibold text-muted hover:text-content"
        >
          Salir a 2D
        </button>
      </div>

      <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
        Simetrías
      </p>
      {CLASS_ORDER.map((cls) => (
        <div key={cls}>
          <label className="mb-1.5 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              aria-label={labels[cls]}
              checked={visibleClasses.has(cls)}
              onChange={() => onToggleClass(cls)}
              className="h-3.5 w-3.5 rounded accent-brand-600"
            />
            <span className="text-xs text-content">{labels[cls]}</span>
          </label>
          {cls === "reflections" && visibleClasses.has("reflections") && (
            <div className="mb-2 ml-5 rounded-md border border-edge p-2">
              <label className="mb-2 block text-[0.65rem] font-semibold text-muted">
                Modo
                <select
                  aria-label="Modo de reflexiones"
                  value={reflectionMode}
                  onChange={(event) =>
                    onReflectionModeChange(
                      event.target.value as ReflectionDisplayMode,
                    )
                  }
                  className="mt-1 w-full rounded border border-edge bg-surface px-1.5 py-1 text-xs text-content"
                >
                  <option value="individual">Individual</option>
                  <option value="cumulative">Acumulativo</option>
                  <option value="all">Todos</option>
                </select>
              </label>

              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  aria-label="Plano anterior"
                  onClick={onPreviousReflection}
                  disabled={reflectionCount === 0}
                  className="rounded border border-edge px-2 py-0.5 text-xs text-muted hover:text-content disabled:opacity-40"
                >
                  ‹
                </button>
                <span aria-live="polite" className="text-[0.7rem] text-content">
                  Plano {reflectionCount === 0 ? 0 : selectedReflectionIndex + 1}{" "}
                  de {reflectionCount}
                </span>
                <button
                  type="button"
                  aria-label="Plano siguiente"
                  onClick={onNextReflection}
                  disabled={reflectionCount === 0}
                  className="rounded border border-edge px-2 py-0.5 text-xs text-muted hover:text-content disabled:opacity-40"
                >
                  ›
                </button>
              </div>

              {reflectionMode === "individual" && (
                <label className="mt-2 flex cursor-pointer items-start gap-1.5">
                  <input
                    type="checkbox"
                    checked={showOtherReflections}
                    onChange={(event) =>
                      onShowOtherReflectionsChange(event.target.checked)
                    }
                    className="mt-0.5 h-3.5 w-3.5 rounded accent-brand-600"
                  />
                  <span className="text-[0.65rem] leading-tight text-content">
                    Mostrar los demás como referencia
                  </span>
                </label>
              )}

              {selectedReflection && (
                <ul
                  aria-live="polite"
                  className="mt-2 space-y-0.5 text-[0.65rem] leading-tight text-muted"
                >
                  {selectedReflection.containedEdges?.map((edge) => (
                    <li key={edge}>Contiene la arista {edge}.</li>
                  ))}
                  {selectedReflection.fixedVertices?.length ? (
                    <li>
                      Deja fijos {selectedReflection.fixedVertices.join(" y ")}.
                    </li>
                  ) : null}
                  {selectedReflection.swappedVertices?.map(([a, b]) => (
                    <li key={`${a}-${b}`}>
                      Intercambia {a} ↔ {b}.
                    </li>
                  ))}
                  {selectedReflection.permutationLabel && (
                    <li>Permutación: {selectedReflection.permutationLabel}.</li>
                  )}
                </ul>
              )}
            </div>
          )}
          {cls === "rotoreflections" && visibleClasses.has("rotoreflections") && (
            <div className="mb-2 ml-5 rounded-md border border-edge p-2">
              <div className="flex items-center justify-between gap-1">
                <button type="button" aria-label="Rotorreflexión anterior" onClick={onPreviousRotoreflection} disabled={!rotoreflectionCount} className="rounded border border-edge px-2 py-0.5 text-xs disabled:opacity-40">‹</button>
                <span aria-live="polite" className="text-[0.65rem] text-content">Rotorreflexión {rotoreflectionCount ? selectedRotoreflectionIndex + 1 : 0} de {rotoreflectionCount}</span>
                <button type="button" aria-label="Rotorreflexión siguiente" onClick={onNextRotoreflection} disabled={!rotoreflectionCount} className="rounded border border-edge px-2 py-0.5 text-xs disabled:opacity-40">›</button>
              </div>
              {selectedRotoreflection && <p className="mt-1 text-[0.65rem] text-muted">{selectedRotoreflection.axisLabel ?? "Eje"}{rotoreflectionAxisCount ? ` de ${rotoreflectionAxisCount}` : ""} · Sentido: {(() => { const degrees = selectedRotoreflection.angle ? Math.round(Math.abs(selectedRotoreflection.angle) * 180 / Math.PI) : 0; const negative = selectedRotoreflection.angle ? selectedRotoreflection.angle < 0 : selectedRotoreflection.rotationSense === "negative"; return `${negative ? "−" : "+"}${degrees}°`; })()}</p>}
              <label className="mt-1 flex items-start gap-1.5 text-[0.65rem] text-content"><input type="checkbox" checked={showOtherRotoreflectionAxes} onChange={(e) => onShowOtherRotoreflectionAxesChange?.(e.target.checked)} />Mostrar los demás ejes como referencia</label>
              <label className="mt-1 flex items-start gap-1.5 text-[0.65rem] text-content"><input type="checkbox" checked={showRotoreflectionPlane} onChange={(e) => onShowRotoreflectionPlaneChange?.(e.target.checked)} />Mostrar plano perpendicular</label>
            </div>
          )}
        </div>
      ))}

      <p className="mb-1 mt-3 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
        Apariencia
      </p>
      <label className="mb-2 flex items-center gap-2">
        <span className="w-16 text-xs text-content">Opacidad</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={opacity}
          aria-label="Opacidad"
          onChange={(e) => onOpacityChange(Number(e.target.value))}
          className="flex-1 accent-brand-600"
        />
      </label>
      <label className="mb-3 flex items-center gap-2">
        <span className="w-16 text-xs text-content">Color</span>
        <input
          type="color"
          value={color}
          aria-label="Color"
          onChange={(e) => onColorChange(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-edge bg-transparent"
        />
      </label>

      <button
        type="button"
        onClick={onResetView}
        className="w-full rounded-md border border-edge px-2 py-1 text-xs font-semibold text-muted hover:text-content"
      >
        Restablecer vista
      </button>
    </div>
  );
}
