import type { SymmetryClass } from "../../geometry/polyhedra/types";

interface SymmetryMenuProps {
  polyhedronName: string;
  visibleClasses: ReadonlySet<SymmetryClass>;
  onToggleClass: (cls: SymmetryClass) => void;
  opacity: number;
  onOpacityChange: (value: number) => void;
  color: string;
  onColorChange: (value: string) => void;
  onResetView: () => void;
  onExit: () => void;
}

const CLASS_LABELS: Record<SymmetryClass, string> = {
  rotations3: "Rotaciones ±120°",
  halfTurns: "Medias vueltas (180°)",
  reflections: "Reflexiones",
  rotoreflections: "Rotoreflexiones (S4)",
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
  onResetView,
  onExit,
}: SymmetryMenuProps) {
  return (
    <div
      role="dialog"
      aria-label="Estudio de simetrías"
      className="absolute left-4 top-4 z-10 w-60 rounded-xl border border-edge bg-surface/95 p-3 shadow-pop backdrop-blur"
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
        <label key={cls} className="mb-1.5 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            aria-label={CLASS_LABELS[cls]}
            checked={visibleClasses.has(cls)}
            onChange={() => onToggleClass(cls)}
            className="h-3.5 w-3.5 rounded accent-brand-600"
          />
          <span className="text-xs text-content">{CLASS_LABELS[cls]}</span>
        </label>
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
