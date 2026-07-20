import { useMemo } from "react";
// Pulls in react-three-fiber v9's JSX.IntrinsicElements augmentation so the
// <mesh>/<group>/<lineSegments>/... intrinsics typecheck in this file.
import type {} from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";
import type {
  PolyhedronDefinition,
  SymmetryClass,
  SymmetryElement,
} from "../../geometry/polyhedra/types";

interface SymmetryOverlayProps {
  definition: PolyhedronDefinition;
  visibleClasses: ReadonlySet<SymmetryClass>;
  onPickElement: (element: SymmetryElement) => void;
}

const AXIS_LEN = 1.6;

function AxisLine({
  element,
  dashed,
  onPick,
}: {
  element: SymmetryElement & { direction: readonly [number, number, number] };
  dashed: boolean;
  onPick: () => void;
}) {
  const dir = new Vector3(...element.direction).normalize();
  const a = dir.clone().multiplyScalar(AXIS_LEN);
  const b = dir.clone().multiplyScalar(-AXIS_LEN);
  const positions = useMemo(
    () => new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]),
    [a.x, a.y, a.z, b.x, b.y, b.z],
  );
  // Invisible fat cylinder as a click target along the axis.
  const mid = new Vector3(0, 0, 0);
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
  return (
    <group onClick={(e) => { e.stopPropagation(); onPick(); }}>
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
      <mesh position={mid} quaternion={quat} visible={false}>
        <cylinderGeometry args={[0.06, 0.06, AXIS_LEN * 2, 8]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}

function PlaneQuad({
  element,
  onPick,
}: {
  element: SymmetryElement & { normal: readonly [number, number, number] };
  onPick: () => void;
}) {
  const normal = new Vector3(...element.normal).normalize();
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
  return (
    <mesh
      quaternion={quat}
      onClick={(e) => { e.stopPropagation(); onPick(); }}
    >
      <planeGeometry args={[2.4, 2.4]} />
      <meshBasicMaterial
        color="#a855f7"
        transparent
        opacity={0.18}
        side={2 /* THREE.DoubleSide */}
        depthWrite={false}
      />
    </mesh>
  );
}

export function SymmetryOverlay({
  definition,
  visibleClasses,
  onPickElement,
}: SymmetryOverlayProps) {
  const s = definition.symmetry;
  return (
    <group>
      {visibleClasses.has("rotations3") &&
        s.rotations3.map((el, i) =>
          el.kind === "axis" ? (
            <AxisLine key={`r3-${i}`} element={el} dashed={false} onPick={() => onPickElement(el)} />
          ) : null,
        )}
      {visibleClasses.has("halfTurns") &&
        s.halfTurns.map((el, i) =>
          el.kind === "axis" ? (
            <AxisLine key={`ht-${i}`} element={el} dashed={false} onPick={() => onPickElement(el)} />
          ) : null,
        )}
      {visibleClasses.has("reflections") &&
        s.reflections.map((el, i) =>
          el.kind === "plane" ? (
            <PlaneQuad key={`rf-${i}`} element={el} onPick={() => onPickElement(el)} />
          ) : null,
        )}
      {visibleClasses.has("rotoreflections") &&
        s.rotoreflections.map((el, i) =>
          el.kind === "improper" ? (
            <AxisLine key={`s4-${i}`} element={el} dashed onPick={() => onPickElement(el)} />
          ) : null,
        )}
    </group>
  );
}
