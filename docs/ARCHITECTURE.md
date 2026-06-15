# GeoLab Architecture

## 1. Goals and constraints

GeoLab is a local-first agentic mathematics platform. The MVP must make simple
classical geometry interactive and reproducible while establishing boundaries
that remain useful when algebra, calculus, matrices, plotting, and isolated
Python execution are added.

The key constraint is epistemic: a language model may propose a construction,
but it cannot be the authority for mathematical state. All accepted mutations
and exact computations pass through typed, deterministic, validated tools.

## 2. Architectural decisions

### 2.1 SVG for the MVP renderer

SVG is preferable to Canvas for the initial object count and interaction model:

- Native shapes, text labels, pointer events, and hit testing.
- Easy inspection and debugging in browser developer tools.
- A clean mapping between geometry objects and rendered elements.
- Sufficient performance for hundreds of MVP objects.

The geometry engine outputs world-space primitives. A separate viewport module
maps world coordinates to SVG screen coordinates. This preserves the option to
replace SVG with Canvas/WebGL later without changing construction semantics.

### 2.2 Dual deterministic geometry runtimes

The TypeScript runtime provides immediate dragging and recomputation without a
network round trip. The Python runtime evaluates scripts and validates geometry
for backend tools. To prevent semantic drift:

- Both consume and emit the same versioned `GeometryDocument` JSON shape.
- Mathematical tolerances and degeneracy rules are documented centrally.
- Shared JSON conformance fixtures are evaluated by both test suites.
- The backend is authoritative when an agent or script submits a mutation.

This small duplication is preferable to server-round-trip dragging or running
the Python engine in the browser for the MVP.

### 2.3 Dependency graph, not imperative drawing

The document is a directed acyclic graph (DAG). Free points contain coordinates.
Derived nodes contain parent IDs and construction parameters. Evaluation creates
runtime values; it does not overwrite construction definitions.

On a free-point move:

1. Update that point's definition.
2. Find transitive dependants through a reverse dependency index.
3. Topologically recompute affected nodes.
4. Mark degenerate/undefined nodes with structured diagnostics.
5. Render the resulting evaluated values.

Cycles, missing references, invalid parent types, duplicate IDs, and duplicate
labels are rejected during validation.

### 2.4 Local JSON persistence

No database is justified for a single-user MVP. Documents are JSON files with a
schema version. The browser may additionally keep a versioned autosave in
`localStorage`, but import/export remains the portable source of truth.

### 2.5 Agent behind a planner interface

`AgentPlanner` receives user text plus a compact document summary and produces
a typed plan. The MVP uses `RuleBasedPlanner`. A future `LLMPlanner` may produce
the same plan schema but cannot directly execute code or mutate state.

## 3. Component responsibilities

### Frontend

| Component | Responsibility |
|---|---|
| React application shell | Layout, tabs/panels, error boundaries, API status |
| Geometry controller | Own document state and dispatch typed commands |
| Geometry graph | Validate references, index dependencies, recompute values |
| SVG renderer | Render evaluated primitives and labels only |
| Interaction tools | Convert pointer gestures into domain commands |
| Script editor | Edit text, submit evaluation request, display diagnostics |
| Object list | Inspect/select/hide objects without calculating geometry |
| Assistant panel | Send prompts, preview plans/scripts, request execution |
| API client | Typed HTTP boundary and error normalization |

### Backend

| Component | Responsibility |
|---|---|
| FastAPI composition root | Configuration, CORS, routers, exception mapping |
| Geometry parser | Parse the construction language into a typed AST |
| Geometry service | Evaluate AST, construct document, validate graph |
| Geometry tools | Pure operations such as line coefficients/intersections |
| Symbolic service | Parse allowlisted SymPy syntax, simplify, solve, serialize |
| Tool registry | Declare names, descriptions, schemas, handlers, side effects |
| Agent planner | Convert intent into a proposed sequence of typed tool calls |
| Plan executor | Validate calls, execute tools, validate results, collect trace |
| JSON repository | Save/load versioned documents with atomic file replacement |

## 4. Canonical geometry model

### 4.1 Document envelope

```json
{
  "schemaVersion": 1,
  "id": "doc_01",
  "title": "Triangle construction",
  "objects": [],
  "viewport": { "centerX": 0, "centerY": 0, "scale": 50 },
  "metadata": { "createdAt": "2026-06-13T00:00:00Z" }
}
```

Dates and metadata are not inputs to geometry evaluation.

### 4.2 Common object fields

```ts
type GeometryObjectBase = {
  id: string;          // stable machine identifier
  label: string;       // user-facing unique label in MVP
  kind: GeometryKind;
  visible: boolean;
  style?: GeometryStyle;
};
```

Use a discriminated union for construction definitions:

```ts
type GeometryObject =
  | FreePoint
  | LineThroughPoints
  | SegmentBetweenPoints
  | CircleByCenterPoint
  | MidpointOfPoints
  | ParallelLineThroughPoint
  | PerpendicularLineThroughPoint
  | IntersectionPoint;
```

Representative JSON definitions:

```json
{ "id": "A", "label": "A", "kind": "point", "visible": true,
  "definition": { "type": "free", "x": 0, "y": 0 } }
```

```json
{ "id": "l1", "label": "l1", "kind": "line", "visible": true,
  "definition": { "type": "through_points", "pointA": "A", "pointB": "B" } }
```

```json
{ "id": "m", "label": "M", "kind": "point", "visible": true,
  "definition": { "type": "midpoint", "pointA": "A", "pointB": "B" } }
```

`kind` describes the rendered mathematical object; `definition.type` describes
how it is constructed. Thus midpoint and intersection definitions both evaluate
to point values.

### 4.3 Runtime evaluated values

Evaluated values are derived and may be cached, but definitions remain the
source of truth:

```ts
type EvaluatedValue =
  | { type: "point"; x: number; y: number }
  | { type: "line"; a: number; b: number; c: number }
  | { type: "segment"; start: PointValue; end: PointValue }
  | { type: "circle"; center: PointValue; radius: number }
  | { type: "undefined"; code: string; message: string };
```

Lines use normalized implicit form `a*x + b*y + c = 0`, with
`sqrt(a^2+b^2)=1` and a deterministic sign convention. This handles vertical
lines uniformly. Near-zero comparisons use a single configurable epsilon,
initially `1e-9` in world coordinates.

### 4.4 Dependency rules

| Definition | Parents | Output |
|---|---|---|
| free | none | point |
| through_points | two points | line |
| between_points | two points | segment |
| center_through_point | two points | circle |
| midpoint | two points | point |
| parallel_through | point + line | line |
| perpendicular_through | point + line | line |
| intersection | two supported curves | point or undefined |

For the MVP, intersection should initially support line-line only. Circle
intersections introduce zero/one/two-result cardinality and can follow later.

## 5. Construction scripting language

### 5.1 Design

The language is declarative, line-oriented, readable, and intentionally not
Python. It cannot import modules, access files, loop, or execute arbitrary code.
Each statement creates exactly one named construction.

```text
A = Point(0, 0)
B = Point(4, 0)
C = Point(2, 3)
l1 = Line(A, B)
s1 = Segment(A, B)
M = Midpoint(A, B)
h = PerpendicularLine(C, l1)
p = ParallelLine(M, l1)
c1 = Circle(A, C)
X = Intersection(h, p)
```

Comments begin with `#`. Blank lines are ignored.

### 5.2 Initial grammar

```ebnf
script      = { statement | comment | newline } ;
statement   = identifier, "=", constructor, "(", [ arguments ], ")", newline ;
constructor = "Point" | "Line" | "Segment" | "Circle" | "Midpoint"
            | "ParallelLine" | "PerpendicularLine" | "Intersection" ;
arguments   = argument, { ",", argument } ;
argument    = number | identifier | coordinate ;
coordinate  = "(", number, ",", number, ")" ;
identifier  = letter, { letter | digit | "_" } ;
number      = [ "-" ], digit, { digit }, [ ".", digit, { digit } ] ;
comment     = "#", { any-character-except-newline } ;
```

A `coordinate` literal `(x, y)` is syntactic sugar: when it appears in an argument position
that expects a *point*, the evaluator automatically creates a named free point with the given
coordinates and uses it by reference. The auto-generated label is the first available letter A–Z
(skipping already-occupied ids/labels), then `P1`, `P2`, … Auto-created points appear in the
document before the object that references them and are visible, draggable free points — identical
to points declared explicitly with `Point(x, y)`.

A `coordinate` in an argument position that expects a *line* (e.g. the second argument of
`ParallelLine`) is a parse error: lines cannot be auto-created from coordinates.

### 5.3 Evaluation phases

1. Tokenize and parse into an AST with source spans.
2. Validate constructor names and arity.
3. Resolve identifiers in declaration order.
4. Validate parent object types.
5. Build the dependency graph and reject cycles/duplicates.
6. Evaluate deterministic values.
7. Return the document plus structured diagnostics.

No partial document is committed when the script contains an error. A later
editor mode may return a best-effort preview separately.

## 6. API design

All APIs use versioned Pydantic request/response models and structured errors.

| Endpoint | Purpose |
|---|---|
| `POST /geometry/evaluate-script` | Parse and evaluate script into a document |
| `POST /geometry/validate` | Validate schema, graph, and evaluated invariants |
| `POST /symbolic/simplify` | Safely parse and simplify an expression |
| `POST /symbolic/solve` | Solve equation(s) for requested symbol(s) |
| `POST /agent/plan` | Produce a typed, unexecuted plan and proposed script |

Example plan response:

```json
{
  "summary": "Construct triangle ABC and its altitude from C.",
  "steps": [
    { "tool": "create_point", "arguments": { "label": "A", "x": 0, "y": 0 } },
    { "tool": "create_point", "arguments": { "label": "B", "x": 4, "y": 0 } },
    { "tool": "create_point", "arguments": { "label": "C", "x": 2, "y": 3 } },
    { "tool": "create_line", "arguments": { "label": "AB", "pointA": "A", "pointB": "B" } },
    { "tool": "create_perpendicular_line", "arguments": { "label": "h", "point": "C", "line": "AB" } }
  ],
  "script": "A = Point(0, 0)\nB = Point(4, 0)\nC = Point(2, 3)\nAB = Line(A, B)\nh = PerpendicularLine(C, AB)"
}
```

The plan is a proposal. Execution is a separate action so the UI can preview it.

## 7. Agent and tool protocol

### 7.1 Tool definition

```python
ToolDefinition(
    name="create_midpoint",
    description="Create the midpoint of two existing points",
    input_model=CreateMidpointInput,
    output_model=GeometryMutationResult,
    handler=create_midpoint,
    mutates_state=True,
)
```

The registry supports discovery, JSON-schema export, argument validation,
execution, and audit metadata. That maps naturally to a future MCP server.

The implemented workspace stages every mutation in a candidate
`GeometryDocument`, validates its schema and dependency graph, and commits only
on success. Agent reads use an immutable `GraphAccessMap` with ID and label
indexes; HTTP responses are detached snapshots rather than mutable state
references.

Initial tools:

- `create_point`
- `create_line`
- `create_segment`
- `create_circle`
- `create_midpoint`
- `create_parallel_line`
- `create_perpendicular_line`
- `intersect_objects`
- `simplify_expression`
- `solve_equation`
- `validate_construction`

### 7.2 Agent flow

```text
User request
  -> intent analysis
  -> typed plan
  -> schema-validated tool selection
  -> deterministic execution
  -> construction validation
  -> explanation based on verified results
```

Every tool result records success/failure, diagnostics, and document revision.
A failed validation prevents state commit. Tool handlers do not depend on an LLM.

### 7.3 Rule-based MVP examples

The first planner recognizes constrained patterns such as:

- “Create a triangle ABC”
- “Construct the midpoint of AB”
- “Draw the perpendicular from C to AB”
- “Create the circle centered at A through C”

Ambiguous requests return clarification diagnostics rather than invented object
references. A real LLM later plugs into the same `AgentPlanner` interface.

The implemented assistant follows an approval boundary: the planner receives a
serialized snapshot of the current construction, returns a complete validated
script and structured plan, and the frontend only applies that script after an
explicit click. Application always goes through `/geometry/evaluate-script`;
the planner never mutates geometry state.

## 8. Symbolic and Python safety

SymPy input is parsed through an allowlist of symbols, functions, and operators;
never with unrestricted `eval`. Requests have expression-size and execution-time
limits. Results return both a canonical machine form and display-friendly text.

Arbitrary Python execution is not part of the MVP. The future execution service
must be a separate isolated process/container with:

- CPU, wall-time, memory, output, and process limits.
- No network by default.
- Ephemeral filesystem and no host credentials.
- An allowlisted package environment.
- Structured inputs/outputs instead of shared application memory.

## 9. Testing strategy

### Frontend

- Unit tests for vector/line math and coordinate transforms.
- Graph tests for topological recomputation and invalid dependencies.
- Parser fixture tests when a local parser is added.
- Component interaction tests for tool selection and dragging.
- End-to-end test for script -> canvas -> drag -> dependent update.

### Backend

- Pure geometry calculation tests, including degeneracies.
- Parser syntax and semantic error tests with source positions.
- Dependency recomputation tests.
- SymPy simplify/solve tests and unsafe-input rejection tests.
- Rule-based planner tests.
- API contract tests.

### Cross-runtime

Shared JSON fixtures define constructions and expected evaluated values. Both
runtimes must satisfy the same tolerances and diagnostic codes.

## 10. Planned implementation sequence

1. Define versioned schemas and shared conformance fixtures.
2. Implement pure geometry primitives and dependency graph in Python and TS.
3. Implement script parser and backend geometry endpoints.
4. Build SVG viewport and render evaluated document state.
5. Add interactive construction tools and free-point dragging.
6. Add safe SymPy services and endpoints.
7. Implement tool registry, rule-based planner, and assistant UI.
8. Add local JSON persistence, examples, integration tests, and polish.

## 11. Extension seams

- New geometry construction: add a definition variant, validator, evaluator,
  renderer mapping, script constructor, tool definition, and conformance fixture.
- Algebra/functions: add typed mathematical artifacts to a workspace document
  rather than forcing them into geometry objects.
- MCP: expose registry schemas and handlers through an adapter.
- Real LLM: implement `LLMPlanner`; retain the same executor and validators.
- Collaboration/database: replace `JsonDocumentRepository` behind a repository
  interface; keep document schema and domain services unchanged.
