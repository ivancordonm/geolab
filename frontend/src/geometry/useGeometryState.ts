import { useCallback, useRef, useState } from "react";

import type {
  EvaluationMap,
  GeometryDocument,
  GeometryObject,
  GeometryObjectId,
  GeometryStyle,
  GeometryViewport,
} from "../types/geometry";
import { GeometryGraph, getParentIds } from "./engine";
import { translateObjectDocument } from "./objectTranslation";

export interface GeometryState {
  document: GeometryDocument;
  values: EvaluationMap;
  viewport: GeometryViewport;
  canUndo: boolean;
  canRedo: boolean;
  moveFreePoint: (pointId: GeometryObjectId, x: number, y: number) => void;
  translateObject: (objectId: GeometryObjectId, dx: number, dy: number) => void;
  beginDocumentInteraction: () => void;
  endDocumentInteraction: () => void;
  addObject: (object: GeometryObject) => void;
  addObjects: (objects: readonly GeometryObject[]) => void;
  applyObjectChanges: (
    createdObjects: readonly GeometryObject[],
    removedObjectIds: readonly GeometryObjectId[],
  ) => void;
  replaceDocument: (document: GeometryDocument) => void;
  toggleObjectVisibility: (objectId: GeometryObjectId) => void;
  setObjectLabel: (objectId: GeometryObjectId, label: string) => void;
  setObjectColor: (objectId: GeometryObjectId, color: string | null) => void;
  setObjectStyle: (objectId: GeometryObjectId, patch: Partial<GeometryStyle>) => void;
  updateFunctionExpression: (objectId: GeometryObjectId, expression: string) => void;
  removeObject: (objectId: GeometryObjectId) => void;
  setObjectLabelOffset: (objectId: GeometryObjectId, x: number, y: number) => void;
  setViewport: (viewport: GeometryViewport) => void;
  resetViewport: () => void;
  undo: () => void;
  redo: () => void;
}

const DEFAULT_VIEWPORT: GeometryViewport = { centerX: 0, centerY: 0, scale: 60 };

interface GeometrySnapshot {
  document: GeometryDocument;
  viewport: GeometryViewport;
}

export function useGeometryState(initialDocument: GeometryDocument): GeometryState {
  const graphRef = useRef<GeometryGraph | null>(null);
  if (graphRef.current === null) {
    graphRef.current = new GeometryGraph(initialDocument);
  }

  const initialViewport = initialDocument.viewport ?? DEFAULT_VIEWPORT;
  const viewportHomeRef = useRef(initialViewport);
  const [document, setDocument] = useState(() => graphRef.current!.document);
  const [values, setValues] = useState<EvaluationMap>(() => graphRef.current!.values);
  const [viewport, setViewportState] = useState<GeometryViewport>(initialViewport);
  const viewportRef = useRef(initialViewport);
  const historyRef = useRef<{ past: GeometrySnapshot[]; future: GeometrySnapshot[] }>({
    past: [],
    future: [],
  });
  const interactionRef = useRef<{ active: boolean; changed: boolean }>({
    active: false,
    changed: false,
  });
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  const syncHistoryState = useCallback(() => {
    setHistoryState({
      canUndo: historyRef.current.past.length > 0,
      canRedo: historyRef.current.future.length > 0,
    });
  }, []);

  const currentSnapshot = useCallback(
    (): GeometrySnapshot => ({
      document: graphRef.current!.document,
      viewport: viewportRef.current,
    }),
    [],
  );

  const restoreSnapshot = useCallback((snapshot: GeometrySnapshot) => {
    const graph = new GeometryGraph(snapshot.document);
    graphRef.current = graph;
    setDocument(graph.document);
    setValues(graph.values);
    viewportRef.current = snapshot.viewport;
    viewportHomeRef.current = snapshot.document.viewport ?? snapshot.viewport;
    setViewportState(snapshot.viewport);
  }, []);

  const pushHistory = useCallback((snapshot: GeometrySnapshot) => {
    historyRef.current.past.push(snapshot);
    historyRef.current.future = [];
    syncHistoryState();
  }, [syncHistoryState]);

  const applyDocument = useCallback((nextDocument: GeometryDocument) => {
    const graph = new GeometryGraph(nextDocument);
    graphRef.current = graph;
    setDocument(graph.document);
    setValues(graph.values);
  }, []);

  const recordDocumentChange = useCallback(() => {
    if (interactionRef.current.active) {
      if (!interactionRef.current.changed) {
        pushHistory(currentSnapshot());
        interactionRef.current.changed = true;
      }
      return;
    }
    pushHistory(currentSnapshot());
  }, [currentSnapshot, pushHistory]);

  const beginDocumentInteraction = useCallback(() => {
    interactionRef.current.active = true;
    interactionRef.current.changed = false;
  }, []);

  const endDocumentInteraction = useCallback(() => {
    interactionRef.current.active = false;
    interactionRef.current.changed = false;
  }, []);

  const moveFreePoint = useCallback((pointId: GeometryObjectId, x: number, y: number) => {
    recordDocumentChange();
    const result = graphRef.current!.moveFreePoint(pointId, x, y);
    graphRef.current = new GeometryGraph(result.document);
    setDocument(graphRef.current.document);
    setValues(graphRef.current.values);
  }, [recordDocumentChange]);

  const translateObject = useCallback((objectId: GeometryObjectId, dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;
    const currentDocument = graphRef.current!.document;
    const nextDocument = translateObjectDocument(currentDocument, objectId, dx, dy);
    if (nextDocument === currentDocument) return;
    recordDocumentChange();
    applyDocument(nextDocument);
  }, [applyDocument, recordDocumentChange]);

  const addObject = useCallback((object: GeometryObject) => {
    recordDocumentChange();
    const currentDocument = graphRef.current!.document;
    const candidate: GeometryDocument = {
      ...currentDocument,
      objects: [...currentDocument.objects, object],
    };
    applyDocument(candidate);
  }, [applyDocument, recordDocumentChange]);

  const addObjects = useCallback((objects: readonly GeometryObject[]) => {
    if (objects.length === 0) return;
    recordDocumentChange();
    const currentDocument = graphRef.current!.document;
    const candidate: GeometryDocument = {
      ...currentDocument,
      objects: [...currentDocument.objects, ...objects],
    };
    applyDocument(candidate);
  }, [applyDocument, recordDocumentChange]);

  const applyObjectChanges = useCallback((
    createdObjects: readonly GeometryObject[],
    removedObjectIds: readonly GeometryObjectId[],
  ) => {
    if (createdObjects.length === 0 && removedObjectIds.length === 0) return;
    recordDocumentChange();
    const removedIds = new Set(removedObjectIds);
    const currentDocument = graphRef.current!.document;
    const candidate: GeometryDocument = {
      ...currentDocument,
      objects: [
        ...currentDocument.objects.filter((object) => !removedIds.has(object.id)),
        ...createdObjects,
      ],
    };
    applyDocument(candidate);
  }, [applyDocument, recordDocumentChange]);

  const replaceDocument = useCallback((nextDocument: GeometryDocument) => {
    recordDocumentChange();
    applyDocument(nextDocument);
    const nextViewport = nextDocument.viewport ?? DEFAULT_VIEWPORT;
    viewportHomeRef.current = nextViewport;
    viewportRef.current = nextViewport;
    setViewportState(nextViewport);
  }, [applyDocument, recordDocumentChange]);

  const toggleObjectVisibility = useCallback((objectId: GeometryObjectId) => {
    recordDocumentChange();
    const currentDocument = graphRef.current!.document;
    const nextDocument: GeometryDocument = {
      ...currentDocument,
      objects: currentDocument.objects.map((object) =>
        object.id === objectId ? { ...object, visible: !object.visible } : object,
      ),
    };
    applyDocument(nextDocument);
  }, [applyDocument, recordDocumentChange]);

  const setObjectLabel = useCallback((objectId: GeometryObjectId, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const currentDocument = graphRef.current!.document;
    const duplicate = currentDocument.objects.some((o) => o.id !== objectId && o.label === trimmed);
    if (duplicate) return;
    recordDocumentChange();
    const nextDocument: GeometryDocument = {
      ...currentDocument,
      objects: currentDocument.objects.map((o) => (o.id === objectId ? { ...o, label: trimmed } : o)),
    };
    applyDocument(nextDocument);
  }, [applyDocument, recordDocumentChange]);

  const setObjectColor = useCallback((objectId: GeometryObjectId, color: string | null) => {
    recordDocumentChange();
    const currentDocument = graphRef.current!.document;
    const nextDocument: GeometryDocument = {
      ...currentDocument,
      objects: currentDocument.objects.map((o) => {
        if (o.id !== objectId) return o;
        const style = color === null
          ? { ...o.style, color: undefined }
          : { ...o.style, color };
        return { ...o, style };
      }),
    };
    applyDocument(nextDocument);
  }, [applyDocument, recordDocumentChange]);

  const setObjectStyle = useCallback((objectId: GeometryObjectId, patch: Partial<GeometryStyle>) => {
    recordDocumentChange();
    const currentDocument = graphRef.current!.document;
    const nextDocument: GeometryDocument = {
      ...currentDocument,
      objects: currentDocument.objects.map((o) => {
        if (o.id !== objectId) return o;
        return { ...o, style: { ...o.style, ...patch } };
      }),
    };
    applyDocument(nextDocument);
  }, [applyDocument, recordDocumentChange]);

  const updateFunctionExpression = useCallback((objectId: GeometryObjectId, expression: string) => {
    recordDocumentChange();
    const currentDocument = graphRef.current!.document;
    const nextDocument: GeometryDocument = {
      ...currentDocument,
      objects: currentDocument.objects.map((o) => {
        if (o.id !== objectId || o.kind !== "function") return o;
        return { ...o, definition: { type: "function_expression", expression } };
      }),
    };
    applyDocument(nextDocument);
  }, [applyDocument, recordDocumentChange]);

  const removeObject = useCallback((objectId: GeometryObjectId) => {
    const currentDocument = graphRef.current!.document;
    const removedIds = new Set<GeometryObjectId>([objectId]);

    let changed = true;
    while (changed) {
      changed = false;
      for (const object of currentDocument.objects) {
        if (removedIds.has(object.id)) continue;
        const parentIds = getParentIds(object);
        if (parentIds.some((parentId) => removedIds.has(parentId))) {
          removedIds.add(object.id);
          changed = true;
        }
      }
    }

    if (!currentDocument.objects.some((object) => removedIds.has(object.id))) return;
    recordDocumentChange();

    const nextDocument: GeometryDocument = {
      ...currentDocument,
      objects: currentDocument.objects.filter((object) => !removedIds.has(object.id)),
    };
    applyDocument(nextDocument);
  }, [applyDocument, recordDocumentChange]);

  const setObjectLabelOffset = useCallback((objectId: GeometryObjectId, x: number, y: number) => {
    recordDocumentChange();
    const currentDocument = graphRef.current!.document;
    const nextDocument: GeometryDocument = {
      ...currentDocument,
      objects: currentDocument.objects.map((o) => {
        if (o.id !== objectId) return o;
        return { ...o, style: { ...o.style, labelOffset: { x, y } } };
      }),
    };
    applyDocument(nextDocument);
  }, [applyDocument, recordDocumentChange]);

  const setViewport = useCallback((nextViewport: GeometryViewport) => {
    viewportRef.current = nextViewport;
    setViewportState(nextViewport);
  }, []);

  const resetViewport = useCallback(() => {
    viewportRef.current = viewportHomeRef.current;
    setViewportState(viewportHomeRef.current);
  }, []);

  const undo = useCallback(() => {
    const snapshot = historyRef.current.past.pop();
    if (snapshot === undefined) return;
    historyRef.current.future.unshift(currentSnapshot());
    syncHistoryState();
    restoreSnapshot(snapshot);
    endDocumentInteraction();
  }, [currentSnapshot, endDocumentInteraction, restoreSnapshot, syncHistoryState]);

  const redo = useCallback(() => {
    const snapshot = historyRef.current.future.shift();
    if (snapshot === undefined) return;
    historyRef.current.past.push(currentSnapshot());
    syncHistoryState();
    restoreSnapshot(snapshot);
    endDocumentInteraction();
  }, [currentSnapshot, endDocumentInteraction, restoreSnapshot, syncHistoryState]);

  return {
    document,
    values,
    viewport,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    moveFreePoint,
    translateObject,
    beginDocumentInteraction,
    endDocumentInteraction,
    addObject,
    addObjects,
    applyObjectChanges,
    replaceDocument,
    toggleObjectVisibility,
    setObjectLabel,
    setObjectColor,
    setObjectStyle,
    updateFunctionExpression,
    removeObject,
    setObjectLabelOffset,
    setViewport,
    resetViewport,
    undo,
    redo,
  };
}
