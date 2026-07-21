import type {
  ReflectionDisplayMode,
  SymmetryClass,
  SymmetryElementAxis,
  SymmetryElementPlane,
  SymmetryElementImproper,
} from "../../geometry/polyhedra/types";
import { useLanguage } from "../../i18n/useLanguage";

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
  symmetryLabels?: Partial<Record<SymmetryClass, string>>;
  symmetryCounts: Partial<Record<SymmetryClass, number>>;
  symmetryClassOrder?: readonly SymmetryClass[];
  selectedRotationIndex: number;
  rotationCount: number;
  rotationAxisCount: number;
  rotationAxisOrdinal: number;
  selectedRotation?: SymmetryElementAxis;
  onPreviousRotation: () => void;
  onNextRotation: () => void;
  showOtherRotationAxes: boolean;
  onShowOtherRotationAxesChange: (value: boolean) => void;
  selectedHalfTurnIndex: number;
  halfTurnCount: number;
  halfTurnAxisCount: number;
  halfTurnAxisOrdinal: number;
  selectedHalfTurn?: SymmetryElementAxis;
  onPreviousHalfTurn: () => void;
  onNextHalfTurn: () => void;
  showOtherHalfTurnAxes: boolean;
  onShowOtherHalfTurnAxesChange: (value: boolean) => void;
  onResetView: () => void;
  onExit: () => void;
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

const classLabel = (cls: SymmetryClass, t: (es: string, en: string) => string) => ({ identity: t("Identidad", "Identity"), rotations3: t("Rotaciones ±120°", "Rotations ±120°"), halfTurns: t("Medias vueltas 180°", "Half turns 180°"), inversion: t("Simetría central", "Central inversion"), reflections: t("Reflexiones", "Reflections"), rotoreflections: t("Rotorreflexiones", "Rotoreflections") })[cls];

interface AxisFamilyControlsProps {
  singularName: string;
  t: (es: string, en: string) => string;
  selectedIndex: number;
  count: number;
  axisCount: number;
  axisOrdinal: number;
  selected?: SymmetryElementAxis;
  onPrevious: () => void;
  onNext: () => void;
  showOtherAxes: boolean;
  onShowOtherAxesChange: (value: boolean) => void;
}

function AxisFamilyControls({
  singularName,
  selectedIndex,
  count,
  axisCount,
  axisOrdinal,
  selected,
  onPrevious,
  onNext,
  showOtherAxes,
  onShowOtherAxesChange, t,
}: AxisFamilyControlsProps) {
  const degrees = selected ? Math.round(Math.abs(selected.angle) * 180 / Math.PI) : 0;
  const sense = selected && selected.angle < 0 ? "−" : "+";
  return (
    <div className="mb-2 ml-5 rounded-md border border-edge p-2">
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label={`${singularName} ${t("anterior", "previous")}`}
          onClick={onPrevious}
          disabled={count === 0}
          className="rounded border border-edge px-2 py-0.5 text-xs text-muted hover:text-content disabled:opacity-40"
        >
          ‹
        </button>
        <span aria-live="polite" className="text-[0.7rem] text-content">
          {singularName} {count === 0 ? 0 : selectedIndex + 1} {t("de", "of")} {count}
        </span>
        <button
          type="button"
          aria-label={`${singularName} ${t("siguiente", "next")}`}
          onClick={onNext}
          disabled={count === 0}
          className="rounded border border-edge px-2 py-0.5 text-xs text-muted hover:text-content disabled:opacity-40"
        >
          ›
        </button>
      </div>
      {selected && (
        singularName === t("Media vuelta", "Half turn") ? (
          <div className="mt-1 text-[0.65rem] text-muted">
            <p>
              {t("Eje", "Axis")}: {selected.axisLabel ?? (axisCount > 0 ? `${t("Eje", "Axis")} ${axisOrdinal} ${t("de", "of")} ${axisCount}` : "")}
            </p>
            <p>{t("Ángulo", "Angle")}: {degrees}°</p><p>{t("Orden", "Order")}: {selected.order ?? 2}</p>
          </div>
        ) : (
          <p className="mt-1 text-[0.65rem] text-muted">
            {t("Eje", "Axis")} {axisCount > 0 ? `${axisOrdinal} ${t("de", "of")} ${axisCount}` : ""}{degrees > 0 ? ` · ${t("Giro", "Turn")}: ${sense}${degrees}°` : ""}
          </p>
        )
      )}
      <label className="mt-1 flex cursor-pointer items-start gap-1.5">
        <input
          type="checkbox"
          checked={showOtherAxes}
          onChange={(event) => onShowOtherAxesChange(event.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 rounded accent-brand-600"
        />
        <span className="text-[0.65rem] leading-tight text-content">
          {t("Mostrar los demás ejes como referencia", "Show other axes as reference")}
        </span>
      </label>
    </div>
  );
}

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
  symmetryLabels,
  symmetryCounts,
  symmetryClassOrder = CLASS_ORDER,
  selectedRotationIndex,
  rotationCount,
  rotationAxisCount,
  rotationAxisOrdinal,
  selectedRotation,
  onPreviousRotation,
  onNextRotation,
  showOtherRotationAxes,
  onShowOtherRotationAxesChange,
  selectedHalfTurnIndex,
  halfTurnCount,
  halfTurnAxisCount,
  halfTurnAxisOrdinal,
  selectedHalfTurn,
  onPreviousHalfTurn,
  onNextHalfTurn,
  showOtherHalfTurnAxes,
  onShowOtherHalfTurnAxesChange,
  onResetView,
  onExit,
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
  const { language, t } = useLanguage();
  const labels = Object.fromEntries(
    symmetryClassOrder.map((symmetryClass) => [
      symmetryClass,
      `${language === "es" ? symmetryLabels?.[symmetryClass] ?? classLabel(symmetryClass, t) : classLabel(symmetryClass, t)} (${symmetryCounts[symmetryClass] ?? 0})`,
    ]),
  ) as Record<SymmetryClass, string>;
  return (
    <div
      role="dialog"
      aria-label={t("Estudio de simetrías", "Symmetry studio")}
      className="absolute left-4 top-4 z-10 max-h-[calc(100vh-2rem)] w-60 overflow-y-auto rounded-xl border border-edge bg-surface/95 p-3 shadow-pop backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-content">{polyhedronName}</p>
        <button
          type="button"
          onClick={onExit}
          className="rounded-md border border-edge px-2 py-0.5 text-xs font-semibold text-muted hover:text-content"
        >
          {t("Salir a 2D", "Exit to 2D")}
        </button>
      </div>

      <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
        {t("Simetrías", "Symmetries")}
      </p>
      {symmetryClassOrder.map((cls) => (
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
          {cls === "identity" && visibleClasses.has("identity") && (
            <p className="mb-2 ml-5 text-[0.65rem] leading-tight text-muted">
              {t("Deja todos los puntos del poliedro invariantes.", "Leaves all polyhedron points unchanged.")}
            </p>
          )}
          {cls === "rotations3" && visibleClasses.has("rotations3") && (
            <AxisFamilyControls
              singularName={t("Rotación", "Rotation")} t={t}
              selectedIndex={selectedRotationIndex}
              count={rotationCount}
              axisCount={rotationAxisCount}
              axisOrdinal={rotationAxisOrdinal}
              selected={selectedRotation}
              onPrevious={onPreviousRotation}
              onNext={onNextRotation}
              showOtherAxes={showOtherRotationAxes}
              onShowOtherAxesChange={onShowOtherRotationAxesChange}
            />
          )}
          {cls === "halfTurns" && visibleClasses.has("halfTurns") && (
            <AxisFamilyControls
              singularName={t("Media vuelta", "Half turn")} t={t}
              selectedIndex={selectedHalfTurnIndex}
              count={halfTurnCount}
              axisCount={halfTurnAxisCount}
              axisOrdinal={halfTurnAxisOrdinal}
              selected={selectedHalfTurn}
              onPrevious={onPreviousHalfTurn}
              onNext={onNextHalfTurn}
              showOtherAxes={showOtherHalfTurnAxes}
              onShowOtherAxesChange={onShowOtherHalfTurnAxesChange}
            />
          )}
          {cls === "inversion" && visibleClasses.has("inversion") && (
            <p className="mb-2 ml-5 text-[0.65rem] leading-tight text-muted">
              {t("Envía cada punto al opuesto respecto del centro.", "Maps every point to its opposite through the center.")}
            </p>
          )}
          {cls === "reflections" && visibleClasses.has("reflections") && (
            <div className="mb-2 ml-5 rounded-md border border-edge p-2">
              <label className="mb-2 block text-[0.65rem] font-semibold text-muted">
                {t("Modo", "Mode")}
                <select
                  aria-label={t("Modo de reflexiones", "Reflection mode")}
                  value={reflectionMode}
                  onChange={(event) =>
                    onReflectionModeChange(
                      event.target.value as ReflectionDisplayMode,
                    )
                  }
                  className="mt-1 w-full rounded border border-edge bg-surface px-1.5 py-1 text-xs text-content"
                >
                  <option value="individual">{t("Individual", "Individual")}</option>
                  <option value="cumulative">{t("Acumulativo", "Cumulative")}</option><option value="all">{t("Todos", "All")}</option>
                </select>
              </label>

              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  aria-label={t("Plano anterior", "Previous plane")}
                  onClick={onPreviousReflection}
                  disabled={reflectionCount === 0}
                  className="rounded border border-edge px-2 py-0.5 text-xs text-muted hover:text-content disabled:opacity-40"
                >
                  ‹
                </button>
                <span aria-live="polite" className="text-[0.7rem] text-content">
                  {t("Plano", "Plane")} {reflectionCount === 0 ? 0 : selectedReflectionIndex + 1} {t("de", "of")} {reflectionCount}
                </span>
                <button
                  type="button"
                  aria-label={t("Plano siguiente", "Next plane")}
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
                    {t("Mostrar los demás como referencia", "Show others as reference")}
                  </span>
                </label>
              )}

              {selectedReflection && (
                <ul
                  aria-live="polite"
                  className="mt-2 space-y-0.5 text-[0.65rem] leading-tight text-muted"
                >
                  {selectedReflection.containedEdges?.map((edge) => (
                    <li key={edge}>{t("Contiene la arista", "Contains edge")} {edge}.</li>
                  ))}
                  {selectedReflection.fixedVertices?.length ? (
                    <li>
                      {t("Deja fijos", "Fixes")} {selectedReflection.fixedVertices.join(t(" y ", " and "))}.
                    </li>
                  ) : null}
                  {selectedReflection.swappedVertices?.map(([a, b]) => (
                    <li key={`${a}-${b}`}>
                      {t("Intercambia", "Swaps")} {a} ↔ {b}.
                    </li>
                  ))}
                  {selectedReflection.permutationLabel && (
                    <li>{t("Permutación", "Permutation")}: {selectedReflection.permutationLabel}.</li>
                  )}
                </ul>
              )}
            </div>
          )}
          {cls === "rotoreflections" && visibleClasses.has("rotoreflections") && (
            <div className="mb-2 ml-5 rounded-md border border-edge p-2">
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  aria-label={t("Rotorreflexión anterior", "Previous rotoreflection")}
                  onClick={onPreviousRotoreflection}
                  disabled={!rotoreflectionCount}
                  className="rounded border border-edge px-2 py-0.5 text-xs disabled:opacity-40"
                >
                  ‹
                </button>
                <span aria-live="polite" className="text-[0.65rem] text-content">
                  {t("Rotorreflexión", "Rotoreflection")} {rotoreflectionCount ? selectedRotoreflectionIndex + 1 : 0} {t("de", "of")} {rotoreflectionCount}
                </span>
                <button
                  type="button"
                  aria-label={t("Rotorreflexión siguiente", "Next rotoreflection")}
                  onClick={onNextRotoreflection}
                  disabled={!rotoreflectionCount}
                  className="rounded border border-edge px-2 py-0.5 text-xs disabled:opacity-40"
                >
                  ›
                </button>
              </div>
              {selectedRotoreflection && (
                <p className="mt-1 text-[0.65rem] text-muted">
                  {selectedRotoreflection.axisLabel ?? t("Eje", "Axis")}{rotoreflectionAxisCount ? ` ${t("de", "of")} ${rotoreflectionAxisCount}` : ""}{` · ${t("Sentido", "Direction")}: ${selectedRotoreflection.angle < 0 ? "−" : "+"}${Math.round(Math.abs(selectedRotoreflection.angle) * 180 / Math.PI)}°`}
                </p>
              )}
              <label className="mt-1 flex items-start gap-1.5 text-[0.65rem] text-content">
                <input
                  type="checkbox"
                  checked={showOtherRotoreflectionAxes}
                  onChange={(event) => onShowOtherRotoreflectionAxesChange?.(event.target.checked)}
                />
                {t("Mostrar los demás ejes como referencia", "Show other axes as reference")}
              </label>
              <label className="mt-1 flex items-start gap-1.5 text-[0.65rem] text-content">
                <input
                  type="checkbox"
                  checked={showRotoreflectionPlane}
                  onChange={(event) => onShowRotoreflectionPlaneChange?.(event.target.checked)}
                />
                {t("Mostrar plano perpendicular", "Show perpendicular plane")}
              </label>
            </div>
          )}
        </div>
      ))}

      <p className="mb-1 mt-3 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
        {t("Apariencia", "Appearance")}
      </p>
      <label className="mb-2 flex items-center gap-2">
        <span className="w-16 text-xs text-content">{t("Opacidad", "Opacity")}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={opacity}
          aria-label={t("Opacidad", "Opacity")}
          onChange={(e) => onOpacityChange(Number(e.target.value))}
          className="flex-1 accent-brand-600"
        />
      </label>
      <label className="mb-3 flex items-center gap-2">
        <span className="w-16 text-xs text-content">{t("Color", "Color")}</span>
        <input
          type="color"
          value={color}
          aria-label={t("Color", "Color")}
          onChange={(e) => onColorChange(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-edge bg-transparent"
        />
      </label>

      <button
        type="button"
        onClick={onResetView}
        className="w-full rounded-md border border-edge px-2 py-1 text-xs font-semibold text-muted hover:text-content"
      >
        {t("Restablecer vista", "Reset view")}
      </button>
    </div>
  );
}
