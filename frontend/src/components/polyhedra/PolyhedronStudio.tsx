import { useCallback, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PolyhedronMesh } from "./PolyhedronMesh";
import { SymmetryOverlay } from "./SymmetryOverlay";
import { SymmetryMenu } from "./SymmetryMenu";
import { wrapReflectionIndex } from "../../geometry/polyhedra/types";
import type {
  PolyhedronDefinition,
  ReflectionDisplayMode,
  SymmetryClass,
} from "../../geometry/polyhedra/types";

interface PolyhedronStudioProps {
  definition: PolyhedronDefinition;
  onExit: () => void;
}

export default function PolyhedronStudio({ definition, onExit }: PolyhedronStudioProps) {
  const [visibleClasses, setVisibleClasses] = useState<Set<SymmetryClass>>(new Set());
  const [opacity, setOpacity] = useState(0.6);
  const [color, setColor] = useState(definition.defaultColor);
  const [reflectionMode, setReflectionMode] =
    useState<ReflectionDisplayMode>("individual");
  const [selectedReflectionIndex, setSelectedReflectionIndex] = useState(0);
  const [showOtherReflections, setShowOtherReflections] = useState(false);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const reflections = definition.symmetry.reflections;

  const toggleClass = useCallback((cls: SymmetryClass) => {
    setVisibleClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    controlsRef.current?.reset();
  }, []);

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
          showOtherReflections={showOtherReflections}
          color={color}
        />
        <OrbitControls ref={controlsRef} enablePan={false} />
      </Canvas>

      <SymmetryMenu
        polyhedronName={definition.name}
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
        onResetView={resetView}
        onExit={onExit}
      />
    </div>
  );
}
