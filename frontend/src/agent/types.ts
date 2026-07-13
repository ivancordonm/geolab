export type ProviderName = "huggingface" | "openai" | "nvidia";

export interface AssistantConfig {
  provider: ProviderName;
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
}

export const PROVIDER_DEFAULTS: Record<ProviderName, AssistantConfig> = {
  huggingface: {
    provider: "huggingface",
    model: "MiniMaxAI/MiniMax-M3:novita",
    baseUrl: "https://router.huggingface.co/v1",
    apiKey: "",
    temperature: 1,
  },
  openai: {
    provider: "openai",
    model: "gpt-5.4-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    temperature: 1,
  },
  nvidia: {
    provider: "nvidia",
    model: "openai/gpt-oss-120b",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    apiKey: "",
    temperature: 1,
  },
};

export interface AgentPlanRequest {
  userRequest: string;
  currentScript?: string;
  config: AssistantConfig;
}

export interface AgentResponse {
  reasoning: string;
  plan: string[];
  generatedScript: string;
  warnings: string[];
}

export interface AgentPlanErrorDetail {
  code: string;
  message: string;
}

export interface ToolCallProposal {
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallPlanRequest {
  userRequest: string;
  document?: unknown;
}

export interface ToolCallPlanResult {
  reasoning: string;
  toolCalls: ToolCallProposal[];
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/**
 * Events streamed by `/agent/plan-stream` (SSE). Event names and payload keys
 * mirror the backend wire format exactly. The planner only *proposes*: there is
 * deliberately no server-side execution event. `thinking` deltas arrive as
 * reasoning text streams; `tools_selected` and `done` carry the same proposal
 * data the non-streaming `/agent/plan-with-tools` returns; `error` replaces
 * them on refusal, empty plan, or transport failure.
 */
export type PlanStreamEvent =
  | { event: "thinking"; data: { delta: string } }
  | { event: "tools_selected"; data: { tool_calls: ToolCallProposal[] } }
  | { event: "done"; data: ToolCallPlanResult }
  | { event: "error"; data: AgentPlanErrorDetail };
