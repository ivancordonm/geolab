import { useCallback, useRef, useState } from "react";

import {
  DocumentsApiError,
  createDocument,
  deleteDocument as deleteDocumentRequest,
  getDocument,
  listDocuments,
  updateDocument,
} from "../api/documentsApi";
import type { DocumentDetail, DocumentSummary } from "../types/documents";
import type { GeometryDocument } from "../types/geometry";

const PAGE_SIZE = 50;

export type CloudActionResult<T> =
  | { status: "success"; value: T }
  | { status: "error"; error: string }
  | { status: "superseded" };

type RequestResult<T> =
  | { status: "success"; value: T }
  | { status: "error"; error: string; unauthorized: boolean };

export interface UseCloudDocumentsResult {
  panelOpen: boolean;
  documents: DocumentSummary[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  cloudId: string | null;
  openPanel: () => void;
  closePanel: () => void;
  detachDocument: () => void;
  loadMore: () => Promise<CloudActionResult<DocumentSummary[]>>;
  saveCurrent: (
    title: string,
    document: GeometryDocument,
  ) => Promise<CloudActionResult<DocumentDetail>>;
  saveAsNew: (
    title: string,
    document: GeometryDocument,
  ) => Promise<CloudActionResult<DocumentDetail>>;
  openDocument: (id: string) => Promise<CloudActionResult<DocumentDetail>>;
  renameDocument: (id: string, title: string) => Promise<CloudActionResult<DocumentDetail>>;
  deleteDocument: (id: string) => Promise<CloudActionResult<void>>;
}

async function requestResult<T>(action: () => Promise<T>): Promise<RequestResult<T>> {
  try {
    return { status: "success", value: await action() };
  } catch (caughtError) {
    const unauthorized = caughtError instanceof DocumentsApiError && caughtError.status === 401;
    return {
      status: "error",
      error: unauthorized
        ? "Your session expired. Please sign in again."
        : caughtError instanceof Error
          ? caughtError.message
          : "Cloud request failed.",
      unauthorized,
    };
  }
}

const CLOUD_ID_STORAGE_KEY = "geolab.cloud-id.v1";

function getStoredCloudId(): string | null {
  try {
    return window.localStorage.getItem(CLOUD_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useCloudDocuments(onUnauthorized: () => void): UseCloudDocumentsResult {
  const [panelOpen, setPanelOpen] = useState(false);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [associationError, setAssociationError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [cloudId, setCloudIdState] = useState<string | null>(getStoredCloudId);
  const cloudIdRef = useRef<string | null>(getStoredCloudId());
  const associationGenerationRef = useRef(0);
  const listGenerationRef = useRef(0);
  const listOffsetRef = useRef(0);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueueMutation = useCallback(<T,>(action: () => Promise<T>): Promise<T> => {
    const queued = mutationQueueRef.current.then(action);
    mutationQueueRef.current = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }, []);

  const setCloudId = useCallback((id: string | null) => {
    cloudIdRef.current = id;
    setCloudIdState(id);
    try {
      if (id === null) {
        window.localStorage.removeItem(CLOUD_ID_STORAGE_KEY);
      } else {
        window.localStorage.setItem(CLOUD_ID_STORAGE_KEY, id);
      }
    } catch {
      // Ignore
    }
  }, []);

  const invalidateList = useCallback(() => {
    listGenerationRef.current += 1;
    setLoading(false);
    setLoadingMore(false);
    setListError(null);
  }, []);

  const beginAssociationOperation = useCallback((): number => {
    associationGenerationRef.current += 1;
    setAssociationError(null);
    invalidateList();
    return associationGenerationRef.current;
  }, [invalidateList]);

  const isCurrentAssociation = useCallback(
    (generation: number): boolean => associationGenerationRef.current === generation,
    [],
  );

  const commitAssociationError = useCallback(
    (generation: number, result: Extract<RequestResult<unknown>, { status: "error" }>) => {
      if (!isCurrentAssociation(generation)) return;
      setAssociationError(result.error);
      if (result.unauthorized) onUnauthorized();
    },
    [isCurrentAssociation, onUnauthorized],
  );

  const refreshList = useCallback(async (): Promise<CloudActionResult<DocumentSummary[]>> => {
    const generation = ++listGenerationRef.current;
    setLoading(true);
    setListError(null);
    const result = await requestResult(() => listDocuments(PAGE_SIZE, 0));
    if (listGenerationRef.current !== generation) {
      return { status: "superseded" };
    }
    setLoading(false);
    if (result.status === "error") {
      setListError(result.error);
      if (result.unauthorized) onUnauthorized();
      return { status: "error", error: result.error };
    }
    setDocuments(result.value.documents);
    setHasMore(result.value.hasMore);
    listOffsetRef.current = result.value.documents.length;
    return { status: "success", value: result.value.documents };
  }, [onUnauthorized]);

  const loadMore = useCallback(async (): Promise<CloudActionResult<DocumentSummary[]>> => {
    const generation = listGenerationRef.current;
    setLoadingMore(true);
    setListError(null);
    const result = await requestResult(() => listDocuments(PAGE_SIZE, listOffsetRef.current));
    if (listGenerationRef.current !== generation) {
      setLoadingMore(false);
      return { status: "superseded" };
    }
    setLoadingMore(false);
    if (result.status === "error") {
      setListError(result.error);
      if (result.unauthorized) onUnauthorized();
      return { status: "error", error: result.error };
    }
    setDocuments((previous) => [...previous, ...result.value.documents]);
    setHasMore(result.value.hasMore);
    listOffsetRef.current += result.value.documents.length;
    return { status: "success", value: result.value.documents };
  }, [onUnauthorized]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    void refreshList();
  }, [refreshList]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    invalidateList();
  }, [invalidateList]);

  const detachDocument = useCallback(() => {
    associationGenerationRef.current += 1;
    invalidateList();
    setAssociationError(null);
    setCloudId(null);
  }, [invalidateList, setCloudId]);

  const saveAsNew = useCallback(
    async (
      title: string,
      document: GeometryDocument,
    ): Promise<CloudActionResult<DocumentDetail>> => {
      const generation = beginAssociationOperation();
      const result = await requestResult(() =>
        enqueueMutation(() => createDocument(title, document)),
      );
      if (!isCurrentAssociation(generation)) return { status: "superseded" };
      if (result.status === "error") {
        commitAssociationError(generation, result);
        return { status: "error", error: result.error };
      }
      setCloudId(result.value.id);
      return result;
    },
    [
      beginAssociationOperation,
      commitAssociationError,
      enqueueMutation,
      isCurrentAssociation,
      setCloudId,
    ],
  );

  const saveCurrent = useCallback(
    async (
      title: string,
      document: GeometryDocument,
    ): Promise<CloudActionResult<DocumentDetail>> => {
      const generation = beginAssociationOperation();
      const associatedId = cloudIdRef.current;
      const result = await requestResult(() =>
        enqueueMutation(() =>
          associatedId === null
            ? createDocument(title, document)
            : updateDocument(associatedId, { title, document }),
        ),
      );
      if (!isCurrentAssociation(generation)) return { status: "superseded" };
      if (result.status === "error") {
        commitAssociationError(generation, result);
        return { status: "error", error: result.error };
      }
      if (associatedId === null) setCloudId(result.value.id);
      return result;
    },
    [
      beginAssociationOperation,
      commitAssociationError,
      enqueueMutation,
      isCurrentAssociation,
      setCloudId,
    ],
  );

  const openDocument = useCallback(
    async (id: string): Promise<CloudActionResult<DocumentDetail>> => {
      const generation = beginAssociationOperation();
      const result = await requestResult(() => getDocument(id));
      if (!isCurrentAssociation(generation)) return { status: "superseded" };
      if (result.status === "error") {
        commitAssociationError(generation, result);
        return { status: "error", error: result.error };
      }
      setCloudId(result.value.id);
      setPanelOpen(false);
      return result;
    },
    [beginAssociationOperation, commitAssociationError, isCurrentAssociation, setCloudId],
  );

  const renameDocument = useCallback(
    async (id: string, title: string): Promise<CloudActionResult<DocumentDetail>> => {
      const generation = beginAssociationOperation();
      const result = await requestResult(() =>
        enqueueMutation(() => updateDocument(id, { title })),
      );
      if (!isCurrentAssociation(generation)) return { status: "superseded" };
      if (result.status === "error") {
        commitAssociationError(generation, result);
        return { status: "error", error: result.error };
      }
      await refreshList();
      if (!isCurrentAssociation(generation)) return { status: "superseded" };
      return result;
    },
    [
      beginAssociationOperation,
      commitAssociationError,
      enqueueMutation,
      isCurrentAssociation,
      refreshList,
    ],
  );

  const deleteDocument = useCallback(
    async (id: string): Promise<CloudActionResult<void>> => {
      const generation = beginAssociationOperation();
      const result = await requestResult(() =>
        enqueueMutation(() => deleteDocumentRequest(id)),
      );
      if (!isCurrentAssociation(generation)) return { status: "superseded" };
      if (result.status === "error") {
        commitAssociationError(generation, result);
        return { status: "error", error: result.error };
      }
      if (cloudIdRef.current === id) setCloudId(null);
      await refreshList();
      if (!isCurrentAssociation(generation)) return { status: "superseded" };
      return result;
    },
    [
      beginAssociationOperation,
      commitAssociationError,
      enqueueMutation,
      isCurrentAssociation,
      refreshList,
      setCloudId,
    ],
  );

  return {
    panelOpen,
    documents,
    loading,
    loadingMore,
    hasMore,
    error: associationError ?? listError,
    cloudId,
    openPanel,
    closePanel,
    detachDocument,
    loadMore,
    saveCurrent,
    saveAsNew,
    openDocument,
    renameDocument,
    deleteDocument,
  };
}
