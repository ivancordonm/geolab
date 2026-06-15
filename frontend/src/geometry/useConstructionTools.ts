import { useCallback, useEffect, useRef, useState } from "react";

import type { GeometryDocument, GeometryObject } from "../types/geometry";
import type { Coordinate } from "./viewport";
import {
  ConstructionToolController,
  TOOL_INSTRUCTIONS,
} from "./constructionTools";
import type {
  ConstructionTool,
  ConstructionToolResult,
  ConstructionToolState,
} from "./constructionTools";

interface UseConstructionToolsOptions {
  document: GeometryDocument;
  onApplyObjectChanges: (
    createdObjects: readonly GeometryObject[],
    removedObjectIds: readonly string[],
  ) => void;
  onSelectObject: (objectId: string) => void;
}

export interface ConstructionToolsState extends ConstructionToolState {
  instruction: string;
  activateTool: (tool: ConstructionTool) => void;
  cancel: () => void;
  finish: () => void;
  setRegularPolygonSides: (sides: number) => void;
  setRotationAngle: (angle: number) => void;
  handleCanvasClick: (world: Coordinate) => void;
  handleObjectClick: (objectId: string) => void;
  updatePointer: (world: Coordinate | null) => void;
}

export function useConstructionTools({
  document,
  onApplyObjectChanges,
  onSelectObject,
}: UseConstructionToolsOptions): ConstructionToolsState {
  const controllerRef = useRef(new ConstructionToolController());
  const [state, setState] = useState<ConstructionToolState>(controllerRef.current.state);

  const applyResult = useCallback(
    (result: ConstructionToolResult) => {
      setState(result.state);
      const createdObjects = result.createdObjects ?? [];
      const removedObjectIds = result.removedObjectIds ?? [];
      if (createdObjects.length > 0 || removedObjectIds.length > 0) {
        onApplyObjectChanges(createdObjects, removedObjectIds);
      }
      if (result.selectedObjectId !== undefined) {
        onSelectObject(result.selectedObjectId);
      }
    },
    [onApplyObjectChanges, onSelectObject],
  );

  const activateTool = useCallback((tool: ConstructionTool) => {
    setState(controllerRef.current.activate(tool));
  }, []);

  const cancel = useCallback(() => {
    setState(controllerRef.current.cancel());
  }, []);

  const finish = useCallback(() => {
    applyResult(controllerRef.current.finish(document));
  }, [applyResult, document]);

  const setRegularPolygonSides = useCallback((sides: number) => {
    setState(controllerRef.current.setRegularPolygonSides(sides));
  }, []);

  const setRotationAngle = useCallback((angle: number) => {
    setState(controllerRef.current.setRotationAngle(angle));
  }, []);

  const handleCanvasClick = useCallback(
    (world: Coordinate) => applyResult(controllerRef.current.handleCanvasClick(world, document)),
    [applyResult, document],
  );

  const handleObjectClick = useCallback(
    (objectId: string) => applyResult(controllerRef.current.handleObjectClick(objectId, document)),
    [applyResult, document],
  );

  const updatePointer = useCallback((world: Coordinate | null) => {
    setState(controllerRef.current.updatePointer(world));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setState(controllerRef.current.cancel());
      } else if (event.key === "Enter") {
        applyResult(controllerRef.current.finish(document));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [applyResult, document]);

  return {
    ...state,
    instruction: TOOL_INSTRUCTIONS[state.activeTool],
    activateTool,
    cancel,
    finish,
    setRegularPolygonSides,
    setRotationAngle,
    handleCanvasClick,
    handleObjectClick,
    updatePointer,
  };
}
