import { lazy, Suspense, useCallback, useEffect, useState } from "react";
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
import { useAuth } from "./auth/useAuth";
import { useSharing } from "./app/useSharing";
import { AssistantPanel } from "./components/assistant/AssistantPanel";
import { AuthControl } from "./components/auth/AuthControl";
import { ConstructionToolbar, SHORTCUT_TO_TOOL } from "./components/geometry/ConstructionToolbar";
import { GeometryCanvas } from "./components/geometry/GeometryCanvas";
import { GridMenu } from "./components/geometry/GridMenu";
import { CaptureMenu } from "./components/geometry/CaptureMenu";
import { CaptureOverlay } from "./components/geometry/CaptureOverlay";
import { ObjectList } from "./components/panel/ObjectList";
import { ScriptEditor } from "./components/panel/ScriptEditor";
import { CloudDocumentsPanel } from "./components/persistence/CloudDocumentsPanel";
import { PersistenceControls } from "./components/persistence/PersistenceControls";
import { ShareDialog } from "./components/persistence/ShareDialog";
import { SidebarTabs } from "./components/SidebarTabs";
import { ThemeToggle } from "./components/ThemeToggle";
import { useTheme } from "./theme/useTheme";
import type { ConstructionTool } from "./geometry/constructionTools";
import { exampleGeometryDocument } from "./geometry/example";
import { parseFunctionObjectCommand } from "./geometry/functionExpression";
import { polyhedronForTool } from "./geometry/polyhedra";
import type { PolyhedronDefinition } from "./geometry/polyhedra/types";
import { useConstructionTools } from "./geometry/useConstructionTools";
import { useGeometryState } from "./geometry/useGeometryState";
import { useGridSettings } from "./geometry/useGridSettings";
import { groupForObject, mergeCommandDocument } from "./geometry/objectGroups";
import {
  clearDocument,
  documentToScript,
  exportDocumentJson,
  importDocumentJson,
  loadDocument,
} from "./persistence/documentPersistence";
import { downloadTextFile } from "./persistence/download";
import { captureSvgToPng } from "./geometry/exportImage";
import { useAutoSaveDocument } from "./persistence/useAutoSaveDocument";
import {
  useCloudDocuments,
  type CloudActionResult,
} from "./persistence/useCloudDocuments";
import type { DocumentDetail } from "./types/documents";
import type { GeometryDocument } from "./types/geometry";
import type { FunctionGraph } from "./types/geometry";
import type { ScriptErrorDetail } from "./types/script";

const PolyhedronStudio = lazy(() => import("./components/polyhedra/PolyhedronStudio"));

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
  const { settings: gridSettings, setSettings: setGridSettings } = useGridSettings();
  const auth = useAuth();
  const signOut = auth.signOut;
  const handleUnauthorized = useCallback(() => void signOut(), [signOut]);
  const cloud = useCloudDocuments(handleUnauthorized);
  const {
    panelOpen: cloudPanelOpen,
    documents: cloudDocuments,
    loading: cloudLoading,
    loadingMore: cloudLoadingMore,
    hasMore: cloudHasMore,
    error: cloudError,
    cloudId,
    openPanel: openCloudPanel,
    closePanel: closeCloudPanel,
    detachDocument: detachCloudDocument,
    loadMore: loadMoreCloudDocuments,
    saveCurrent: saveCurrentCloudDocument,
    saveAsNew: saveAsNewCloudDocument,
    openDocument: openCloudDocument,
    renameDocument: renameCloudDocument,
    deleteDocument: deleteCloudDocument,
  } = cloud;
  const [startup] = useState(restoreStartupDocument);
  const geometry = useGeometryState(startup.document);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [runningScript, setRunningScript] = useState(false);
  const [scriptError, setScriptError] = useState<ScriptErrorDetail | null>(null);
  const [scriptOutput, setScriptOutput] = useState<string | null>(null);
  const [scriptText, setScriptText] = useState(DEFAULT_CONSTRUCTION_SCRIPT);
  const [persistenceNotice, setPersistenceNotice] = useState<{
    message: string | null;
    error: string | null;
  }>({ message: null, error: startup.error });
  const [panelOpen, setPanelOpen] = useState(true);
  const [captureMode, setCaptureMode] = useState<"none" | "area">("none");
  const [activePolyhedron, setActivePolyhedron] = useState<PolyhedronDefinition | null>(null);
  const [pendingPolyhedron, setPendingPolyhedron] = useState<PolyhedronDefinition | null>(null);

  useEffect(() => {
    if (persistenceNotice.message === null && persistenceNotice.error === null) return;
    const id = setTimeout(() => setPersistenceNotice({ message: null, error: null }), 3000);
    return () => clearTimeout(id);
  }, [persistenceNotice.message, persistenceNotice.error]);

  useEffect(() => {
    if (auth.error !== null) {
      setPersistenceNotice({ message: null, error: auth.error });
    }
  }, [auth.error]);

  useEffect(() => {
    if (!auth.loading && auth.user === null) {
      detachCloudDocument();
    }
  }, [auth.loading, auth.user, detachCloudDocument]);

  const constructionTools = useConstructionTools({
    document: geometry.document,
    onApplyObjectChanges: geometry.applyObjectChanges,
    onSelectObject: setSelectedObjectId,
  });
  const cancelConstruction = constructionTools.cancel;
  const replaceGeometryDocument = geometry.replaceDocument;
  const setGeometryDocumentTitle = geometry.setDocumentTitle;

  const reportPersistenceError = useCallback((error: Error) => {
    setPersistenceNotice({ message: null, error: error.message });
  }, []);
  useAutoSaveDocument(geometry.document, geometry.viewport, reportPersistenceError);

  const replaceConstruction = useCallback(
    (document: GeometryDocument) => {
      replaceGeometryDocument(document);
      cancelConstruction();
      setSelectedObjectId(null);
    },
    [cancelConstruction, replaceGeometryDocument],
  );

  const currentDocument = useCallback(
    (): GeometryDocument => ({ ...geometry.document, viewport: geometry.viewport }),
    [geometry.document, geometry.viewport],
  );

  const handleActivateTool = useCallback(
    (tool: ConstructionTool) => {
      const def = polyhedronForTool(tool);
      if (def) {
        setPendingPolyhedron(def);
        return;
      }
      constructionTools.activateTool(tool);
    },
    [constructionTools],
  );
  const confirmOpenPolyhedron = useCallback(() => {
    if (!pendingPolyhedron) return;
    replaceConstruction(createEmptyDocument(geometry.viewport));
    setActivePolyhedron(pendingPolyhedron);
    setPendingPolyhedron(null);
  }, [pendingPolyhedron, geometry.viewport, replaceConstruction]);

  const sharing = useSharing({
    cloudId,
    documentTitle: geometry.document.title,
    currentDocument,
    saveAsNewCloudDocument: saveAsNewCloudDocument,
    setGeometryDocumentTitle,
    detachCloudDocument: detachCloudDocument,
    replaceConstruction,
    onMessage: (message) => setPersistenceNotice({ message, error: null }),
    onError: (error) => setPersistenceNotice({ message: null, error }),
  });

  const handleDeleteObject = useCallback((objectId: string) => {
    const group = groupForObject(geometry.document, objectId);
    const isOnlyPrimary = group?.members.filter((member) => member.role === "primary").length === 1
      && group.members.some((member) => member.objectId === objectId && member.role === "primary");
    if (group !== undefined && isOnlyPrimary) geometry.removeObjectGroup(group.id);
    else geometry.removeObject(objectId);
    constructionTools.cancel();
    setSelectedObjectId(null);
  }, [constructionTools, geometry]);

  const handleDeleteGroup = useCallback((groupId: string) => {
    geometry.removeObjectGroup(groupId);
    constructionTools.cancel();
    setSelectedObjectId(null);
  }, [constructionTools, geometry]);

  const handleSubmitObjectCommand = useCallback(async (command: string) => {
    const functionCommand = parseFunctionObjectCommand(command);
    if (functionCommand !== null) {
      const objectId = functionCommand.id ?? nextFunctionId(geometry.document);
      const duplicate = geometry.document.objects.some((object) => object.id === objectId || object.label === objectId);
      if (duplicate) {
        throw new Error(`An object named '${objectId}' already exists.`);
      }
      const object: FunctionGraph = {
        id: objectId,
        label: objectId,
        kind: "function",
        visible: true,
        definition: {
          type: "function_expression",
          expression: functionCommand.expression,
        },
      };
      geometry.addObject(object);
      setSelectedObjectId(object.id);
      return;
    }

    const response = await evaluateConstructionScript({
      script: `${documentToScript(currentDocument())}${command}\n`,
      documentId: geometry.document.id,
      title: geometry.document.title,
    });
    const mergedDocument = mergeCommandDocument(geometry.document, response.document);
    geometry.replaceDocument({
      ...mergedDocument,
      viewport: geometry.viewport,
    });
    constructionTools.cancel();
    const lastObject = response.document.objects.at(-1);
    setSelectedObjectId(lastObject?.id ?? null);
  }, [constructionTools, currentDocument, geometry]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (activePolyhedron !== null || pendingPolyhedron !== null) return;
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedObjectId !== null &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        handleDeleteObject(selectedObjectId);
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !isEditableTarget(event.target)) {
        const tool = SHORTCUT_TO_TOOL[event.key.toLowerCase()];
        if (tool !== undefined) {
          event.preventDefault();
          handleActivateTool(tool);
          return;
        }
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
  }, [
    activePolyhedron,
    pendingPolyhedron,
    constructionTools,
    geometry,
    handleActivateTool,
    handleDeleteObject,
    selectedObjectId,
  ]);

  const handleClear = useCallback(() => {
    clearDocument();
    detachCloudDocument();
    sharing.resetSharing();
    replaceConstruction(createEmptyDocument(geometry.viewport));
    setPersistenceNotice({ message: "Construction cleared.", error: null });
  }, [detachCloudDocument, geometry.viewport, replaceConstruction, sharing]);

  const handleCaptureFull = useCallback(() => {
    const svg = document.querySelector(".coordinate-grid")?.closest("svg");
    if (svg) {
      void captureSvgToPng(svg, `capture-${safeFilename(geometry.document.title)}.png`);
    }
  }, [geometry.document.title]);

  const handleCaptureArea = useCallback(() => {
    setCaptureMode("area");
  }, []);

  const handleCaptureBounds = useCallback((bounds: { x: number; y: number; width: number; height: number }) => {
    setCaptureMode("none");
    const svg = document.querySelector(".coordinate-grid")?.closest("svg");
    if (svg) {
      void captureSvgToPng(svg, `capture-${safeFilename(geometry.document.title)}.png`, bounds);
    }
  }, [geometry.document.title]);

  const handleImportJson = useCallback(
    (serialized: string) => {
      try {
        const imported = importDocumentJson(serialized);
        detachCloudDocument();
        sharing.resetSharing();
        replaceConstruction(imported);
        setPersistenceNotice({ message: "JSON construction imported.", error: null });
      } catch (error) {
        reportPersistenceError(asError(error, "Unable to import construction."));
      }
    },
    [detachCloudDocument, replaceConstruction, reportPersistenceError, sharing],
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
      const script = documentToScript(currentDocument());
      downloadTextFile(
        script,
        `${safeFilename(geometry.document.title)}.geolab.txt`,
        "text/plain",
      );
      setScriptText(script);
      setPersistenceNotice({ message: "Construction script export created.", error: null });
    } catch (error) {
      reportPersistenceError(asError(error, "Unable to export script."));
    }
  }, [currentDocument, geometry.document.title, reportPersistenceError]);

  const reportCloudSaveResult = useCallback((result: CloudActionResult<DocumentDetail>) => {
    if (result.status === "superseded") return;
    if (result.status === "success") {
      setGeometryDocumentTitle(result.value.title);
      setPersistenceNotice({ message: "Construction saved to the cloud.", error: null });
    } else {
      setPersistenceNotice({ message: null, error: result.error });
    }
  }, [setGeometryDocumentTitle]);

  const handleSaveToCloud = useCallback(() => {
    if (cloudId !== null) {
      void saveCurrentCloudDocument(geometry.document.title, currentDocument()).then(reportCloudSaveResult);
      return;
    }
    const title = window.prompt("Title for this construction:", geometry.document.title);
    if (title !== null && title.trim() !== "") {
      void saveAsNewCloudDocument(title.trim(), currentDocument()).then(reportCloudSaveResult);
    }
  }, [cloudId, currentDocument, geometry.document.title, reportCloudSaveResult, saveAsNewCloudDocument, saveCurrentCloudDocument]);

  const handleSaveAsNewToCloud = useCallback(() => {
    const title = window.prompt("Title for the new construction:", geometry.document.title);
    if (title !== null && title.trim() !== "") {
      void saveAsNewCloudDocument(title.trim(), currentDocument()).then(reportCloudSaveResult);
    }
  }, [currentDocument, geometry.document.title, reportCloudSaveResult, saveAsNewCloudDocument]);

  const handleOpenCloudDocument = useCallback(
    (id: string) => {
      void (async () => {
        const result = await openCloudDocument(id);
        if (result.status === "success") {
          replaceConstruction(result.value.document);
          sharing.resetSharing();
          sharing.markShared(result.value.shared);
          setPersistenceNotice({ message: "Cloud construction loaded.", error: null });
        }
      })();
    },
    [openCloudDocument, replaceConstruction, sharing],
  );

  const handleRenameCloudDocument = useCallback(
    (id: string, title: string) => {
      void (async () => {
        const result = await renameCloudDocument(id, title);
        if (result.status === "success" && cloudId === id) {
          setGeometryDocumentTitle(result.value.title);
        }
      })();
    },
    [cloudId, renameCloudDocument, setGeometryDocumentTitle],
  );

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
        detachCloudDocument();
        replaceGeometryDocument(response.document);
        cancelConstruction();
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
    [cancelConstruction, detachCloudDocument, replaceGeometryDocument],
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
      <GridMenu settings={gridSettings} onChange={setGridSettings} />
      <CaptureMenu onCaptureFull={handleCaptureFull} onCaptureArea={handleCaptureArea} />
      <AuthControl
        user={auth.user}
        onCredential={(idToken) => void auth.signIn(idToken)}
        onSignOut={() => void auth.signOut()}
      />
      <PersistenceControls
        message={persistenceNotice.message}
        error={persistenceNotice.error}
        onClear={handleClear}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onImportError={reportPersistenceError}
        onExportScript={handleExportScript}
        menuSide="right"
        cloudEnabled={auth.user !== null}
        shared={sharing.shared}
        onSaveToCloud={handleSaveToCloud}
        onSaveAsNewToCloud={handleSaveAsNewToCloud}
        onOpenCloudPanel={openCloudPanel}
        onShare={sharing.handleShare}
        onStopSharing={sharing.handleStopSharing}
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
      {sharing.viewingShared && (
        <div
          className="absolute left-1/2 top-3 z-20 -translate-x-1/2 max-w-[90vw] rounded-card border border-edge bg-surface/95 px-4 py-2 text-sm text-muted shadow-card backdrop-blur"
          role="status"
        >
          Viewing a shared construction. Changes are not saved to the original — sign in and use
          &ldquo;Save as new&rdquo; to keep a copy.
          <button
            type="button"
            onClick={sharing.dismissViewingShared}
            className="ml-3 rounded-md border border-edge px-2 py-0.5 text-xs font-semibold text-muted hover:text-content"
          >
            Dismiss
          </button>
        </div>
      )}
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
          gridSettings={gridSettings}
        />
      </div>

      {captureMode === "area" && (
        <CaptureOverlay
          onCapture={handleCaptureBounds}
          onCancel={() => setCaptureMode("none")}
        />
      )}

      {/* Tira vertical flotante izquierda: herramientas + divisor + controles */}
      <ConstructionToolbar
        activeTool={constructionTools.activeTool}
        onActivateTool={handleActivateTool}
        regularPolygonSides={constructionTools.regularPolygonSides}
        onRegularPolygonSidesChange={constructionTools.setRegularPolygonSides}
        rotationAngle={constructionTools.rotationAngle}
        onRotationAngleChange={constructionTools.setRotationAngle}
        homothetyRatio={constructionTools.homothetyRatio}
        onHomothetyRatioChange={constructionTools.setHomothetyRatio}
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

      {/* Leyenda en la esquina inferior izquierda */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 text-[11px] text-muted/50 select-none">
        <div>v.{__APP_VERSION__}</div>
        <div>An Anticentro Lab project</div>
      </div>

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
        <div className="min-h-0 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          <SidebarTabs
            tabs={[
              {
                id: "objects",
                label: "Objects",
                icon: <Shapes size={16} />,
                panel: (
                  <ObjectList
                    key={geometry.document.id}
                    document={geometry.document}
                    values={geometry.values}
                    selectedObjectId={selectedObjectId}
                    onSelectObject={setSelectedObjectId}
                    onToggleVisibility={geometry.toggleObjectVisibility}
                    onToggleGroupVisibility={geometry.toggleObjectGroupVisibility}
                    onSetObjectLabel={geometry.setObjectLabel}
                    onSetObjectColor={geometry.setObjectColor}
                    onSetObjectStyle={geometry.setObjectStyle}
                    onUpdateFunctionExpression={geometry.updateFunctionExpression}
                    onUpdateHomothetyRatio={geometry.updateHomothetyRatio}
                    onDeleteObject={handleDeleteObject}
                    onDeleteGroup={handleDeleteGroup}
                    onSubmitCommand={handleSubmitObjectCommand}
                  />
                ),
              },
              {
                id: "script",
                label: "Script",
                icon: <Code2 size={16} />,
                panel: (
                  <ScriptEditor
                    initialScript={scriptText}
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
      <CloudDocumentsPanel
        open={cloudPanelOpen}
        documents={cloudDocuments}
        loading={cloudLoading}
        loadingMore={cloudLoadingMore}
        hasMore={cloudHasMore}
        error={cloudError}
        onClose={closeCloudPanel}
        onOpenDocument={handleOpenCloudDocument}
        onLoadMore={() => void loadMoreCloudDocuments()}
        onRenameDocument={handleRenameCloudDocument}
        onDeleteDocument={(id) => {
          if (id === cloudId) {
            sharing.resetSharing();
          }
          void deleteCloudDocument(id);
        }}
      />

      <ShareDialog
        open={sharing.shareUrl !== null}
        url={sharing.shareUrl}
        onClose={sharing.closeShareDialog}
        onStopSharing={sharing.handleStopSharing}
      />
      <Analytics />

      {pendingPolyhedron && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40">
          <div role="dialog" aria-label="Abrir visor 3D" className="w-80 rounded-card border border-edge bg-surface p-4 shadow-pop">
            <p className="mb-3 text-sm text-content">
              Se borrará el dibujo actual y se abrirá el visor 3D del {pendingPolyhedron.name.toLowerCase()}. ¿Continuar?
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPendingPolyhedron(null)} className="rounded-md border border-edge px-3 py-1 text-xs font-semibold text-muted hover:text-content">
                Cancelar
              </button>
              <button type="button" onClick={confirmOpenPolyhedron} className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700">
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
      {activePolyhedron && (
        <Suspense fallback={<div className="absolute inset-0 z-30 flex items-center justify-center bg-surface text-sm text-muted">Cargando visor 3D…</div>}>
          <PolyhedronStudio definition={activePolyhedron} onExit={() => setActivePolyhedron(null)} />
        </Suspense>
      )}
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

export function nextFunctionId(document: GeometryDocument): string {
  const occupied = new Set(document.objects.flatMap((object) => [object.id, object.label]));
  let index = 1;
  while (occupied.has(`f_${index}`)) {
    index += 1;
  }
  return `f_${index}`;
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
