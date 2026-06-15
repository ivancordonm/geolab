import { useState } from "react";
import type { AssistantConfig } from "./types";
import { PROVIDER_DEFAULTS } from "./types";

const STORAGE_KEY = "mathllm_assistant_config";

function loadConfig(): AssistantConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = JSON.parse(stored) as Partial<AssistantConfig>;
      if (parsed.provider && parsed.provider in PROVIDER_DEFAULTS) {
        const defaults = PROVIDER_DEFAULTS[parsed.provider];
        return {
          ...defaults,
          ...parsed,
          temperature:
            typeof parsed.temperature === "number" && Number.isFinite(parsed.temperature)
              ? Math.min(2, Math.max(0, parsed.temperature))
              : defaults.temperature,
        };
      }
    }
  } catch {
    // corrupted storage — reset to default
  }
  return PROVIDER_DEFAULTS.ollama;
}

export function useAssistantConfig(): [AssistantConfig, (c: AssistantConfig) => void] {
  const [config, setConfigState] = useState<AssistantConfig>(loadConfig);

  const setConfig = (c: AssistantConfig): void => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } catch {
      // storage full or unavailable — keep in memory only
    }
    setConfigState(c);
  };

  return [config, setConfig];
}
