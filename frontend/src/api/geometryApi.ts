import type {
  EvaluateScriptRequest,
  EvaluateScriptResponse,
  ScriptErrorDetail,
} from "../types/script";
import type {
  ExecuteToolRequest,
  ExecuteToolResponse,
  GraphResponse,
} from "../types/tools";
import type { GeometryDocument } from "../types/geometry";

export class ScriptEvaluationError extends Error {
  readonly detail: ScriptErrorDetail | null;

  constructor(message: string, detail: ScriptErrorDetail | null = null) {
    super(message);
    this.name = "ScriptEvaluationError";
    this.detail = detail;
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function evaluateConstructionScript(
  request: EvaluateScriptRequest,
  signal?: AbortSignal,
): Promise<EvaluateScriptResponse> {
  const response = await fetch(`${API_BASE}/geometry/evaluate-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const payload = (await readJson(response)) as { detail?: unknown } | null;
    const detail = isScriptErrorDetail(payload?.detail) ? payload.detail : null;
    throw new ScriptEvaluationError(
      detail?.message ?? `Script evaluation failed with status ${response.status}`,
      detail,
    );
  }

  return (await response.json()) as EvaluateScriptResponse;
}

/**
 * Fetch a read-only graph snapshot for *document* (or an empty construction
 * when omitted). Stateless: the backend builds a fresh workspace per call —
 * no server-held state is read or mutated. Returns both the evaluated graph
 * and the (unmodified) document, matching `/geometry/graph`'s response shape.
 *
 * Typed surface only: no call site wires this into the UI yet. See Task 5 of
 * the medio-plazo plan — the frontend does not call this endpoint today.
 */
export async function getGeometryGraph(
  document?: GeometryDocument | null,
  signal?: AbortSignal,
): Promise<GraphResponse> {
  const response = await fetch(`${API_BASE}/geometry/graph`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document: document ?? null }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch geometry graph with status ${response.status}`);
  }

  return (await response.json()) as GraphResponse;
}

/**
 * Validate and execute one deterministic agent tool call. Stateless: pass the
 * document returned by the previous call (or omit it to start fresh) and
 * thread the response's `document` into the next call.
 *
 * Typed surface only: no call site wires this into the UI yet. See Task 5 of
 * the medio-plazo plan — the frontend does not call this endpoint today.
 */
export async function executeTool(
  request: ExecuteToolRequest,
  signal?: AbortSignal,
): Promise<ExecuteToolResponse> {
  const response = await fetch(`${API_BASE}/agent/execute-tool`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const detail = (await readJson(response)) as { detail?: unknown } | null;
    throw new Error(
      `Tool execution failed with status ${response.status}: ${JSON.stringify(detail?.detail ?? detail)}`,
    );
  }

  return (await response.json()) as ExecuteToolResponse;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isScriptErrorDetail(value: unknown): value is ScriptErrorDetail {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const detail = value as Partial<ScriptErrorDetail>;
  return (
    typeof detail.code === "string" &&
    typeof detail.message === "string" &&
    typeof detail.line === "number" &&
    typeof detail.column === "number" &&
    typeof detail.sourceLine === "string"
  );
}

