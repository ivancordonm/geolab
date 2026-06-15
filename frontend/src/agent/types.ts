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

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}
