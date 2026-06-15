import { useState } from "react";
import type { AssistantConfig, ProviderName } from "./types";
import { PROVIDER_DEFAULTS } from "./types";

const STORAGE_KEY = "geolab_assistant_config";
const API_KEY_STORAGE_KEY = "geolab_assistant_api_key";
const REMEMBER_KEY_STORAGE = "geolab_assistant_remember_key";

type ApiKeys = Record<ProviderName, string>;

const EMPTY_API_KEYS: ApiKeys = { ollama: "", openai: "", nvidia: "" };

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

function loadConfig(): { config: AssistantConfig; remember: boolean; apiKeys: ApiKeys } {
  let base: AssistantConfig = PROVIDER_DEFAULTS.ollama;
  let legacyApiKey = "";

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

  return { config: { ...base, apiKey: apiKeys[base.provider] }, remember, apiKeys };
}

export function useAssistantConfig(): [
  AssistantConfig,
  (c: AssistantConfig, remember: boolean) => void,
  boolean,
  ApiKeys,
] {
  const [state, setState] = useState<{
    config: AssistantConfig;
    remember: boolean;
    apiKeys: ApiKeys;
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

    setState({ config: c, remember: newRemember, apiKeys: updatedKeys });
  };

  return [state.config, setConfig, state.remember, state.apiKeys];
}
