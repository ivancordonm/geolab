import { useCallback, useEffect, useState } from "react";
import {
  Code2,
  PanelRight,
  PanelRightClose,
  Redo2,
  RotateCcw,
  Shapes,
  Sparkles,
  Undo2,
} from "lucide-react";
import { Analytics } from "@vercel/analytics/react";

import { evaluateConstructionScript, ScriptEvaluationError } from "./api/geometryApi";
import { AssistantPanel } from "./components/assistant/AssistantPanel";
import { ConstructionToolbar } from "./components/geometry/ConstructionToolbar";
import { GeometryCanvas } from "./components/geometry/GeometryCanvas";
import { ObjectList } from "./components/panel/ObjectList";
import { ScriptEditor } from "./components/panel/ScriptEditor";
import { PersistenceControls } from "./components/persistence/PersistenceControls";
import { SidebarTabs } from "./components/SidebarTabs";
import { ThemeToggle } from "./components/ThemeToggle";
import { useTheme } from "./theme/useTheme";
import { exampleGeometryDocument } from "./geometry/example";
import { useConstructionTools } from "./geometry/useConstructionTools";
import { useGeometryState } from "./geometry/useGeometryState";
import {
  clearDocument,
  documentToScript,
  exportDocumentJson,
  importDocumentJson,
  loadDocument,
  saveDocument,
} from "./persistence/documentPersistence";
import { downloadTextFile } from "./persistence/download";
import { useAutoSaveDocument } from "./persistence/useAutoSaveDocument";
import type { GeometryDocument } from "./types/geometry";
import type { ScriptErrorDetail } from "./types/script";

export const DEFAULT_CONSTRUCTION_SCRIPT = `A = Point(0, 0)
B = Point(4, 0)
C = Point(2, 3)
AB = Line(A, B)
base = Segment(A, B)
M = Midpoint(A, B)
h = PerpendicularLine(C, AB)
p = ParallelLine(M, AB)
c1 = Circle(A, C)`;

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [startup] = useState(restoreStartupDocument);
  const geometry = useGeometryState(startup.document);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [runningScript, setRunningScript] = useState(false);
  const [scriptError, setScriptError] = useState<ScriptErrorDetail | null>(null);
  const [scriptOutput, setScriptOutput] = useState<string | null>(null);
  const [persistenceNotice, setPersistenceNotice] = useState<{
    message: string | null;
    error: string | null;
  }>({ message: null, error: startup.error });
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    if (persistenceNotice.message === null && persistenceNotice.error === null) return;
    const id = setTimeout(() => setPersistenceNotice({ message: null, error: null }), 3000);
    return () => clearTimeout(id);
  }, [persistenceNotice.message, persistenceNotice.error]);

  const constructionTools = useConstructionTools({
    document: geometry.document,
    onApplyObjectChanges: geometry.applyObjectChanges,
    onSelectObject: setSelectedObjectId,
  });

  const reportPersistenceError = useCallback((error: Error) => {
    setPersistenceNotice({ message: null, error: error.message });
  }, []);
  useAutoSaveDocument(geometry.document, geometry.viewport, reportPersistenceError);

  const replaceConstruction = useCallback(
    (document: GeometryDocument) => {
      geometry.replaceDocument(document);
      constructionTools.cancel();
      setSelectedObjectId(null);
    },
    [constructionTools.cancel, geometry.replaceDocument],
  );

  const currentDocument = useCallback(
    (): GeometryDocument => ({ ...geometry.document, viewport: geometry.viewport }),
    [geometry.document, geometry.viewport],
  );

  const handleDeleteObject = useCallback((objectId: string) => {
    geometry.removeObject(objectId);
    constructionTools.cancel();
    setSelectedObjectId(null);
  }, [constructionTools, geometry]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedObjectId !== null &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        handleDeleteObject(selectedObjectId);
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) {
        geometry.redo();
      } else {
        geometry.undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [geometry, handleDeleteObject, selectedObjectId]);

  const handleSave = useCallback(() => {
    try {
      saveDocument(currentDocument());
      setPersistenceNotice({ message: "Construction saved locally.", error: null });
    } catch (error) {
      reportPersistenceError(asError(error, "Unable to save construction."));
    }
  }, [currentDocument, reportPersistenceError]);

  const handleLoad = useCallback(() => {
    try {
      const saved = loadDocument();
      if (saved === null) {
        setPersistenceNotice({ message: "No saved construction was found.", error: null });
        return;
      }
      replaceConstruction(saved);
      setPersistenceNotice({ message: "Saved construction loaded.", error: null });
    } catch (error) {
      reportPersistenceError(asError(error, "Unable to load construction."));
    }
  }, [replaceConstruction, reportPersistenceError]);

  const handleClear = useCallback(() => {
    clearDocument();
    replaceConstruction(createEmptyDocument(geometry.viewport));
    setPersistenceNotice({ message: "Construction cleared.", error: null });
  }, [geometry.viewport, replaceConstruction]);

  const handleImportJson = useCallback(
    (serialized: string) => {
      try {
        const imported = importDocumentJson(serialized);
        replaceConstruction(imported);
        setPersistenceNotice({ message: "JSON construction imported.", error: null });
      } catch (error) {
        reportPersistenceError(asError(error, "Unable to import construction."));
      }
    },
    [replaceConstruction, reportPersistenceError],
  );

  const handleExportJson = useCallback(() => {
    try {
      downloadTextFile(
        exportDocumentJson(currentDocument()),
        `${safeFilename(geometry.document.title)}.json`,
        "application/json",
      );
      setPersistenceNotice({ message: "JSON export created.", error: null });
    } catch (error) {
      reportPersistenceError(asError(error, "Unable to export JSON."));
    }
  }, [currentDocument, geometry.document.title, reportPersistenceError]);

  const handleExportScript = useCallback(() => {
    try {
      downloadTextFile(
        documentToScript(currentDocument()),
        `${safeFilename(geometry.document.title)}.geolab.txt`,
        "text/plain",
      );
      setPersistenceNotice({ message: "Construction script export created.", error: null });
    } catch (error) {
      reportPersistenceError(asError(error, "Unable to export script."));
    }
  }, [currentDocument, geometry.document.title, reportPersistenceError]);

  const runScript = useCallback(
    async (script: string): Promise<void> => {
      setRunningScript(true);
      setScriptError(null);
      setScriptOutput(null);
      try {
        const response = await evaluateConstructionScript({
          script,
          documentId: "canvas_script",
          title: "Script construction",
        });
        geometry.replaceDocument(response.document);
        constructionTools.cancel();
        setSelectedObjectId(null);
        setScriptOutput(`Created ${response.document.objects.length} objects successfully.`);
      } catch (error) {
        if (error instanceof ScriptEvaluationError && error.detail !== null) {
          setScriptError(error.detail);
        } else {
          setScriptOutput(error instanceof Error ? error.message : "Unable to evaluate script.");
        }
        throw error;
      } finally {
        setRunningScript(false);
      }
    },
    [constructionTools.cancel, geometry.replaceDocument],
  );

  // Controles de la tira izquierda (debajo del separador).
  const toolbarControls = (
    <>
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
      <button
        type="button"
        title="Undo"
        aria-label="Undo last change"
        aria-keyshortcuts="Meta+Z Control+Z"
        onClick={geometry.undo}
        disabled={!geometry.canUndo}
        className="flex items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent-soft-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        <Undo2 size={18} aria-hidden />
      </button>
      <button
        type="button"
        title="Redo"
        aria-label="Redo last change"
        aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z"
        onClick={geometry.redo}
        disabled={!geometry.canRedo}
        className="flex items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent-soft-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        <Redo2 size={18} aria-hidden />
      </button>
      <button
        type="button"
        title="Reset view"
        aria-label="Reset viewport"
        onClick={geometry.resetViewport}
        className="flex items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent-soft-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <RotateCcw size={18} aria-hidden />
      </button>
      <PersistenceControls
        message={persistenceNotice.message}
        error={persistenceNotice.error}
        onSave={handleSave}
        onLoad={handleLoad}
        onClear={handleClear}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onImportError={reportPersistenceError}
        onExportScript={handleExportScript}
        menuSide="right"
      />
    </>
  );

  // Pastilla de estado (instrucción / selección / error del modo de construcción).
  const hasStatus =
    constructionTools.instruction !== "" ||
    constructionTools.selectedObjectIds.length > 0 ||
    constructionTools.error !== null;

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Capa base: canvas a pantalla completa */}
      <div className="absolute inset-0">
        <GeometryCanvas
          document={geometry.document}
          values={geometry.values}
          viewport={geometry.viewport}
          activeTool={constructionTools.activeTool}
          selectedObjectIds={constructionTools.selectedObjectIds}
          selectedObjectId={selectedObjectId}
          pointerWorld={constructionTools.pointerWorld}
          onMoveFreePoint={geometry.moveFreePoint}
          onTranslateObject={geometry.translateObject}
          onBeginFreePointMove={geometry.beginDocumentInteraction}
          onEndFreePointMove={geometry.endDocumentInteraction}
          onViewportChange={geometry.setViewport}
          onCanvasClick={constructionTools.handleCanvasClick}
          onObjectClick={constructionTools.handleObjectClick}
          onPointerWorldChange={constructionTools.updatePointer}
          onSetLabelOffset={geometry.setObjectLabelOffset}
          panelOpen={panelOpen}
        />
      </div>

      {/* Tira vertical flotante izquierda: herramientas + divisor + controles */}
      <ConstructionToolbar
        activeTool={constructionTools.activeTool}
        onActivateTool={constructionTools.activateTool}
        regularPolygonSides={constructionTools.regularPolygonSides}
        onRegularPolygonSidesChange={constructionTools.setRegularPolygonSides}
        controls={toolbarControls}
      />

      {/* Pastilla de estado flotante centrada arriba (instrucción / selección / error) */}
      {hasStatus && (
        <div
          className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 flex items-center gap-x-3 gap-y-1 flex-wrap justify-center rounded-card border border-edge bg-surface/90 px-4 py-2 text-sm text-muted shadow-card backdrop-blur"
          aria-live="polite"
        >
          {constructionTools.instruction !== "" && (
            <span>{constructionTools.instruction}</span>
          )}
          {constructionTools.selectedObjectIds.length > 0 && (
            <span className="font-semibold text-brand-600">
              Selected: {constructionTools.selectedObjectIds.join(", ")}
            </span>
          )}
          {constructionTools.error !== null && (
            <span className="font-semibold text-danger-fg">{constructionTools.error}</span>
          )}
          {constructionTools.selectedObjectIds.length > 0 && (
            <button
              type="button"
              onClick={constructionTools.cancel}
              className="pointer-events-auto ml-1 rounded-md border border-edge bg-surface px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-brand-400 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              Cancel (Esc)
            </button>
          )}
        </div>
      )}

      {/* Botón para reabrir el panel cuando está colapsado */}
      {!panelOpen && (
        <button
          type="button"
          title="Open panel"
          aria-label="Open construction panels"
          onClick={() => setPanelOpen(true)}
          className="absolute right-3 top-3 z-10 flex items-center justify-center rounded-card border border-edge bg-surface/90 p-2 text-muted shadow-card backdrop-blur transition-colors hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <PanelRight size={20} aria-hidden />
        </button>
      )}

      {/* Panel derecho flotante colapsable — siempre montado para preservar estado */}
      <div
        className={`absolute bottom-3 right-3 top-3 z-10 flex w-[23rem] max-w-[calc(100vw-5rem)] flex-col overflow-hidden rounded-card border border-edge bg-surface shadow-card ${
          panelOpen ? "" : "hidden"
        }`}
      >
        {/* Cabecera del panel con botón de colapso */}
        <div className="flex shrink-0 items-center justify-between border-b border-edge bg-surface-muted px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Construction
          </span>
          <button
            type="button"
            title="Collapse panel"
            aria-label="Collapse panel"
            onClick={() => setPanelOpen(false)}
            className="rounded-lg p-1 text-muted transition-colors hover:bg-accent-soft hover:text-accent-soft-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <PanelRightClose size={16} aria-hidden />
          </button>
        </div>

        {/* Contenido con scroll */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarTabs
            tabs={[
              {
                id: "objects",
                label: "Objects",
                icon: <Shapes size={16} />,
                panel: (
                  <ObjectList
                    document={geometry.document}
                    values={geometry.values}
                    selectedObjectId={selectedObjectId}
                    onSelectObject={setSelectedObjectId}
                    onToggleVisibility={geometry.toggleObjectVisibility}
                    onSetObjectLabel={geometry.setObjectLabel}
                    onSetObjectColor={geometry.setObjectColor}
                    onSetObjectStyle={geometry.setObjectStyle}
                    onDeleteObject={handleDeleteObject}
                  />
                ),
              },
              {
                id: "script",
                label: "Script",
                icon: <Code2 size={16} />,
                panel: (
                  <ScriptEditor
                    initialScript={DEFAULT_CONSTRUCTION_SCRIPT}
                    running={runningScript}
                    error={scriptError}
                    output={scriptOutput}
                    onRunScript={runScript}
                  />
                ),
              },
              {
                id: "assistant",
                label: "Assistant",
                icon: <Sparkles size={16} />,
                panel: (
                  <AssistantPanel
                    document={geometry.document}
                    applyingScript={runningScript}
                    onApplyScript={runScript}
                  />
                ),
              },
            ]}
          />
        </div>
      </div>
      <Analytics />
    </div>
  );
}

function restoreStartupDocument(): { document: GeometryDocument; error: string | null } {
  try {
    return { document: loadDocument() ?? exampleGeometryDocument, error: null };
  } catch (error) {
    return {
      document: exampleGeometryDocument,
      error: asError(error, "Unable to restore the saved construction.").message,
    };
  }
}

function createEmptyDocument(viewport: GeometryDocument["viewport"]): GeometryDocument {
  return {
    schemaVersion: 1,
    id: "local_construction",
    title: "Local construction",
    objects: [],
    viewport,
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function safeFilename(title: string): string {
  const filename = title.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return filename || "geometry-construction";
}

function asError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback);
}
