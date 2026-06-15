export type ProviderName = "ollama" | "openai" | "nvidia";

export interface AssistantConfig {
  provider: ProviderName;
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
}

export const PROVIDER_DEFAULTS: Record<ProviderName, AssistantConfig> = {
  ollama: {
    provider: "ollama",
    model: "llama3.1",
    baseUrl: "http://localhost:11434",
    apiKey: "",
    temperature: 0,
  },
  openai: {
    provider: "openai",
    model: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    temperature: 1,
  },
  nvidia: {
    provider: "nvidia",
    model: "meta/llama-3.1-70b-instruct",
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
