# GeoLab

GeoLab is an agentic mathematics workspace for reproducible 2D geometry. The
React application provides an interactive SVG canvas and a declarative
construction language; FastAPI validates scripts and exposes deterministic
geometry tools to the assistant, REST clients, and MCP clients.

The central rule is: **an LLM may propose a construction, but deterministic
code validates and applies it**.

## Current capabilities

- A versioned `GeometryDocument` dependency graph shared by the TypeScript and
  Python runtimes.
- Interactive points, lines, segments, circles, polygons, arcs, functions,
  transformations, intersections, undo/redo, labels, styles, and pan/zoom.
- Construction-script evaluation and dependency-ordered script export.
- Debounced browser autosave plus explicit local save/load and JSON import/export.
- Google Sign-In. GeoLab exchanges the Google credential for an HttpOnly,
  signed session cookie; frontend JavaScript does not store the session JWT.
- Per-user cloud documents in PostgreSQL through SQLAlchemy and Alembic. The
  document-row title is canonical when a saved payload and row disagree.
- Assistant planning through Hugging Face, OpenAI, and NVIDIA
  OpenAI-compatible endpoints selected in the UI. Legacy server configuration
  also supports Ollama, Claude, and the rule-based planner.
- Deterministic tool discovery/execution over REST and a stateless MCP
  Streamable HTTP endpoint with SVG/PNG/JSON export and a geometry widget.

## Architecture

```text
Browser (React + TypeScript)
  ├─ GeometryGraph ──> evaluated values ──> SVG renderer
  ├─ localStorage autosave / JSON import-export and script export
  ├─ Google credential ──> /auth/google ──> HttpOnly session cookie
  ├─ authenticated /documents CRUD ───────> PostgreSQL
  └─ assistant request ──> /agent/plan ──> provider proposes a script
                                      └──> Python evaluator validates it

FastAPI
  ├─ geometry parser, graph, renderers, and deterministic tool registry
  ├─ agent planners (OpenAI-compatible, Ollama, Claude, rules)
  ├─ auth + document routers
  ├─ SQLAlchemy / Alembic persistence
  └─ stateless MCP adapter at /mcp
```

The browser owns low-latency interaction. Applying an assistant proposal is a
separate user action and always passes through `/geometry/evaluate-script`.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for component boundaries and
known state-lifetime constraints.

## Repository layout

```text
frontend/src/
  api/             typed REST clients
  auth/            Google Sign-In and session state
  components/      canvas, panels, toolbar, assistant, persistence UI
  geometry/        graph, evaluators, tools, viewport, serialization
  persistence/     local and cloud persistence hooks
backend/app/
  agent/            planners, schemas, registry, deterministic tools
  auth/             Google verification, JWT cookie, dependencies, router
  documents/        authenticated PostgreSQL document CRUD
  geometry/         Pydantic model, script parser, graph, rendering, router
  config.py         validated environment configuration
  db.py             SQLAlchemy session setup
  mcp_server.py     stateless MCP tools and resources
backend/alembic/    database migrations
shared/fixtures/    cross-runtime geometry fixtures
```

## Local development

### Frontend

Requires Node.js 20+.

```bash
cd frontend
npm install
cp .env.example .env       # set VITE_GOOGLE_CLIENT_ID when testing auth
npm run dev
```

Vite normally serves `http://localhost:5173` and proxies the application API
paths to `http://127.0.0.1:8000`.

### Backend

Requires Python 3.11+ and PostgreSQL for auth/document workflows.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

Relevant backend variables:

- `STORAGE_DATABASE_URL`: PostgreSQL connection string.
- `GOOGLE_CLIENT_ID`: Web OAuth client ID accepted by the backend.
- `JWT_SECRET`: secret for GeoLab session JWTs (use at least 32 random bytes).
- `JWT_EXPIRE_DAYS`: positive integer.
- `APP_ENV`: `development` or `production`; controls cookie security.
- `FRONTEND_ORIGIN`: non-empty comma-separated CORS allowlist.
- `COOKIE_DOMAIN`: optional shared cookie domain for split frontend/API hosts.
- `MATHLLM_LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL`, and
  `OLLAMA_MODEL`: legacy server-side planner configuration.

The frontend assistant sends its selected OpenAI-compatible base URL, model,
and API key with the planning request. “Remember key” controls whether the
browser uses local or session storage; do not enable it on an untrusted device.

## Production deployment (Vercel)

Two separate Vercel projects, each with a custom subdomain of `anticentro.es`:

| Project  | Custom domain                | Raw Vercel URL             |
|----------|------------------------------|----------------------------|
| Frontend | `geolab.anticentro.es`       | `geolab-seven.vercel.app`  |
| Backend  | `geolab-api.anticentro.es`   | (FastAPI)                  |

**The frontend must reach the backend through its custom domain, same-origin —
never through the raw `*.vercel.app` URL.** The session cookie (`geolab_session`)
is `HttpOnly; Secure; SameSite=None`. If the browser calls
`geolab-seven.vercel.app` from a page on `geolab.anticentro.es`, the request is
cross-site (`vercel.app` ≠ `anticentro.es`), so the cookie is third-party and
gets dropped by Safari/ITP and third-party-cookie blockers — the session is lost
on every tab/browser close.

To keep the cookie first-party, `frontend/vercel.json` proxies `/auth`,
`/documents`, `/geometry`, and `/agent` same-origin to
`https://geolab-api.anticentro.es`. **Each prefix needs two rewrite rules**: the
bare collection path (`/documents`) *and* the wildcard (`/documents/:path*`).
Vercel's `:path*` does not match the bare collection root, so a single
`/documents/:path*` rule leaves `GET /documents` (list) and `POST /documents`
(create) falling through to the SPA and returning 404 — even though
`PUT /documents/:id` works. Required environment configuration:

- **Frontend project:** leave `VITE_API_BASE_URL` **empty** so API calls are
  relative and hit the same origin (then get proxied). Setting it to any
  `*.vercel.app` URL reintroduces the third-party-cookie bug.
- **Backend project:** `COOKIE_DOMAIN` unset (host-only on
  `geolab.anticentro.es`, recommended) or `.anticentro.es`; `APP_ENV=production`;
  and `FRONTEND_ORIGIN` including `https://geolab.anticentro.es`.

Verify after deploy: DevTools → Network shows `/auth/me` going to
`geolab.anticentro.es` (not `*.vercel.app`), and Application → Cookies shows
`geolab_session` with a real `Expires` date (not `Session`).

## HTTP and MCP surfaces

Important REST routes:

- `POST /geometry/evaluate-script`, `POST /geometry/graph`
- `POST /agent/plan`, `GET /agent/tools`, `POST /agent/execute-tool`
- `POST /agent/plan-with-tools` (Claude native tool-calling planner), `POST /agent/plan-stream` (SSE streaming variant)
- `POST /auth/google`, `POST /auth/logout`, `GET /auth/me`
- authenticated CRUD under `/documents`
- `GET /health`

MCP is mounted at `POST /mcp`. Its construction tools are stateless: begin with
`document: null` and pass the returned document to every subsequent call.
Use the explicit intersection tools rather than calculating coordinates, then
validate and render the final graph. The repository currently deploys the
connector at `https://geolab-seven.vercel.app/mcp`.

## Checks

```bash
cd frontend
npm run lint
npm run typecheck
npm test
npm run build

cd ../backend
.venv/bin/ruff check app tests
.venv/bin/pytest
```

## Important limitations

- `POST /geometry/graph` and `POST /agent/execute-tool` are stateless: each
  call builds a fresh in-memory workspace from the `document` in the request
  body and returns the resulting `document` for the caller to thread into the
  next call, mirroring the MCP tools. Neither endpoint holds server-side
  construction state or is user-scoped; authenticated cloud documents are
  separate and live in PostgreSQL.
- There is no multi-user realtime collaboration, pagination for cloud document
  lists, formal theorem prover, arbitrary Python execution, or 3D engine.
- The TypeScript and Python geometry engines intentionally duplicate domain
  evaluation for latency and server authority; shared fixtures limit drift.
- Arc definitions and values are preserved and evaluated by both runtimes, but
  backend SVG/PNG exports do not yet draw arcs; the interactive frontend does.
- LLM output remains probabilistic even though every returned construction
  script is deterministically validated.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the medium- and long-term plan.
