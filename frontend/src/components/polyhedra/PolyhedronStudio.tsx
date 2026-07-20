import { useCallback, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PolyhedronMesh } from "./PolyhedronMesh";
import { SymmetryOverlay } from "./SymmetryOverlay";
import { SymmetryMenu } from "./SymmetryMenu";
import type {
  PolyhedronDefinition,
  SymmetryClass,
  SymmetryElement,
} from "../../geometry/polyhedra/types";

interface PolyhedronStudioProps {
  definition: PolyhedronDefinition;
  onExit: () => void;
}

interface AnimationState {
  element: SymmetryElement;
  progress: number;
}

const DURATION = 1.6; // seconds for a full there-and-back demonstration

function AnimationRunner({
  animation,
  onProgress,
  onDone,
}: {
  animation: AnimationState | null;
  onProgress: (progress: number) => void;
  onDone: () => void;
}) {
  const elapsed = useRef(0);
  const prevElement = useRef<SymmetryElement | null>(null);
  useFrame((_, delta) => {
    if (!animation) {
      prevElement.current = null; // idle: next run starts fresh
      return;
    }
    if (animation.element !== prevElement.current) {
      elapsed.current = 0; // new element picked (possibly mid-flight): restart
      prevElement.current = animation.element;
    }
    elapsed.current += delta;
    const t = Math.min(1, elapsed.current / DURATION);
    // Triangle wave: 0 -> 1 -> 0 with ease.
    const eased = t < 0.5 ? t * 2 : (1 - t) * 2;
    onProgress(eased);
    if (t >= 1) {
      elapsed.current = 0;
      onDone();
    }
  });
  return null;
}

export default function PolyhedronStudio({ definition, onExit }: PolyhedronStudioProps) {
  const [visibleClasses, setVisibleClasses] = useState<Set<SymmetryClass>>(new Set());
  const [opacity, setOpacity] = useState(0.6);
  const [color, setColor] = useState(definition.defaultColor);
  const [animation, setAnimation] = useState<AnimationState | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const toggleClass = useCallback((cls: SymmetryClass) => {
    setVisibleClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });
  }, []);

  const pickElement = useCallback((element: SymmetryElement) => {
    setAnimation({ element, progress: 0 });
  }, []);

  const resetView = useCallback(() => {
    controlsRef.current?.reset();
  }, []);

  return (
    <div className="absolute inset-0 z-30 bg-surface">
      <Canvas camera={{ position: [3, 2, 3], fov: 50 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 5, 3]} intensity={0.8} />
        <PolyhedronMesh
          definition={definition}
          color={color}
          opacity={opacity}
          animation={animation}
        />
        <SymmetryOverlay
          definition={definition}
          visibleClasses={visibleClasses}
          onPickElement={pickElement}
        />
        <OrbitControls ref={controlsRef} enablePan={false} />
        <AnimationRunner
          animation={animation}
          onProgress={(progress) =>
            setAnimation((a) => (a ? { ...a, progress } : a))
          }
          onDone={() => setAnimation(null)}
        />
      </Canvas>

      <SymmetryMenu
        polyhedronName={definition.name}
        visibleClasses={visibleClasses}
        onToggleClass={toggleClass}
        opacity={opacity}
        onOpacityChange={setOpacity}
        color={color}
        onColorChange={setColor}
        onResetView={resetView}
        onExit={onExit}
      />
    </div>
  );
}
