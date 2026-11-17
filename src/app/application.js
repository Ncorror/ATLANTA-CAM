import { createApplicationState } from "./state.js";
import {
  numberIds,
  boolIds,
  selectIds,
  toolKeys,
  initialToolProfiles,
  defaultToolNameSpaces,
  machineKeys,
  machineDefaults,
  operationKeys,
  drillKeys,
  defaultDrill,
  toolStorage,
} from "./parameter-schema.js";
import { createOperationsController } from "./operations-controller.js";
import { createCatalogController } from "./catalog-controller.js";
import { createConfigurationController } from "./configuration-controller.js";
import { createNcViewController } from "./nc-view-controller.js";
import { createParametersController } from "./parameters-controller.js";
import { createDrawingController } from "./drawing-controller.js";
import { createCalculationController } from "./calculation-controller.js";
import { createNcEditorController } from "./nc-editor-controller.js";
import { createProjectController } from "./project-controller.js";
import { createViewportController } from "./viewport-controller.js";
import { createEntryController } from "./entry-controller.js";
import CAM from "../core/index.js";
import MACHINES from "../cam/machines.js";
import UI_RENDER from "../ui/render.js";
import ATLANTA_OPERATIONS from "../operations/index.js";
import ATLANTA_SEED_TOOLS from "../data/tools.js";
import SKETCH from "../geometry/sketch.js";
import ORIGIN from "../geometry/origin.js";
import SIMULATION from "../ui/simulation.js";
import SKETCH_UI from "../ui/editor/editor.js";
import WALL_NETWORK from "../cam/wall-network.js";
import OPEN_WALL from "../cam/open-wall.js";
import MATERIAL_VIEW from "../cam/material-view.js";
import CAM_JOB from "../workers/client.js";
import ENTRY from "../cam/entry.js";
import GUIDES from "../geometry/guides.js";
import CONTROLLER from "../nc/controller.js";
import CANVAS_INPUT from "../ui/canvas-input.js";
import SAMPLES from "../data/samples.js";
export function startApplication() {
  // Live accessors preserve a single application/editor state across controllers.
  // Factories only declare callbacks; none may read this context during construction.
  const controllerContext = {
    get $() {
      return $;
    },
    get A() {
      return A;
    },
    get activeOperationId() {
      return activeOperationId;
    },
    set activeOperationId(value) {
      activeOperationId = value;
    },
    get boolIds() {
      return boolIds;
    },
    get C() {
      return C;
    },
    get calculation() {
      return calculation;
    },
    get contourSignature() {
      return contourSignature;
    },
    get cutSketchSignature() {
      return cutSketchSignature;
    },
    set cutSketchSignature(value) {
      cutSketchSignature = value;
    },
    get defaultDrill() {
      return defaultDrill;
    },
    get diagnosticIssues() {
      return diagnosticIssues;
    },
    set diagnosticIssues(value) {
      diagnosticIssues = value;
    },
    get diagnosticMaterial() {
      return diagnosticMaterial;
    },
    set diagnosticMaterial(value) {
      diagnosticMaterial = value;
    },
    get drillKeys() {
      return drillKeys;
    },
    get editor() {
      return editor;
    },
    get failedDiagnostic() {
      return failedDiagnostic;
    },
    get initialToolProfiles() {
      return initialToolProfiles;
    },
    get invalidate() {
      return invalidate;
    },
    get M() {
      return M;
    },
    get machine() {
      return machine;
    },
    get machineDefaults() {
      return machineDefaults;
    },
    get machineSelected() {
      return machineSelected;
    },
    get nextOperation() {
      return nextOperation;
    },
    set nextOperation(value) {
      nextOperation = value;
    },
    get operationKeys() {
      return operationKeys;
    },
    get operations() {
      return operations;
    },
    get ORIGIN() {
      return ORIGIN;
    },
    get originSetup() {
      return originSetup;
    },
    get renderContours() {
      return renderContours;
    },
    get requestDraw() {
      return requestDraw;
    },
    get restoreOperationOrigin() {
      return restoreOperationOrigin;
    },
    get scheduleAutosave() {
      return scheduleAutosave;
    },
    get setMachiningScene() {
      return setMachiningScene;
    },
    get sharedOriginSetup() {
      return sharedOriginSetup;
    },
    set sharedOriginSetup(value) {
      sharedOriginSetup = value;
    },
    get showMachine() {
      return showMachine;
    },
    get showResult() {
      return showResult;
    },
    get showWorkPane() {
      return showWorkPane;
    },
    get SKETCH() {
      return SKETCH;
    },
    get state() {
      return state;
    },
    get toolCatalog() {
      return toolCatalog;
    },
    get UI_RENDER() {
      return UI_RENDER;
    },
    get updateParams() {
      return updateParams;
    },
    get updatePick() {
      return updatePick;
    },
    get activeOperation() {
      return activeOperation;
    },
    get addToolOptions() {
      return addToolOptions;
    },
    get catalogEditing() {
      return catalogEditing;
    },
    set catalogEditing(value) {
      catalogEditing = value;
    },
    get renderOperationPanel() {
      return renderOperationPanel;
    },
    get toast() {
      return toast;
    },
    set toolCatalog(value) {
      toolCatalog = value;
    },
    get toolStorage() {
      return toolStorage;
    },
    get calculate() {
      return calculate;
    },
    get captureOperation() {
      return captureOperation;
    },
    get hasMarks() {
      return hasMarks;
    },
    set machine(value) {
      machine = value;
    },
    get machineKeys() {
      return machineKeys;
    },
    set machineSelected(value) {
      machineSelected = value;
    },
    get machineSettings() {
      return machineSettings;
    },
    get message() {
      return message;
    },
    get numberIds() {
      return numberIds;
    },
    get originEffective() {
      return originEffective;
    },
    get selectIds() {
      return selectIds;
    },
    get activeViewPlane() {
      return activeViewPlane;
    },
    set activeViewPlane(value) {
      activeViewPlane = value;
    },
    get codeArea() {
      return codeArea;
    },
    get codeFrameCount() {
      return codeFrameCount;
    },
    set codeFrameCount(value) {
      codeFrameCount = value;
    },
    get codeFrameExecution() {
      return codeFrameExecution;
    },
    set codeFrameExecution(value) {
      codeFrameExecution = value;
    },
    get codeFrameLayout() {
      return codeFrameLayout;
    },
    set codeFrameLayout(value) {
      codeFrameLayout = value;
    },
    get codeFrameLine() {
      return codeFrameLine;
    },
    set codeFrameLine(value) {
      codeFrameLine = value;
    },
    get codeFrameStatus() {
      return codeFrameStatus;
    },
    get codeMarker() {
      return codeMarker;
    },
    get config() {
      return config;
    },
    get focusIssue() {
      return focusIssue;
    },
    get motionViewCache() {
      return motionViewCache;
    },
    set motionViewCache(value) {
      motionViewCache = value;
    },
    get playback() {
      return playback;
    },
    get resize() {
      return resize;
    },
    get OPEN_WALL() {
      return OPEN_WALL;
    },
    get renderMachine() {
      return renderMachine;
    },
    get syncWorkspace() {
      return syncWorkspace;
    },
    get toolKeys() {
      return toolKeys;
    },
    get updateEntryReadout() {
      return updateEntryReadout;
    },
    get updatePlaneReadout() {
      return updatePlaneReadout;
    },
    get WALL_NETWORK() {
      return WALL_NETWORK;
    },
    get dxfSettings() {
      return dxfSettings;
    },
    get enableExport() {
      return enableExport;
    },
    get originBasePoint() {
      return originBasePoint;
    },
    set originBasePoint(value) {
      originBasePoint = value;
    },
    set originEffective(value) {
      originEffective = value;
    },
    get originShift() {
      return originShift;
    },
    set originShift(value) {
      originShift = value;
    },
    get parsedSettings() {
      return parsedSettings;
    },
    set parsedSettings(value) {
      parsedSettings = value;
    },
    get planSignature() {
      return planSignature;
    },
    get planSketchDxf() {
      return planSketchDxf;
    },
    set planSketchDxf(value) {
      planSketchDxf = value;
    },
    get renderOperationLabels() {
      return renderOperationLabels;
    },
    get sideOptions() {
      return sideOptions;
    },
    get ATLANTA_OPERATIONS() {
      return ATLANTA_OPERATIONS;
    },
    set calculation(value) {
      calculation = value;
    },
    get CAM_JOB() {
      return CAM_JOB;
    },
    get currentAutoFix() {
      return currentAutoFix;
    },
    set currentAutoFix(value) {
      currentAutoFix = value;
    },
    get errorEntryPoint() {
      return errorEntryPoint;
    },
    set errorEntryPoint(value) {
      errorEntryPoint = value;
    },
    set failedDiagnostic(value) {
      failedDiagnostic = value;
    },
    get lastCalculationErrorText() {
      return lastCalculationErrorText;
    },
    set lastCalculationErrorText(value) {
      lastCalculationErrorText = value;
    },
    get MATERIAL_VIEW() {
      return MATERIAL_VIEW;
    },
    get operationLabel() {
      return operationLabel;
    },
    get parseNc() {
      return parseNc;
    },
    get restoreEntry() {
      return restoreEntry;
    },
    get restoreEntryStart() {
      return restoreEntryStart;
    },
    get restoreExit() {
      return restoreExit;
    },
    get saveToolProfile() {
      return saveToolProfile;
    },
    get setSim() {
      return setSim;
    },
    get showFailedFrame() {
      return showFailedFrame;
    },
    get toastTimer() {
      return toastTimer;
    },
    get unsupportedDxfGeometry() {
      return unsupportedDxfGeometry;
    },
    get withSides() {
      return withSides;
    },
    get currentMotions() {
      return currentMotions;
    },
    get profile() {
      return profile;
    },
    get applyMachine() {
      return applyMachine;
    },
    get applyOperationValues() {
      return applyOperationValues;
    },
    get applyOrigin() {
      return applyOrigin;
    },
    get applyToolProfile() {
      return applyToolProfile;
    },
    get dirtyDxf() {
      return dirtyDxf;
    },
    get fixParkFields() {
      return fixParkFields;
    },
    get importCatalogue() {
      return importCatalogue;
    },
    get marksSignature() {
      return marksSignature;
    },
    set marksSignature(value) {
      marksSignature = value;
    },
    set operations(value) {
      operations = value;
    },
    get parseDxf() {
      return parseDxf;
    },
    get persistMachine() {
      return persistMachine;
    },
    get persistTools() {
      return persistTools;
    },
    get primaryOperation() {
      return primaryOperation;
    },
    get restoreDone() {
      return restoreDone;
    },
    get restoreOperations() {
      return restoreOperations;
    },
    get setMode() {
      return setMode;
    },
    get timer() {
      return timer;
    },
    set timer(value) {
      timer = value;
    },
    get activeResult() {
      return activeResult;
    },
    get canvas() {
      return canvas;
    },
    get ch() {
      return ch;
    },
    set ch(value) {
      ch = value;
    },
    get ctx() {
      return ctx;
    },
    get cw() {
      return cw;
    },
    set cw(value) {
      cw = value;
    },
    get drawPending() {
      return drawPending;
    },
    set drawPending(value) {
      drawPending = value;
    },
    get entryPresentation() {
      return entryPresentation;
    },
    get focusedIssueId() {
      return focusedIssueId;
    },
    get geometryIssues() {
      return geometryIssues;
    },
    get motionPoint() {
      return motionPoint;
    },
    get pixelScale() {
      return pixelScale;
    },
    set pixelScale(value) {
      pixelScale = value;
    },
    get placeCodeFrame() {
      return placeCodeFrame;
    },
    get restCache() {
      return restCache;
    },
    set restCache(value) {
      restCache = value;
    },
    get restCanvas() {
      return restCanvas;
    },
    get restSweepCanvas() {
      return restSweepCanvas;
    },
    get sceneComp() {
      return sceneComp;
    },
    set sceneComp(value) {
      sceneComp = value;
    },
    get sceneDirty() {
      return sceneDirty;
    },
    set sceneDirty(value) {
      sceneDirty = value;
    },
    get sceneSnapshot() {
      return sceneSnapshot;
    },
    set sceneSnapshot(value) {
      sceneSnapshot = value;
    },
    get showCodeFrame() {
      return showCodeFrame;
    },
    get CONTROLLER() {
      return CONTROLLER;
    },
    get ENTRY() {
      return ENTRY;
    },
    set entryPresentation(value) {
      entryPresentation = value;
    },
    get GUIDES() {
      return GUIDES;
    },
    get slotAxisCache() {
      return slotAxisCache;
    },
    set slotAxisCache(value) {
      slotAxisCache = value;
    },
  };

  const {
    primaryOperation,
    activeOperation,
    activeResult,
    markColor,
    drillColors,
    hasMarks,
    operationKind,
    operationLabel,
    captureOperation,
    normalizeDirection,
    applyOperationValues,
    saveEntryPoint,
    restorePoint,
    restoreEntry,
    restoreEntryStart,
    restoreExit,
    applyCatalogueTool,
    addToolOptions,
    updateDrillFields,
    renderOperationPanel,
    refreshActiveGeometry,
    selectOperation,
    startMarking,
    addOperation,
    moveOperation,
    removeOperation,
    restoreOperations,
  } = createOperationsController(controllerContext);
  const {
    persistTools,
    catalogueStatus,
    catalogueSelection,
    editCatalogueTool,
    catalogueChanged,
    saveCatalogueTool,
    importCatalogue,
  } = createCatalogController(controllerContext);
  const {
    config,
    profile,
    captureMachine,
    fixParkFields,
    applyMachine,
    persistMachine,
    renderMachine,
    showMachine,
    chooseMachine,
  } = createConfigurationController(controllerContext);
  const {
    currentMotions,
    motionPoint,
    updatePlaneReadout,
    clearCodeFrame,
    showFailedFrame,
    placeCodeFrame,
    showCodeFrame,
    setSim,
  } = createNcViewController(controllerContext);
  const { saveToolProfile, applyToolProfile, updateParams } =
    createParametersController(controllerContext);
  const {
    activateContour,
    renderContours,
    applyOrigin,
    originSetup,
    restoreOperationOrigin,
    changeOrigin,
    setCustomOrigin,
    parseDxf,
    dirtyDxf,
    unsupportedDxfGeometry,
  } = createDrawingController(controllerContext);
  const {
    calculationButton,
    cancelCalculation,
    completeCalculation,
    calculationError,
    plannedOperations,
    startCalculation,
    calculate,
    timeText,
    showResult,
  } = createCalculationController(controllerContext);
  const { parseNc, optionalNumber, applyNc, download, exportCode } =
    createNcEditorController(controllerContext);
  const {
    projectObject,
    autosaveStatus,
    scheduleAutosave,
    restoreProject,
    importGeometryProject,
    resetOperationGeometry,
    resetOperations,
    loadFile,
  } = createProjectController(controllerContext);
  const {
    rawToWorld,
    project,
    screen,
    fromScreen,
    fitView,
    queueDraw,
    requestDraw,
    strokePoints,
    strokeSegments,
    drawGrid,
    drawMaterial,
    drawCutter,
    getPlungeGeometry,
    isPlungeAllowed,
    drawPlungeZones,
    drawScene,
    draw,
    drawGeometryIssues,
    resize,
  } = createViewportController(controllerContext);
  const { nearest, nearestEntry, snapOrigin, updateEntryReadout, selectEntryPoint } =
    createEntryController(controllerContext);

  const $ = (id) => document.getElementById(id),
    C = CAM,
    M = MACHINES;
  function sideOptions() {
    return (
      M.cutModes
        .map((mode) => '<option value="' + mode.value + '">' + mode.label + "</option>")
        .join("") + '<option value="g12">Цикл расфрезерования G12/G13</option>'
    );
  }
  $("cutSide").innerHTML = sideOptions();

  const state = createApplicationState();
  let workPane = "drawing";
  function showWorkPane(name, keepTool = false) {
    workPane = UI_RENDER.showWorkPane(name, workPane, keepTool, cancelCanvasAction);
  }
  function syncWorkspace() {
    UI_RENDER.syncWorkspace({
      state,
      operationsCount: operations.length,
      editorItemsCount: editor.items.length,
    });
  }
  const ctx = $("canvas").getContext("2d"),
    canvas = $("canvas");
  let cw = 500,
    ch = 400,
    pixelScale = 1,
    drawPending = false,
    timer = null,
    toastTimer = null,
    pointerDown = null,
    restoreDone = false;
  const restCanvas = document.createElement("canvas"),
    restSweepCanvas = document.createElement("canvas");
  let restCache = { material: null, key: "" },
    diagnosticMaterial = null;
  let calculation = null,
    entryPresentation = null,
    currentAutoFix = null,
    slotAxisCache = { contours: null, info: null };
  let activeViewPlane = "xy",
    motionViewCache = { source: null, plane: null, motions: [] };
  let sceneDirty = true,
    sceneSnapshot = null,
    sceneComp = false;
  const codeArea = $("code"),
    codeMarker = $("codeFrameHighlight"),
    codeFrameStatus = $("codeFrameStatus");
  let codeFrameLine = 0,
    codeFrameCount = 0,
    codeFrameLayout = null,
    codeFrameExecution = null;
  let issueCache = { source: null, issues: [] },
    diagnosticIssues = null,
    failedDiagnostic = null,
    focusedIssueId = null,
    focusedIssueTimer = null,
    lastCalculationErrorText = "",
    errorEntryPoint = null;
  let machine = "fanuc3000c",
    machineSelected = false;
  const A = ATLANTA_OPERATIONS;

  let machineSettings = JSON.parse(JSON.stringify(machineDefaults)),
    planSketchDxf = null,
    cutSketchSignature = "",
    parsedSettings = null,
    originBasePoint = { x: 0, y: 0 },
    originEffective = { x: 0, y: 0 },
    originShift = { x: 0, y: 0 };

  let operations = [primaryOperation()],
    activeOperationId = "primary",
    nextOperation = 1,
    marksSignature = "",
    catalogEditing = null;
  let sharedOriginSetup = null;
  let toolCatalog = A.checkTools(ATLANTA_SEED_TOOLS);
  try {
    const saved = localStorage.getItem(toolStorage);
    if (saved) toolCatalog = A.checkTools(JSON.parse(saved));
  } catch (error) {}

  function bindOperations() {
    $("operationChoice").onchange = () => selectOperation($("operationChoice").value);
    $("addMillOperation").onclick = () => addOperation("profile");
    $("addDrillOperation").onclick = () => addOperation("drill");
    $("moveOperationUp").onclick = () => moveOperation(-1);
    $("moveOperationDown").onclick = () => moveOperation(1);
    $("removeOperation").onclick = removeOperation;
    $("markOperation").onclick = startMarking;
    $("operationTool").onchange = () => {
      activeOperation().toolNumber = $("operationTool").value
        ? Number($("operationTool").value)
        : null;
      const tool = toolCatalog.get(activeOperation().toolNumber);
      if (tool) {
        var _tool$correctionRadiu3;
        $("corrector").value = tool.corrector;
        $("correctionValue").value = Math.round(
          ((_tool$correctionRadiu3 = tool.correctionRadius) !== null &&
          _tool$correctionRadiu3 !== void 0
            ? _tool$correctionRadiu3
            : tool.diameter / 2) * 1000,
        );
      }
      renderOperationPanel();
      updateParams();
      dirtyDxf();
    };
    $("operationColor").oninput = () => {
      activeOperation().color = $("operationColor").value;
      $("markOperation").style.setProperty("--mark-color", activeOperation().color);
      editor.refreshOperation();
      scheduleAutosave();
      requestDraw();
    };
    for (const [key, id] of Object.entries(drillKeys))
      $(id).addEventListener("input", () => {
        const op = activeOperation();
        if (op.kind === "drill") {
          op.drill[key] = $(id).value;
          updateDrillFields();
          renderOperationLabels();
          dirtyDxf();
        }
      });
    for (const [type, label] of Object.entries(A.toolTypes))
      $("catalogType").appendChild(new Option(label, type));
    $("openCatalog").onclick = () => {
      catalogueSelection(activeOperation().toolNumber);
      UI_RENDER.openDialog("catalogDialog");
    };
    $("closeCatalog").onclick = () => UI_RENDER.closeDialog("catalogDialog");
    $("catalogChoice").onchange = () =>
      editCatalogueTool(toolCatalog.get(Number($("catalogChoice").value)));
    $("newCatalogTool").onclick = () => {
      editCatalogueTool(null);
      $("catalogNumber").focus();
    };
    $("resetCatalogForm").onclick = () => editCatalogueTool(toolCatalog.get(catalogEditing));
    $("saveCatalogTool").onclick = saveCatalogueTool;
    $("deleteCatalogTool").onclick = () => {
      if (catalogEditing === null) return;
      captureOperation();
      const removed = toolCatalog.get(catalogEditing),
        number = catalogEditing;
      for (const op of operations)
        if (op.toolNumber === number) {
          op.params = {
            ...op.params,
            diameter: String(removed.diameter),
            flutes: String(removed.flutes),
          };
          op.toolNumber = null;
        }
      toolCatalog.delete(number);
      catalogueChanged();
      catalogueSelection();
      catalogueStatus("Инструмент №" + number + " удалён.");
    };
    $("importCatalog").onclick = () => {
      $("catalogFile").value = "";
      $("catalogFile").click();
    };
    $("catalogFile").onchange = async () => {
      const file = $("catalogFile").files[0];
      if (!file) return;
      try {
        if (file.size > 6000000) throw Error("Каталог больше 6 МБ.");
        importCatalogue(JSON.parse((await file.text()).replace(/^\uFEFF/, "")));
      } catch (error) {
        catalogueStatus(error.message, true);
      }
    };
    $("exportCatalog").onclick = () =>
      download(
        "ATLANTA_tools.json",
        JSON.stringify(
          {
            format: "ATLANTA-tools",
            version: 1,
            tools: [...toolCatalog.values()],
          },
          null,
          2,
        ),
        "application/json",
      );
  }
  function renderOperationLabels() {
    UI_RENDER.renderOperationLabels({
      operations,
      editor,
      operationLabel,
      syncWorkspace,
    });
  }
  function dxfSettings() {
    return {
      dxfUnits: $("dxfUnits").value,
      tolerance: $("tolerance").value,
      joinTolerance: $("joinTolerance").value,
    };
  }
  function planSignature() {
    if (planSketchDxf === null)
      try {
        planSketchDxf = SKETCH.toScene(SKETCH.fromContours(state.planContours)).dxf;
      } catch (error) {
        planSketchDxf = state.rawDxf;
      }
    return planSketchDxf;
  }
  function contourSignature(contour) {
    return C.contoursToDXF([{ ...contour, layer: "MACHINING" }]);
  }
  function withSides(contours, sides, fallback) {
    const prior = new Map(sides);
    return contours.map((contour) => ({
      ...contour,
      enabled: true,
      side: prior.get(contourSignature(contour)) || M.normalizeSide(fallback),
    }));
  }
  function setMachiningScene(
    scene,
    sides = state.contours.map((contour) => [contourSignature(contour), contour.side]),
  ) {
    state.contours = withSides(scene.machiningContours, sides, $("cutSide").value);
    cutSketchSignature = scene.machiningSignature;
    marksSignature = scene.marksSignature;
    state.dxfWarnings = [
      ...scene.warnings.filter(
        (text) =>
          !(
            /разветв|ветвлен|неоднозначн/i.test(text) &&
            scene.machiningContours.length &&
            scene.machiningContours.every((c) => !c.ambiguous)
          ),
      ),
      ...scene.machiningWarnings,
    ];
  }
  const playback = SIMULATION.create({
    state,
    $,
    win: window,
    motionLength: C.motionLength,
    draw: queueDraw,
    toast,
  });
  const editor = SKETCH_UI.create({
    $,
    toast,
    draw: requestDraw,
    save: scheduleAutosave,
    zoom: () => state.zoom,
    activeOperation,
    markColor,
    drillColors,
    toolDimensions: () => {
      const c = config();
      return { kind: c.toolKind, diameter: c.diameter };
    },
    setToolDiameter: (value) => {
      if ($("diameter").readOnly || Number($("diameter").value) === value) return;
      $("diameter").value = String(value);
      $("diameter").dispatchEvent(new Event("input", { bubbles: true }));
    },
    viewport: () => ({ width: cw, height: ch }),
    drawingOrigin: () => ({ ...originEffective }),
    getContours: () => state.planContours,
    calculate: finishSketchCalculation,
    canSelectAll: () =>
      state.mode === "dxf" &&
      machineSelected &&
      !$("help").open &&
      !$("machineDialog").open &&
      !$("catalogDialog").open &&
      (editor.isOpen || state.planContours.length > 0 || editor.items.length > 0),
    scaleBlocked: () => {
      const unsupported = unsupportedDxfGeometry();
      return unsupported.length
        ? "Масштабирование остановлено: DXF содержит неподдерживаемую геометрию (" +
            unsupported.join(", ") +
            ")."
        : "";
    },
    onBegin: () => {
      if (state.mode !== "dxf") setMode("dxf");
      showWorkPane("drawing");
      playback.pause();
      state.pick = null;
      state.view = "xy";
      $("topView").classList.add("active");
      $("isoView").classList.remove("active");
      updatePick();
    },
    cancelAction: cancelAllAction,
    onScene: (scene, fit) => {
      var _state$contours$2;
      const planChanged = scene.dxf !== planSignature(),
        cutChanged = scene.machiningSignature !== cutSketchSignature,
        marksChanged = scene.marksSignature !== marksSignature;
      if (!planChanged && !cutChanged && !marksChanged) {
        if (fit) state.fit = fit;
        requestDraw();
        return;
      }
      if (planChanged) {
        planSketchDxf = scene.dxf;
        $("dxfUnits").value = "1";
        state.rawDxf = scene.dxf;
        parsedSettings = dxfSettings();
        state.planContours = scene.contours;
        state.dxfName = "Свой эскиз";
        state.dxfUnsupported = [];
        $("fileName").textContent = state.dxfName;
      }
      setMachiningScene(scene);
      state.active =
        (_state$contours$2 = state.contours[0]) === null || _state$contours$2 === void 0
          ? void 0
          : _state$contours$2.id;
      invalidate(
        cutChanged || marksChanged
          ? "Отметки обработки изменены · пересчитай траекторию"
          : "План изменён · проверь ноль и рассчитай",
      );
      $("code").value = "";
      $("canvasTag").textContent = "ПЛАН / ОБРАБОТКА · ММ";
      const count = editor.items.filter((item) => A.isMark(item, activeOperation())).length;
      message([
        {
          text: count
            ? "В выбранной операции отмечено элементов: " + count + "."
            : "Отметь контуры или окружности для выбранной операции.",
        },
        ...scene.machiningWarnings.map((text) => ({ type: "warn", text })),
      ]);
      renderOperationLabels();
      renderContours();
      if (fit) state.fit = fit;
    },
    onBlank: () => {
      originBasePoint = { x: 0, y: 0 };
      originShift = { x: 0, y: 0 };
      $("originShiftX").value = "0";
      $("originShiftY").value = "0";
      $("originPreset").value = "tl";
      applyOrigin();
      resetOperations();
      state.dxfName = "Новый чертёж";
      $("fileName").textContent = state.dxfName;
      state.rawDxf = "";
      planSketchDxf = "";
      state.fit = true;
      requestDraw();
    },
    onFinish: () => {
      var _state$contours$3;
      showWorkPane("operations");
      if (!state.ready) applyOrigin();
      if (!state.active)
        state.active =
          (_state$contours$3 = state.contours[0]) === null || _state$contours$3 === void 0
            ? void 0
            : _state$contours$3.id;
      renderContours();
      updateParams();
      state.fit = true;
      $("generate").textContent = "Рассчитать траекторию";
      requestDraw();
    },
  });
  function finishSketchCalculation() {
    if (state.ready && state.result) {
      requestDraw();
      scheduleAutosave();
      return;
    }
    if (!hasMarks()) {
      toast("План сохранён. Отметь нужные контуры или отверстия.");
      requestDraw();
      scheduleAutosave();
      return;
    }
    calculate();
  }
  function toast(t) {
    toastTimer = UI_RENDER.showToast(t, toastTimer);
  }
  function escapeHtml(s) {
    return UI_RENDER.escapeHtml(s);
  }

  function setDetails(open) {
    UI_RENDER.setDetails(open);
  }
  function message(items) {
    UI_RENDER.renderMessages({
      items,
      issues: geometryIssues(),
      errorEntryPoint,
      onIssueFocus: focusIssue,
      onMenuHighlight: highlightMenuForIssue,
      showFailedFrame,
      setDetails,
    });
  }
  function geometryIssues() {
    var _activeResult;
    if (state.mode !== "dxf") return [];
    if (diagnosticIssues) return diagnosticIssues;
    if (
      (_activeResult = activeResult()) !== null &&
      _activeResult !== void 0 &&
      _activeResult.wallNetworkInfo
    )
      return activeResult().wallNetworkInfo.issues;
    if (issueCache.source !== state.contours) {
      let issues = [];
      try {
        issues = WALL_NETWORK.inspect(state.contours);
      } catch (error) {}
      issueCache = { source: state.contours, issues };
    }
    return issueCache.issues;
  }
  function blinkMenuElement(el) {
    UI_RENDER.blinkMenuElement(el);
  }
  function highlightMenuForIssue(issue) {
    UI_RENDER.highlightMenuForIssue(issue, lastCalculationErrorText, showWorkPane);
  }
  function focusIssue(issue) {
    if (!issue || !issue.point) return;
    state.view = "xy";
    $("topView").classList.add("active");
    $("isoView").classList.remove("active");
    state.center = project(rawToWorld(issue.point, config().topZ));
    state.pan = { x: 0, y: 0 };
    state.zoom = Math.max(state.zoom, 12);
    state.fit = false;
    if (issue.id != null) {
      focusedIssueId = issue.id;
      clearTimeout(focusedIssueTimer);
      focusedIssueTimer = setTimeout(() => {
        focusedIssueId = null;
        requestDraw();
      }, 6000);
    }
    requestDraw();
    highlightMenuForIssue(issue);
  }
  function enableExport(ok) {
    state.ready = ok;
    $("exportTxt").disabled = !ok;
    $("exportNc").disabled = !ok;
    $("editCode").disabled = !ok || state.mode !== "dxf";
  }

  codeArea.addEventListener("scroll", () => placeCodeFrame(false));

  function invalidate(text = "Параметры изменены · пересчитай траекторию") {
    const hadFailedFrame = !!failedDiagnostic;
    cancelCalculation();
    diagnosticMaterial = null;
    entryPresentation = null;
    diagnosticIssues = null;
    failedDiagnostic = null;
    enableExport(false);
    clearCodeFrame();
    playback.setMotions([]);
    state.result = null;
    if (state.mode === "dxf") $("code").value = "";
    $("compReadout").hidden = true;
    $("compSummary").hidden = true;
    if (state.mode === "nc") state.parsed = null;
    $("play").textContent = "▶";
    state.sim = [];
    $("frameReadout").textContent = "Траектория не рассчитана";
    $("codeStatus").textContent = text;
    $("canvasTag").textContent = state.mode === "nc" ? "КОД НЕ ПРОВЕРЕН" : "ЧЕРТЁЖ · ММ";
    $("statPasses").textContent = "—";
    $("statTime").textContent = "—";
    $("statBlocks").textContent = "—";
    updateEntryReadout();
    if (hadFailedFrame) message([]);
    requestDraw();
  }
  function setMode(mode) {
    var _state$result4;
    if (failedDiagnostic) invalidate("Требуется новый расчёт");
    if (mode !== state.mode) {
      cancelCalculation();
      $("settingsBody").scrollTop = 0;
    }
    if (state.mode === "nc" && mode !== "nc") state.ncText = $("code").value;
    if (mode === "nc" && editor.isOpen && !editor.finish()) return;
    state.mode = mode;
    $("compReadout").hidden = true;
    $("compSummary").hidden = true;
    document.querySelectorAll(".dxfOnly").forEach((x) => (x.hidden = mode !== "dxf"));
    document.querySelectorAll(".ncOnly").forEach((x) => (x.hidden = mode !== "nc"));
    $("dxfMode").classList.toggle("active", mode === "dxf");
    $("ncMode").classList.toggle("active", mode === "nc");
    $("code").readOnly = mode === "dxf";
    document.body.classList.toggle("nc-mode", mode === "nc");
    if (mode === "nc") {
      document.body.classList.add("show-code");
      $("viewTitle").textContent = "Программа " + M.profiles[machine].name;
    }
    $("toggleCode").textContent = document.body.classList.contains("show-code")
      ? "Скрыть код"
      : "Код";
    $("generate").textContent =
      mode === "dxf"
        ? editor.isOpen
          ? "К обработке → рассчитать"
          : "Рассчитать траекторию"
        : "Проверить программу";
    $("code").value =
      mode === "dxf"
        ? ((_state$result4 = state.result) === null || _state$result4 === void 0
            ? void 0
            : _state$result4.code) || ""
        : state.ncText;
    $("fileName").textContent =
      mode === "dxf"
        ? state.dxfName || "DXF не загружен"
        : state.ncName || "Вставь текст или открой TXT/NC";
    $("passesCaption").textContent = mode === "dxf" ? "ПРОХОДЫ" : "УЧАСТКИ";
    $("sizeCaption").textContent = mode === "dxf" ? "ГАБАРИТ DXF" : "ГАБАРИТ ПУТИ";
    $("viewSubtitle").textContent =
      mode === "dxf"
        ? "Открой чертёж → выбери инструмент → скачай TXT"
        : "Программные координаты " + M.profiles[machine].name;
    if (mode === "nc" && state.ncText) parseNc();
    else if (mode === "dxf" && state.result) {
      showResult();
    } else {
      enableExport(false);
      setSim();
      requestDraw();
    }
    state.fit = true;
    state.pick = null;
    updatePick();
    showWorkPane(workPane);
    syncWorkspace();
    scheduleAutosave();
  }

  function updatePick() {
    const active = state.pick;
    if (!active) {
      state.originHover = null;
      state.originSnapKind = "";
      state.touchHover = null;
      state.plungeHover = null;
      state.exitHover = null;
    }
    if (active !== "entryStart") state.plungeHover = null;
    if (active !== "exit") state.exitHover = null;
    $("pickEntryStart").classList.toggle("active", active === "entryStart");
    $("pickOrigin").classList.toggle("active", active === "origin");
    $("pickStart").classList.toggle("active", active === "start");
    if ($("pickExit")) $("pickExit").classList.toggle("active", active === "exit");
    $("canvasPrompt").hidden = !active;
    $("canvasPrompt").textContent =
      active === "entryStart"
        ? "Выбери точку погружения в зелёной области. Примагничивание: линии, направляющие и пересечения. Esc — отмена."
        : active === "exit"
          ? "Выбери точку выхода. Примагничивание: линии, направляющие и пересечения. Esc — отмена."
          : active === "origin"
            ? "Щёлкни по точке нуля. Привязка: линии, направляющие и пересечения. Esc — отмена."
            : "Выбери касание на отмеченной стенке. Примагничивание: начальные точки с цифрами и узлы. Для свободной точки нажми «Погружение». Esc — отмена.";
    if (active === "start" || active === "entryStart" || active === "exit") setDetails(false);
    if (active) {
      state.view = "xy";
      $("topView").classList.add("active");
      $("isoView").classList.remove("active");
      state.fit = true;
    }
    updateEntryReadout();
    requestDraw();
  }

  state.center = { u: 0, v: 0 };

  function sketchMousePoint(e) {
    const p = fromScreen(e.x, e.y);
    return C.P(p.x + originEffective.x, p.y + originEffective.y);
  }
  function cancelCanvasAction(focus = false, fullToolReset = false) {
    pointerDown = null;
    canvas.classList.remove("panning");
    state.pick = null;
    state.originHover = null;
    state.originSnapKind = "";
    state.touchHover = null;
    state.plungeHover = null;
    state.exitHover = null;
    if (
      !fullToolReset &&
      editor &&
      editor.isOpen &&
      editor.hasActiveAction &&
      editor.hasActiveAction()
    ) {
      editor.cancelActiveAction(focus);
    } else if (editor && editor.cancelTool) {
      editor.cancelTool(focus);
    }
    updatePick();
  }
  function cancelAllAction() {
    if (state.pick) {
      state.pick = null;
      state.originHover = null;
      state.originSnapKind = "";
      updatePick();
      return;
    }
    cancelCanvasAction(false, false);
    playback.pause();
    if (calculation) invalidate("Расчёт отменён");
    setDetails(false);
    for (const dialog of document.querySelectorAll("dialog")) {
      if (dialog.open && (dialog.id !== "machineDialog" || machineSelected)) dialog.close();
    }
    if (!$("machineDialog").open) canvas.focus();
  }
  CANVAS_INPUT.attach(canvas, window, {
    down: (e) => {
      if (editor.scaling && !e.shiftKey && !e.altKey) {
        pointerDown = null;
        return;
      }
      pointerDown = {
        x: e.x,
        y: e.y,
        px: state.pan.x,
        py: state.pan.y,
        moved: false,
        pan: e.shiftKey || e.altKey,
      };
      if (pointerDown.pan) {
        canvas.classList.add("panning");
        return;
      }
      if (
        editor.isOpen &&
        !state.pick &&
        state.mode === "dxf" &&
        state.view === "xy" &&
        !e.altKey
      ) {
        const p = sketchMousePoint(e);
        if (editor.startPaint(p)) {
          pointerDown.paint = true;
          return;
        }
        if (editor.startSelection(p, e.ctrlKey, state.zoom)) {
          pointerDown.selection = true;
          return;
        }
        if (editor.startBox(p)) {
          pointerDown.box = true;
          return;
        }
        if (editor.guideDrawing) {
          pointerDown.guide = true;
          pointerDown.hadReference = editor.guideHasReference;
          pointerDown.itemCount = editor.items.length;
          if (!pointerDown.hadReference) editor.click(p, e.shiftKey, state.zoom);
        }
      }
    },
    move: (e) => {
      var _pointerDown;
      if (pointerDown && pointerDown.pan) {
        if (Math.hypot(e.x - pointerDown.x, e.y - pointerDown.y) > 4) pointerDown.moved = true;
        if (pointerDown.moved) {
          state.pan.x = pointerDown.px + e.x - pointerDown.x;
          state.pan.y = pointerDown.py + e.y - pointerDown.y;
          state.fit = false;
          requestDraw();
        }
        return;
      }
      if ((_pointerDown = pointerDown) !== null && _pointerDown !== void 0 && _pointerDown.paint) {
        if (!pointerDown.moved)
          pointerDown.moved = Math.hypot(e.x - pointerDown.x, e.y - pointerDown.y) > 4;
        if (pointerDown.moved) editor.movePaint(e.inside ? sketchMousePoint(e) : null, state.zoom);
        return;
      }
      if (pointerDown && pointerDown.selection) {
        editor.moveSelection(sketchMousePoint(e), state.zoom);
        return;
      }
      if (pointerDown && (pointerDown.box || pointerDown.guide)) {
        if (Math.hypot(e.x - pointerDown.x, e.y - pointerDown.y) > 4) pointerDown.moved = true;
        const p = sketchMousePoint(e);
        if (pointerDown.box) editor.moveBox(p);
        else editor.move(p, e.shiftKey, state.zoom);
        return;
      }
      if (pointerDown && Math.hypot(e.x - pointerDown.x, e.y - pointerDown.y) > 4) {
        pointerDown.moved = true;
        state.pan.x = pointerDown.px + e.x - pointerDown.x;
        state.pan.y = pointerDown.py + e.y - pointerDown.y;
        state.fit = false;
        requestDraw();
      }
      if (state.view === "xy") {
        const p = fromScreen(e.x, e.y);
        const cfg = config();
        if (state.pick === "origin") {
          const rawP = C.P(p.x + cfg.originX, p.y + cfg.originY);
          const snap = snapOrigin(rawP);
          state.originHover = snap ? snap.p : rawP;
          state.originSnapKind = snap ? snap.kind : "";
          const showP = snap ? rawToWorld(snap.p, 0, cfg) : p;
          $("coordinates").textContent =
            C.planeInfo(activeViewPlane).axes[0] +
            " " +
            showP.x.toFixed(3) +
            " · " +
            C.planeInfo(activeViewPlane).axes[1] +
            " " +
            showP.y.toFixed(3) +
            (snap ? " · " + snap.kind : "");
          requestDraw();
        } else if (state.pick === "start") {
          const rawP = C.P(p.x + cfg.originX, p.y + cfg.originY);
          const hit = nearestEntry(rawP);
          state.touchHover = hit ? hit : null;
          const showP = hit ? rawToWorld(hit.p, 0, cfg) : p;
          const snapLabel = hit
            ? hit.kind === "startPoint"
              ? " · Начало обработки " + (hit.index || "")
              : hit.kind === "endPoint"
                ? " · Конец обработки"
                : hit.kind === "vertex"
                  ? " · Узел контура"
                  : " · Стенка"
            : "";
          $("coordinates").textContent =
            C.planeInfo(activeViewPlane).axes[0] +
            " " +
            showP.x.toFixed(3) +
            " · " +
            C.planeInfo(activeViewPlane).axes[1] +
            " " +
            showP.y.toFixed(3) +
            snapLabel;
          requestDraw();
        } else if (state.pick === "entryStart") {
          const rawP = C.P(p.x + cfg.originX, p.y + cfg.originY);
          const snap = snapOrigin(rawP);
          const targetP = snap ? snap.p : rawP;
          const allowed = isPlungeAllowed(targetP);
          state.plungeHover = {
            p: targetP,
            allowed,
            snapKind: snap ? snap.kind : "",
          };
          const showP = snap ? rawToWorld(snap.p, 0, cfg) : p;
          const snapLabel = snap ? " · " + snap.kind : "";
          const statusText = allowed ? " · Погружение разрешено" : " · Запрещено (задевает деталь)";
          $("coordinates").textContent =
            C.planeInfo(activeViewPlane).axes[0] +
            " " +
            showP.x.toFixed(3) +
            " · " +
            C.planeInfo(activeViewPlane).axes[1] +
            " " +
            showP.y.toFixed(3) +
            snapLabel +
            statusText;
          requestDraw();
        } else if (state.pick === "exit") {
          const rawP = C.P(p.x + cfg.originX, p.y + cfg.originY);
          const snap = snapOrigin(rawP);
          const targetP = snap ? snap.p : rawP;
          state.exitHover = { p: targetP, snapKind: snap ? snap.kind : "" };
          const showP = snap ? rawToWorld(snap.p, 0, cfg) : p;
          const snapLabel = snap ? " · " + snap.kind : "";
          $("coordinates").textContent =
            C.planeInfo(activeViewPlane).axes[0] +
            " " +
            showP.x.toFixed(3) +
            " · " +
            C.planeInfo(activeViewPlane).axes[1] +
            " " +
            showP.y.toFixed(3) +
            snapLabel +
            " · Точка выхода";
          requestDraw();
        } else {
          state.touchHover = null;
          state.plungeHover = null;
          state.exitHover = null;
          $("coordinates").textContent =
            C.planeInfo(activeViewPlane).axes[0] +
            " " +
            p.x.toFixed(3) +
            " · " +
            C.planeInfo(activeViewPlane).axes[1] +
            " " +
            p.y.toFixed(3);
          if (editor.isOpen && !pointerDown && !state.pick) {
            editor.move(C.P(p.x + cfg.originX, p.y + cfg.originY), e.shiftKey, state.zoom);
          }
        }
      }
    },
    up: (e) => {
      var _pointerDown2;
      if (pointerDown && pointerDown.pan) {
        pointerDown = null;
        canvas.classList.remove("panning");
        return;
      }
      if (
        (_pointerDown2 = pointerDown) !== null &&
        _pointerDown2 !== void 0 &&
        _pointerDown2.paint
      ) {
        const gesture = pointerDown;
        pointerDown = null;
        const dragged = gesture.moved || Math.hypot(e.x - gesture.x, e.y - gesture.y) > 4;
        const point = e.inside ? sketchMousePoint(e) : null;
        if (dragged && !point && !gesture.moved) editor.movePaint(null, state.zoom);
        editor.endPaint(point, e.shiftKey, state.zoom, dragged);
        return;
      }
      if (pointerDown && pointerDown.selection) {
        pointerDown = null;
        editor.endSelection(sketchMousePoint(e), e.inside);
        return;
      }
      if (pointerDown && (pointerDown.box || pointerDown.guide)) {
        const gesture = pointerDown;
        pointerDown = null;
        if (gesture.box) {
          if (e.inside) editor.endBox(sketchMousePoint(e));
          else editor.cancelBox();
        } else if (
          e.inside &&
          editor.guideDrawing &&
          (gesture.moved || gesture.hadReference) &&
          editor.items.length === gesture.itemCount
        )
          editor.click(sketchMousePoint(e), e.shiftKey, state.zoom);
        return;
      }
      if (
        e.inside &&
        pointerDown &&
        !pointerDown.moved &&
        state.mode === "dxf" &&
        state.view === "xy"
      ) {
        const p0 = fromScreen(e.x, e.y),
          cfg = config(),
          p = C.P(p0.x + cfg.originX, p0.y + cfg.originY),
          snap = nearest(p, state.pick !== "start");
        if (editor.isOpen && !state.pick) {
          editor.click(p, editor.selectionTool ? e.ctrlKey : e.shiftKey, state.zoom);
          pointerDown = null;
          return;
        }
        if (!state.pick) {
          const issues = geometryIssues();
          for (const issue of issues) {
            const sp = screen(rawToWorld(issue.point, cfg.topZ, cfg));
            const isFocused = issue.id === focusedIssueId;
            const hitRadius = isFocused ? 28 : 20;
            let hit = Math.hypot(e.x - sp.x, e.y - sp.y) <= hitRadius;
            if (!hit && isFocused && issue.text) {
              const tw = String(issue.text).length * 7.5;
              const bw = tw + 20,
                bh = 26;
              const bx = sp.x - bw / 2,
                by = sp.y - 42;
              hit = e.x >= bx && e.x <= bx + bw && e.y >= by && e.y <= by + bh;
            }
            if (hit) {
              focusIssue(issue);
              pointerDown = null;
              return;
            }
          }
        }
        if (state.pick === "origin") {
          const snap = snapOrigin(p);
          const q = (snap === null || snap === void 0 ? void 0 : snap.p) || p;
          setCustomOrigin(q);
          state.pick = null;
          state.originHover = null;
          state.originSnapKind = "";
          state.fit = true;
          updateParams();
          dirtyDxf();
          updatePick();
          toast("Ноль XY установлен");
        } else if (state.pick === "start") {
          const rawP = state.touchHover ? state.touchHover.p : p;
          selectEntryPoint("start", rawP);
          state.touchHover = null;
        } else if (state.pick === "entryStart") {
          const snap = snapOrigin(p);
          const q = (snap && snap.p) || (state.plungeHover && state.plungeHover.p) || p;
          selectEntryPoint("entryStart", q);
          state.touchHover = null;
          state.plungeHover = null;
        } else if (state.pick === "exit") {
          const snap = snapOrigin(p);
          const q = (snap && snap.p) || (state.exitHover && state.exitHover.p) || p;
          selectEntryPoint("exit", q);
          state.touchHover = null;
          state.exitHover = null;
        } else {
          let closest = null,
            d = 10 / state.zoom;
          for (const c of state.contours)
            for (const seg of c.segs) {
              const v = C.pSegDist(p, seg);
              if (v < d) {
                closest = c;
                d = v;
              }
            }
          if (closest) activateContour(closest.id);
        }
      }
      pointerDown = null;
    },
    dblclick: (e) => {
      if (
        !e.shiftKey &&
        !e.altKey &&
        editor.isOpen &&
        !editor.scaling &&
        !state.pick &&
        state.mode === "dxf" &&
        state.view === "xy"
      ) {
        const p = sketchMousePoint(e);
        if (editor.dblclick) editor.dblclick(p, e, state.zoom);
      }
    },
    cancel: () => {
      pointerDown = null;
      canvas.classList.remove("panning");
      editor.cancelBox();
      editor.cancelSelection();
      editor.cancelPaint();
      if (state.originHover) {
        state.originHover = null;
        state.originSnapKind = "";
        requestDraw();
      }
      if (state.plungeHover) {
        state.plungeHover = null;
        requestDraw();
      }
      if (state.exitHover) {
        state.exitHover = null;
        requestDraw();
      }
    },
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      var _pointerDown3;
      e.preventDefault();
      if (pointerDown && pointerDown.pan) {
        pointerDown = null;
        canvas.classList.remove("panning");
      }
      if (
        (_pointerDown3 = pointerDown) !== null &&
        _pointerDown3 !== void 0 &&
        _pointerDown3.paint
      ) {
        pointerDown = null;
        editor.cancelPaint();
      }
      const factor = Math.exp(-e.deltaY * 0.001),
        before = fromScreen(e.offsetX, e.offsetY);
      state.zoom = Math.max(0.002, Math.min(100000, state.zoom * factor));
      const after = fromScreen(e.offsetX, e.offsetY);
      state.pan.x += (after.x - before.x) * state.zoom;
      state.pan.y -= (after.y - before.y) * state.zoom;
      state.fit = false;
      requestDraw();
    },
    { passive: false },
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      cancelAllAction();
    }
  });
  function hasDrawingOrMachiningProgress() {
    const hasItems = editor && Array.isArray(editor.items) && editor.items.length > 0;
    const hasDxf = Boolean(state.rawDxf && state.rawDxf.trim());
    const hasContours =
      (state.planContours && state.planContours.length > 0) ||
      (state.contours && state.contours.length > 0);
    const hasResult = Boolean(state.result);
    const hasMarks = operations.some(
      (op) => (op.sides && op.sides.length > 0) || op.entry || op.entryStart,
    );
    const hasExtraOps = operations.length > 1;
    return hasItems || hasDxf || hasContours || hasResult || hasMarks || hasExtraOps;
  }
  function clearDrawingAndMachiningProgress() {
    resetOperations();
    if (editor) {
      editor.reset();
    }
    state.rawDxf = "";
    planSketchDxf = "";
    state.dxfName = "";
    state.planContours = [];
    state.contours = [];
    state.result = null;
    state.startPoint = null;
    state.entryStart = null;
    state.active = null;
    state.dxfUnsupported = [];
    state.ready = false;
    $("code").value = "";
    renderContours();
    renderOperationLabels();
    dirtyDxf();
    invalidate("Чертёж и обработка очищены");
  }
  function openNcEditor() {
    if (state.mode === "nc") return;
    if (hasDrawingOrMachiningProgress()) {
      const dialog = $("ncConfirmDialog");
      if (dialog && typeof dialog.showModal === "function") {
        UI_RENDER.openDialog("ncConfirmDialog");
      } else if (
        window.confirm("Текущий прогресс чертежа, обработки при согласии будет удален. Продолжить?")
      ) {
        clearDrawingAndMachiningProgress();
        setMode("nc");
      }
    } else {
      setMode("nc");
    }
  }
  $("ncMode").onclick = openNcEditor;
  if ($("closeNcConfirm"))
    $("closeNcConfirm").onclick = () => UI_RENDER.closeDialog("ncConfirmDialog");
  if ($("cancelNcConfirm"))
    $("cancelNcConfirm").onclick = () => UI_RENDER.closeDialog("ncConfirmDialog");
  if ($("acceptNcConfirm"))
    $("acceptNcConfirm").onclick = () => {
      UI_RENDER.closeDialog("ncConfirmDialog");
      clearDrawingAndMachiningProgress();
      setMode("nc");
    };
  $("loadFile").onclick = () => {
    $("fileInput").accept = ".dxf,.json,.txt,.nc,.tap,.cnc";
    $("fileInput").click();
  };
  $("fileInput").onchange = (e) => {
    loadFile(e.target.files[0]);
    e.target.value = "";
  };
  document.addEventListener("dragover", (e) => {
    var _e$dataTransfer;
    if (
      (_e$dataTransfer = e.dataTransfer) !== null &&
      _e$dataTransfer !== void 0 &&
      (_e$dataTransfer = _e$dataTransfer.types) !== null &&
      _e$dataTransfer !== void 0 &&
      _e$dataTransfer.includes("Files")
    )
      e.preventDefault();
  });
  document.addEventListener("drop", (e) => {
    var _e$dataTransfer2;
    if (
      (_e$dataTransfer2 = e.dataTransfer) !== null &&
      _e$dataTransfer2 !== void 0 &&
      (_e$dataTransfer2 = _e$dataTransfer2.files) !== null &&
      _e$dataTransfer2 !== void 0 &&
      _e$dataTransfer2.length
    ) {
      e.preventDefault();
      loadFile(e.dataTransfer.files[0]);
    }
  });
  $("toggleCode").onclick = () => {
    document.body.classList.toggle("show-code");
    $("toggleCode").textContent = document.body.classList.contains("show-code")
      ? "Скрыть код"
      : "Код";
    resize();
  };
  $("cutSide").onchange = () => {
    for (const c of state.contours) c.side = $("cutSide").value;
    const rep = $("repeatMode")
      ? $("repeatMode").value
      : $("cutSide").value === "g25"
        ? "g25"
        : "none";
    if ($("g25Fields")) $("g25Fields").hidden = rep !== "g25";
    renderContours();
    updateParams();
    dirtyDxf();
  };
  if ($("repeatMode")) {
    $("repeatMode").onchange = () => {
      const rep = $("repeatMode").value;
      if ($("g25Fields")) $("g25Fields").hidden = rep !== "g25";
      if ($("m98Fields")) $("m98Fields").hidden = rep !== "m98";
      updateParams();
      dirtyDxf();
    };
  }
  if ($("m98ReturnMode")) {
    $("m98ReturnMode").onchange = () => {
      if ($("m98PField")) $("m98PField").hidden = $("m98ReturnMode").value !== "p";
      updateParams();
      dirtyDxf();
    };
  }
  if ($("extractRepeatsToM98")) {
    $("extractRepeatsToM98").onclick = () => {
      const op = activeOperation();
      if (!op) return;
      const opContours = state.contours.filter((c) => c.enabled);
      if (opContours.length < 2) {
        toast("Для выноса в M98 нужно как минимум два отмеченных контура");
        return;
      }
      const info = A.extractRepeatsToM98(opContours, 0.05);
      if (!info) {
        toast("Одинаковых контуров с регулярным смещением не найдено");
        return;
      }
      $("repeatMode").value = "m98";
      $("m98R").value = info.count;
      $("m98StepX").value = info.stepX;
      $("m98StepY").value = info.stepY;
      if ($("m98Fields")) $("m98Fields").hidden = false;
      for (const dup of info.repeatedContours) {
        dup.enabled = false;
      }
      renderContours();
      updateParams();
      dirtyDxf();
      toast(
        "Найдено " +
          info.count +
          " контуров (шаг X=" +
          info.stepX +
          " Y=" +
          info.stepY +
          "). Настроена M98 R" +
          info.count,
      );
    };
  }
  if ($("renumberNc")) {
    $("renumberNc").onclick = () => {
      const prior = $("code").value;
      if (!prior.trim()) return;
      try {
        const renumbered = A.renumberNC(prior, {
          step: 1,
          start: 1,
          subprogramStart: 101,
        });
        state.undo.push(prior);
        if (state.undo.length > 20) state.undo.shift();
        $("undoNc").disabled = false;
        $("code").value = renumbered;
        parseNc();
        toast("Кадры N перенумерованы, адреса P в M98/M99 пересчитаны");
      } catch (err) {
        message([{ type: "error", text: "Ошибка перенумерации: " + err.message }]);
      }
    };
  }
  $("toolKind").onchange = () => {
    saveToolProfile(state.activeTool);
    const kind = $("toolKind").value;
    applyToolProfile(kind);
    const selected = toolCatalog.get(activeOperation().toolNumber);
    if (selected && !A.allowed(selected, kind)) activeOperation().toolNumber = null;
    renderOperationPanel();
    updateParams();
    renderContours();
    dirtyDxf();
    toast(
      $("toolKind").value === "scribe"
        ? "Выбран разметочный конус"
        : "Выбрана фреза Ø" + $("diameter").value + " мм",
    );
  };
  $("extractNc").onclick = () => {
    try {
      const r = C.extractNC($("code").value, profile(), $("ncSection").value);
      resetOperationGeometry();
      $("workPlane").value = r.workPlane || "xy";
      $("workPlaneExplicit").checked = true;
      state.rawDxf = C.contoursToDXF(r.contours);
      state.dxfName = "Контуры из " + (state.ncName || "кода");
      state.result = null;
      state.startPoint = null;
      $("originPreset").value = "tl";
      setMode("dxf");
      if (parseDxf()) {
        for (const c of state.contours) if (c.layer.startsWith("NC_CENTER_")) c.side = "on";
        renderContours();
        message(r.warnings.map((text) => ({ type: "warn", text })));
        toast("Геометрия перенесена. Выбери фрезу и проходы.");
      }
      scheduleAutosave();
    } catch (e) {
      message([{ type: "error", text: e.message }]);
    }
  };
  $("generate").onclick = calculate;
  $("parseNc").onclick = parseNc;
  $("applyNc").onclick = applyNc;
  $("undoNc").onclick = () => {
    if (state.undo.length) {
      $("code").value = state.undo.pop();
      $("undoNc").disabled = !state.undo.length;
      parseNc();
      toast("Изменение отменено");
    }
  };
  $("code").addEventListener("input", () => {
    if (state.mode === "nc") {
      state.ncText = $("code").value;
      invalidate("Код изменён · нажми «Проверить программу»");
      scheduleAutosave();
    }
  });
  $("ncSection").onchange = () => {
    setSim();
    state.fit = true;
    requestDraw();
  };
  $("exportTxt").onclick = () => exportCode("txt");
  $("exportNc").onclick = () => exportCode("nc");
  $("editCode").onclick = () => {
    if (state.mode !== "dxf" || !state.ready || !state.result) return;
    const code = $("code").value;
    if (state.ncText && state.ncText !== code) {
      state.undo.push(state.ncText);
      if (state.undo.length > 5) state.undo.shift();
      $("undoNc").disabled = false;
    }
    state.ncText = code;
    state.ncName = "Рассчитанный код · " + M.profiles[machine].name;
    setMode("nc");
    $("code").focus();
  };
  $("copyCode").onclick = async () => {
    if (state.mode === "dxf" && !state.ready) {
      toast("Сначала рассчитай траекторию");
      return;
    }
    try {
      if (!navigator.clipboard) throw Error("clipboard");
      await navigator.clipboard.writeText($("code").value);
      toast("Код скопирован");
    } catch (e) {
      $("code").focus();
      $("code").select();
      if (document.execCommand("copy")) toast("Код скопирован");
      else toast("Код выделен · нажми Ctrl+C");
    }
  };
  $("saveProject").onclick = () => {
    captureMachine();
    saveToolProfile(state.activeTool);
    download(
      "ATLANTA_project_v5.json",
      JSON.stringify(projectObject(), null, 2),
      "application/json",
    );
  };
  $("demoNc").onclick = () => {
    state.ncText = SAMPLES.nc;
    state.ncName = "123.txt · твоя программа";
    state.undo = [];
    $("undoNc").disabled = true;
    $("dialect").value = "legacy";
    $("coordScale").value = 1000;
    $("feedScale").value = 10;
    updateParams();
    setMode("nc");
  };
  $("selectAll").onclick = () => {
    const value = state.contours.some((c) => !c.enabled);
    for (const c of state.contours) c.enabled = value;
    renderContours();
    dirtyDxf();
  };
  $("pickOrigin").onclick = () => {
    state.pick = state.pick === "origin" ? null : "origin";
    updatePick();
  };
  $("pickStart").onclick = () => {
    if (!state.contours.length) {
      toast("Сначала отметь цветом операции элементы обработки");
      return;
    }
    if (editor.isOpen && !editor.finish()) return;
    state.pick = state.pick === "start" ? null : "start";
    updatePick();
  };
  $("pickEntryStart").onclick = () => {
    if (!state.contours.length) {
      toast("Сначала отметь контур для обработки");
      return;
    }
    if (editor.isOpen && !editor.finish()) return;
    state.pick = state.pick === "entryStart" ? null : "entryStart";
    updatePick();
  };
  if ($("pickExit"))
    $("pickExit").onclick = () => {
      if (!state.contours.length) {
        toast("Сначала отметь контур для обработки");
        return;
      }
      if (editor.isOpen && !editor.finish()) return;
      state.pick = state.pick === "exit" ? null : "exit";
      updatePick();
    };
  $("applyEntryStart").onclick = () => {
    try {
      selectEntryPoint(
        "entryStart",
        C.P(
          ORIGIN.parse($("entryStartX").value, "X начала") + originEffective.x,
          ORIGIN.parse($("entryStartY").value, "Y начала") + originEffective.y,
        ),
      );
    } catch (error) {
      toast(error.message);
    }
  };
  for (const id of ["entryStartX", "entryStartY"])
    $(id).addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        $("applyEntryStart").click();
      }
    });
  if ($("applyExit"))
    $("applyExit").onclick = () => {
      try {
        selectEntryPoint(
          "exit",
          C.P(
            ORIGIN.parse($("entryExitX").value, "X выхода") + originEffective.x,
            ORIGIN.parse($("entryExitY").value, "Y выхода") + originEffective.y,
          ),
        );
      } catch (error) {
        toast(error.message);
      }
    };
  for (const id of ["entryExitX", "entryExitY"]) {
    if ($(id))
      $(id).addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if ($("applyExit")) $("applyExit").click();
        }
      });
  }
  $("resetEntryStart").onclick = () => {
    state.entryStart = null;
    state.pick = null;
    dirtyDxf();
    updateParams();
    updatePick();
    if (state.contours.length) calculate();
  };
  if ($("resetExit"))
    $("resetExit").onclick = () => {
      state.exitPoint = null;
      state.pick = null;
      dirtyDxf();
      updateParams();
      updatePick();
      if (state.contours.length) calculate();
    };
  $("resetStart").onclick = () => {
    state.startPoint = null;
    state.entryStart = null;
    state.exitPoint = null;
    state.pick = null;
    $("entryMode").value = "auto";
    $("autoLead").checked = true;
    $("entryRun").value = "0.1";
    $("directedEntry").checked = false;
    $("lead").value = "0.1";
    if ($("manualLead")) $("manualLead").value = "0.1";
    if ($("entryAngle")) $("entryAngle").value = "0";
    if ($("exitOffset")) $("exitOffset").value = "0.1";
    if ($("safetyGap")) $("safetyGap").value = "0.1";
    dirtyDxf();
    updateParams();
    updatePick();
    if (state.contours.length) calculate();
  };
  function applyEntryPoints(sol, contour, isManual) {
    state.startPoint = {
      x: sol.T.x,
      y: sol.T.y,
      contourId: contour.id,
      signature: contourSignature(contour),
    };
    state.entryStart = {
      x: sol.P.x,
      y: sol.P.y,
      contourId: contour.id,
      signature: contourSignature(contour),
    };
    if (sol.exitPoint)
      state.exitPoint = {
        x: sol.exitPoint.x,
        y: sol.exitPoint.y,
        contourId: contour.id,
        signature: contourSignature(contour),
      };
    if (sol.R_arc) {
      const rVal = Number(sol.R_arc.toFixed(3));
      $("manualLead").value = rVal;
      $("lead").value = rVal;
    }
    if (sol.L) $("entryRun").value = Number(sol.L.toFixed(3));
    $("entryStartX").value = Number((sol.P.x - originEffective.x).toFixed(3));
    $("entryStartY").value = Number((sol.P.y - originEffective.y).toFixed(3));
    if (sol.exitPoint && $("entryExitX")) {
      $("entryExitX").value = Number((sol.exitPoint.x - originEffective.x).toFixed(3));
      $("entryExitY").value = Number((sol.exitPoint.y - originEffective.y).toFixed(3));
    }
    if (isManual) {
      $("entryMode").value = "manual";
      $("autoLead").checked = false;
    }
    const op = activeOperation();
    if (op) {
      if (isManual) {
        op.entryMode = "manual";
        op.autoLead = false;
      }
      op.startPoint = state.startPoint;
      op.entryStart = state.entryStart;
      op.exitPoint = state.exitPoint;
      op.lead = sol.R_arc;
      op.entryRun = sol.L;
    }
    updateParams();
    updateEntryReadout();
    calculate();
    draw();
  }
  if ($("makeManual"))
    $("makeManual").onclick = () => {
      const contour =
        state.contours.find((item) => item.id === state.active && item.enabled) ||
        state.contours.find((item) => item.enabled);
      if (!contour) return toast("Сначала отметь контур для обработки");
      const cfg = config(),
        side = contour.side === "auto" ? contour.autoSide : contour.side;
      const sol = ATLANTA_OPERATIONS.solveLeadIn(
        contour,
        side,
        cfg.direction,
        Object.assign({}, cfg, {
          allSketchItems: editor.items,
          otherContours: state.contours,
        }),
      );
      if (sol && sol.ok) {
        applyEntryPoints(sol, contour, true);
        toast("Точки перенесены в ручной режим");
      } else toast(sol ? sol.reason : "Не удалось рассчитать автозаход");
    };
  if ($("fixEntryAuto"))
    $("fixEntryAuto").onclick = () => {
      if (!currentAutoFix) return;
      const contour =
        state.contours.find((item) => item.id === state.active && item.enabled) ||
        state.contours.find((item) => item.enabled);
      if (contour) applyEntryPoints(currentAutoFix, contour, false);
      $("fixEntryAuto").style.display = "none";
      currentAutoFix = null;
      toast("Заход автоматически исправлен");
    };
  if ($("showEntryZones"))
    $("showEntryZones").onclick = () => {
      state.showEntryZones = !state.showEntryZones;
      $("showEntryZones").textContent = state.showEntryZones ? "Скрыть зоны" : "Показать зоны";
      $("showEntryZones").setAttribute("aria-pressed", String(state.showEntryZones));
      draw();
    };
  $("workPlaneButton").onclick = () => {
    updatePlaneReadout();
    $("workPlaneDialog").showModal();
  };
  $("closeWorkPlane").onclick = () => $("workPlaneDialog").close();
  for (const plane of ["xy", "zx", "yz"])
    $("choosePlane" + plane.toUpperCase()).onclick = () => {
      $("workPlaneDialog").close();
      if (state.mode === "nc") {
        state.ncPlane = plane;
        updatePlaneReadout();
        setSim();
      } else {
        $("workPlane").value = plane;
        $("workPlaneExplicit").checked = true;
        captureOperation();
        updateParams();
        dirtyDxf();
      }
      state.fit = true;
      requestDraw();
      scheduleAutosave();
    };
  $("fitView").onclick = () => {
    state.fit = true;
    requestDraw();
  };
  $("topView").onclick = () => {
    state.view = "xy";
    $("topView").classList.add("active");
    $("isoView").classList.remove("active");
    state.fit = true;
    requestDraw();
  };
  $("isoView").onclick = () => {
    if (editor.isOpen) {
      toast("Для рисования используется плоский вид");
      return;
    }
    state.view = "iso";
    $("isoView").classList.add("active");
    $("topView").classList.remove("active");
    state.fit = true;
    requestDraw();
  };
  $("chooseMachine").onclick = showMachine;
  $("selectFanuc").onclick = () => chooseMachine("fanuc3000c");
  $("closeMachine").onclick = () => $("machineDialog").close();
  $("machineDialog").addEventListener("cancel", (e) => {
    if (!machineSelected) e.preventDefault();
  });
  $("exportSketch").onclick = () => {
    if (!state.planContours.length) {
      toast("Сначала нарисуй план");
      return;
    }
    download("ATLANTA_sketch.dxf", C.contoursToDXF(state.planContours), "application/dxf");
  };
  $("toggleDetails").onclick = () => setDetails($("workDetails").hidden);
  $("closeDetails").onclick = () => {
    setDetails(false);
    $("toggleDetails").focus();
  };
  $("compSummary").onclick = () => setDetails(true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("workDetails").hidden) setDetails(false);
  });
  $("helpBtn").onclick = () => $("help").showModal();
  $("closeHelp").onclick = () => $("help").close();
  for (const button of document.querySelectorAll("[data-work-pane]")) {
    button.onclick = () => {
      if (state.mode !== "dxf") setMode("dxf");
      if (button.dataset.workPane === "drawing") editor.begin();
      showWorkPane(button.dataset.workPane);
      syncWorkspace();
      resize();
    };
    button.addEventListener("keydown", (event) => {
      const order = ["drawing", "operations", "machine"],
        index = order.indexOf(button.dataset.workPane);
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? order.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : order.length - 1)) % order.length;
      const target = document.querySelector('[data-work-pane="' + order[next] + '"]');
      target.click();
      target.focus();
    });
  }
  for (const id of [
    ...numberIds.filter((x) => !["originX", "originY"].includes(x)),
    ...boolIds,
    ...selectIds.filter((x) => !["toolKind", "originPreset"].includes(x)),
  ])
    $(id).addEventListener("change", () => {
      try {
        if (id === "dialect") {
          if ($("dialect").value === "legacy") {
            $("coordScale").value = 1000;
            $("feedScale").value = 10;
          } else if ($("dialect").value === "decimal") {
            $("coordScale").value = 1;
            $("feedScale").value = 1;
          }
        }
        if (id === "entryMode" && $("entryMode").value === "auto") {
          state.startPoint = null;
          state.entryStart = null;
          state.exitPoint = null;
          state.pick = null;
          $("autoLead").checked = true;
          $("entryRun").value = "0.1";
          $("directedEntry").checked = false;
          $("lead").value = "0.1";
          if ($("manualLead")) $("manualLead").value = "0.1";
          updatePick();
        }
        if (id === "workPlane") $("workPlaneExplicit").checked = true;
        if (id === "lead" || id === "manualLead") {
          if (id === "manualLead") $("lead").value = $("manualLead").value;
          else if ($("manualLead")) $("manualLead").value = $("lead").value;
          $("autoLead").checked = false;
          $("entryMode").value = "manual";
        }
        if (id === "entryRun" || (id === "autoLead" && !$("autoLead").checked))
          $("entryMode").value = "manual";
        if (id === "depth" && Number($("depth").value) > 0)
          $("depth").value = -Number($("depth").value);
        if (id === "originPreset") applyOrigin();
        if (["originX", "originY"].includes(id)) $("originPreset").value = "custom";
        updateParams();
        if (
          ["dxfUnits", "tolerance", "joinTolerance"].includes(id) &&
          state.rawDxf &&
          state.mode === "dxf"
        )
          parseDxf(true);
        else if (state.mode === "nc" && ["dialect", "coordScale", "feedScale"].includes(id))
          invalidate("Изменён формат чисел · проверь программу");
        else if (state.mode === "dxf") invalidate();
        saveToolProfile(state.activeTool);
        scheduleAutosave();
        requestDraw();
      } catch (e) {
        message([{ type: "error", text: e.message }]);
      }
    });
  for (const id of numberIds.filter((x) => !["originX", "originY"].includes(x)))
    $(id).addEventListener("input", () => {
      try {
        if (id === "lead" || id === "manualLead") {
          if (id === "manualLead") $("lead").value = $("manualLead").value;
          else if ($("manualLead")) $("manualLead").value = $("lead").value;
          $("autoLead").checked = false;
          $("entryMode").value = "manual";
        }
        if (id === "entryRun") $("entryMode").value = "manual";
        if (["originX", "originY"].includes(id)) $("originPreset").value = "custom";
        updateParams();
        saveToolProfile(state.activeTool);
        if (state.mode === "dxf") invalidate();
        scheduleAutosave();
      } catch (e) {
        enableExport(false);
      }
    });
  for (const button of document.querySelectorAll("[data-origin-anchor]"))
    button.onclick = () => {
      $("originPreset").value = button.dataset.originAnchor;
      changeOrigin();
    };
  $("originPreset").addEventListener("change", changeOrigin);
  for (const id of ["originShiftX", "originShiftY"]) {
    $(id).addEventListener("input", changeOrigin);
    $(id).addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        changeOrigin();
      }
    });
  }
  $("originOffsetsReset").onclick = () => {
    $("originShiftX").value = "0";
    $("originShiftY").value = "0";
    changeOrigin();
  };
  $("localOrigin").onchange = () => {
    const op = activeOperation();
    if ($("localOrigin").checked) {
      sharedOriginSetup = originSetup();
      op.originSetup = originSetup();
    } else {
      delete op.originSetup;
      restoreOperationOrigin(op);
    }
    dirtyDxf();
    updateParams();
    scheduleAutosave();
  };
  for (const id of ["originX", "originY"]) {
    $(id).addEventListener("input", () => invalidate("Ноль редактируется · заверши ввод"));
    $(id).addEventListener("change", () => {
      try {
        setCustomOrigin({
          x: ORIGIN.parse($("originX").value, "X нуля"),
          y: ORIGIN.parse($("originY").value, "Y нуля"),
        });
        updateParams();
        state.fit = true;
        dirtyDxf();
      } catch (error) {
        enableExport(false);
        $("originReadout").textContent = error.message;
      }
    });
  }
  window.addEventListener("error", (e) => {
    if (e.message && e.message.startsWith("ResizeObserver loop")) return;
    enableExport(false);
    message([{ type: "error", text: "Ошибка приложения: " + e.message }]);
  });
  if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe($("canvasWrap"));
  else window.addEventListener("resize", resize);
  try {
    const saved = JSON.parse(localStorage.getItem("atlanta-machine-v1"));
    if (saved && M.profiles[saved.machine]) {
      machine = saved.machine;
      for (const key of Object.keys(M.profiles))
        if (saved.settings && saved.settings[key])
          machineSettings[key] = {
            ...machineDefaults[key],
            ...saved.settings[key],
          };
    }
  } catch (e) {}
  machineSelected = true;
  applyMachine();
  let restored = false;
  try {
    const saved =
      localStorage.getItem("atlanta-cam-v5") ||
      localStorage.getItem("atlanta-cam-v4") ||
      localStorage.getItem("atlanta-cam-v2");
    if (saved) {
      restoreProject(JSON.parse(saved), true);
      restored = true;
      message([{ text: "Последний проект восстановлен." }]);
    }
  } catch (e) {
    message([{ type: "warn", text: "Последний проект не восстановлен: " + e.message }]);
  }
  restoreDone = true;
  bindOperations();
  renderOperationPanel();
  saveToolProfile(state.activeTool);
  setMode(state.mode);
  updateParams();
  if (!restored) {
    state.dxfName = "Новый чертёж";
    $("fileName").textContent = state.dxfName;
    editor.begin(true);
  } else showWorkPane(editor.isOpen ? "drawing" : "operations");
  resize();
  if (state.mode === "dxf" && hasMarks() && !editor.isOpen) calculate();
  syncWorkspace();
  requestDraw();
  window.ATLANTA = {
    target: "Windows 7 SP1 x86 / Firefox 55+, including 115 ESR",
    version: __APP_VERSION__,
    getState: () => ({
      mode: state.mode,
      pane: workPane,
      machine,
      machineSelected,
      sketchEditing: editor.isOpen,
      contours: state.contours.length,
      planContours: state.planContours.length,
      marked: editor.items.filter((item) => A.isMark(item, activeOperation())).length,
      operations: operations.length,
      activeOperation: activeOperationId,
      workPlane: config().workPlane,
      tools: toolCatalog.size,
      ready: state.ready,
      calculating: !!calculation,
      motions: currentMotions().length,
      startPoint: state.startPoint ? { ...state.startPoint } : null,
      entryStart: state.entryStart ? { ...state.entryStart } : null,
      exitPoint: state.exitPoint ? { ...state.exitPoint } : null,
      entry: entryPresentation
        ? {
            radius: entryPresentation.entryRadius,
            attachment: { ...entryPresentation.attachment },
            point: { ...entryPresentation.entry },
            exit: entryPresentation.exit ? { ...entryPresentation.exit } : null,
          }
        : null,
      pick: state.pick,
      plungeHover: state.plungeHover ? { ...state.plungeHover } : null,
      exitHover: state.exitHover ? { ...state.exitHover } : null,
    }),
    isPlungeAllowed,
    getPlungeGeometry,
    snapOrigin,
    snapGeometry: snapOrigin,
    calculate,
    parseNc,
    focusIssue,
    highlightMenuForIssue,
    blinkMenuElement,
  };
}
