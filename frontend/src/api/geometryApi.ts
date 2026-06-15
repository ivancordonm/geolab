import type {
  EvaluateScriptRequest,
  EvaluateScriptResponse,
  ScriptErrorDetail,
} from "../types/script";

export class ScriptEvaluationError extends Error {
  readonly detail: ScriptErrorDetail | null;

  constructor(message: string, detail: ScriptErrorDetail | null = null) {
    super(message);
    this.name = "ScriptEvaluationError";
    this.detail = detail;
  }
}

export async function evaluateConstructionScript(
  request: EvaluateScriptRequest,
  signal?: AbortSignal,
): Promise<EvaluateScriptResponse> {
  const response = await fetch("/geometry/evaluate-script", {
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

