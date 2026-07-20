# Eliminar la animación de simetría del estudio 3D

**Fecha:** 2026-07-20
**Estado:** aprobado

## Problema

En el estudio 3D del tetraedro, hacer clic sobre un eje o plano de simetría
lanza automáticamente una animación del movimiento (rotación/reflexión). El
usuario no quiere esa reproducción: los elementos de simetría deben ser
visualización pura.

## Decisión

Eliminar la animación por completo (opción elegida frente a «selección +
botón Reproducir» y «doble clic para animar»).

## Cambios

- `frontend/src/components/polyhedra/PolyhedronStudio.tsx`: eliminar el
  estado `animation`, `AnimationState`, el componente `AnimationRunner`,
  `pickElement` y el prop `animation` pasado a `PolyhedronMesh`; dejar de
  pasar `onPickElement` a `SymmetryOverlay`.
- `frontend/src/components/polyhedra/SymmetryOverlay.tsx`: eliminar
  `onPickElement`/`onPick`, los manejadores de clic y el cilindro invisible
  que solo servía de objetivo de clic en los ejes.
- `frontend/src/components/polyhedra/PolyhedronMesh.tsx`: eliminar el prop
  `animation` y el uso de `transformedVertices`; el mesh dibuja siempre los
  vértices de la definición.
- Borrar `frontend/src/geometry/polyhedra/animation.ts` y
  `animation.test.ts` (quedan muertos).
- **Se conserva** `matrixForElement` en `types.ts`: define matemáticamente
  cada elemento de simetría y los tests del grupo Td la usan para validar la
  taxonomía.

## Verificación

- `npx vitest run` sobre los tests de `polyhedra` y componentes.
- `npm run typecheck`.
