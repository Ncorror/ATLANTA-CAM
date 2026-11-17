import { NAMES, SHAPES, FIELD_NAMES, FIELD_DEFAULTS } from "./schema.js";
import { createCircleFields } from "./circle-fields.js";
import { createReferences } from "./references.js";
import { createDraftTools } from "./draft-tools.js";
import { createHistory } from "./history.js";
import { createToolbar } from "./toolbar.js";
import { createScaleTools } from "./scale-tools.js";
import { createGeometryTools } from "./geometry-tools.js";
import { createClipboard } from "./clipboard.js";
import { createSelection } from "./selection.js";
import { createRendering } from "./rendering.js";
import { createDimensions } from "./dimensions.js";
import { parseMath } from "../../geometry/expression.js";
import CAM from "../../core/index.js";
import GUIDES from "../../geometry/guides.js";
import SKETCH from "../../geometry/sketch.js";
import CONSTRUCTION from "../../geometry/construction.js";
import DRAFTING from "../../geometry/drafting.js";
import GEO_SNAPS from "../../geometry/snapping.js";
import ATLANTA_OPERATIONS from "../../operations/index.js";

function calcCircleValue(radius, mode) {
  return mode === "diameter" ? radius * 2 : radius;
}
function circleText(value) {
  return String(+value.toPrecision(15)).replace(".", ",");
}
function editingText(target) {
  return (
    target &&
    (target.isContentEditable ||
      /TEXTAREA|SELECT/.test(target.tagName) ||
      (target.tagName === "INPUT" &&
        !["checkbox", "radio", "button", "submit", "range"].includes(target.type)))
  );
}
function create(env) {
  // Live accessors preserve a single application/editor state across controllers.
  // Factories only declare callbacks; none may read this context during construction.
  const controllerContext = {
    get $() {
      return $;
    },
    get calcCircleValue() {
      return calcCircleValue;
    },
    get circleDraft() {
      return circleDraft;
    },
    set circleDraft(value) {
      circleDraft = value;
    },
    get circleFieldLabel() {
      return circleFieldLabel;
    },
    get circleMode() {
      return circleMode;
    },
    set circleMode(value) {
      circleMode = value;
    },
    get circleText() {
      return circleText;
    },
    get D() {
      return D;
    },
    get env() {
      return env;
    },
    get model() {
      return model;
    },
    get render() {
      return render;
    },
    get auxiliaryCache() {
      return auxiliaryCache;
    },
    get B() {
      return B;
    },
    get C() {
      return C;
    },
    get S() {
      return S;
    },
    get updateSnapContext() {
      return updateSnapContext;
    },
    get cachedGuideCrossings() {
      return cachedGuideCrossings;
    },
    set cachedGuideCrossings(value) {
      cachedGuideCrossings = value;
    },
    get cachedGuideCrossingsItems() {
      return cachedGuideCrossingsItems;
    },
    set cachedGuideCrossingsItems(value) {
      cachedGuideCrossingsItems = value;
    },
    get circleCaption() {
      return circleCaption;
    },
    get circleLabel() {
      return circleLabel;
    },
    get clearDraft() {
      return clearDraft;
    },
    get clearPending() {
      return clearPending;
    },
    get commit() {
      return commit;
    },
    get fillCircleFields() {
      return fillCircleFields;
    },
    get focusCanvas() {
      return focusCanvas;
    },
    get G() {
      return G;
    },
    get id() {
      return id;
    },
    get marksPanelPlacement() {
      return marksPanelPlacement;
    },
    set marksPanelPlacement(value) {
      marksPanelPlacement = value;
    },
    get N() {
      return N;
    },
    get newGeometry() {
      return newGeometry;
    },
    get parseMath() {
      return parseMath;
    },
    get readCircleDraft() {
      return readCircleDraft;
    },
    get toast() {
      return toast;
    },
    get cancelPaint() {
      return cancelPaint;
    },
    get checkpoint() {
      return checkpoint;
    },
    get cleanDimensions() {
      return cleanDimensions;
    },
    get closeDimEditor() {
      return closeDimEditor;
    },
    get closeScale() {
      return closeScale;
    },
    get finiteReferenceIds() {
      return finiteReferenceIds;
    },
    get historyEncoder() {
      return historyEncoder;
    },
    get rebuildIndex() {
      return rebuildIndex;
    },
    get selectionIds() {
      return selectionIds;
    },
    get setSelection() {
      return setSelection;
    },
    get A() {
      return A;
    },
    get actionLabel() {
      return actionLabel;
    },
    get anchorFields() {
      return anchorFields;
    },
    get begin() {
      return begin;
    },
    get fields() {
      return fields;
    },
    get paint() {
      return paint;
    },
    get paste() {
      return paste;
    },
    get pendingCut() {
      return pendingCut;
    },
    set pendingCut(value) {
      pendingCut = value;
    },
    get pickAnchor() {
      return pickAnchor;
    },
    get prepareReference() {
      return prepareReference;
    },
    get renderDraft() {
      return renderDraft;
    },
    get scale() {
      return scale;
    },
    get shapes() {
      return shapes;
    },
    get attachmentAt() {
      return attachmentAt;
    },
    set scale(value) {
      scale = value;
    },
    get select() {
      return select;
    },
    get validBoxPoint() {
      return validBoxPoint;
    },
    get applyDraft() {
      return applyDraft;
    },
    get cursor() {
      return cursor;
    },
    set cursor(value) {
      cursor = value;
    },
    get endBox() {
      return endBox;
    },
    get endSelection() {
      return endSelection;
    },
    get fieldNames() {
      return fieldNames;
    },
    get guideReferenceAt() {
      return guideReferenceAt;
    },
    get guideSnap() {
      return guideSnap;
    },
    get hitDimension() {
      return hitDimension;
    },
    get moveBox() {
      return moveBox;
    },
    get pickGuideReference() {
      return pickGuideReference;
    },
    get placePaste() {
      return placePaste;
    },
    get startBox() {
      return startBox;
    },
    get startSelection() {
      return startSelection;
    },
    get click() {
      return click;
    },
    get clipboard() {
      return clipboard;
    },
    set clipboard(value) {
      clipboard = value;
    },
    set paint(value) {
      paint = value;
    },
    set paste(value) {
      paste = value;
    },
    get selectionRect() {
      return selectionRect;
    },
    get dimMidpoint() {
      return dimMidpoint;
    },
    get markNumber() {
      return markNumber;
    },
    get placeMarksPanel() {
      return placeMarksPanel;
    },
    get referenceMarks() {
      return referenceMarks;
    },
    get translated() {
      return translated;
    },
    get auxiliaryPoints() {
      return auxiliaryPoints;
    },
    get draftResult() {
      return draftResult;
    },
    get drawDimensions() {
      return drawDimensions;
    },
    get drawReferenceMarks() {
      return drawReferenceMarks;
    },
    get guideScreenPoints() {
      return guideScreenPoints;
    },
    get previewDelta() {
      return previewDelta;
    },
    get translatedPaste() {
      return translatedPaste;
    },
    get movedDimensions() {
      return movedDimensions;
    },
    get snapshot() {
      return snapshot;
    },
  };

  const {
    circleLabel,
    circleValue,
    circleCaption,
    updateCircleInputs,
    fillCircleFields,
    changeCircleMode,
    readCircleDraft,
  } = createCircleFields(controllerContext);
  const { auxiliaryPoints, rebuildIndex, clearDraft } = createReferences(controllerContext);
  const {
    anchorFields,
    draftVisible,
    guideReferenceAt,
    markNumber,
    placeMarksPanel,
    referenceMarks,
    renderToolMarks,
    getGuideCrossings,
    guideSnap,
    pickGuideReference,
    draftResult,
    renderDraft,
    applyDraft,
  } = createDraftTools(controllerContext);
  const { sync, historyFrame, trimHistory, commit } = createHistory(controllerContext);
  const {
    render,
    formVisibility,
    select,
    tool,
    hasDraftInput,
    hasActiveAction,
    cancelActiveAction,
    cancelTool,
    cancelAction,
    markSelection,
    focusPanel,
    selectAll,
  } = createToolbar(controllerContext);
  const { closeScale, scaleSummary, openScale, applyScale } = createScaleTools(controllerContext);
  const {
    submit,
    snapped,
    rulerSnap,
    radius,
    chamferSize,
    cornerPieces,
    construct,
    machiningHit,
    click,
    move,
  } = createGeometryTools(controllerContext);
  const {
    copy,
    startPaste,
    translated,
    translatedPaste,
    placePaste,
    attachmentAt,
    dimensionsAfterDelete,
    remove,
    cut,
    startPaint,
    movePaint,
    cancelPaint,
    endPaint,
  } = createClipboard(controllerContext);
  const {
    insideSelection,
    startSelection,
    moveSelection,
    selectionRect,
    contained,
    movedDimensions,
    endSelection,
    cancelSelection,
    previewDelta,
    validBoxPoint,
    startBox,
    moveBox,
    cancelBox,
    endBox,
    guideScreenPoints,
    drawPlan,
    drawReferenceMarks,
  } = createSelection(controllerContext);
  const { drawAuxiliary, draw } = createRendering(controllerContext);
  const {
    dimMidpoint,
    hitDimension,
    drawDimensions,
    openDimEditor,
    applyDimEdit,
    dblclick,
    serialize,
  } = createDimensions(controllerContext);

  const A = ATLANTA_OPERATIONS;
  const { toast } = env;
  const legacy = document.getElementById("sketchLegacyForm").content;
  const $ = (id) => env.$(id) || legacy.querySelector("#" + id);
  const S = SKETCH,
    C = CAM,
    B = CONSTRUCTION,
    D = DRAFTING,
    G = GUIDES,
    N = GEO_SNAPS;

  const model = {
    isOpen: false,
    items: null,
    selected: null,
    selectedIds: [],
    referenceIds: [],
    selectedSet: new Set(),
    selectedDims: [],
    selection: null,
    snapContext: null,
    snapItems: null,
    snapSelectionKey: "",
    tool: "line",
    constructionMode: false,
    auxiliaryPaths: [],
    planPaths: [],
    markedCount: 0,
    guideReference: null,
    box: null,
    pending: [],
    chainStart: null,
    mouse: null,
    undo: [],
    redo: [],
    next: 1,
    waitingForNew: false,
    issue: "",
    index: B.makeIndex([]),
    firstFillet: null,
    preview: null,
    lastDirection: 0,
    draft: {
      length: "",
      angle: "",
      radius: "",
      turn: "",
      width: "",
      height: "",
    },
    dimensions: [],
    selectedDim: null,
    activeDim: null,
  };
  const names = NAMES;
  let clipboard = null,
    pendingCut = null,
    paste = null,
    pickAnchor = false,
    cursor = null,
    paint = null,
    scale = null,
    marksPanelPlacement = "";
  const auxiliaryCache = new WeakMap(),
    historyEncoder = new TextEncoder(),
    historyDecoder = new TextDecoder();
  const shapes = SHAPES;
  const fieldNames = FIELD_NAMES;
  const defaults = FIELD_DEFAULTS;
  let circleMode = "radius",
    circleDraft = null;
  const fields = $("sketchFields"),
    circleFieldLabel = document.createElement("span");
  for (const key of Object.keys(fieldNames)) {
    const label = document.createElement("label"),
      input = document.createElement("input");
    label.dataset.sketchField = key;
    if (key === "dia") {
      label.appendChild(circleFieldLabel);
      input.type = "text";
      input.maxLength = 64;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.title = "Например, 35/2";
    } else {
      label.textContent = fieldNames[key] + (key === "angle" ? "" : ", мм");
      input.type = "number";
      input.step = key === "angle" ? "1" : ".001";
    }
    input.id = "sketch_" + key;
    input.value = defaults[key];
    input.required = true;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });
    label.appendChild(input);
    fields.appendChild(label);
  }

  function id(extraItems = []) {
    let s;
    const reserved = (p) => String(p.id) === s || String(p.id).startsWith(s + "-");
    do {
      s = "s" + model.next++;
    } while (
      (model.items || []).some(reserved) ||
      (extraItems || []).some(reserved) ||
      (model.dimensions || []).some(reserved)
    );
    return s;
  }
  function snapshot() {
    return S.clone(model.items || []);
  }
  function selectionIds() {
    return model.selectedIds.length
      ? model.selectedIds.slice()
      : model.selected
        ? [model.selected]
        : [];
  }
  function setSelection(ids, dimIds = []) {
    model.selectedIds = Array.from(new Set(ids));
    model.selectedSet = new Set(model.selectedIds);
    model.selected = model.selectedIds[0] || null;
    model.selectedDims = Array.from(new Set(dimIds));
    model.selectedDim = model.selectedDims[0] || null;
    updateSnapContext();
  }
  function updateSnapContext() {
    if (!N) return;
    const basis = model.selectedIds.length ? model.selectedIds : model.referenceIds,
      key = basis.join("\0");
    if (model.snapContext && model.snapItems === model.items && model.snapSelectionKey === key)
      return;
    model.snapContext =
      model.snapContext && model.snapItems === model.items
        ? N.withSelection(model.snapContext, basis)
        : N.build(model.items || [], basis);
    model.snapItems = model.items;
    model.snapSelectionKey = key;
    model.index = model.snapContext.index;
  }
  function finiteReferenceIds(ids, items = model.items || []) {
    const byId = new Map(items.map((item) => [item.id, item]));
    return Array.from(new Set(ids || [])).filter(
      (id) => byId.has(id) && byId.get(id).guide !== true,
    );
  }
  function prepareReference(type) {
    if (type === "select") model.referenceIds = [];
    else if (
      model.tool === "select" &&
      ["line", "guide", "arc", "arcRadius", "circle", "rect"].includes(type)
    )
      model.referenceIds = finiteReferenceIds(selectionIds());
  }
  function closeDimEditor() {
    model.activeDim = null;
    const popup = $("dimEditor");
    if (popup) popup.hidden = true;
  }
  function cleanDimensions(dims) {
    return S.clone(dims || []).map((d) => {
      delete d.screenBox;
      return d;
    });
  }
  function newGeometry(item) {
    return model.constructionMode ? { ...item, construction: true } : item;
  }
  function actionLabel(id, label) {
    const button = $(id);
    if (!button) return;
    button.title = label;
    button.setAttribute("aria-label", label);
    if (!button.dataset.icon) button.textContent = label;
  }

  function clearPending(keepCut = false) {
    const wasPasting = !!paste || model.tool === "paste";
    cancelSelection();
    cancelPaint();
    closeScale();
    if (wasPasting && !keepCut) pendingCut = null;
    model.pending = [];
    model.chainStart = null;
    model.mouse = null;
    model.firstFillet = null;
    model.preview = null;
    model.guideReference = null;
    model.box = null;
    paste = null;
    pickAnchor = false;
    if (model.tool === "paste") model.tool = "select";
    clearDraft();
  }
  function checkpoint() {
    return {
      items: snapshot(),
      dimensions: cleanDimensions(model.dimensions),
      selectedIds: selectionIds(),
      referenceIds: model.referenceIds.slice(),
      selectedDims: model.selectedDims.slice(),
      pending: S.clone(model.pending),
      chainStart: model.chainStart ? { ...model.chainStart } : null,
      tool: model.tool,
      constructionMode: model.constructionMode,
      guideReference: S.clone(model.guideReference),
      guidePointer: model.tool === "guide" && model.mouse ? { ...model.mouse.p } : null,
      lastDirection: model.lastDirection,
    };
  }
  function focusCanvas() {
    const canvas = $("canvas");
    if (canvas && canvas.focus)
      try {
        canvas.focus({ preventScroll: true });
      } catch (e) {
        canvas.focus();
      }
  }

  let cachedGuideCrossings = null;
  let cachedGuideCrossingsItems = null;

  function startBlank() {
    pendingCut = null;
    const before = checkpoint();
    model.waitingForNew = false;
    model.issue = "";
    model.items = model.items || [];
    clearPending();
    closeDimEditor();
    model.referenceIds = [];
    model.tool = "line";
    model.constructionMode = false;
    $("sketchType").value = "line";
    formVisibility();
    commit([], false, {
      before,
      dimensions: [],
      selectedIds: [],
      selectedDims: [],
    });
    env.onBlank();
    render();
    focusPanel();
    focusCanvas();
    toast("Чистый эскиз. Щёлкай по чертежу или открой «Точные размеры».");
  }
  function begin(fresh = false) {
    if (model.isOpen) {
      if (fresh) startBlank();
      else focusPanel();
      return;
    }
    let scene = null;
    model.issue = "";
    model.waitingForNew = false;
    if (!fresh)
      try {
        if (!model.items) model.items = S.fromContours(env.getContours());
        scene = S.toScene(model.items, env.activeOperation().id);
      } catch (e) {
        model.items = null;
        model.waitingForNew = true;
        model.issue =
          "Этот чертёж не удалось перенести в редактор: " +
          e.message +
          " Нажми «Новый эскиз», чтобы рисовать с чистого листа. Исходная геометрия пока сохранена.";
      }
    model.isOpen = true;
    clearPending();
    env.onBegin();
    if (fresh) startBlank();
    else if (scene) sync(false, scene);
    else render();
    focusPanel();
  }
  function reset() {
    pendingCut = null;
    model.isOpen = false;
    model.items = null;
    model.auxiliaryPaths = [];
    model.planPaths = [];
    model.markedCount = 0;
    model.constructionMode = false;
    model.referenceIds = [];
    setSelection([]);
    model.undo = [];
    model.redo = [];
    model.waitingForNew = false;
    model.issue = "";
    clearPending();
    model.dimensions = [];
    closeDimEditor();
    setSelection([]);
    rebuildIndex();
    render();
  }
  function finish() {
    pendingCut = null;
    if (!model.isOpen) return true;
    if (model.pending.length && !["line", "guide", "ruler"].includes(model.tool)) {
      toast(
        "Закончи " +
          names[model.tool].toLowerCase() +
          " или нажми Esc, чтобы отменить незаконченный элемент.",
      );
      return false;
    }
    clearPending();
    model.isOpen = false;
    setSelection([]);
    model.waitingForNew = false;
    model.issue = "";
    render();
    env.onFinish();
    env.save();
    return true;
  }

  function history(back) {
    pendingCut = null;
    cancelSelection();
    const from = back ? model.undo : model.redo,
      to = back ? model.redo : model.undo;
    if (!from.length) return;
    const frame = JSON.parse(historyDecoder.decode(from.pop())),
      current = historyFrame({
        ...checkpoint(),
        fitOnRestore: frame.fitOnRestore === true,
      });
    to.push(current);
    trimHistory(to);
    model.items = frame.items || frame;
    model.dimensions = cleanDimensions(frame.dimensions || []);
    clearPending();
    closeDimEditor();
    model.referenceIds = finiteReferenceIds(frame.referenceIds);
    setSelection(frame.selectedIds || [], frame.selectedDims || []);
    if (frame.items) {
      model.tool = frame.tool === "paste" ? "select" : frame.tool;
      model.constructionMode = frame.constructionMode === true;
      model.guideReference = frame.guideReference ? S.clone(frame.guideReference) : null;
      if (frame.guidePointer)
        model.mouse = {
          p: { ...frame.guidePointer },
          guide: { ...frame.guidePointer },
          kind: "",
        };
      model.pending = S.clone(frame.pending || []);
      model.chainStart = frame.chainStart;
      model.lastDirection = frame.lastDirection;
      if (model.pending.length) anchorFields(model.pending[0]);
    }
    sync(frame.fitOnRestore === true);
    focusCanvas();
  }

  function restore(value, raw, canonical) {
    if (!value || !Array.isArray(value.items)) return;
    const items = S.clone(value.items),
      scene = S.toScene(items);
    if (scene.dxf !== raw && scene.dxf !== canonical) return;
    model.items = items;
    model.referenceIds = finiteReferenceIds(
      Array.isArray(value.referenceIds) ? value.referenceIds : [],
      items,
    );
    setSelection(
      Array.isArray(value.selectedIds)
        ? value.selectedIds.filter((id) => items.some((item) => item.id === id))
        : [],
      Array.isArray(value.selectedDims) ? value.selectedDims : [],
    );
    closeDimEditor();
    rebuildIndex();
    model.firstFillet = null;
    model.preview = null;
    model.isOpen = value.open === true;
    model.dimensions = cleanDimensions(
      Array.isArray(value.dimensions) ? S.clone(value.dimensions) : [],
    );
    model.tool = Object.keys(names).includes(value.tool) ? value.tool : "line";
    model.constructionMode = value.constructionMode === true;
    circleMode = value.circleMode === "diameter" ? "diameter" : "radius";
    updateCircleInputs();
    const restoredCircle = items.find(
      (item) => item.id === model.selected && item.type === "circle",
    );
    if (restoredCircle) {
      $("sketchType").value = "circle";
      fillCircleFields(restoredCircle);
    } else $("sketch_dia").value = circleText(circleValue(defaults.dia));
    model.undo = [];
    model.redo = [];
    if (Number(value.radius) > 0 && Number.isFinite(Number(value.radius)))
      $("sketchRadius").value = String(value.radius);
    if (value.chamfer != null)
      try {
        const n = D.number(value.chamfer, "Фаска");
        if (n > 0) $("sketchChamfer").value = String(value.chamfer);
      } catch (e) {}
    $("sketchSnap").checked = value.snap !== false;
    if (Number(value.step) > 0) $("sketchStep").value = String(value.step);
    const valid = (p) =>
      p &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      Math.abs(p.x) < 1e6 &&
      Math.abs(p.y) < 1e6;
    model.pending =
      Array.isArray(value.pending) && value.pending.length <= 2 && value.pending.every(valid)
        ? S.clone(value.pending)
        : [];
    model.chainStart = valid(value.chainStart) ? { ...value.chainStart } : null;
    const reference = value.guideReference;
    model.guideReference =
      reference &&
      reference.type === "line" &&
      valid(reference.a) &&
      valid(reference.b) &&
      C.dist(reference.a, reference.b) > 0.001 &&
      ["line", "auto"].includes(reference.kind)
        ? S.clone(reference)
        : null;
    model.mouse = valid(value.guidePointer)
      ? {
          p: { ...value.guidePointer },
          guide: { ...value.guidePointer },
          kind: "",
        }
      : null;
    if (model.tool === "guide" && !model.guideReference) model.pending = [];
    if (shapes.includes(model.tool)) $("sketchType").value = model.tool;
    if (Number.isFinite(value.lastDirection)) model.lastDirection = value.lastDirection;
    if (value.draft)
      for (const key of Object.keys(model.draft))
        if (
          typeof value.draft[key] === "string" &&
          value.draft[key].length <= (key === "radius" ? 64 : 31)
        )
          model.draft[key] = value.draft[key];
    if (model.pending.length) anchorFields(model.pending[0]);
    formVisibility();
    render();
  }
  $("drawSketch").onclick = () => begin();
  for (const b of document.querySelectorAll("[data-sketch-tool]"))
    b.onclick = () => tool(b.dataset.sketchTool);
  if ($("sketchScale")) {
    $("sketchScale").onclick = openScale;
    $("scaleDrawing").onclick = openScale;
    $("scaleMode").onchange = () => {
      if (scale) {
        scaleSummary();
        $("scaleValue").focus();
        $("scaleValue").select();
      }
    };
    $("scaleApply").onclick = applyScale;
    $("scaleCancel").onclick = () => {
      closeScale();
      focusCanvas();
    };
    $("scaleValue").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyScale();
      }
    });
    $("scaleEditor").addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelAction();
      }
    });
  }
  $("sketchType").onchange = () => {
    prepareReference($("sketchType").value);
    setSelection([]);
    clearPending();
    if (model.tool === "guide") model.constructionMode = false;
    model.tool = $("sketchType").value;
    formVisibility();
    render();
  };
  $("sketchLineMode").onchange = formVisibility;
  $("sketchApply").onclick = submit;
  $("sketchNewItem").onclick = () => select(null);
  $("sketchConstruction").onchange = () => {
    if (model.waitingForNew) return;
    const enabled = $("sketchConstruction").checked,
      selected = (model.items || []).find((item) => item.id === model.selected);
    try {
      if ((selected && selected.guide === true) || model.tool === "guide") {
        render();
        toast(
          "Бесконечная направляющая не становится контуром. Для рабочего отрезка выбери «Линия».",
        );
        return;
      }
      if (selected) {
        if ((selected.construction === true) !== enabled)
          commit(
            model.items.map((item) =>
              item.id === selected.id
                ? {
                    ...item,
                    construction: enabled,
                    ...(enabled ? { machining: false, millOps: [], drillOps: [] } : {}),
                  }
                : item,
            ),
          );
        toast(
          enabled
            ? "Элемент вспомогательный: в обработку не попадёт."
            : "Элемент плана. Для обработки назначь его текущей операции.",
        );
      } else {
        model.constructionMode = enabled;
        render();
        env.save();
      }
      env.draw();
    } catch (error) {
      render();
      toast(error.message);
    }
  };
  $("sketchNew").onclick = () => {
    begin(true);
    env.onBegin();
  };
  $("sketchUndo").onclick = () => history(true);
  $("sketchRedo").onclick = () => history(false);
  $("sketchDelete").onclick = remove;
  $("sketchRadius").oninput = () => {
    model.preview = null;
    env.draw();
    env.save();
  };
  $("sketchChamfer").addEventListener("input", () => {
    model.preview = null;
    env.draw();
    env.save();
  });
  $("sketchChamfer").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      try {
        chamferSize();
        focusCanvas();
        render();
      } catch (error) {
        toast(error.message);
      }
    }
  });
  for (const id of ["sketchSnap", "sketchStep"])
    $(id).onchange = () => {
      renderDraft();
      env.draw();
      env.save();
    };
  for (let n = 1; n <= 4; n++) {
    const button = $("draftToolQuarter" + n);
    if (button)
      button.onclick = () => {
        const mark = referenceMarks()[n - 1];
        if (!mark || model.tool !== "guide" || !model.guideReference) return;
        model.mouse = {
          p: { ...mark.p },
          guide: { ...mark.p },
          kind: mark.label,
        };
        model.draft.length = String(mark.distance);
        $("draftLength").value = model.draft.length;
        renderDraft();
        env.draw();
        env.save();
        focusCanvas();
      };
  }
  const draftKeys = {
    length: "draftLength",
    radius: "draftRadius",
    turn: "draftTurn",
    angle: "draftAngle",
    width: "draftWidth",
    height: "draftHeight",
  };
  for (const id of ["sketchCircleMode", "draftCircleMode"])
    $(id).onchange = () => changeCircleMode($(id).value);
  for (const key of Object.keys(draftKeys)) {
    const input = $(draftKeys[key]);
    if (input)
      input.addEventListener("input", () => {
        model.draft[key] = input.value;
        renderDraft();
        env.draw();
        env.save();
      });
  }
  if ($("draftApply")) $("draftApply").onclick = applyDraft;
  if ($("dimEditorApply")) $("dimEditorApply").onclick = applyDimEdit;
  if ($("dimEditorDelete"))
    $("dimEditorDelete").onclick = () => {
      if (!model.activeDim) return;
      setSelection([], [model.activeDim.id]);
      remove();
      focusCanvas();
    };
  if ($("dimEditorCancel"))
    $("dimEditorCancel").onclick = () => {
      model.activeDim = null;
      if ($("dimEditor")) $("dimEditor").hidden = true;
      focusCanvas();
    };
  if ($("dimEditorInput"))
    $("dimEditorInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyDimEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelAction();
      }
    });
  if ($("draftFree"))
    $("draftFree").onclick = () => {
      clearDraft();
      renderDraft();
      env.draw();
      focusCanvas();
    };
  if ($("sketchPickAnchor"))
    $("sketchPickAnchor").onclick = () => {
      clearPending();
      setSelection([]);
      model.tool = "line";
      pickAnchor = true;
      $("sketchLineMode").value = "polar";
      formVisibility();
      render();
      focusCanvas();
    };
  document.addEventListener("copy", (e) => {
    if (!model.isOpen || editingText(e.target || document.activeElement) || !e.clipboardData)
      return;
    if (copy()) {
      const data = {
        app: "ATLANTA_SKETCH_CLIPBOARD",
        version: 3,
        ...clipboard,
      };
      e.clipboardData.setData("text/plain", JSON.stringify(data));
      e.preventDefault();
    }
  });
  function deliverCut(event, payload) {
    let delivered = false;
    try {
      if (event.clipboardData && typeof event.clipboardData.setData === "function") {
        event.clipboardData.setData(
          "text/plain",
          JSON.stringify({
            app: "ATLANTA_SKETCH_CLIPBOARD",
            version: 3,
            ...payload,
          }),
        );
        delivered = true;
      }
    } catch (ignore) {}
    event.preventDefault();
    return delivered;
  }
  document.addEventListener("cut", (e) => {
    if (!model.isOpen || editingText(e.target || document.activeElement)) return;
    const prepared = pendingCut;
    if (prepared) {
      if (deliverCut(e, prepared)) pendingCut = null;
      return;
    }
    if (selectionIds().length && copy()) {
      const payload = S.clone(clipboard);
      pendingCut = deliverCut(e, payload) ? null : payload;
      remove();
    }
  });
  document.addEventListener("paste", (e) => {
    if (!model.isOpen || editingText(e.target || document.activeElement)) return;
    const localCut = pendingCut,
      text = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
    if (localCut) clipboard = S.clone(localCut);
    if (!localCut && text && text.length <= 6000000)
      try {
        const data = JSON.parse(text);
        if (
          data.app === "ATLANTA_SKETCH_CLIPBOARD" &&
          [1, 2, 3].includes(data.version) &&
          data.base &&
          Number.isFinite(data.base.x) &&
          Number.isFinite(data.base.y)
        ) {
          S.validate(data.items);
          if (data.items.length)
            clipboard = {
              items: S.clone(data.items),
              base: { ...data.base },
            };
        }
      } catch (error) {}
    if (clipboard) {
      e.preventDefault();
      startPaste();
      if (localCut) pendingCut = null;
    }
  });
  document.addEventListener("keydown", (e) => {
    var _env$canSelectAll, _env$canSelectAll2;
    if (e.defaultPrevented || $("catalogDialog").open) return;
    const target = e.target || document.activeElement,
      key = String(e.key || ""),
      lower = key.toLowerCase(),
      code = e.code || "",
      typing = editingText(target),
      modifier = e.ctrlKey || e.metaKey;
    if (
      modifier &&
      !e.altKey &&
      !e.shiftKey &&
      !typing &&
      !scale &&
      (lower === "a" || code === "KeyA") &&
      ((_env$canSelectAll =
        (_env$canSelectAll2 = env.canSelectAll) === null || _env$canSelectAll2 === void 0
          ? void 0
          : _env$canSelectAll2.call(env)) !== null && _env$canSelectAll !== void 0
        ? _env$canSelectAll
        : model.isOpen)
    ) {
      e.preventDefault();
      if (!e.repeat) selectAll();
      return;
    }
    if (!model.isOpen) return;
    if (
      (code === "Space" || key === " ") &&
      !modifier &&
      !e.altKey &&
      !e.shiftKey &&
      !e.isComposing &&
      !model.waitingForNew &&
      !scale &&
      (target === $("canvas") || target === document.body)
    ) {
      e.preventDefault();
      if (!e.repeat && model.tool !== "select") tool("select");
      return;
    }
    const draftField = Object.values(draftKeys).includes(target.id);
    if (modifier) {
      if ((!typing || draftField) && (lower === "z" || code === "KeyZ")) {
        e.preventDefault();
        history(!e.shiftKey);
        return;
      }
      if ((!typing || draftField) && (lower === "y" || code === "KeyY")) {
        e.preventDefault();
        history(false);
        return;
      }
      if (!typing && (lower === "c" || code === "KeyC")) {
        copy();
        return;
      }
      if (!typing && (lower === "x" || code === "KeyX")) {
        cut();
        return;
      }
      if (!typing && (lower === "v" || code === "KeyV")) {
        if (clipboard) startPaste();
        return;
      }
      return;
    }
    if (key === "Escape") {
      e.preventDefault();
      cancelAction();
      return;
    }
    if (
      /^(BUTTON|SUMMARY|A)$/.test(target.tagName) ||
      (target.tagName === "INPUT" &&
        ["checkbox", "radio", "button", "submit", "range"].includes(target.type))
    )
      return;
    if (
      key === "Tab" &&
      draftVisible() &&
      (!typing || draftField || target === $("draftCircleMode"))
    ) {
      var _next$select;
      const list = Object.values(draftKeys)
        .map((id) => $(id))
        .filter((el) => el && !el.disabled);
      if (model.tool === "circle") list.push($("draftCircleMode"));
      const at = list.indexOf(target),
        next = list[(at + (e.shiftKey ? -1 : 1) + list.length) % list.length];
      e.preventDefault();
      next.focus();
      (_next$select = next.select) === null || _next$select === void 0 || _next$select.call(next);
      return;
    }
    if (key === "Enter" && (!typing || draftField || target === $("draftCircleMode"))) {
      e.preventDefault();
      if (paste) {
        placePaste();
        return;
      }
      const fixed = Object.values(model.draft).some((value) => value.trim());
      if (draftVisible() && (fixed || model.tool === "arcRadius")) applyDraft();
      else {
        clearPending();
        render();
        toast("Цепочка завершена");
      }
      return;
    }
    if (!typing && key === "Delete") {
      e.preventDefault();
      remove();
      return;
    }
    if (!typing && draftVisible()) {
      const primary =
          model.tool === "rect"
            ? "width"
            : ["line", "guide"].includes(model.tool)
              ? "length"
              : "radius",
        shortcut =
          code === "KeyL"
            ? "length"
            : code === "KeyR"
              ? "radius"
              : code === "KeyA"
                ? "angle"
                : null;
      if (shortcut) {
        const input = $(draftKeys[shortcut]);
        if (input && !input.disabled) {
          e.preventDefault();
          input.focus();
          input.select();
        }
        return;
      }
      if (/^[0-9.,+\-*/×÷()]$/.test(key)) {
        e.preventDefault();
        const input = $(draftKeys[primary]);
        model.draft[primary] = key;
        input.value = key;
        input.focus();
        if (input.setSelectionRange) input.setSelectionRange(1, 1);
        renderDraft();
        env.draw();
      }
    }
  });
  updateCircleInputs();
  formVisibility();
  return {
    begin,
    reset,
    finish,
    cancelTool,
    cancelAction,
    hasActiveAction,
    cancelActiveAction,
    marking: () => tool("machining"),
    refreshOperation() {
      cancelPaint();
      model.preview = null;
      render();
    },
    click,
    move,
    draw,
    drawPlan,
    drawAuxiliary,
    serialize,
    restore,
    startPaint,
    movePaint,
    endPaint,
    cancelPaint,
    startBox,
    moveBox,
    endBox,
    cancelBox,
    startSelection,
    moveSelection,
    endSelection,
    cancelSelection,
    get scaling() {
      return !!scale;
    },
    get selectionTool() {
      return model.isOpen && model.tool === "select";
    },
    get selecting() {
      return !!model.selection;
    },
    get selectedIds() {
      return selectionIds();
    },
    refreshToolDimensions() {
      renderDraft();
      env.draw();
    },
    clearOperation(op) {
      var _model$items4;
      if (!(
        (_model$items4 = model.items) !== null &&
        _model$items4 !== void 0 &&
        _model$items4.some((item) => A.isMark(item, op))
      ))
        return;
      model.items = model.items.map((item) =>
        A.isMark(item, op) ? A.mark(item, op, false) : item,
      );
      sync();
    },
    get isOpen() {
      return model.isOpen;
    },
    get guideDrawing() {
      return model.isOpen && model.tool === "guide";
    },
    get guideHasReference() {
      return model.isOpen && model.tool === "guide" && !!model.guideReference;
    },
    get boxSelecting() {
      return model.isOpen && model.tool === "auxErase";
    },
    get items() {
      return model.items || [];
    },
    get mouse() {
      return model.mouse ? S.clone(model.mouse) : null;
    },
    dblclick,
    openDimEditor,
    applyDimEdit,
    get dimensions() {
      return model.dimensions || [];
    },
  };
}

const api = {
  create,
  parseMath,
  calcCircleValue,
  circleText,
  editingText,
};
export default api;
