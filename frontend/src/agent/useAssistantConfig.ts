import { useState } from "react";
import type { AssistantConfig } from "./types";
import { PROVIDER_DEFAULTS } from "./types";

const STORAGE_KEY = "geolab_assistant_config";
const API_KEY_STORAGE_KEY = "geolab_assistant_api_key";
const REMEMBER_KEY_STORAGE = "geolab_assistant_remember_key";

function loadConfig(): { config: AssistantConfig; remember: boolean } {
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

  // Leer la API key del almacenamiento correcto según la preferencia
  let apiKey = "";
  try {
    apiKey = remember
      ? (localStorage.getItem(API_KEY_STORAGE_KEY) ?? "")
      : (sessionStorage.getItem(API_KEY_STORAGE_KEY) ?? "");
  } catch {
    // almacenamiento no disponible
  }

  // Migración: si no hay key separada pero el blob legado la tenía, usarla
  if (!apiKey && legacyApiKey) {
    apiKey = legacyApiKey;
  }

  return { config: { ...base, apiKey }, remember };
}

export function useAssistantConfig(): [
  AssistantConfig,
  (c: AssistantConfig, remember: boolean) => void,
  boolean,
] {
  const [state, setState] = useState<{ config: AssistantConfig; remember: boolean }>(loadConfig);

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
    try {
      if (newRemember) {
        // Persistir en localStorage y limpiar sessionStorage
        localStorage.setItem(API_KEY_STORAGE_KEY, c.apiKey);
        sessionStorage.removeItem(API_KEY_STORAGE_KEY);
      } else {
        // Persistir en sessionStorage y limpiar localStorage (no dejar secreto olvidado)
        sessionStorage.setItem(API_KEY_STORAGE_KEY, c.apiKey);
        localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
    } catch {
      // almacenamiento no disponible
    }
    setState({ config: c, remember: newRemember });
  };

  return [state.config, setConfig, state.remember];
}
