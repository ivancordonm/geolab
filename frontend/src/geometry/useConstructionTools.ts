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
  onCreateObjects: (objects: readonly GeometryObject[]) => void;
  onSelectObject: (objectId: string) => void;
}

export interface ConstructionToolsState extends ConstructionToolState {
  instruction: string;
  activateTool: (tool: ConstructionTool) => void;
  cancel: () => void;
  handleCanvasClick: (world: Coordinate) => void;
  handleObjectClick: (objectId: string) => void;
  updatePointer: (world: Coordinate | null) => void;
}

export function useConstructionTools({
  document,
  onCreateObjects,
  onSelectObject,
}: UseConstructionToolsOptions): ConstructionToolsState {
  const controllerRef = useRef(new ConstructionToolController());
  const [state, setState] = useState<ConstructionToolState>(controllerRef.current.state);

  const applyResult = useCallback(
    (result: ConstructionToolResult) => {
      setState(result.state);
      if (result.createdObjects !== undefined && result.createdObjects.length > 0) {
        onCreateObjects(result.createdObjects);
      }
      if (result.selectedObjectId !== undefined) {
        onSelectObject(result.selectedObjectId);
      }
    },
    [onCreateObjects, onSelectObject],
  );

  const activateTool = useCallback((tool: ConstructionTool) => {
    setState(controllerRef.current.activate(tool));
  }, []);

  const cancel = useCallback(() => {
    setState(controllerRef.current.cancel());
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
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    ...state,
    instruction: TOOL_INSTRUCTIONS[state.activeTool],
    activateTool,
    cancel,
    handleCanvasClick,
    handleObjectClick,
    updatePointer,
  };
}

