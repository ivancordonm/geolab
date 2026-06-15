# Geometry backend

- `models.py` defines the version-1 Pydantic construction and evaluated-value
  schemas using the shared camelCase JSON aliases.
- `engine.py` validates the dependency DAG, evaluates all supported construction
  types, and incrementally recomputes transitive dependants after a free point
  moves.
- `script.py` parses line-oriented assignments, resolves references in source
  order, converts commands to shared geometry objects, and reports structured
  diagnostics with source line and column information.
- `router.py` exposes `POST /geometry/evaluate-script`.

The separate `/geometry/validate` endpoint remains a future milestone.
