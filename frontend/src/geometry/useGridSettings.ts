import { useEffect, useState } from "react";

import type { GridSettings } from "./viewport";

const STORAGE_KEY = "geolab-grid-settings";

export const DEFAULT_GRID_SETTINGS: GridSettings = {
  showGrid: true,
  snapToGrid: false,
  stepMode: "auto",
  manualStep: 1,
};

function readStoredSettings(): GridSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_GRID_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_GRID_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_GRID_SETTINGS;
  }
}

/**
 * Resolves and persists the grid visibility/snap/step preferences.
 * Follows the same localStorage pattern as useTheme.ts.
 */
export function useGridSettings(): {
  settings: GridSettings;
  setSettings: (next: GridSettings) => void;
} {
  const [settings, setSettings] = useState<GridSettings>(readStoredSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage failures (private mode, quota); settings still apply in-session.
    }
  }, [settings]);

  return { settings, setSettings };
}
