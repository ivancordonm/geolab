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
  selectedRotoreflectionIndex?: number;
  showOtherRotoreflectionAxes?: boolean;
  showRotoreflectionPlane?: boolean;
  color: string;
  opacity?: number;
}

const AXIS_LEN = 1.6;

export function rotoreflectionAxisIndicesToRender(
  elements: readonly SymmetryElement[],
  selectedIndex: number,
  showOthers: boolean,
): number[] {
  const impropers = elements.filter((el) => el.kind === "improper");
  if (!impropers.length) return [];
  const selected = Math.min(Math.max(selectedIndex, 0), impropers.length - 1);
  if (!showOthers) return [selected];
  const axisKey = (el: SymmetryElement) => el.kind === "improper"
    ? (el.axisId ?? new Vector3(...el.direction).normalize().toArray().map((v) => v.toFixed(4)).join(","))
    : "";
  const selectedAxis = axisKey(impropers[selected]);
  return impropers.reduce<number[]>((indices, el, i) => {
    const key = axisKey(el);
    if (i === selected || (key !== selectedAxis && !indices.some((j) => axisKey(impropers[j]) === key))) indices.push(i);
    return indices;
  }, []);
}

function AxisLine({
  element,
  dashed,
  color,
  opacity,
}: {
  element: SymmetryElement & { direction: readonly [number, number, number] };
  dashed: boolean;
  color?: string;
  opacity?: number;
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
        <lineDashedMaterial color={color ?? "#f59e0b"} transparent opacity={opacity ?? 1} dashSize={0.15} gapSize={0.1} />
      ) : (
        <lineBasicMaterial color={color ?? "#ef4444"} transparent opacity={opacity ?? 1} />
      )}
    </lineSegments>
  );
}

function RotationArc({ direction, angle, color }: { direction: readonly [number, number, number]; angle: number; color: string }) {
  const axis = new Vector3(...direction).normalize();
  const ref = Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const u = new Vector3().crossVectors(axis, ref).normalize();
  const v = new Vector3().crossVectors(axis, u).normalize();
  const points = Array.from({ length: 25 }, (_, i) => { const t = (i / 24) * Math.abs(angle) * Math.sign(angle || 1); return u.clone().multiplyScalar(Math.cos(t) * 0.8).add(v.clone().multiplyScalar(Math.sin(t) * 0.8)); });
  const positions = new Float32Array(points.flatMap((p) => [p.x, p.y, p.z]));
  const tip = points[points.length - 1];
  const tangent = points[points.length - 1].clone().sub(points[points.length - 2]).normalize();
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), tangent);
  return <group renderOrder={5}><line><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><lineBasicMaterial color={color} transparent opacity={0.95} depthTest={false} /></line><mesh position={tip} quaternion={quat}><coneGeometry args={[0.09, 0.2, 8]} /><meshBasicMaterial color={color} depthTest={false} /></mesh></group>;
}

function PlaneQuad({
  element,
  selected,
  color,
  selectedOpacity,
}: {
  element: SymmetryElement & { normal: readonly [number, number, number] };
  selected: boolean;
  color: string;
  selectedOpacity?: number;
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
          opacity={selected ? (selectedOpacity ?? 0.32) : 0.04}
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
  selectedRotoreflectionIndex = 0,
  showOtherRotoreflectionAxes = false,
  showRotoreflectionPlane = true,
  opacity = 0.6,
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
        s.rotoreflections[selectedRotoreflectionIndex]?.kind === "improper" && (() => {
          const selected = s.rotoreflections[selectedRotoreflectionIndex];
          if (selected.kind !== "improper") return null;
          const axes = rotoreflectionAxisIndicesToRender(s.rotoreflections, selectedRotoreflectionIndex, true)
            .filter((i) => i !== selectedRotoreflectionIndex)
            .map((i) => s.rotoreflections[i]);
          return <>
            <AxisLine element={selected} dashed={false} color={color} opacity={0.95} />
            {showOtherRotoreflectionAxes && axes.map((el) => el.kind === "improper" ? <AxisLine key={`s4-ref-${el.axisId}`} element={el} dashed={true} color={color} opacity={0.18} /> : null)}
            {showRotoreflectionPlane && <PlaneQuad element={{ kind: "plane", point: selected.point, normal: selected.direction, label: "plano" }} selected selectedOpacity={Math.min(0.25, opacity * 0.35)} color={color} />}
            <RotationArc direction={selected.direction} angle={selected.angle} color={color} />
          </>;
        })()}
    </group>
  );
}
