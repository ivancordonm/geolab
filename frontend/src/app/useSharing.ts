import { useCallback, useEffect, useState } from "react";

import { fetchSharedDocument, shareDocument, unshareDocument } from "../api/documentsApi";
import { readShareTokenFromLocation } from "../persistence/sharedLink";
import type { CloudActionResult } from "../persistence/useCloudDocuments";
import type { DocumentDetail } from "../types/documents";
import type { GeometryDocument } from "../types/geometry";

interface UseSharingOptions {
  cloudId: string | null;
  documentTitle: string;
  currentDocument: () => GeometryDocument;
  saveAsNewCloudDocument: (
    title: string,
    document: GeometryDocument,
  ) => Promise<CloudActionResult<DocumentDetail>>;
  setGeometryDocumentTitle: (title: string) => void;
  detachCloudDocument: () => void;
  replaceConstruction: (document: GeometryDocument) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}

export interface SharingState {
  shared: boolean;
  viewingShared: boolean;
  shareUrl: string | null;
  dismissViewingShared: () => void;
  closeShareDialog: () => void;
  markShared: (value: boolean) => void;
  resetSharing: () => void;
  handleShare: () => void;
  handleStopSharing: () => void;
}

export function useSharing(options: UseSharingOptions): SharingState {
  const {
    cloudId,
    documentTitle,
    currentDocument,
    saveAsNewCloudDocument,
    setGeometryDocumentTitle,
    detachCloudDocument,
    replaceConstruction,
    onMessage,
    onError,
  } = options;
  const [shared, setShared] = useState(false);
  const [viewingShared, setViewingShared] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    const token = readShareTokenFromLocation(window.location);
    if (token === null) return;
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      try {
        const sharedDocument = await fetchSharedDocument(token);
        detachCloudDocument();
        replaceConstruction(sharedDocument.document);
        setShared(false);
        setViewingShared(true);
      } catch {
        onError("This shared link is no longer available.");
      }
    })();
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetSharing = useCallback(() => {
    setShared(false);
    setViewingShared(false);
    setShareUrl(null);
  }, []);

  const handleShare = useCallback(() => {
    void (async () => {
      let id = cloudId;
      if (id === null) {
        const title = window.prompt("Title for this construction:", documentTitle);
        if (title === null || title.trim() === "") return;
        const result = await saveAsNewCloudDocument(title.trim(), currentDocument());
        if (result.status !== "success") {
          if (result.status === "error") onError(result.error);
          return;
        }
        setGeometryDocumentTitle(result.value.title);
        id = result.value.id;
      }
      try {
        const { token } = await shareDocument(id);
        setShared(true);
        setShareUrl(`${window.location.origin}/?share=${token}`);
      } catch (error) {
        onError(error instanceof Error ? error.message : "Unable to share construction.");
      }
    })();
  }, [cloudId, currentDocument, documentTitle, onError, saveAsNewCloudDocument, setGeometryDocumentTitle]);

  const handleStopSharing = useCallback(() => {
    if (cloudId === null) return;
    void (async () => {
      try {
        await unshareDocument(cloudId);
        setShared(false);
        onMessage("Sharing stopped.");
      } catch (error) {
        onError(error instanceof Error ? error.message : "Unable to stop sharing.");
      }
    })();
  }, [cloudId, onError, onMessage]);

  return {
    shared,
    viewingShared,
    shareUrl,
    dismissViewingShared: useCallback(() => setViewingShared(false), []),
    closeShareDialog: useCallback(() => setShareUrl(null), []),
    markShared: setShared,
    resetSharing,
    handleShare,
    handleStopSharing,
  };
}
