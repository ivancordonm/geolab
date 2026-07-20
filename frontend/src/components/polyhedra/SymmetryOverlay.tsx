import { useMemo } from "react";
// Pulls in react-three-fiber v9's JSX.IntrinsicElements augmentation so the
// <mesh>/<group>/<lineSegments>/... intrinsics typecheck in this file.
import type {} from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";
import type {
  PolyhedronDefinition,
  ReflectionDisplayMode,
  SymmetryClass,
  SymmetryElement,
} from "../../geometry/polyhedra/types";

interface SymmetryOverlayProps {
  definition: PolyhedronDefinition;
  visibleClasses: ReadonlySet<SymmetryClass>;
  reflectionMode: ReflectionDisplayMode;
  selectedReflectionIndex: number;
  showOtherReflections: boolean;
  color: string;
}

const AXIS_LEN = 1.6;

function AxisLine({
  element,
  dashed,
}: {
  element: SymmetryElement & { direction: readonly [number, number, number] };
  dashed: boolean;
}) {
  const dir = new Vector3(...element.direction).normalize();
  const a = dir.clone().multiplyScalar(AXIS_LEN);
  const b = dir.clone().multiplyScalar(-AXIS_LEN);
  const positions = useMemo(
    () => new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]),
    [a.x, a.y, a.z, b.x, b.y, b.z],
  );
  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        {dashed && (
          <bufferAttribute
            attach="attributes-lineDistance"
            args={[new Float32Array([0, AXIS_LEN * 2]), 1]}
          />
        )}
      </bufferGeometry>
      {dashed ? (
        <lineDashedMaterial color="#f59e0b" dashSize={0.15} gapSize={0.1} />
      ) : (
        <lineBasicMaterial color="#ef4444" />
      )}
    </lineSegments>
  );
}

function PlaneQuad({
  element,
  selected,
  color,
}: {
  element: SymmetryElement & { normal: readonly [number, number, number] };
  selected: boolean;
  color: string;
}) {
  const normal = new Vector3(...element.normal).normalize();
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
  return (
    <group quaternion={quat}>
      <mesh>
        <planeGeometry args={[2.4, 2.4]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.32 : 0.04}
          side={2 /* THREE.DoubleSide */}
          depthWrite={false}
        />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([
                -1.2, -1.2, 0.001, 1.2, -1.2, 0.001, 1.2, -1.2, 0.001,
                1.2, 1.2, 0.001, 1.2, 1.2, 0.001, -1.2, 1.2, 0.001, -1.2,
                1.2, 0.001, -1.2, -1.2, 0.001,
              ]),
              3,
            ]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.9 : 0.12}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

export function reflectionIndicesToRender(
  count: number,
  selectedIndex: number,
  mode: ReflectionDisplayMode,
  showOthersAsReference: boolean,
): number[] {
  if (count <= 0) return [];
  const selected = Math.min(Math.max(selectedIndex, 0), count - 1);
  if (mode === "all" || (mode === "individual" && showOthersAsReference)) {
    return Array.from({ length: count }, (_, index) => index);
  }
  if (mode === "cumulative") {
    return Array.from({ length: selected + 1 }, (_, index) => index);
  }
  return [selected];
}

export function SymmetryOverlay({
  definition,
  visibleClasses,
  reflectionMode,
  selectedReflectionIndex,
  showOtherReflections,
  color,
}: SymmetryOverlayProps) {
  const s = definition.symmetry;
  const reflectionIndices = reflectionIndicesToRender(
    s.reflections.length,
    selectedReflectionIndex,
    reflectionMode,
    showOtherReflections,
  );
  return (
    <group>
      {visibleClasses.has("rotations3") &&
        s.rotations3.map((el, i) =>
          el.kind === "axis" ? (
            <AxisLine key={`r3-${i}`} element={el} dashed={false} />
          ) : null,
        )}
      {visibleClasses.has("halfTurns") &&
        s.halfTurns.map((el, i) =>
          el.kind === "axis" ? (
            <AxisLine key={`ht-${i}`} element={el} dashed={false} />
          ) : null,
        )}
      {visibleClasses.has("reflections") &&
        reflectionIndices.map((i) => {
          const el = s.reflections[i];
          return (
            <PlaneQuad
              key={el.id ?? `rf-${i}`}
              element={el}
              selected={i === selectedReflectionIndex}
              color={color}
            />
          );
        })}
      {visibleClasses.has("rotoreflections") &&
        s.rotoreflections.map((el, i) =>
          el.kind === "improper" ? (
            <AxisLine key={`s4-${i}`} element={el} dashed />
          ) : null,
        )}
    </group>
  );
}
