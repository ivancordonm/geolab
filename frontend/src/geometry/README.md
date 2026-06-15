# Frontend geometry

- `engine.ts` validates construction dependencies, computes deterministic
  runtime values, and incrementally recomputes transitive dependants.
- `serialization.ts` reads and writes the version-1 construction JSON format.
- `viewport.ts` owns world/screen transforms, line clipping, grid sizing, and
  cursor-centered zoom math.
- `useGeometryState.ts` adapts the mutable deterministic graph to immutable React
  snapshots without putting geometry formulas in components.
- Geometry object interfaces live in `src/types/geometry.ts`.

Typed construction commands remain a future milestone.
