import type {
  ReflectionDisplayMode,
  SymmetryClass,
  SymmetryElementAxis,
  SymmetryElementPlane,
  SymmetryElementImproper,
  SymmetryAxisDescription,
} from "../../geometry/polyhedra/types";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ChevronDown } from "lucide-react";
import { POLYHEDRON_TOOLS } from "../../geometry/polyhedra";
import { translatePolyhedronName } from "../../i18n/polyhedra";

interface SymmetryMenuProps {
  polyhedronId: string;
  polyhedronName: string;
  onSelectPolyhedron?: (id: string) => void;
  visibleClasses: ReadonlySet<SymmetryClass>;
  onToggleClass: (cls: SymmetryClass) => void;
  opacity: number;
  onOpacityChange: (value: number) => void;
  color: string;
  onColorChange: (value: string) => void;
  axisThickness: number;
  onAxisThicknessChange: (value: number) => void;
  axisColor: string;
  onAxisColorChange: (value: string) => void;
  planeThickness: number;
  onPlaneThicknessChange: (value: number) => void;
  planeColor: string;
  onPlaneColorChange: (value: string) => void;
  reflectionMode: ReflectionDisplayMode;
  onReflectionModeChange: (mode: ReflectionDisplayMode) => void;
  selectedReflectionIndex: number;
  reflectionCount: number;
  selectedReflection?: SymmetryElementPlane;
  onPreviousReflection: () => void;
  onNextReflection: () => void;
  showOtherReflections: boolean;
  onShowOtherReflectionsChange: (value: boolean) => void;
  symmetryCounts: Partial<Record<SymmetryClass, number>>;
  symmetryClassOrder?: readonly SymmetryClass[];
  selectedRotationIndex: number;
  rotationCount: number;
  rotationAxisCount: number;
  rotationAxisOrdinal: number;
  rotationSubtype?: import("../../geometry/polyhedra/types").RotationSubtype;
  onRotationSubtypeChange?: (subtype: import("../../geometry/polyhedra/types").RotationSubtype) => void;
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

function classLabel(cls: SymmetryClass, polyhedronId: string, t: TFunction): string {
  if (cls === "rotations3" && (polyhedronId === "cube" || polyhedronId === "octahedron")) {
    return t("symmetry.classes.rotations3And4");
  }
  if (cls === "rotoreflections" && polyhedronId === "tetrahedron") {
    return t("symmetry.classes.rotoreflectionsQuarter");
  }
  const keys = {
    identity: "symmetry.classes.identity",
    rotations3: "symmetry.classes.rotations3",
    halfTurns: "symmetry.classes.halfTurns",
    inversion: "symmetry.classes.inversion",
    reflections: "symmetry.classes.reflections",
    rotoreflections: "symmetry.classes.rotoreflections",
  } as const;
  return t(keys[cls]);
}

function translatedAxisLabel(
  selected: { axisDescription?: SymmetryAxisDescription },
  t: TFunction,
): string {
  const description = selected.axisDescription;
  if (!description) return t("symmetry.axis");
  switch (description.kind) {
    case "generic": return t("symmetry.axisDescriptions.generic", { number: description.ordinal });
    case "bodyDiagonal": return t("symmetry.axisDescriptions.bodyDiagonal", { number: description.ordinal });
    case "oppositeFaceCenters": return t("symmetry.axisDescriptions.oppositeFaceCenters", { number: description.ordinal });
    case "oppositeVertices": return t("symmetry.axisDescriptions.oppositeVertices", { number: description.ordinal });
    case "oppositeEdgeMidpoints": return t("symmetry.axisDescriptions.oppositeEdgeMidpoints", { number: description.ordinal });
    case "tetrahedronOppositeEdgeMidpoints": {
      const keys = {
        AB_CD: "symmetry.axisDescriptions.tetrahedronABCD",
        AC_BD: "symmetry.axisDescriptions.tetrahedronACBD",
        AD_BC: "symmetry.axisDescriptions.tetrahedronADBC",
      } as const;
      return t(keys[description.pair]);
    }
  }
}

interface AxisFamilyControlsProps {
  singularName: string;
  isHalfTurn?: boolean;
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
  onShowOtherAxesChange,
  isHalfTurn = false,
}: AxisFamilyControlsProps) {
  const { t } = useTranslation();
  const degrees = selected ? Math.round(Math.abs(selected.angle) * 180 / Math.PI) : 0;
  const sense = selected && selected.angle < 0 ? "−" : "+";
  return (
    <div className="mb-2 ml-5 rounded-md border border-edge p-2">
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label={t("symmetry.previous", { name: singularName })}
          onClick={onPrevious}
          disabled={count === 0}
          className="rounded border border-edge px-2 py-0.5 text-xs text-muted hover:text-content disabled:opacity-40"
        >
          ‹
        </button>
        <span aria-live="polite" className="text-[0.7rem] text-content">
          {t("symmetry.position", { name: singularName, current: count === 0 ? 0 : selectedIndex + 1, count })}
        </span>
        <button
          type="button"
          aria-label={t("symmetry.next", { name: singularName })}
          onClick={onNext}
          disabled={count === 0}
          className="rounded border border-edge px-2 py-0.5 text-xs text-muted hover:text-content disabled:opacity-40"
        >
          ›
        </button>
      </div>
      {selected && (
        isHalfTurn ? (
          <div className="mt-1 text-[0.65rem] text-muted">
            <p>
              {t("symmetry.axis")}: {translatedAxisLabel(selected, t)}
            </p>
            <p>{t("symmetry.angle")}: {degrees}°</p><p>{t("symmetry.order")}: {selected.order ?? 2}</p>
          </div>
        ) : (
          <p className="mt-1 text-[0.65rem] text-muted">
            {axisCount > 0
              ? t("symmetry.axisTurn", { current: axisOrdinal, count: axisCount, sense, degrees })
              : t("symmetry.axis")}
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
          {t("symmetry.showOtherAxes")}
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
  polyhedronId,
  polyhedronName,
  onSelectPolyhedron,
  visibleClasses,
  onToggleClass,
  opacity,
  onOpacityChange,
  color,
  onColorChange,
  axisThickness,
  onAxisThicknessChange,
  axisColor,
  onAxisColorChange,
  planeThickness,
  onPlaneThicknessChange,
  planeColor,
  onPlaneColorChange,
  reflectionMode,
  onReflectionModeChange,
  selectedReflectionIndex,
  reflectionCount,
  selectedReflection,
  onPreviousReflection,
  onNextReflection,
  showOtherReflections,
  onShowOtherReflectionsChange,
  symmetryCounts,
  symmetryClassOrder = CLASS_ORDER,
  selectedRotationIndex,
  rotationCount,
  rotationAxisCount,
  rotationAxisOrdinal,
  rotationSubtype = "c3",
  onRotationSubtypeChange,
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
  const { t } = useTranslation();
  const labels = Object.fromEntries(
    symmetryClassOrder.map((symmetryClass) => [
      symmetryClass,
      t("symmetry.classWithCount", { label: classLabel(symmetryClass, polyhedronId, t), count: symmetryCounts[symmetryClass] ?? 0 }),
    ]),
  ) as Record<SymmetryClass, string>;
  return (
    <div
      role="dialog"
      aria-label={t("symmetry.studio")}
      className="absolute left-4 top-4 z-10 max-h-[calc(100vh-2rem)] w-60 overflow-y-auto rounded-xl border border-edge bg-surface/95 p-3 shadow-pop backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="relative flex items-center">
          <select
            aria-label={t("polyhedra.selectPolyhedron")}
            value={polyhedronId}
            onChange={(e) => onSelectPolyhedron?.(e.target.value)}
            className="cursor-pointer appearance-none rounded border border-transparent bg-transparent py-0.5 pl-1 pr-6 text-sm font-semibold text-content hover:border-edge hover:bg-surface-hover focus:border-brand-500 focus:outline-none"
          >
            {POLYHEDRON_TOOLS.map((tool) => (
              <option key={tool} value={tool} className="bg-surface text-content text-xs">
                {translatePolyhedronName(t, tool)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        </div>
        <button
          type="button"
          onClick={onExit}
          className="rounded-md border border-edge px-2 py-0.5 text-xs font-semibold text-muted hover:text-content"
        >
          {t("symmetry.exit")}
        </button>
      </div>

      <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
        {t("symmetry.title")}
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
              {t("symmetry.identityDescription")}
            </p>
          )}
          {cls === "rotations3" && visibleClasses.has("rotations3") && (
            <div>
              {(polyhedronId === "cube" || polyhedronId === "octahedron") && onRotationSubtypeChange && (
                <div
                  role="radiogroup"
                  aria-label={t("symmetry.title")}
                  className="mb-2 ml-5 flex flex-col gap-1 rounded-md border border-edge bg-surface/50 p-2 text-xs"
                >
                  <label className="flex cursor-pointer items-center gap-2 text-[0.7rem] font-medium text-content">
                    <input
                      type="radio"
                      name="rotationSubtype"
                      value="c3"
                      checked={rotationSubtype === "c3"}
                      onChange={() => onRotationSubtypeChange("c3")}
                      className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
                    />
                    <span>
                      {polyhedronId === "cube"
                        ? t("symmetry.rotationSubtypes.c3Vertex")
                        : t("symmetry.rotationSubtypes.c3Face")}
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-[0.7rem] font-medium text-content">
                    <input
                      type="radio"
                      name="rotationSubtype"
                      value="c4"
                      checked={rotationSubtype === "c4"}
                      onChange={() => onRotationSubtypeChange("c4")}
                      className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
                    />
                    <span>
                      {polyhedronId === "cube"
                        ? t("symmetry.rotationSubtypes.c4Face")
                        : t("symmetry.rotationSubtypes.c4Vertex")}
                    </span>
                  </label>
                </div>
              )}
              {polyhedronId === "tetrahedron" && (
                <p className="mb-1 ml-5 text-[0.65rem] font-medium text-muted">
                  {t("symmetry.rotationSubtypes.c3Tetrahedron")}
                </p>
              )}
              <AxisFamilyControls
                singularName={t("symmetry.rotation")}
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
            </div>
          )}

          {cls === "halfTurns" && visibleClasses.has("halfTurns") && (
            <AxisFamilyControls
              singularName={t("symmetry.halfTurn")}
              isHalfTurn
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
              {t("symmetry.inversionDescription")}
            </p>
          )}
          {cls === "reflections" && visibleClasses.has("reflections") && (
            <div className="mb-2 ml-5 rounded-md border border-edge p-2">
              <label className="mb-2 block text-[0.65rem] font-semibold text-muted">
                {t("symmetry.mode")}
                <select
                  aria-label={t("symmetry.reflectionMode")}
                  value={reflectionMode}
                  onChange={(event) =>
                    onReflectionModeChange(
                      event.target.value as ReflectionDisplayMode,
                    )
                  }
                  className="mt-1 w-full rounded border border-edge bg-surface px-1.5 py-1 text-xs text-content"
                >
                  <option value="individual">{t("symmetry.modes.individual")}</option>
                  <option value="cumulative">{t("symmetry.modes.cumulative")}</option><option value="all">{t("symmetry.modes.all")}</option>
                </select>
              </label>

              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  aria-label={t("symmetry.previousPlane")}
                  onClick={onPreviousReflection}
                  disabled={reflectionCount === 0}
                  className="rounded border border-edge px-2 py-0.5 text-xs text-muted hover:text-content disabled:opacity-40"
                >
                  ‹
                </button>
                <span aria-live="polite" className="text-[0.7rem] text-content">
                  {t("symmetry.planePosition", { current: reflectionCount === 0 ? 0 : selectedReflectionIndex + 1, count: reflectionCount })}
                </span>
                <button
                  type="button"
                  aria-label={t("symmetry.nextPlane")}
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
                    {t("symmetry.showOtherReflections")}
                  </span>
                </label>
              )}

              {selectedReflection && (
                <ul
                  aria-live="polite"
                  className="mt-2 space-y-0.5 text-[0.65rem] leading-tight text-muted"
                >
                  {selectedReflection.containedEdges?.map((edge) => (
                    <li key={edge}>{t("symmetry.containsEdge", { edge })}</li>
                  ))}
                  {selectedReflection.fixedVertices?.length ? (
                    <li>
                      {t("symmetry.fixes", { vertices: selectedReflection.fixedVertices.join(t("symmetry.conjunction")) })}
                    </li>
                  ) : null}
                  {selectedReflection.swappedVertices?.map(([a, b]) => (
                    <li key={`${a}-${b}`}>
                      {t("symmetry.swaps", { a, b })}
                    </li>
                  ))}
                  {selectedReflection.permutationLabel && (
                    <li>{t("symmetry.permutation", { permutation: selectedReflection.permutationLabel })}</li>
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
                  aria-label={t("symmetry.previousRotoreflection")}
                  onClick={onPreviousRotoreflection}
                  disabled={!rotoreflectionCount}
                  className="rounded border border-edge px-2 py-0.5 text-xs disabled:opacity-40"
                >
                  ‹
                </button>
                <span aria-live="polite" className="text-[0.65rem] text-content">
                  {t("symmetry.rotoreflectionPosition", { current: rotoreflectionCount ? selectedRotoreflectionIndex + 1 : 0, count: rotoreflectionCount })}
                </span>
                <button
                  type="button"
                  aria-label={t("symmetry.nextRotoreflection")}
                  onClick={onNextRotoreflection}
                  disabled={!rotoreflectionCount}
                  className="rounded border border-edge px-2 py-0.5 text-xs disabled:opacity-40"
                >
                  ›
                </button>
              </div>
              {selectedRotoreflection && (
                <p className="mt-1 text-[0.65rem] text-muted">
                  {t("symmetry.rotoreflectionDetails", { axis: translatedAxisLabel(selectedRotoreflection, t), axisCountText: rotoreflectionAxisCount ? t("symmetry.axisCountText", { count: rotoreflectionAxisCount }) : "", sense: selectedRotoreflection.angle < 0 ? "−" : "+", degrees: Math.round(Math.abs(selectedRotoreflection.angle) * 180 / Math.PI) })}
                </p>
              )}
              <label className="mt-1 flex items-start gap-1.5 text-[0.65rem] text-content">
                <input
                  type="checkbox"
                  checked={showOtherRotoreflectionAxes}
                  onChange={(event) => onShowOtherRotoreflectionAxesChange?.(event.target.checked)}
                />
                {t("symmetry.showOtherAxes")}
              </label>
              <label className="mt-1 flex items-start gap-1.5 text-[0.65rem] text-content">
                <input
                  type="checkbox"
                  checked={showRotoreflectionPlane}
                  onChange={(event) => onShowRotoreflectionPlaneChange?.(event.target.checked)}
                />
                {t("symmetry.showPlane")}
              </label>
            </div>
          )}
        </div>
      ))}

      <p className="mb-1 mt-3 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
        {t("symmetry.appearance")}
      </p>
      <label className="mb-2 flex items-center gap-2">
        <span className="w-16 text-xs text-content">{t("symmetry.opacity")}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={opacity}
          aria-label={t("symmetry.opacity")}
          onChange={(e) => onOpacityChange(Number(e.target.value))}
          className="flex-1 accent-brand-600"
        />
      </label>
      <label className="mb-2 flex items-center gap-2">
        <span className="w-16 text-xs text-content">{t("symmetry.color")}</span>
        <input
          type="color"
          value={color}
          aria-label={t("symmetry.color")}
          onChange={(e) => onColorChange(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-edge bg-transparent"
        />
      </label>
      <label className="mb-2 flex items-center gap-2">
        <span className="w-16 text-xs text-content">{t("symmetry.axisThickness")}</span>
        <input
          type="range"
          min="0"
          max="4"
          step="0.5"
          value={axisThickness}
          aria-label={t("symmetry.axisThickness")}
          onChange={(e) => onAxisThicknessChange(Number(e.target.value))}
          className="flex-1 accent-brand-600"
        />
      </label>
      <label className="mb-2 flex items-center gap-2">
        <span className="w-16 text-xs text-content">{t("symmetry.axisColor")}</span>
        <input
          type="color"
          value={axisColor}
          aria-label={t("symmetry.axisColor")}
          onChange={(e) => onAxisColorChange(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-edge bg-transparent"
        />
      </label>
      <label className="mb-2 flex items-center gap-2">
        <span className="w-16 text-xs text-content">{t("symmetry.planeThickness")}</span>
        <input
          type="range"
          min="-1"
          max="3"
          step="0.5"
          value={planeThickness}
          aria-label={t("symmetry.planeThickness")}
          onChange={(e) => onPlaneThicknessChange(Number(e.target.value))}
          className="flex-1 accent-brand-600"
        />
      </label>
      <label className="mb-3 flex items-center gap-2">
        <span className="w-16 text-xs text-content">{t("symmetry.planeColor")}</span>
        <input
          type="color"
          value={planeColor}
          aria-label={t("symmetry.planeColor")}
          onChange={(e) => onPlaneColorChange(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-edge bg-transparent"
        />
      </label>

      <button
        type="button"
        onClick={onResetView}
        className="w-full rounded-md border border-edge px-2 py-1 text-xs font-semibold text-muted hover:text-content"
      >
        {t("common.resetView")}
      </button>
    </div>
  );
}
