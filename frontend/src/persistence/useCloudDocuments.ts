import { useCallback, useState } from "react";

import {
  DocumentsApiError,
  createDocument,
  deleteDocument as deleteDocumentRequest,
  getDocument,
  listDocuments,
  updateDocument,
} from "../api/documentsApi";
import type { DocumentSummary } from "../types/documents";
import type { GeometryDocument } from "../types/geometry";

type ActionResult<T> = { ok: true; value: T } | { ok: false };

export interface UseCloudDocumentsResult {
  panelOpen: boolean;
  documents: DocumentSummary[];
  loading: boolean;
  error: string | null;
  cloudId: string | null;
  openPanel: () => void;
  closePanel: () => void;
  saveCurrent: (title: string, document: GeometryDocument) => Promise<void>;
  saveAsNew: (title: string, document: GeometryDocument) => Promise<void>;
  openDocument: (id: string) => Promise<GeometryDocument | null>;
  renameDocument: (id: string, title: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
}

export function useCloudDocuments(onUnauthorized: () => void): UseCloudDocumentsResult {
  const [panelOpen, setPanelOpen] = useState(false);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloudId, setCloudId] = useState<string | null>(null);

  const withErrorHandling = useCallback(
    async <T,>(action: () => Promise<T>): Promise<ActionResult<T>> => {
      try {
        const value = await action();
        return { ok: true, value };
      } catch (caughtError) {
        if (caughtError instanceof DocumentsApiError && caughtError.status === 401) {
          onUnauthorized();
          setError("Your session expired. Please sign in again.");
        } else {
          setError(caughtError instanceof Error ? caughtError.message : "Cloud request failed.");
        }
        return { ok: false };
      }
    },
    [onUnauthorized],
  );

  const refreshList = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await withErrorHandling(() => listDocuments());
    if (result.ok) {
      setDocuments(result.value);
    }
    setLoading(false);
  }, [withErrorHandling]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    void refreshList();
  }, [refreshList]);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  const saveAsNew = useCallback(
    async (title: string, document: GeometryDocument) => {
      const result = await withErrorHandling(() => createDocument(title, document));
      if (result.ok) {
        setCloudId(result.value.id);
      }
    },
    [withErrorHandling],
  );

  const saveCurrent = useCallback(
    async (title: string, document: GeometryDocument) => {
      if (cloudId === null) {
        await saveAsNew(title, document);
        return;
      }
      await withErrorHandling(() => updateDocument(cloudId, { title, document }));
    },
    [cloudId, saveAsNew, withErrorHandling],
  );

  const openDocument = useCallback(
    async (id: string): Promise<GeometryDocument | null> => {
      const result = await withErrorHandling(() => getDocument(id));
      if (!result.ok) {
        return null;
      }
      setCloudId(result.value.id);
      setPanelOpen(false);
      return result.value.document;
    },
    [withErrorHandling],
  );

  const renameDocument = useCallback(
    async (id: string, title: string) => {
      const result = await withErrorHandling(() => updateDocument(id, { title }));
      if (result.ok) {
        await refreshList();
      }
    },
    [refreshList, withErrorHandling],
  );

  const deleteDocument = useCallback(
    async (id: string) => {
      const result = await withErrorHandling(() => deleteDocumentRequest(id));
      if (result.ok) {
        if (cloudId === id) {
          setCloudId(null);
        }
        await refreshList();
      }
    },
    [cloudId, refreshList, withErrorHandling],
  );

  return {
    panelOpen,
    documents,
    loading,
    error,
    cloudId,
    openPanel,
    closePanel,
    saveCurrent,
    saveAsNew,
    openDocument,
    renameDocument,
    deleteDocument,
  };
}
