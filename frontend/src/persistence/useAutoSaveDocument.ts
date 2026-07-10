import { useCallback, useEffect, useRef } from "react";

import type { GeometryDocument, GeometryViewport } from "../types/geometry";
import { saveDocument } from "./documentPersistence";

export const AUTO_SAVE_DELAY_MS = 500;

export function useAutoSaveDocument(
  document: GeometryDocument,
  viewport: GeometryViewport,
  onError: (error: Error) => void,
): void {
  const pendingRef = useRef<GeometryDocument | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const flush = useCallback(() => {
    const pending = pendingRef.current;
    if (pending === null) return;
    pendingRef.current = null;
    timeoutRef.current = null;
    try {
      saveDocument(pending);
    } catch (error) {
      onErrorRef.current(
        error instanceof Error ? error : new Error("Unable to auto-save construction."),
      );
    }
  }, []);

  useEffect(() => {
    pendingRef.current = { ...document, viewport };
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(flush, AUTO_SAVE_DELAY_MS);
  }, [document, flush, viewport]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      flush();
    },
    [flush],
  );
}
