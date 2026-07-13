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

### 2.4 Local-first and authenticated cloud persistence

Every construction remains a versioned JSON document. The browser keeps a
debounced `localStorage` autosave and supports explicit local save/load plus
portable JSON and construction-script exports. Signed-in users can additionally
store documents in PostgreSQL through authenticated `/documents` CRUD.

The document table owns persistence metadata (`id`, owner, timestamps) and its
`title` column is canonical. Create/update/detail responses normalize the nested
geometry payload to that title so browser and database state cannot silently
diverge. Cloud lists are currently unpaginated.

### 2.5 Agent behind a planner interface

`Planner` receives user text plus the current construction script and produces a
typed plan and replacement script. The UI supports Hugging Face, OpenAI, and
NVIDIA through an OpenAI-compatible planner. Server-side/legacy selection also
supports Ollama, Claude, and `RuleBasedPlanner`. All implementations share the
same validation/repair boundary and cannot directly mutate browser state.

### 2.6 Google identity and GeoLab sessions

The browser obtains a Google ID credential and sends it once to
`POST /auth/google`. The backend validates audience/signature, upserts the user,
and issues its own signed JWT in an HttpOnly cookie. Cookie `Secure`/`SameSite`
settings derive from validated `APP_ENV`; CORS uses an explicit credentialed
origin allowlist. Authenticated document routes always scope rows by user ID.

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
| API clients | Typed geometry, auth, and document HTTP boundaries |
| Persistence hooks | Debounced local autosave and cloud document workflows |
| Auth hook | Restore/login/logout UI session state without exposing the JWT |

### Backend

| Component | Responsibility |
|---|---|
| FastAPI composition root | Configuration, CORS, routers, exception mapping |
| Geometry parser | Parse the construction language into a typed AST |
| Geometry service | Evaluate AST, construct document, validate graph |
| Geometry tools | Pure operations such as line coefficients/intersections |
| Symbolic tools | Parse allowlisted SymPy syntax, simplify, solve, serialize |
| Tool registry | Declare names, descriptions, schemas, handlers, side effects |
| Agent planners | Convert intent into a validated proposed construction script |
| Auth service | Verify Google identity and issue/verify session cookies |
| Document service | User-scoped SQLAlchemy CRUD over PostgreSQL |
| MCP adapter | Stateless deterministic tools, exports, and geometry widget |

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
  | { type: "arc"; center: PointValue; radius: number; start: PointValue; mid: PointValue; end: PointValue }
  | { type: "polygon"; vertices: PointValue[] }
  | { type: "function"; expression: string }
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
| polygon_vertex | polygon + zero-based index | point or undefined |
| parallel_through | point + line | line |
| perpendicular_through | point + line | line |
| intersection_ll | two lines | point or undefined |
| intersection_lc | line + circle + index/selector | point or undefined |
| intersection_cc | two circles + index/selector | point or undefined |
| arc_through_points | three points | arc or undefined |
| polygon / regular_polygon / vector_polygon | point parents or anchor | polygon |

Line-line, line-circle, and circle-circle intersections are implemented.
Multi-solution circle intersections use either a deterministic numeric index or
a directional selector. Arc values are validated and preserved by the backend,
but its SVG/PNG exporter does not yet draw them; the frontend renderer does.

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
constructor = "Point" | "Line" | "Segment" | "Circle" | "Midpoint" | "Vertex"
            | "ParallelLine" | "PerpendicularLine"
            | "Intersection" | "IntersectionLL" | "IntersectionLC" | "IntersectionCC"
            | "PerpendicularBisector" | "AngleBisector" | "Circumcircle"
            | "Reflection" | "Homothety" | "Inversion" | "Translation" | "Rotation"
            | "Arc" | "Function" | "Polygon" | "VectorPolygon" ;
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
| `POST /agent/plan` | Produce a typed, unexecuted plan and proposed script |
| `GET /agent/tools` | Discover deterministic tool JSON schemas |
| `POST /agent/execute-tool` | Execute one validated tool against the REST workspace |
| `POST /auth/google` / `POST /auth/logout` / `GET /auth/me` | Session lifecycle |
| `/documents` CRUD | User-scoped PostgreSQL document persistence |
| `POST /mcp` | Stateless MCP Streamable HTTP transport |

Example plan response:

```json
{
  "reasoning": "Construct the triangle, its base line, and the perpendicular through C.",
  "plan": [
    "Create points A, B, and C.",
    "Create line AB.",
    "Create the perpendicular through C."
  ],
  "generatedScript": "A = Point(0, 0)\nB = Point(4, 0)\nC = Point(2, 3)\nAB = Line(A, B)\nh = PerpendicularLine(C, AB)",
  "warnings": []
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

### 7.3 Planner implementations

The rule-based planner recognizes constrained patterns such as:

- “Create a triangle ABC”
- “Construct the midpoint of AB”
- “Draw the perpendicular from C to AB”
- “Create the circle centered at A through C”

Ambiguous requests return clarification diagnostics rather than invented object
references. OpenAI-compatible, Ollama, and Claude planners plug into the same
interface and must return the same structured proposal.

The implemented assistant follows an approval boundary: the planner receives a
serialized snapshot of the current construction, returns a complete validated
script and structured plan, and the frontend only applies that script after an
explicit click. Application always goes through `/geometry/evaluate-script`;
the planner never mutates geometry state.

### 7.4 State lifetimes and MCP

The public MCP tools are stateless. Each mutation creates a temporary workspace
from the input `document` (or an empty document), and the caller must pass the
returned snapshot into the next tool. MCP therefore does not share construction
state between sessions.

`POST /geometry/graph` and `POST /agent/execute-tool` are likewise stateless:
each call builds a fresh `GeometryWorkspace` from the request's `document`
field (or an empty document when omitted) and returns the resulting document
in the response, exactly the pattern MCP already used. Neither endpoint holds
any process-global construction state, is authenticated, or is user-scoped.
User-owned durable documents use the separate authenticated PostgreSQL routes.

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
- Hook/component tests for session failure handling, cloud title coherence,
  debounced autosave, and bounded undo history.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` are the
  supported frontend checks.

### Backend

- Pure geometry calculation tests, including degeneracies.
- Parser syntax and semantic error tests with source positions.
- Dependency recomputation tests.
- SymPy simplify/solve tests and unsafe-input rejection tests.
- Rule-based planner tests.
- API contract tests.
- Auth/JWT, configuration validation, CORS, and user-isolated document CRUD
  tests.
- `.venv/bin/ruff check app tests` and `.venv/bin/pytest` are the supported
  backend checks.

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
- Collaboration: add an explicitly user/session-scoped workspace and realtime
  protocol; do not extend the current process-global REST workspace.
- Persistence scale: add cloud-list pagination without changing the versioned
  geometry payload or title-canonicalization rule.
