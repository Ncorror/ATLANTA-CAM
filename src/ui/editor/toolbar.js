/**
 * toolbar controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.A
 * @param {*} deps.actionLabel
 * @param {*} deps.anchorFields
 * @param {*} deps.begin
 * @param {*} deps.C
 * @param {*} deps.checkpoint
 * @param {*} deps.clearPending
 * @param {*} deps.closeDimEditor
 * @param {*} deps.closeScale
 * @param {*} deps.commit
 * @param {*} deps.D
 * @param {*} deps.env
 * @param {*} deps.fields
 * @param {*} deps.fillCircleFields
 * @param {*} deps.focusCanvas
 * @param {*} deps.model
 * @param {*} deps.paint
 * @param {*} deps.paste
 * @param {*} deps.pendingCut (read/write)
 * @param {*} deps.pickAnchor
 * @param {*} deps.prepareReference
 * @param {*} deps.renderDraft
 * @param {*} deps.scale
 * @param {*} deps.selectionIds
 * @param {*} deps.setSelection
 * @param {*} deps.shapes
 * @param {*} deps.toast
 */
export function createToolbar(deps) {
  function render() {
    var _model$items2;
    const panel = deps.$("sketchPanel");
    const modeChanged = panel.hidden === deps.model.isOpen;
    panel.hidden = !deps.model.isOpen;
    if (modeChanged) focusPanel();
    document.body.classList.toggle("drawing", deps.model.isOpen);
    if (!deps.$("drawSketch").dataset.workPane)
      deps.$("drawSketch").classList.toggle("active", deps.model.isOpen);
    if (!deps.$("drawSketch").dataset.workPane)
      deps.$("drawSketch").setAttribute("aria-pressed", String(deps.model.isOpen));
    deps.$("sketchIssue").hidden = !deps.model.issue;
    deps.$("sketchIssue").textContent = deps.model.issue;
    deps.$("sketchApply").disabled = deps.model.waitingForNew || deps.model.selectedIds.length > 1;
    deps.actionLabel(
      "sketchFinish",
      deps.model.waitingForNew ? "Вернуться к чертежу" : "Готово: рассчитать отмеченные элементы",
    );
    const operation = deps.env.activeOperation(),
      drilling = operation.kind === "drill",
      markButton = document.querySelector('[data-sketch-tool="machining"]');
    const markAction = deps.$("markOperation");
    if (markAction) {
      const active = deps.model.isOpen && deps.model.tool === "machining";
      markAction.classList.toggle("active", active);
      markAction.setAttribute("aria-pressed", String(active));
    }
    deps.model.markedCount = deps.model.planPaths.reduce(
      (sum, entry) => sum + (deps.A.isMark(entry.item, operation) ? 1 : 0),
      0,
    );
    if (markButton) {
      const label = drilling ? "Отметить отверстия" : "Отметить контуры обработки";
      markButton.title = label;
      markButton.setAttribute("aria-label", label);
      markButton.style.setProperty("--mark-color", operation.color);
    }
    deps.$("sketchCount").textContent =
      (deps.model.items || []).length + " элем. · " + deps.model.markedCount + " в работе";
    deps.$("sketchUndo").disabled = !deps.model.undo.length;
    deps.$("sketchRedo").disabled = !deps.model.redo.length;
    deps.$("sketchDelete").disabled = !deps.selectionIds().length && !deps.model.selectedDim;
    const selected = (deps.model.items || []).find((item) => item.id === deps.model.selected),
      guideSelected = selected && selected.guide === true;
    deps.$("sketchConstruction").checked = selected
      ? selected.construction === true
      : deps.model.constructionMode;
    deps.$("sketchConstruction").disabled =
      deps.model.waitingForNew ||
      guideSelected ||
      deps.model.tool === "guide" ||
      deps.model.selectedIds.length > 1;
    deps.$("sketchConstruction").title =
      guideSelected || deps.model.tool === "guide"
        ? "Направляющая всегда вспомогательная"
        : selected
          ? (selected.construction ? "Выбран вспомогательный элемент" : "Выбран элемент плана") +
            ". Флажок меняет назначение."
          : "Новые элементы не попадут в обработку и DXF";
    for (const b of document.querySelectorAll("[data-sketch-tool]")) {
      const type = b.dataset.sketchTool,
        active =
          type === "auxLine"
            ? deps.model.tool === "guide"
            : type === "line"
              ? deps.model.tool === "line"
              : type === deps.model.tool;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
      b.disabled = deps.model.waitingForNew;
    }
    const n = deps.model.pending.length;
    let hint = "";
    if (deps.model.tool === "select")
      hint = deps.model.selectedIds.length
        ? "Выделено: " + deps.model.selectedIds.length
        : "Рамка → целиком · ← касанием";
    if (deps.model.tool === "ruler")
      hint =
        n === 2 ? "Укажи положение размера." : n ? "Укажи вторую точку." : "Укажи первую точку.";
    if (deps.model.tool === "line")
      hint = n ? "Укажи конец или введи длину." : "Укажи начало линии.";
    if (deps.model.tool === "machining")
      hint = "Рамка или щелчок — назначить / снять. Shift + ЛКМ — сдвиг вида.";
    if (deps.model.tool === "erase") hint = "Щёлкни элемент, чтобы удалить его целиком.";
    if (deps.model.tool === "guide")
      hint = deps.model.guideReference ? "Укажи сторону и смещение." : "Выбери прямую или ось.";
    if (deps.model.tool === "auxErase") hint = "Пересеки вспомогательные линии рамкой.";
    if (guideSelected) hint = "Выбрана направляющая.";
    if (deps.model.tool === "arc")
      hint = ["Укажи начало дуги.", "Укажи точку на дуге.", "Укажи конец дуги."][Math.min(n, 2)];
    if (deps.model.tool === "arcRadius")
      hint = n ? "Задай радиус и поворот." : "Укажи начало дуги.";
    if (deps.model.tool === "circle")
      hint = n ? "Укажи размер или введи выражение." : "Укажи центр окружности.";
    if (deps.model.tool === "rect")
      hint = n ? "Укажи второй угол или введи размеры." : "Укажи первый угол.";
    if (deps.model.tool === "fillet")
      hint = deps.model.firstFillet
        ? "Выбери вторую сторону угла."
        : "Введи R и выбери первую сторону.";
    if (deps.model.tool === "chamfer")
      hint = deps.model.firstFillet
        ? "Выбери вторую сторону угла."
        : "Введи C и выбери первую сторону.";
    if (deps.model.tool === "trim") hint = "Щёлкни участок между пересечениями.";
    if (deps.model.tool === "split") hint = "Щёлкни элемент для разделения по пересечениям.";
    if (deps.model.tool === "paste") hint = "Щелчок или Enter — вставить.";
    if (deps.pickAnchor) hint = "Укажи начало линии.";
    deps.$("sketchRadiusFields").hidden = deps.model.tool !== "fillet";
    deps.$("sketchExact").hidden =
      guideSelected ||
      [
        "guide",
        "machining",
        "erase",
        "auxErase",
        "fillet",
        "chamfer",
        "trim",
        "split",
        "arcRadius",
        "paste",
        "ruler",
      ].includes(deps.model.tool);
    deps.$("sketchChamferFields").hidden = deps.model.tool !== "chamfer";
    deps.$("sketchCircleModeField").hidden =
      deps.model.waitingForNew ||
      !(
        deps.model.tool === "circle" ||
        (deps.model.tool === "select" &&
          (selected === null || selected === void 0 ? void 0 : selected.type) === "circle")
      );
    if (deps.$("sketchPickAnchor")) {
      deps.$("sketchPickAnchor").hidden =
        deps.$("sketchType").value !== "line" || !!deps.model.selected;
      deps.$("sketchPickAnchor").classList.toggle("active", deps.pickAnchor);
    }
    deps.$("sketchHint").textContent = hint;
    deps.actionLabel(
      "sketchApply",
      deps.model.selected ? "Применить размеры" : "Добавить элемент плана",
    );
    deps.$("sketchNewItem").hidden = !deps.model.selected;
    if (deps.$("sketchScale"))
      deps.$("sketchScale").disabled =
        deps.model.waitingForNew ||
        !(
          (_model$items2 = deps.model.items) !== null &&
          _model$items2 !== void 0 &&
          _model$items2.length
        );
    deps.renderDraft();
    if (deps.model.isOpen) {
      deps.$("generate").textContent = "К обработке → рассчитать";
      deps.env.draw();
    }
  }

  function formVisibility() {
    const type = deps.$("sketchType").value,
      polar = deps.$("sketchLineMode").value === "polar";
    const keys =
      type === "line"
        ? ["ax", "ay", ...(polar ? ["length", "angle"] : ["bx", "by"])]
        : type === "arc"
          ? ["ax", "ay", "mx", "my", "bx", "by"]
          : type === "circle"
            ? ["cx", "cy", "dia"]
            : ["ax", "ay", "w", "h"];
    for (const label of deps.fields.children) {
      const key = label.dataset.sketchField;
      label.hidden = !keys.includes(key);
      deps.$("sketch_" + key).disabled = label.hidden;
    }
    deps.$("sketchLineModeLabel").hidden = type !== "line";
  }

  function select(item, dimIds = []) {
    deps.setSelection(item ? [item.id] : [], dimIds);
    if (item) {
      deps.$("sketchType").value = item.type;
      if (item.type === "circle") deps.fillCircleFields(item);
      else {
        const values = {
          ax: item.a.x,
          ay: item.a.y,
          bx: item.b.x,
          by: item.b.y,
        };
        if (item.type === "arc") Object.assign(values, { mx: item.m.x, my: item.m.y });
        else
          Object.assign(values, {
            length: deps.C.dist(item.a, item.b),
            angle: deps.D.direction(item.a, item.b),
          });
        for (const key of Object.keys(values))
          deps.$("sketch_" + key).value = +values[key].toFixed(6);
      }
      deps.$("sketchExact").open = true;
      formVisibility();
    }
    render();
  }

  function tool(type) {
    deps.pendingCut = null;
    deps.closeDimEditor();
    const continuous =
        ["line", "arcRadius"].includes(type) && ["line", "arcRadius"].includes(deps.model.tool),
      anchor = continuous && deps.model.pending.length ? { ...deps.model.pending[0] } : null,
      start = continuous && deps.model.chainStart ? { ...deps.model.chainStart } : null;
    deps.clearPending();
    if (type === "machining" && deps.model.tool === "select" && markSelection()) return;
    const leavingGuide = deps.model.tool === "guide" && type !== "auxLine";
    if (type === "auxLine") {
      type = "guide";
      deps.model.constructionMode = true;
    } else if (leavingGuide || type === "line" || type === "machining")
      deps.model.constructionMode = false;
    deps.prepareReference(type);
    deps.model.tool = type;
    deps.setSelection([]);
    if (anchor) {
      deps.model.pending = [anchor];
      deps.model.chainStart = start || { ...anchor };
      deps.anchorFields(anchor);
    }
    if (deps.shapes.includes(type)) deps.$("sketchType").value = type;
    formVisibility();
    render();
    deps.focusCanvas();
    if (type === "chamfer") {
      deps.$("sketchChamfer").focus();
      deps.$("sketchChamfer").select();
    }
  }

  function hasDraftInput() {
    if (!deps.model.draft) return false;
    return Object.values(deps.model.draft).some((v) => typeof v === "string" && v.trim() !== "");
  }

  function hasActiveAction() {
    if (deps.scale) return true;
    if (deps.$("dimEditor") && !deps.$("dimEditor").hidden) return true;
    if (deps.paste || deps.pendingCut) return true;
    if (deps.pickAnchor) return true;
    if (deps.model.tool === "select") {
      return !!deps.model.selection;
    }
    return (
      (Array.isArray(deps.model.pending) && deps.model.pending.length > 0) ||
      !!deps.model.chainStart ||
      !!deps.model.firstFillet ||
      !!deps.model.preview ||
      !!deps.model.guideReference ||
      !!deps.model.box ||
      !!deps.paint ||
      hasDraftInput()
    );
  }

  function cancelActiveAction(focus = true) {
    if (deps.$("dimEditor") && !deps.$("dimEditor").hidden) deps.closeDimEditor();
    deps.closeScale();
    deps.clearPending();
    formVisibility();
    render();
    deps.renderDraft();
    deps.env.draw();
    if (focus && deps.model.isOpen) deps.focusCanvas();
  }

  function cancelTool(focus = true) {
    const keepSelection = deps.model.tool === "select";
    const leavingGuide = deps.model.tool === "guide";
    deps.pendingCut = null;
    deps.closeDimEditor();
    deps.clearPending();
    deps.model.tool = "select";
    if (leavingGuide) deps.model.constructionMode = false;
    deps.model.referenceIds = [];
    if (!keepSelection) deps.setSelection([]);
    formVisibility();
    render();
    if (focus && deps.model.isOpen) deps.focusCanvas();
  }

  function cancelAction(focus = true) {
    if (hasActiveAction()) {
      cancelActiveAction(focus);
      return;
    }
    if (deps.env.cancelAction) deps.env.cancelAction();
    else cancelTool(focus);
  }

  function markSelection() {
    if (!deps.model.selectedSet.size) return false;
    const op = deps.env.activeOperation(),
      items = deps.model.items.filter(
        (item) => deps.model.selectedSet.has(item.id) && deps.A.canMark(item, op),
      );
    if (!items.length) return false;
    const before = deps.checkpoint(),
      ids = new Set(items.map((item) => item.id));
    deps.model.tool = "machining";
    deps.model.constructionMode = false;
    try {
      deps.commit(
        deps.model.items.map((item) =>
          ids.has(item.id) ? deps.A.mark(item, op, !deps.A.isMark(item, op)) : item,
        ),
        false,
        { before, selectedIds: [], selectedDims: [], node: false },
      );
      deps.toast("Назначение выбранных элементов переключено.");
    } catch (e) {
      deps.model.tool = before.tool;
      deps.model.constructionMode = before.constructionMode;
      render();
      deps.toast(e.message);
    }
    deps.focusCanvas();
    return true;
  }

  function focusPanel() {
    deps.$("settingsBody").scrollTop = 0;
  }

  function selectAll() {
    if (!deps.model.isOpen) deps.begin();
    if (deps.model.waitingForNew) return;
    deps.pendingCut = null;
    deps.clearPending();
    deps.closeDimEditor();
    deps.model.tool = "select";
    deps.model.referenceIds = [];
    const dimIds = deps.model.dimensions.map((dim) => dim.id);
    if (deps.model.items.length === 1) select(deps.model.items[0], dimIds);
    else {
      deps.setSelection(
        deps.model.items.map((item) => item.id),
        dimIds,
      );
      render();
    }
    deps.focusCanvas();
    deps.env.save();
  }
  return {
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
  };
}
