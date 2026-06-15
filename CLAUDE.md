# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

GeoLab is an agentic mathematics workspace (inspired by GeoGebra) with a strict epistemic boundary: the LLM proposes constructions, but deterministic tools are the authority for mathematical state. The MVP targets interactive classical 2D geometry while keeping the architecture extensible to algebra, calculus, and sandboxed Python execution.

The codebase is a full-stack React + TypeScript frontend paired with a Python FastAPI backend, sharing versioned JSON contracts and conformance fixtures. See `docs/ARCHITECTURE.md` for the complete technical design.

## Core architectural principle

**The LLM reasons; deterministic tools calculate.** Agent mutations pass through typed, validated, deterministic tools. The UI is not the geometry engine. Both frontend (TS) and backend (Python) evaluate the same JSON document schema to prevent semantic drift.

## Development workflow

### Frontend setup and commands

```bash
cd frontend
npm install
npm run dev          # Vite dev server on http://localhost:5173
npm run typecheck    # TypeScript without emit
npm run build        # Production build
npm run test         # Run vitest suite
npm run test -- --ui # Interactive test UI
```

### Backend setup and commands

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e '.[dev]'
uvicorn app.main:app --reload  # API on http://localhost:8000; docs at /docs

# Testing
pytest                              # Run all tests
pytest tests/geometry/test_graph.py # Run a specific test module
pytest -k "test_midpoint"           # Run tests matching a name pattern
pytest -v                           # Verbose output with test names
pytest --tb=short                   # Shorter tracebacks

# Linting and formatting
ruff check app tests                # Check code style
ruff format app tests               # Auto-format code
```

### Running the full stack

Open three terminals:
1. `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload`
2. `cd frontend && npm run dev`
3. Browser: http://localhost:5173

The frontend will proxy to the backend at http://localhost:8000.

## Repository structure

| Path | Purpose |
|------|---------|
| `frontend/src/geometry/` | Graph recomputation, typed commands, coordinate transforms, evaluators |
| `frontend/src/components/` | React presentation components (canvas, toolbar, object list, script editor) |
| `frontend/src/agent/` | Assistant UI and backend API client |
| `frontend/src/persistence/` | localStorage auto-save/restore, JSON import/export |
| `frontend/src/types/` | Versioned TypeScript schemas for contracts and domain types |
| `backend/app/geometry/` | Parser, dependency DAG, validation, pure geometry tools |
| `backend/app/symbolic/` | Safe SymPy parsing, simplify, solve |
| `backend/app/agent/` | Tool registry, planner interface, rule-based MVP planner |
| `backend/tests/` | Fixtures and conformance tests |
| `docs/ARCHITECTURE.md` | Detailed technical design, contracts, and implementation roadmap |

## Key constraints and design decisions

### 1. Dual deterministic runtimes
The browser (TypeScript) and backend (Python) both evaluate the same `GeometryDocument` JSON. Both must produce bit-identical geometry results within documented tolerances (currently `1e-9`). New geometry operations must be implemented in both runtimes.

Shared conformance fixtures in `backend/tests/fixtures/` validate this contract. When adding a new construction type:
- Add a definition variant to the JSON schema (both TypeScript and Python types)
- Implement the evaluator in both runtimes
- Add a test fixture that both runtimes must satisfy

### 2. Dependency graph, not imperative drawing
The document is a directed acyclic graph (DAG). Free points own coordinates; derived objects reference parents. Mutations trigger topological recomputation. Invalid references, cycles, and duplicate IDs are rejected during validation.

When mutating geometry, always go through the graph validation layer. Direct coordinate assignment breaks the dependency chain.

### 3. Strict LLM/tool boundary
The agent planner produces a *proposal* (typed plan + script preview). The UI previews and requires explicit user approval before calling `/geometry/evaluate-script`. The planner never directly mutates state. The tool registry is the sole source of valid mutations.

### 4. Transport-neutral tool contracts
Tools are defined with `ToolDefinition(name, description, input_model, output_model, handler)` in the registry. Input/output schemas are Pydantic models that export to JSON-Schema. This design allows the same tool definitions to be exposed through HTTP, an LLM function-call protocol, or (later) MCP, without changing domain behavior.

### 5. No partial documents on error
Script evaluation is atomic. A syntax error, semantic error, or validation failure leaves the document unchanged. The error response includes source position and diagnostic code so the UI can provide precise feedback.

## Common tasks and patterns

### Adding a new geometry construction type

1. Define the JSON schema variant in `frontend/src/types/geometry.ts` and `backend/app/geometry/schema.py`
2. Implement evaluators in both runtimes: `frontend/src/geometry/evaluators.ts` and `backend/app/geometry/tools.py`
3. Add a script constructor in both parsers (if the construction is user-accessible)
4. Create a shared conformance fixture in `backend/tests/fixtures/` with expected input and evaluated output
5. Verify both test suites pass the fixture
6. Add a tool definition to the registry if agents should invoke it

### Fixing a cross-runtime bug

1. Add a failing conformance fixture that demonstrates the discrepancy
2. Run the fixture against both runtimes to confirm both fail in the same way or diverge
3. Fix the evaluator logic in one runtime
4. Port the fix to the other runtime
5. Verify the fixture passes in both

### Adding a new agent tool

1. Implement the handler as a pure function with deterministic behavior
2. Define input and output Pydantic models
3. Register in the tool registry in `backend/app/agent/registry.py`
4. Write a test for the handler with mock geometry state
5. Add the tool to the rule-based planner's pattern matching (MVP) or test it with an LLM planner (future)

### Testing geometry operations

- **Frontend unit tests:** `frontend/src/**/*.test.ts`. Test transforms, line algebra, and graph recomputation in isolation.
- **Backend unit tests:** `backend/tests/` for geometry tools, parser, and SymPy safety.
- **Conformance tests:** `backend/tests/fixtures/` — shared JSON inputs evaluated by both runtimes.
- **Integration tests:** `backend/tests/test_api_*.py` for HTTP contract validation.

Run a subset with pytest flags: `pytest -k "line" -v` finds all tests with "line" in the name.

## Important implementation notes

### Geometry tolerances
All near-zero comparisons use a configurable epsilon (`1e-9` in world coordinates). Update this in one place: the tolerance constant that both runtimes import or define (currently duplicated but documented in `ARCHITECTURE.md` § 4.3).

### Lines in normalized form
Lines use the implicit form `a*x + b*y + c = 0` normalized so that `sqrt(a² + b²) = 1` with a deterministic sign convention. This handles vertical lines uniformly and is tested by conformance fixtures.

### SymPy safety
SymPy input is never evaluated directly. All requests are parsed through an allowlist of symbols and operations. Requests have expression-size and execution-time limits. See `backend/app/symbolic/service.py` for the allowlist.

### Agent approval boundary
The planner (`/agent/plan`) returns a proposal with a validated script. The UI previews the script and requires explicit user click to apply it via `/geometry/evaluate-script`. The planner never mutates state. This preserves user agency and makes debugging deterministic (the same script always produces the same geometry).

## Known limitations and future work

- **No symbolic validation yet:** The `/geometry/validate` endpoint is not implemented. Complex algebra and proof is deferred.
- **Rule-based planner only:** The MVP uses pattern matching. Real LLM integration is a separate `LLMPlanner` that plugs into the existing executor.
- **No undo/redo:** Each interaction is deterministic from the document state, but incremental undo is not yet implemented.
- **Local persistence only:** No database, cloud sync, or collaboration. JSON import/export is the persistent format.
- **No sandboxed Python yet:** Arbitrary execution is not part of the MVP. A future service must be isolated with resource limits.

See the "Suggested next step" section of `README.md` and the "Planned implementation sequence" in `docs/ARCHITECTURE.md` for the roadmap.

## Debugging tips

### Canvas not rendering after a mutation?
Check the graph recomputation logic in `frontend/src/geometry/graph.ts`. Ensure the topological sort is correct and dependent objects are marked for recalculation.

### Backend returning "undefined" for an intersection?
The intersection may be degenerate (parallel lines, point on a line) or requires a construction type not yet implemented (circle–line intersections). Check the evaluator in `backend/app/geometry/tools.py` and add a conformance fixture for the edge case.

### Script parse error with correct syntax?
Verify the statement follows the grammar in `ARCHITECTURE.md` § 5.2. The parser does not auto-recover; one syntax error fails the entire script. Check the error source position and diagnostic code in the response.

### TypeScript error about mismatched JSON schemas?
Both runtimes must have identical type definitions. If you added a field, update `frontend/src/types/geometry.ts` and `backend/app/geometry/schema.py` together, then validate with a conformance fixture.
