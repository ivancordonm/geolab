import type { AgentPlanErrorDetail, AgentPlanRequest, AgentResponse } from "./types";

export interface PlannerClient {
  generatePlan(request: AgentPlanRequest, signal?: AbortSignal): Promise<AgentResponse>;
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
    const response = await fetch(`${API_BASE}/agent/plan`, {
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
    return (await response.json()) as AgentResponse;
  }
}

export const plannerClient: PlannerClient = new HttpPlannerClient();

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

