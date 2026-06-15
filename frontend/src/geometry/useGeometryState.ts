import { useCallback, useRef, useState } from "react";

import type {
  EvaluationMap,
  GeometryDocument,
  GeometryObject,
  GeometryObjectId,
  GeometryStyle,
  GeometryViewport,
} from "../types/geometry";
import { GeometryGraph } from "./engine";

export interface GeometryState {
  document: GeometryDocument;
  values: EvaluationMap;
  viewport: GeometryViewport;
  moveFreePoint: (pointId: GeometryObjectId, x: number, y: number) => void;
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
  setObjectLabelOffset: (objectId: GeometryObjectId, x: number, y: number) => void;
  setViewport: (viewport: GeometryViewport) => void;
  resetViewport: () => void;
}

const DEFAULT_VIEWPORT: GeometryViewport = { centerX: 0, centerY: 0, scale: 60 };

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

  const moveFreePoint = useCallback((pointId: GeometryObjectId, x: number, y: number) => {
    const result = graphRef.current!.moveFreePoint(pointId, x, y);
    setDocument(result.document);
    setValues(result.values);
  }, []);

  const addObject = useCallback((object: GeometryObject) => {
    const currentDocument = graphRef.current!.document;
    const candidate: GeometryDocument = {
      ...currentDocument,
      objects: [...currentDocument.objects, object],
    };
    const graph = new GeometryGraph(candidate);
    graphRef.current = graph;
    setDocument(graph.document);
    setValues(graph.values);
  }, []);

  const addObjects = useCallback((objects: readonly GeometryObject[]) => {
    if (objects.length === 0) return;
    const currentDocument = graphRef.current!.document;
    const candidate: GeometryDocument = {
      ...currentDocument,
      objects: [...currentDocument.objects, ...objects],
    };
    const graph = new GeometryGraph(candidate);
    graphRef.current = graph;
    setDocument(graph.document);
    setValues(graph.values);
  }, []);

  const applyObjectChanges = useCallback((
    createdObjects: readonly GeometryObject[],
    removedObjectIds: readonly GeometryObjectId[],
  ) => {
    if (createdObjects.length === 0 && removedObjectIds.length === 0) return;
    const removedIds = new Set(removedObjectIds);
    const currentDocument = graphRef.current!.document;
    const candidate: GeometryDocument = {
      ...currentDocument,
      objects: [
        ...currentDocument.objects.filter((object) => !removedIds.has(object.id)),
        ...createdObjects,
      ],
    };
    const graph = new GeometryGraph(candidate);
    graphRef.current = graph;
    setDocument(graph.document);
    setValues(graph.values);
  }, []);

  const replaceDocument = useCallback((nextDocument: GeometryDocument) => {
    const graph = new GeometryGraph(nextDocument);
    graphRef.current = graph;
    setDocument(graph.document);
    setValues(graph.values);
    const nextViewport = nextDocument.viewport ?? DEFAULT_VIEWPORT;
    viewportHomeRef.current = nextViewport;
    setViewportState(nextViewport);
  }, []);

  const toggleObjectVisibility = useCallback((objectId: GeometryObjectId) => {
    const currentDocument = graphRef.current!.document;
    const nextDocument: GeometryDocument = {
      ...currentDocument,
      objects: currentDocument.objects.map((object) =>
        object.id === objectId ? { ...object, visible: !object.visible } : object,
      ),
    };
    const graph = new GeometryGraph(nextDocument);
    graphRef.current = graph;
    setDocument(graph.document);
    setValues(graph.values);
  }, []);

  const setObjectLabel = useCallback((objectId: GeometryObjectId, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const currentDocument = graphRef.current!.document;
    const duplicate = currentDocument.objects.some((o) => o.id !== objectId && o.label === trimmed);
    if (duplicate) return;
    const nextDocument: GeometryDocument = {
      ...currentDocument,
      objects: currentDocument.objects.map((o) => (o.id === objectId ? { ...o, label: trimmed } : o)),
    };
    const graph = new GeometryGraph(nextDocument);
    graphRef.current = graph;
    setDocument(graph.document);
    setValues(graph.values);
  }, []);

  const setObjectColor = useCallback((objectId: GeometryObjectId, color: string | null) => {
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
    const graph = new GeometryGraph(nextDocument);
    graphRef.current = graph;
    setDocument(graph.document);
    setValues(graph.values);
  }, []);

  const setObjectStyle = useCallback((objectId: GeometryObjectId, patch: Partial<GeometryStyle>) => {
    const currentDocument = graphRef.current!.document;
    const nextDocument: GeometryDocument = {
      ...currentDocument,
      objects: currentDocument.objects.map((o) => {
        if (o.id !== objectId) return o;
        return { ...o, style: { ...o.style, ...patch } };
      }),
    };
    const graph = new GeometryGraph(nextDocument);
    graphRef.current = graph;
    setDocument(graph.document);
    setValues(graph.values);
  }, []);

  const setObjectLabelOffset = useCallback((objectId: GeometryObjectId, x: number, y: number) => {
    const currentDocument = graphRef.current!.document;
    const nextDocument: GeometryDocument = {
      ...currentDocument,
      objects: currentDocument.objects.map((o) => {
        if (o.id !== objectId) return o;
        return { ...o, style: { ...o.style, labelOffset: { x, y } } };
      }),
    };
    const graph = new GeometryGraph(nextDocument);
    graphRef.current = graph;
    setDocument(graph.document);
    setValues(graph.values);
  }, []);

  const setViewport = useCallback((nextViewport: GeometryViewport) => {
    setViewportState(nextViewport);
  }, []);

  const resetViewport = useCallback(() => {
    setViewportState(viewportHomeRef.current);
  }, []);

  return {
    document,
    values,
    viewport,
    moveFreePoint,
    addObject,
    addObjects,
    applyObjectChanges,
    replaceDocument,
    toggleObjectVisibility,
    setObjectLabel,
    setObjectColor,
    setObjectStyle,
    setObjectLabelOffset,
    setViewport,
    resetViewport,
  };
}
