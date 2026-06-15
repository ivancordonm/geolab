import { useEffect } from "react";

import type { GeometryDocument, GeometryViewport } from "../types/geometry";
import { saveDocument } from "./documentPersistence";

export function useAutoSaveDocument(
  document: GeometryDocument,
  viewport: GeometryViewport,
  onError: (error: Error) => void,
): void {
  useEffect(() => {
    try {
      saveDocument({ ...document, viewport });
    } catch (error) {
      onError(error instanceof Error ? error : new Error("Unable to auto-save construction."));
    }
  }, [document, onError, viewport]);
}
