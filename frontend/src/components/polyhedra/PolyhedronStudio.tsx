import { useCallback, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PolyhedronMesh } from "./PolyhedronMesh";
import { SymmetryOverlay } from "./SymmetryOverlay";
import { SymmetryMenu } from "./SymmetryMenu";
import { axisCount, axisOrdinal, filterRotationsBySubtype, wrapReflectionIndex } from "../../geometry/polyhedra/types";
import type {
  PolyhedronDefinition,
  ReflectionDisplayMode,
  RotationSubtype,
  SymmetryClass,
} from "../../geometry/polyhedra/types";
import { useTranslation } from "react-i18next";
import { translatePolyhedronName } from "../../i18n/polyhedra";
import { ChevronDown } from "lucide-react";
import { POLYHEDRON_TOOLS, polyhedronForTool } from "../../geometry/polyhedra";
import type { ConstructionTool } from "../../geometry/constructionTools";

interface PolyhedronStudioProps {
  definition: PolyhedronDefinition;
  onChangePolyhedron?: (definition: PolyhedronDefinition) => void;
  onExit: () => void;
}

export default function PolyhedronStudio({
  definition,
  onChangePolyhedron,
  onExit,
}: PolyhedronStudioProps) {
  const { t } = useTranslation();
  const polyhedronName = translatePolyhedronName(t, definition.id);
  const [visibleClasses, setVisibleClasses] = useState<Set<SymmetryClass>>(new Set());
  const [opacity, setOpacity] = useState(0.6);
  const [color, setColor] = useState(definition.defaultColor);
  const [reflectionMode, setReflectionMode] =
    useState<ReflectionDisplayMode>("individual");
  const [selectedReflectionIndex, setSelectedReflectionIndex] = useState(0);
  const [rotationSubtype, setRotationSubtype] = useState<RotationSubtype>("c3");
  const [selectedRotationIndex, setSelectedRotationIndex] = useState(0);
  const [selectedHalfTurnIndex, setSelectedHalfTurnIndex] = useState(0);
  const [selectedRotoreflectionIndex, setSelectedRotoreflectionIndex] = useState(0);
  const [showOtherReflections, setShowOtherReflections] = useState(false);
  const [showOtherRotationAxes, setShowOtherRotationAxes] = useState(false);
  const [showOtherHalfTurnAxes, setShowOtherHalfTurnAxes] = useState(false);
  const [showOtherRotoreflectionAxes, setShowOtherRotoreflectionAxes] = useState(false);
  const [showRotoreflectionPlane, setShowRotoreflectionPlane] = useState(true);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { symmetry } = definition;
  const reflections = symmetry.reflections;
  const filteredRotations = filterRotationsBySubtype(symmetry.rotations3, rotationSubtype);

  const toggleClass = useCallback((cls: SymmetryClass) => {
    if (!visibleClasses.has(cls)) {
      if (cls === "rotations3") {
        setRotationSubtype("c3");
        setSelectedRotationIndex(0);
      }
      if (cls === "halfTurns") setSelectedHalfTurnIndex(0);
      if (cls === "reflections") setSelectedReflectionIndex(0);
      if (cls === "rotoreflections") setSelectedRotoreflectionIndex(0);
    }
    setVisibleClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });
  }, [visibleClasses]);


  const handleSelectPolyhedron = useCallback(
    (id: string) => {
      const newDef = polyhedronForTool(id as ConstructionTool);
      if (newDef && onChangePolyhedron) {
        onChangePolyhedron(newDef);
      }
    },
    [onChangePolyhedron],
  );

  const resetView = useCallback(() => {
    controlsRef.current?.reset();
  }, []);

  if (definition.underConstruction) {
    return (
      <div className="absolute inset-0 z-[10000] bg-surface">
        <Canvas camera={{ position: [3, 2, 3], fov: 50 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[4, 5, 3]} intensity={0.8} />
          <PolyhedronMesh definition={definition} color={definition.defaultColor} opacity={0.6} />
          <OrbitControls ref={controlsRef} enablePan={false} />
        </Canvas>
        <div className="absolute left-4 top-4 z-10 flex items-center gap-3 rounded-card border border-edge bg-surface/95 px-3 py-2 shadow-pop backdrop-blur">
          <div className="relative flex items-center">
            <select
              aria-label={t("polyhedra.selectPolyhedron")}
              value={definition.id}
              onChange={(e) => handleSelectPolyhedron(e.target.value)}
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
          <span className="text-xs font-semibold text-muted">({t("polyhedra.underConstruction")})</span>
          <button type="button" onClick={onExit} className="rounded-md border border-edge px-2 py-0.5 text-xs font-semibold text-muted hover:text-content">
            {t("polyhedra.exit")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-[10000] bg-surface">
      <Canvas camera={{ position: [3, 2, 3], fov: 50 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 5, 3]} intensity={0.8} />
        <PolyhedronMesh definition={definition} color={color} opacity={opacity} />
        <SymmetryOverlay
          definition={definition}
          visibleClasses={visibleClasses}
          reflectionMode={reflectionMode}
          selectedReflectionIndex={selectedReflectionIndex}
          selectedRotationIndex={selectedRotationIndex}
          showOtherRotationAxes={showOtherRotationAxes}
          rotationsList={filteredRotations}
          selectedHalfTurnIndex={selectedHalfTurnIndex}
          showOtherHalfTurnAxes={showOtherHalfTurnAxes}
          selectedRotoreflectionIndex={selectedRotoreflectionIndex}
          showOtherReflections={showOtherReflections}
          color={color}
          opacity={opacity}
          showOtherRotoreflectionAxes={showOtherRotoreflectionAxes}
          showRotoreflectionPlane={showRotoreflectionPlane}
        />
        <OrbitControls ref={controlsRef} enablePan={false} />
      </Canvas>

      <SymmetryMenu
        polyhedronId={definition.id}
        polyhedronName={polyhedronName}
        onSelectPolyhedron={handleSelectPolyhedron}
        visibleClasses={visibleClasses}
        onToggleClass={toggleClass}
        opacity={opacity}
        onOpacityChange={setOpacity}
        color={color}
        onColorChange={setColor}
        reflectionMode={reflectionMode}
        onReflectionModeChange={setReflectionMode}
        selectedReflectionIndex={selectedReflectionIndex}
        reflectionCount={reflections.length}
        selectedReflection={reflections[selectedReflectionIndex]}
        onPreviousReflection={() =>
          setSelectedReflectionIndex((index) =>
            wrapReflectionIndex(index, -1, reflections.length),
          )
        }
        onNextReflection={() =>
          setSelectedReflectionIndex((index) =>
            wrapReflectionIndex(index, 1, reflections.length),
          )
        }
        showOtherReflections={showOtherReflections}
        onShowOtherReflectionsChange={setShowOtherReflections}
        symmetryCounts={{
          identity: symmetry.identity.length,
          rotations3: symmetry.rotations3.length,
          halfTurns: symmetry.halfTurns.length,
          inversion: symmetry.inversion.length,
          reflections: symmetry.reflections.length,
          rotoreflections: symmetry.rotoreflections.length,
        }}
        symmetryClassOrder={definition.symmetryClassOrder}
        selectedRotationIndex={selectedRotationIndex}
        rotationCount={filteredRotations.length}
        rotationAxisCount={axisCount(filteredRotations)}
        rotationAxisOrdinal={axisOrdinal(filteredRotations, selectedRotationIndex)}
        rotationSubtype={rotationSubtype}
        onRotationSubtypeChange={(subtype) => {
          setRotationSubtype(subtype);
          setSelectedRotationIndex(0);
        }}
        selectedRotation={filteredRotations[selectedRotationIndex]}
        onPreviousRotation={() =>
          setSelectedRotationIndex((index) =>
            wrapReflectionIndex(index, -1, filteredRotations.length),
          )
        }
        onNextRotation={() =>
          setSelectedRotationIndex((index) =>
            wrapReflectionIndex(index, 1, filteredRotations.length),
          )
        }
        showOtherRotationAxes={showOtherRotationAxes}
        onShowOtherRotationAxesChange={setShowOtherRotationAxes}

        selectedHalfTurnIndex={selectedHalfTurnIndex}
        halfTurnCount={symmetry.halfTurns.length}
        halfTurnAxisCount={axisCount(symmetry.halfTurns)}
        halfTurnAxisOrdinal={axisOrdinal(symmetry.halfTurns, selectedHalfTurnIndex)}
        selectedHalfTurn={symmetry.halfTurns[selectedHalfTurnIndex]}
        onPreviousHalfTurn={() =>
          setSelectedHalfTurnIndex((index) =>
            wrapReflectionIndex(index, -1, symmetry.halfTurns.length),
          )
        }
        onNextHalfTurn={() =>
          setSelectedHalfTurnIndex((index) =>
            wrapReflectionIndex(index, 1, symmetry.halfTurns.length),
          )
        }
        showOtherHalfTurnAxes={showOtherHalfTurnAxes}
        onShowOtherHalfTurnAxesChange={setShowOtherHalfTurnAxes}
        selectedRotoreflectionIndex={selectedRotoreflectionIndex}
        rotoreflectionCount={symmetry.rotoreflections.length}
        rotoreflectionAxisCount={axisCount(symmetry.rotoreflections)}
        selectedRotoreflection={symmetry.rotoreflections[selectedRotoreflectionIndex]}
        onPreviousRotoreflection={() =>
          setSelectedRotoreflectionIndex((index) =>
            wrapReflectionIndex(index, -1, symmetry.rotoreflections.length),
          )
        }
        onNextRotoreflection={() =>
          setSelectedRotoreflectionIndex((index) =>
            wrapReflectionIndex(index, 1, symmetry.rotoreflections.length),
          )
        }
        showOtherRotoreflectionAxes={showOtherRotoreflectionAxes}
        onShowOtherRotoreflectionAxesChange={setShowOtherRotoreflectionAxes}
        showRotoreflectionPlane={showRotoreflectionPlane}
        onShowRotoreflectionPlaneChange={setShowRotoreflectionPlane}
        onResetView={resetView}
        onExit={onExit}
      />
    </div>
  );
}
