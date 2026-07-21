import { useEffect, useMemo } from "react";
// Side-effect-only type import: pulls in @react-three/fiber's module
// augmentation of the JSX.IntrinsicElements namespace (mesh, group,
// meshStandardMaterial, lineSegments, lineBasicMaterial, etc). r3f v9
// declares this augmentation in its own .d.ts, which TypeScript only
// includes in the program if something in the type graph imports from
// "@react-three/fiber"; this file is otherwise standalone (it only needs
// "three" and local geometry types), so without this import the r3f
// intrinsic elements below are unrecognized.
import type {} from "@react-three/fiber";
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three";
import type { PolyhedronDefinition, Vec3 } from "../../geometry/polyhedra/types";

interface PolyhedronMeshProps {
  definition: PolyhedronDefinition;
  color: string;
  opacity: number;
}

function faceGeometry(vertices: Vec3[], faces: number[][]): BufferGeometry {
  const positions: number[] = [];
  for (const face of faces) {
    // Triangulate each face as a fan around its first vertex.
    for (let i = 1; i < face.length - 1; i += 1) {
      for (const idx of [face[0], face[i], face[i + 1]]) {
        positions.push(...vertices[idx]);
      }
    }
  }
  const geom = new BufferGeometry();
  geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

function edgeGeometry(
  vertices: Vec3[],
  edges: readonly (readonly [number, number])[],
): BufferGeometry {
  const positions: number[] = [];
  for (const [a, b] of edges) {
    positions.push(...vertices[a], ...vertices[b]);
  }
  const geom = new BufferGeometry();
  geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geom;
}

export function PolyhedronMesh({ definition, color, opacity }: PolyhedronMeshProps) {
  const faces = useMemo(
    () => faceGeometry(definition.vertices, definition.faces),
    [definition.vertices, definition.faces],
  );
  useEffect(() => () => faces.dispose(), [faces]);
  const edges = useMemo(
    () => edgeGeometry(definition.vertices, definition.edges),
    [definition.vertices, definition.edges],
  );
  useEffect(() => () => edges.dispose(), [edges]);

  return (
    <group>
      <mesh geometry={faces} renderOrder={2}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={edges} renderOrder={3}>
        <lineBasicMaterial color="#1e293b" />
      </lineSegments>
    </group>
  );
}
