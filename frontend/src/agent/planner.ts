import type {
  AgentPlanErrorDetail,
  AgentPlanRequest,
  AgentResponse,
  PlanStreamEvent,
  ToolCallPlanRequest,
  ToolCallPlanResult,
} from "./types";

export interface PlannerClient {
  generatePlan(request: AgentPlanRequest, signal?: AbortSignal): Promise<AgentResponse>;
  planWithTools(
    request: ToolCallPlanRequest,
    signal?: AbortSignal,
  ): Promise<ToolCallPlanResult>;
}

export class AgentPlanningError extends Error {
  readonly detail: AgentPlanErrorDetail | null;

  constructor(message: string, detail: AgentPlanErrorDetail | null = null) {
    super(message);
    this.name = "AgentPlanningError";
    this.detail = detail;
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class HttpPlannerClient implements PlannerClient {
  async generatePlan(request: AgentPlanRequest, signal?: AbortSignal): Promise<AgentResponse> {
    return postPlan<AgentResponse>("/agent/plan", request, signal);
  }

  async planWithTools(
    request: ToolCallPlanRequest,
    signal?: AbortSignal,
  ): Promise<ToolCallPlanResult> {
    return postPlan<ToolCallPlanResult>("/agent/plan-with-tools", request, signal);
  }
}

export const plannerClient: PlannerClient = new HttpPlannerClient();

/**
 * Consume the `/agent/plan-stream` SSE endpoint as an async iterable of parsed
 * events. `EventSource` only supports GET, but this is a POST with a JSON body,
 * so we drive a manual `fetch` + `ReadableStream` reader and parse the standard
 * two-field SSE frames (`event:` name line + `data:` JSON line, blank-line
 * separated) the backend emits.
 *
 * Errors surfaced by the planner arrive as an in-band `{ event: "error" }`
 * event (headers are already sent once streaming starts, so failures cannot be
 * an HTTP status). A non-2xx response *before* streaming begins still throws
 * `AgentPlanningError`, matching `postPlan`.
 */
export async function* planStream(
  request: ToolCallPlanRequest,
  signal?: AbortSignal,
): AsyncGenerator<PlanStreamEvent> {
  const response = await fetch(`${API_BASE}/agent/plan-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok || response.body === null) {
    const payload = (await readJson(response)) as { detail?: unknown } | null;
    const detail = isAgentPlanErrorDetail(payload?.detail) ? payload.detail : null;
    throw new AgentPlanningError(
      detail?.message ?? `Streaming plan failed with status ${response.status}`,
      detail,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      // Frames are separated by a blank line ("\n\n").
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const parsed = parseSseFrame(frame);
        if (parsed !== null) {
          yield parsed;
        }
        separator = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseFrame(frame: string): PlanStreamEvent | null {
  let eventName: string | null = null;
  let dataText: string | null = null;
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataText = line.slice("data:".length).trim();
    }
  }
  if (eventName === null || dataText === null) {
    return null;
  }
  try {
    return { event: eventName, data: JSON.parse(dataText) } as PlanStreamEvent;
  } catch {
    return null;
  }
}

async function postPlan<T>(path: string, request: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    const payload = (await readJson(response)) as { detail?: unknown } | null;
    const detail = isAgentPlanErrorDetail(payload?.detail) ? payload.detail : null;
    throw new AgentPlanningError(
      detail?.message ?? `Planning failed with status ${response.status}`,
      detail,
    );
  }
  return (await response.json()) as T;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isAgentPlanErrorDetail(value: unknown): value is AgentPlanErrorDetail {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const detail = value as Partial<AgentPlanErrorDetail>;
  return typeof detail.code === "string" && typeof detail.message === "string";
}

