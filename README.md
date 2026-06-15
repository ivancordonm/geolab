# MathLLM

MathLLM is an agentic mathematics workspace inspired by GeoGebra. The first
milestone targets classical 2D geometry while keeping the architecture open to
algebra, functions, linear algebra, calculus, and sandboxed Python execution.

This repository currently contains architecture documentation, runnable project
shells, the geometry domain, construction scripts, the agent tool registry, an
interactive SVG geometry canvas, local persistence/import/export, and a
deterministic assistant. Symbolic endpoints and a real LLM provider are
intentionally deferred.

## Product principles

1. **The LLM reasons; deterministic tools calculate.**
2. **Every construction is serializable and reproducible.** Interactive edits,
   scripts, and agent actions all produce the same geometry document model.
3. **Dependencies are explicit.** Free objects own values; derived objects store
   references to parents and are recomputed in topological order.
4. **The UI is not the geometry engine.** React renders state and dispatches
   commands but does not contain geometric formulas.
5. **Tool contracts are transport-neutral.** Tool definitions can later be
   exposed through MCP without changing their domain behavior.

## Architecture at a glance

```text
Browser
  React UI ── commands ──> TypeScript geometry graph ──> SVG renderer
      │                            │
      │ HTTP/JSON                  └── versioned GeometryDocument JSON
      ▼
FastAPI
  API routers ──> application services ──> deterministic domain tools
                                      ├── Python geometry evaluator
                                      ├── SymPy symbolic service
                                      ├── construction validator
                                      └── local JSON repository
      │
      └── AgentPlanner
            ├── RuleBasedPlanner (MVP)
            └── LLMPlanner (future)
                    │
                    └── ToolRegistry ──> validated tool calls
```

The browser owns the low-latency interactive geometry session. The backend
re-evaluates scripts, validates documents, performs symbolic work, and plans
tool calls. Both geometry runtimes use the same versioned JSON contract and
will be covered by shared conformance fixtures.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the complete design,
component responsibilities, data model, script grammar, API contracts, and
implementation sequence.

## MVP scope

### Included in the planned MVP

- SVG coordinate plane with pan/zoom-ready coordinate transforms.
- Point, line, segment, circle, midpoint, parallel line, perpendicular line,
  and feasible intersection-point constructions.
- Dragging free points with deterministic dependent-object recomputation.
- Object labels and object list.
- Construction script editor and evaluator.
- Basic assistant UI backed by a rule-based planner.
- FastAPI geometry validation/evaluation and SymPy simplify/solve endpoints.
- Local JSON import/export.
- Unit tests for geometry, parser, graph recomputation, symbolic operations,
  and agent planning.

### Explicitly out of scope for the first MVP

- Formal theorem proving or unverified proof claims.
- Arbitrary Python execution. A later version will use an isolated worker with
  time, memory, package, and filesystem limits; Python will never run directly
  inside the API process.
- Authentication, collaboration, cloud persistence, mobile-specific UI,
  advanced constraint solving, 3D geometry, CAS notebooks, and MCP transport.

## LLM and deterministic-tool boundary

### What the LLM should do

- Understand user intent.
- Explain mathematical concepts.
- Generate construction scripts.
- Break complex requests into steps.
- Choose tools.
- Summarize validated results.
- Help debug user constructions.

### What deterministic tools should do

- Compute intersections and derived geometry.
- Validate constructions and dependency references.
- Simplify symbolic expressions.
- Solve equations.
- Maintain and recompute the dependency graph.
- Apply validated geometry state updates.
- Guarantee numerical/symbolic correctness within documented tolerances.

### What should not be trusted to the LLM

- Exact coordinates or intersections.
- Algebraic simplification.
- Proof of correctness without deterministic verification.
- Direct state mutation without schema and domain validation.
- Executable Python or unrestricted tool arguments.

## Repository layout

```text
frontend/
  src/
    components/       React presentation components
    geometry/         graph, commands, evaluators, coordinate transforms
    agent/            assistant API client and UI-facing agent types
    types/            versioned transport/domain contracts
backend/
  app/
    geometry/         parser, dependency graph, geometry tools
    symbolic/         SymPy application service
    agent/            planner abstraction and tool registry
    main.py            FastAPI composition root
    schemas.py         API schemas (next milestone)
  tests/               backend unit and API tests
docs/
  ARCHITECTURE.md      detailed technical design
```

## Run the current skeleton

### Frontend

Requirements: Node.js 20+ and npm.

```bash
cd frontend
npm install
npm run dev
```

Vite will print the local URL, normally `http://localhost:5173`.

### Backend

Requirements: Python 3.11+.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`; interactive docs are at
`http://localhost:8000/docs`. Geometry and agent routes include:

- `POST /geometry/evaluate-script`
- `GET /geometry/graph`
- `GET /agent/tools`
- `POST /agent/execute-tool`
- `POST /agent/plan`

### Checks

```bash
cd frontend && npm run typecheck
cd backend && pytest
```

## Implementation milestones

1. **Foundation (complete):** architecture, contracts, directories, and
   runnable frontend/backend shells.
2. **Geometry core (complete for current objects):** versioned model, graph,
   evaluators, shared conformance fixture, recomputation, validated object
   insertion, and tests.
3. **Script engine (partially complete):** parser, semantic validation,
   evaluation, and `/geometry/evaluate-script`. Document validation remains.
4. **Interactive canvas (complete for MVP tools):** SVG rendering, labels,
   grid, cursor-centered zoom, free-point dragging, object inspection, and a
   construction toolbar for points, segments, lines, circles, midpoints,
   parallels, and perpendiculars. Multi-step tools support Escape cancellation
   and simple previews.
5. **Symbolic tools:** safe SymPy parsing, simplify/solve endpoints, and tests.
6. **Agent loop (partially complete):** tool registry, validated execution,
   read-only graph access, rule-based planning, script preview, and explicit
   user-approved application are complete. A real LLM provider remains.
7. **Persistence and polish (partially complete):** versioned localStorage
   auto-save/restore, explicit save/load/clear controls, validated JSON
   import/export, construction-script export, tests, and error UX are complete.
   File-based autosave and richer examples remain.

## Known limitations of this skeleton

- Symbolic, agent planning, and standalone geometry-validation routes remain
  unimplemented. The current workspace is process-local and resets on restart.
- The canvas starts from an in-memory example and can replace it through the
  backend construction script endpoint. Persistence across restarts remains.
- Interactive constructions use generated labels and IDs; renaming, snapping,
  undo/redo, and advanced constraint feedback are not implemented yet.
- Persistence is browser-local. It does not synchronize across browsers or
  devices, and script export intentionally omits visual styles and visibility.
- No LLM provider or Python sandbox is configured.

## Suggested next step

Add `/geometry/validate` and safe SymPy endpoints, then expand the assistant to
use the tool registry for multi-step validated execution traces.
