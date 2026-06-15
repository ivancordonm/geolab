import { useState } from "react";
import type { AssistantConfig, ProviderName } from "./types";
import { PROVIDER_DEFAULTS } from "./types";

const STORAGE_KEY = "geolab_assistant_config";
const API_KEY_STORAGE_KEY = "geolab_assistant_api_key";
const MODEL_STORAGE_KEY = "geolab_assistant_models";
const REMEMBER_KEY_STORAGE = "geolab_assistant_remember_key";

type ApiKeys = Record<ProviderName, string>;
export type AssistantModels = Record<ProviderName, string>;

const EMPTY_API_KEYS: ApiKeys = { ollama: "", openai: "", nvidia: "" };
const DEFAULT_MODELS: AssistantModels = {
  ollama: PROVIDER_DEFAULTS.ollama.model,
  openai: PROVIDER_DEFAULTS.openai.model,
  nvidia: PROVIDER_DEFAULTS.nvidia.model,
};

/** Parse the raw value from storage into a per-provider api-key map.
 *
 * Handles two legacy formats:
 *  - A plain string (old single-key format): assigned to `fallbackProvider`.
 *  - A JSON object with provider keys (current format): used as-is.
 */
function parseApiKeys(raw: string | null, fallbackProvider: ProviderName): ApiKeys {
  if (raw === null || raw === "") return { ...EMPTY_API_KEYS };
  // Legacy: plain string (not JSON object)
  if (!raw.startsWith("{")) {
    return { ...EMPTY_API_KEYS, [fallbackProvider]: raw };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ApiKeys>;
    return {
      ollama: typeof parsed.ollama === "string" ? parsed.ollama : "",
      openai: typeof parsed.openai === "string" ? parsed.openai : "",
      nvidia: typeof parsed.nvidia === "string" ? parsed.nvidia : "",
    };
  } catch {
    return { ...EMPTY_API_KEYS };
  }
}

function parseModels(raw: string | null): AssistantModels {
  if (raw === null || raw === "") return { ...DEFAULT_MODELS };
  try {
    const parsed = JSON.parse(raw) as Partial<AssistantModels>;
    return {
      ollama: typeof parsed.ollama === "string" && parsed.ollama ? parsed.ollama : DEFAULT_MODELS.ollama,
      openai: typeof parsed.openai === "string" && parsed.openai ? parsed.openai : DEFAULT_MODELS.openai,
      nvidia: typeof parsed.nvidia === "string" && parsed.nvidia ? parsed.nvidia : DEFAULT_MODELS.nvidia,
    };
  } catch {
    return { ...DEFAULT_MODELS };
  }
}

function loadConfig(): {
  config: AssistantConfig;
  remember: boolean;
  apiKeys: ApiKeys;
  models: AssistantModels;
} {
  let base: AssistantConfig = PROVIDER_DEFAULTS.ollama;
  let legacyApiKey = "";
  let legacyModel = "";

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = JSON.parse(stored) as Partial<AssistantConfig>;
      if (parsed.provider && parsed.provider in PROVIDER_DEFAULTS) {
        const defaults = PROVIDER_DEFAULTS[parsed.provider];
        // Capturar key legada del blob antes de sanearla
        if (typeof parsed.apiKey === "string" && parsed.apiKey) {
          legacyApiKey = parsed.apiKey;
        }
        if (typeof parsed.model === "string" && parsed.model) {
          legacyModel = parsed.model;
        }
        base = {
          ...defaults,
          ...parsed,
          apiKey: "", // el secreto ya no vive en el blob general
          temperature:
            typeof parsed.temperature === "number" && Number.isFinite(parsed.temperature)
              ? Math.min(2, Math.max(0, parsed.temperature))
              : defaults.temperature,
        };
      }
    }
  } catch {
    // almacenamiento corrupto — volver al default
  }

  // Leer preferencia remember (default true = compatible hacia atrás)
  const rememberRaw = localStorage.getItem(REMEMBER_KEY_STORAGE);
  const remember = rememberRaw === null ? true : rememberRaw === "1";

  // Leer el mapa de API keys del almacenamiento correcto según la preferencia
  let apiKeys: ApiKeys = { ...EMPTY_API_KEYS };
  try {
    const raw = remember
      ? localStorage.getItem(API_KEY_STORAGE_KEY)
      : sessionStorage.getItem(API_KEY_STORAGE_KEY);
    apiKeys = parseApiKeys(raw, base.provider);
  } catch {
    // almacenamiento no disponible
  }

  // Migración: si no hay key en el mapa pero el blob legado la tenía, asignarla al provider actual
  if (!apiKeys[base.provider] && legacyApiKey) {
    apiKeys = { ...apiKeys, [base.provider]: legacyApiKey };
  }

  let models = { ...DEFAULT_MODELS };
  try {
    models = parseModels(localStorage.getItem(MODEL_STORAGE_KEY));
  } catch {
    // storage unavailable
  }
  if (legacyModel) {
    models = { ...models, [base.provider]: legacyModel };
  }

  return {
    config: { ...base, model: models[base.provider], apiKey: apiKeys[base.provider] },
    remember,
    apiKeys,
    models,
  };
}

export function useAssistantConfig(): [
  AssistantConfig,
  (c: AssistantConfig, remember: boolean) => void,
  boolean,
  ApiKeys,
  AssistantModels,
] {
  const [state, setState] = useState<{
    config: AssistantConfig;
    remember: boolean;
    apiKeys: ApiKeys;
    models: AssistantModels;
  }>(loadConfig);

  const setConfig = (c: AssistantConfig, newRemember: boolean): void => {
    try {
      // El blob de config se guarda siempre en localStorage, pero sin la key
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...c, apiKey: "" }));
    } catch {
      // almacenamiento lleno o no disponible — mantener en memoria
    }
    try {
      localStorage.setItem(REMEMBER_KEY_STORAGE, newRemember ? "1" : "0");
    } catch {
      // almacenamiento lleno
    }

    // Actualizar solo la key del provider activo; preservar las demás
    const updatedKeys: ApiKeys = { ...state.apiKeys, [c.provider]: c.apiKey };
    const updatedModels: AssistantModels = { ...state.models, [c.provider]: c.model };

    try {
      localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(updatedModels));
    } catch {
      // storage unavailable
    }

    try {
      const serialized = JSON.stringify(updatedKeys);
      if (newRemember) {
        // Persistir en localStorage y limpiar sessionStorage
        localStorage.setItem(API_KEY_STORAGE_KEY, serialized);
        sessionStorage.removeItem(API_KEY_STORAGE_KEY);
      } else {
        // Persistir en sessionStorage y limpiar localStorage (no dejar secreto olvidado)
        sessionStorage.setItem(API_KEY_STORAGE_KEY, serialized);
        localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
    } catch {
      // almacenamiento no disponible
    }

    setState({ config: c, remember: newRemember, apiKeys: updatedKeys, models: updatedModels });
  };

  return [state.config, setConfig, state.remember, state.apiKeys, state.models];
}
