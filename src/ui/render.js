import CAM from "../core/index.js";
import SKETCH from "../geometry/sketch.js";
import MACHINES from "../cam/machines.js";
import ATLANTA_OPERATIONS from "../operations/index.js";
const $ = function (id) {
  return document.getElementById(id);
};
const C = CAM;
const M = MACHINES;
const A = ATLANTA_OPERATIONS;
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}
function openDialog(id) {
  const dialog = $(id);
  if (!dialog) return;
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}
function closeDialog(id) {
  const dialog = $(id);
  if (!dialog) return;
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}
function showToast(text, currentTimer) {
  const toastEl = $("toast");
  if (!toastEl) return null;
  toastEl.textContent = text;
  toastEl.classList.add("show");
  if (currentTimer) clearTimeout(currentTimer);
  return setTimeout(function () {
    toastEl.classList.remove("show");
  }, 3500);
}
function setDetails(open) {
  const details = $("workDetails");
  if (details) details.hidden = !open;
  const toggle = $("toggleDetails");
  if (toggle) toggle.setAttribute("aria-expanded", String(open));
}
function showWorkPane(name, currentPane, keepTool, cancelAction) {
  if (name === "origin") name = "operations";
  if (["drawing", "operations", "machine"].indexOf(name) < 0) return currentPane;
  if (name !== currentPane && !keepTool && cancelAction) cancelAction(false, true);
  const panes = document.querySelectorAll("[data-pane]");
  for (let i = 0; i < panes.length; i++) {
    panes[i].hidden = panes[i].dataset.pane !== name;
  }
  const buttons = document.querySelectorAll("[data-work-pane]");
  for (let j = 0; j < buttons.length; j++) {
    const button = buttons[j];
    const selected = button.dataset.workPane === name;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  const body = $("settingsBody");
  if (body) body.scrollTop = 0;
  return name;
}
function syncWorkspace(opts) {
  const state = opts.state;
  const operationsCount = opts.operationsCount;
  const editorItemsCount = opts.editorItemsCount;
  const canvasEmpty = $("canvasEmpty");
  if (canvasEmpty) {
    canvasEmpty.hidden =
      state.mode !== "dxf" || state.planContours.length > 0 || editorItemsCount > 0;
  }
  const opCountEl = $("operationCount");
  if (opCountEl) opCountEl.textContent = String(operationsCount);
  const titles = [
    ["compModeHelp", "compMode"],
    ["feedCodeReadout", "feed"],
    ["feedSlowReadout", "slowFeedPercent"],
    ["entryRule", "pickEntryStart"],
  ];
  for (let i = 0; i < titles.length; i++) {
    const src = $(titles[i][0]);
    const tgt = $(titles[i][1]);
    if (src && tgt) tgt.title = src.textContent;
  }
}
function renderOrigin(resolved) {
  $("originX").value = String(+resolved.x.toFixed(6));
  $("originY").value = String(+resolved.y.toFixed(6));
  $("originAnchorName").textContent = resolved.label;
  const buttons = document.querySelectorAll("[data-origin-anchor]");
  for (let i = 0; i < buttons.length; i++) {
    const active = buttons[i].dataset.originAnchor === resolved.preset;
    buttons[i].classList.toggle("active", active);
    buttons[i].setAttribute("aria-pressed", String(active));
  }
  $("originReadout").textContent =
    "Ноль в плане: X" + resolved.x.toFixed(3) + " · Y" + resolved.y.toFixed(3);
  $("originSetupSummary").textContent =
    "X" + resolved.x.toFixed(3) + " · Y" + resolved.y.toFixed(3);
}
function renderMessages(opts) {
  const items = opts.items || [];
  const issues = opts.issues || [];
  const errorEntryPoint = opts.errorEntryPoint;
  const onIssueFocus = opts.onIssueFocus;
  const onMenuHighlight = opts.onMenuHighlight;
  const showFailedFrame = opts.showFailedFrame;
  const setDetailsFn = opts.setDetails || setDetails;
  const messagesEl = $("messages");
  if (!messagesEl) return;
  messagesEl.replaceChildren();
  let errors = 0;
  let warnings = 0;
  const seen = new Set();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = (item.type || "info") + ":" + item.text;
    if (seen.has(key)) continue;
    seen.add(key);
    const div = document.createElement("div");
    div.className = item.type || "info";
    div.textContent = item.text;
    if (item.type === "error") {
      const isEntry =
        /заход|выход|погружени|касани|разворот|R захода|угол захода|открытой стенк/i.test(
          item.text,
        ) ||
        issues.some(function (iss) {
          return iss.kind === "entry";
        });
      if (isEntry) {
        div.classList.add("clickableError");
        div.title = "Нажми, чтобы показать на чертеже и открыть раздел в меню";
        div.onclick = function () {
          const entryIssue =
            issues.find(function (iss) {
              return iss.kind === "entry";
            }) ||
            (errorEntryPoint
              ? {
                  id: 1,
                  kind: "entry",
                  point: errorEntryPoint,
                  text: "Радиусный заход: выбери другое место или R",
                }
              : null);
          if (entryIssue) {
            if (onIssueFocus) onIssueFocus(entryIssue);
          } else {
            if (onMenuHighlight) onMenuHighlight({ kind: "entry", text: item.text });
          }
        };
      }
    }
    if (item.action) {
      const button = document.createElement("button");
      button.id = "showFailedFrame";
      button.type = "button";
      button.className = "errorFrameButton";
      button.textContent = item.actionText;
      button.title = "Показать точную строку проверочного кода и проблемную дугу";
      button.onclick = item.action;
      div.appendChild(button);
    }
    messagesEl.appendChild(div);
    if (item.type === "error") errors++;
    if (item.type === "warn") warnings++;
  }
  if (issues.length) {
    const list = document.createElement("div");
    list.className = "geometryIssues";
    const label = document.createElement("div");
    label.textContent = "Метки на чертеже · нажми номер, чтобы приблизить место";
    list.appendChild(label);
    const displayCount = Math.min(issues.length, 64);
    for (let j = 0; j < displayCount; j++) {
      const issue = displayIssues(issues, j);
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "geometryIssue" + (["entry", "correction"].indexOf(issue.kind) >= 0 ? " entryIssue" : "");
      button.dataset.issueId = issue.id;
      button.textContent =
        issue.id +
        " · " +
        issue.text +
        " · X" +
        issue.point.x.toFixed(3) +
        " Y" +
        issue.point.y.toFixed(3);
      button.title = "Показать это место на чертеже и открыть раздел в меню";
      button.onclick = (function (currIssue) {
        return function () {
          if (currIssue.kind === "correction") {
            if (showFailedFrame) showFailedFrame();
          } else {
            if (onIssueFocus) onIssueFocus(currIssue);
          }
        };
      })(issue);
      list.appendChild(button);
    }
    if (issues.length > 64) {
      const more = document.createElement("div");
      more.textContent = "Показаны первые 64 места из " + issues.length + ".";
      list.appendChild(more);
    }
    messagesEl.prepend(list);
  }
  const count = errors || warnings || issues.length;
  const detailsLabel = $("detailsLabel");
  if (detailsLabel)
    detailsLabel.textContent = errors > 1 ? "Ошибки" : errors ? "Ошибка" : "Проверка";
  const detailsBadge = $("detailsBadge");
  if (detailsBadge) {
    detailsBadge.hidden = !count;
    detailsBadge.textContent = count;
  }
  const toggleDetails = $("toggleDetails");
  if (toggleDetails) {
    toggleDetails.title =
      "Ошибок: " + errors + "; предупреждений: " + warnings + "; отмеченных мест: " + issues.length;
    toggleDetails.classList.toggle("has-errors", errors > 0);
    toggleDetails.classList.toggle("has-warnings", !errors && warnings > 0);
  }
  if (errors && setDetailsFn) setDetailsFn(true);
}
function displayIssues(issues, j) {
  return issues[j];
}
function renderContours(opts) {
  const state = opts.state;
  const activeColor = opts.activeColor;
  const sideOptions = opts.sideOptions;
  const activateContour = opts.activateContour;
  const dirtyDxf = opts.dirtyDxf;
  const updateParams = opts.updateParams;
  const marking = opts.marking;
  const countEl = $("contourCount");
  if (countEl) countEl.textContent = "(" + state.contours.length + ")";
  const listEl = $("contourList");
  if (!listEl) return;
  listEl.replaceChildren();
  const selectAll = $("selectAll");
  if (selectAll) selectAll.hidden = true;
  for (let i = 0; i < state.contours.length; i++) {
    const c = state.contours[i];
    const div = document.createElement("div");
    div.className = "contourItem" + (state.active === c.id ? " focus" : "");
    div.dataset.contourId = c.id;
    const dot = document.createElement("span");
    dot.textContent = "●";
    dot.style.color = activeColor;
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("button");
    label.type = "button";
    label.className = "contourName";
    label.setAttribute("aria-label", "Выбрать отмеченный контур " + c.id.toUpperCase());
    label.innerHTML =
      escapeHtml(c.id.toUpperCase()) +
      "<small>" +
      escapeHtml(
        (c.closed ? "Замкнутый" : "Открытый") +
          (c.ambiguous ? " · ветвление" : "") +
          " · в обработке",
      ) +
      "</small>";
    label.onclick = function () {
      activateContour(c.id);
    };
    label.onfocus = function () {
      activateContour(c.id);
    };
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Сторона обработки " + c.id);
    select.innerHTML = sideOptions();
    select.value = M.normalizeSide(c.side);
    select.disabled = marking;
    select.onchange = function () {
      c.side = select.value;
      activateContour(c.id);
      dirtyDxf();
      updateParams();
    };
    div.append(dot, label, select);
    listEl.appendChild(div);
  }
  const statSize = $("statSize");
  if (statSize) {
    if (state.planContours.length) {
      const b = C.bounds(state.planContours);
      statSize.textContent = b.w.toFixed(2) + " × " + b.h.toFixed(2);
    } else {
      statSize.textContent = "—";
    }
  }
}
function renderOperationPanel(opts) {
  const op = opts.op;
  const kind = opts.kind;
  const operations = opts.operations;
  const position = operations.indexOf(op);
  const drilling = kind === "drill";
  const editor = opts.editor;
  const operationLabel = opts.operationLabel;
  const addToolOptions = opts.addToolOptions;
  const updateDrillFields = opts.updateDrillFields;
  const applyCatalogueTool = opts.applyCatalogueTool;
  const machine = opts.machine;
  const choice = $("operationChoice");
  const tools = $("operationTool");
  choice.replaceChildren();
  for (let i = 0; i < operations.length; i++) {
    const entry = operations[i];
    const count = editor.items.filter(function (item) {
      return A.isMark(item, entry);
    }).length;
    choice.appendChild(new Option(i + 1 + ". " + operationLabel(entry) + " · " + count, entry.id));
  }
  choice.size = Math.min(4, Math.max(2, operations.length));
  $("operationCount").textContent = String(operations.length);
  for (let j = 0; j < choice.options.length; j++) {
    const option = choice.options[j];
    const entry = operations.find(function (item) {
      return item.id === option.value;
    });
    if (entry) option.style.color = entry.color;
  }
  choice.value = op.id;
  $("moveOperationUp").disabled = position === 0;
  $("moveOperationDown").disabled = position === operations.length - 1;
  $("removeOperation").disabled = false;
  $("addMillOperation").disabled = operations.length >= A.MAX_OPERATIONS;
  $("addDrillOperation").disabled = operations.length >= A.MAX_OPERATIONS;
  $("addDrillOperation").title = "Добавить сверление";
  tools.replaceChildren(new Option(drilling ? "Выбрать инструмент" : "Параметры вручную", ""));
  addToolOptions(tools, function (tool) {
    return A.allowed(tool, kind);
  });
  if (
    op.toolNumber !== null &&
    ![].slice.call(tools.options).some(function (opt) {
      return Number(opt.value) === op.toolNumber;
    })
  ) {
    tools.appendChild(
      new Option("№" + op.toolNumber + " · выбери подходящий тип", String(op.toolNumber)),
    );
  }
  tools.value = op.toolNumber == null ? "" : String(op.toolNumber);
  $("operationColor").value = op.color;
  $("markOperation").style.setProperty("--mark-color", op.color);
  $("markOperation").setAttribute(
    "aria-label",
    drilling ? "Отметить отверстия" : "Отметить контуры",
  );
  $("markOperation").disabled = false;
  $("markOperation").title =
    "Рамка или щелчок переключают назначение элементов. Shift + левая кнопка — сдвиг вида. Esc — Выбор.";
  $("drillFields").hidden = !drilling;
  $("millFields").hidden = drilling;
  const repMode = $("repeatMode") ? $("repeatMode").value : "none";
  if ($("g25Fields")) $("g25Fields").hidden = kind !== "g25" && repMode !== "g25";
  if ($("m98Fields")) $("m98Fields").hidden = repMode !== "m98";
  if ($("m98PField") && $("m98ReturnMode"))
    $("m98PField").hidden = $("m98ReturnMode").value !== "p";
  updateDrillFields();
  applyCatalogueTool();
}
function renderOperationLabels(opts) {
  const operations = opts.operations;
  const editor = opts.editor;
  const operationLabel = opts.operationLabel;
  const syncWorkspace = opts.syncWorkspace;
  if (syncWorkspace) syncWorkspace();
  const choice = $("operationChoice");
  if (!choice) return;
  for (let i = 0; i < choice.options.length; i++) {
    const option = choice.options[i];
    const op = operations.find(function (entry) {
      return entry.id === option.value;
    });
    if (!op) continue;
    const count = editor.items.filter(function (item) {
      return A.isMark(item, op);
    }).length;
    option.textContent = operations.indexOf(op) + 1 + ". " + operationLabel(op) + " · " + count;
  }
}
function renderMachine(opts) {
  const machine = opts.machine;
  const machineSelected = opts.machineSelected;
  const activeKind = opts.activeKind;
  const hasStartPoint = opts.hasStartPoint;
  const name = M.profiles[machine].name;
  $("chooseMachine").textContent = name + " ▾";
  $("rpm").max = "9999";
  $("ncTitle").textContent = "Код " + name;
  $("useG92").disabled = true;
  $("useG92").checked = true;
  $("coordinateMode").disabled = activeKind === "drill";
  const fanucFeeds = document.querySelectorAll(".fanucFeed");
  for (let i = 0; i < fanucFeeds.length; i++) fanucFeeds[i].hidden = false;
  $("lineNumbersLabel").textContent = "Номера N001…N999";
  $("timeCaption").textContent = "РЕЗАНИЕ, ОЦЕНКА";
  $("ncFeedCaption").textContent = "Максимальная подача, мм/мин";
  $("leadCaption").textContent = "Заход / выход, мм";
  if ($("defaultLeadCaption")) $("defaultLeadCaption").textContent = "Радиус захода R, мм";
  $("autoLeadCaption").textContent = "Касательный автозаход";
  const fanucFeatures = document.querySelectorAll(".fanucFeature");
  for (let j = 0; j < fanucFeatures.length; j++) fanucFeatures[j].hidden = false;
  $("directionField").hidden = activeKind === "drill";
  $("pickStart").hidden = false;
  $("demoNc").hidden = false;
  if ($("selectFanuc")) $("selectFanuc").classList.toggle("selected", machineSelected);
  $("closeMachine").hidden = !machineSelected;
}
function updatePlaneReadout(opts) {
  const state = opts.state;
  const workPlaneValue = opts.workPlaneValue;
  const activeViewPlane =
    state.mode === "nc" ? state.ncPlane || "xy" : C.planeInfo(workPlaneValue || "xy").id;
  const plane = C.planeInfo(activeViewPlane);
  const normal = plane.axes[2];
  $("workPlaneButton").textContent = "Плоскость " + plane.axes.slice(0, 2).join("");
  $("workPlaneButton").title =
    state.mode === "nc"
      ? "Плоскость просмотра"
      : "Рабочая плоскость операции: " + plane.axes.slice(0, 2).join("/") + "; глубина " + normal;
  $("topView").textContent = plane.axes.slice(0, 2).join("");
  $("topView").title = "Вид на плоскость " + plane.axes.slice(0, 2).join("");
  $("topAxisLabel").textContent = normal + " верха, мм";
  $("safeAxisLabel").textContent = normal + " безопасный, мм";
  const editPlane = state.mode === "nc" ? C.planeInfo(state.ncCodePlane || activeViewPlane) : plane;
  $("ncShiftU").textContent = "Сдвиг " + editPlane.axes[0] + ", мм";
  $("ncShiftV").textContent = "Сдвиг " + editPlane.axes[1] + ", мм";
  $("ncDepthAxis").textContent = "Конечная глубина от " + editPlane.axes[2] + "0, мм";
  $("ncSafeAxis").textContent = "Положительный " + editPlane.axes[2] + " в G00, мм";
  $("entryAxisU").textContent = plane.axes[0] + " начала";
  $("entryAxisV").textContent = plane.axes[1] + " начала";
  if ($("exitAxisU")) $("exitAxisU").textContent = plane.axes[0] + " выхода";
  if ($("exitAxisV")) $("exitAxisV").textContent = plane.axes[1] + " выхода";
  const planes = ["xy", "zx", "yz"];
  for (let k = 0; k < planes.length; k++) {
    const btn = $("choosePlane" + planes[k].toUpperCase());
    if (btn) btn.setAttribute("aria-pressed", String(planes[k] === plane.id));
  }
  return activeViewPlane;
}
function catalogueStatus(text, error) {
  const el = $("catalogStatus");
  if (el) {
    el.textContent = text;
    el.dataset.error = String(!!error);
  }
}
function editCatalogueTool(opts) {
  const tool = opts.tool;
  const toolCatalog = opts.toolCatalog;
  const activeKind = opts.activeKind;
  let next = 1;
  while (toolCatalog.has(next)) next++;
  $("catalogChoice").value = tool ? String(tool.number) : "";
  $("catalogNumber").value = String(tool && tool.number != null ? tool.number : next);
  $("catalogNumber").readOnly = !!tool;
  $("catalogType").value = (tool && tool.type) || (activeKind === "drill" ? "drill" : "end_mill");
  $("catalogName").value = (tool && tool.name) || "";
  $("catalogDiameter").value = tool && tool.diameter != null ? tool.diameter : "";
  $("catalogFlutes").value = tool && tool.flutes != null ? tool.flutes : 2;
  $("catalogWorkingLength").value = tool && tool.workingLength != null ? tool.workingLength : 0;
  $("catalogCorrector").value = tool && tool.corrector != null ? tool.corrector : 1;
  $("catalogRadius").value =
    tool && tool.correctionRadius != null ? Math.round(tool.correctionRadius * 1000) : "";
  const defaultName = tool
    ? "Имя по умолчанию: (" + A.name(Object.assign({}, tool, { name: "" })) + ")."
    : "Заполни диаметр и сохрани инструмент.";
  catalogueStatus(defaultName, false);
}
function timeText(minutes) {
  if (minutes === null || !Number.isFinite(minutes)) return "—";
  const seconds = Math.round(minutes * 60);
  return Math.floor(seconds / 60) + " м " + String(seconds % 60).padStart(2, "0") + " с";
}
function blinkMenuElement(el) {
  if (!el) return;
  el.classList.remove("menuErrorHighlight");
  if (typeof el.offsetWidth === "number") void el.offsetWidth;
  el.classList.add("menuErrorHighlight");
  if (typeof el.addEventListener === "function") {
    el.addEventListener(
      "animationend",
      function () {
        el.classList.remove("menuErrorHighlight");
      },
      { once: true },
    );
  }
  setTimeout(function () {
    el.classList.remove("menuErrorHighlight");
  }, 2200);
}
function highlightMenuForIssue(issue, lastCalculationErrorText, showWorkPaneCb) {
  if (!issue) return;
  const text = (issue.text || "") + " " + (lastCalculationErrorText || "");
  const isEntry =
    issue.kind === "entry" ||
    /заход|выход|погружени|касани|разворот|R захода|угол захода|открытой стенк/i.test(text);
  if (showWorkPaneCb) showWorkPaneCb("operations");
  const highlighted = [];
  const highlight = function (el) {
    if (el) {
      blinkMenuElement(el);
      highlighted.push(el);
    }
  };
  if (isEntry) {
    const entryControls = $("entryControls");
    if (entryControls) entryControls.open = true;
    if (/угол захода|угол подхода|направлени.*стенк/i.test(text)) {
      highlight($("entryAngle") || $("directedEntry"));
    } else if (/сторона (?:фрезы|обработки)/i.test(text)) {
      highlight($("openOffsetSide") || $("cutSide"));
    } else if (/касани/i.test(text) && !/начал|разворот|выбери другое место|место|R/i.test(text)) {
      highlight($("pickStart"));
    } else if (
      /задай R|увеличь R|автоподбор R|положительный R|D превышает заданный радиус/i.test(text) &&
      !/начал|разворот|выбери другое место/i.test(text)
    ) {
      highlight(
        $("entryMode") && $("entryMode").value === "manual" && $("manualLead")
          ? $("manualLead")
          : $("lead"),
      );
      if ($("autoLead")) highlight($("autoLead"));
    } else if (/выход/i.test(text)) {
      highlight($("pickExit"));
    } else if (/разворот|выбери другое место|начало|погружени/i.test(text)) {
      highlight($("pickEntryStart"));
      if (/\bR\b|радиус/i.test(text)) {
        highlight(
          $("entryMode") && $("entryMode").value === "manual" && $("manualLead")
            ? $("manualLead")
            : $("lead"),
        );
      }
    } else {
      highlight($("pickEntryStart"));
      highlight(
        $("entryMode") && $("entryMode").value === "manual" && $("manualLead")
          ? $("manualLead")
          : $("lead"),
      );
    }
  } else if (issue.kind === "correction" || /\b[Dd]\b|корректор|ячейк/i.test(text)) {
    highlight($("correctionValue") || $("correctorField") || $("compMode"));
  } else if (issue.kind === "open-wall-end" || /открыт.*стенк/i.test(text)) {
    highlight($("openOffsetSide") || $("openOffsetField"));
  }
  if (highlighted.length > 0) {
    const first = highlighted[0];
    if (typeof first.scrollIntoView === "function") {
      first.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
}
function renderCalculationResult(opts) {
  const program = opts.program;
  const activeOperationId = opts.activeOperationId;
  const config = opts.config;
  const machine = opts.machine;
  const planContours = opts.planContours;
  const part = program.parts.find(function (entry) {
      return entry.id === activeOperationId;
    }),
    r = part ? part.result : null,
    c = (part ? part.config : null) || config,
    drilling = r ? r.drilling : null;
  const cp = (r ? r.compensation : null) || { kind: "center" },
    D = "D" + String(cp.number === undefined ? 1 : cp.number).padStart(2, "0"),
    full = cp.kind === "full",
    wear = cp.kind === "wear";
  const description = !r
    ? "Операция без отметок"
    : drilling
      ? "Сверление G" + drilling.cycle
      : r.toolKind === "scribe"
        ? "Разметка по линии · G40"
        : r.g12
          ? "G12/G13 · радиус по " + D + " = " + cp.tableValue.toFixed(3) + " мм"
          : full
            ? "Коррекция " +
              D +
              (cp.physicalPreview ? " · центр рассчитан по значению D" : " · программный контур")
            : wear
              ? "G42 " + D + " = 0 · радиус в координатах"
              : "Радиус в координатах центра · G40";
  $("postDescription").textContent = description + " · координаты ×1000, F ×10.";
  $("code").value = program.code;
  $("codeStatus").textContent = M.profiles[machine].name + " · операций " + program.parts.length;
  $("canvasTag").textContent =
    (part ? program.parts.indexOf(part) + 1 + " · " : "") +
    (r && r.partialOpenWall ? "ПРЕДВАРИТЕЛЬНЫЙ ОБХОД" : description.toUpperCase()) +
    " · ММ";
  $("passesCaption").textContent = drilling ? "ОТВЕРСТИЯ" : "ПРОХОДЫ";
  $("statPasses").textContent = r && r.passes !== undefined ? r.passes : "—";
  $("statTime").textContent = timeText(program.minutes);
  $("statBlocks").textContent = program.blocks;
  const b = C.bounds(planContours);
  $("statSize").textContent = b.w.toFixed(2) + " × " + b.h.toFixed(2);
  const readout = $("compReadout");
  readout.hidden = !r || !!drilling || r.toolKind === "scribe";
  readout.classList.toggle("zeroD", wear);
  readout.textContent =
    full || (r && r.g12)
      ? "На станке " +
        D +
        " = " +
        Math.round(cp.tableValue * 1000) +
        " (" +
        cp.tableValue.toFixed(3) +
        " мм). Фреза Ø" +
        c.diameter +
        " мм."
      : wear
        ? "На станке " + D + " = 0.000 мм. Радиус фрезы учтён в координатах."
        : "G40 · радиус фрезы учтён в координатах.";
  for (const info of (r ? r.fitReport : null) || [])
    readout.textContent +=
      " " +
      info.contour.toUpperCase() +
      ": " +
      (info.partial
        ? "доступный обход; недорез залит красным."
        : "припуск " + info.appliedAllowance.toFixed(3) + " мм.") +
      " Предел точного корректора R" +
      info.maxExactRadius.toFixed(3) +
      " мм.";
  if (r && r.partialOpenWall)
    readout.textContent += " Предварительный обход. Остаток у стенки показан красным.";
  $("compSummary").hidden = !(full || wear);
  $("compSummary").textContent = full || wear ? D + " = " + cp.tableValue.toFixed(3) : "";
  $("compSummary").title = readout.textContent;
  $("compSummary").classList.toggle("zeroD", wear);
  return {
    part: part,
    r: r,
    c: c,
    drilling: drilling,
    description: description,
  };
}
function renderNcParseResult(opts) {
  const r = opts.result;
  const machine = opts.machine;
  const section = opts.section;
  const currentMotions = opts.currentMotions;
  $("ncSection").innerHTML = '<option value="all">Вся программа</option>';
  for (const s of r.sections) {
    const o = document.createElement("option");
    o.value = s.index;
    o.textContent = s.label;
    $("ncSection").appendChild(o);
  }
  if (
    [...$("ncSection").options].some(function (o) {
      return o.value === section;
    })
  )
    $("ncSection").value = section;
  $("canvasTag").textContent = r.motions.some(function (m) {
    return m.comp !== 40;
  })
    ? "ПРОГРАММНЫЙ КОНТУР · G41/G42"
    : "ПРОГРАММНАЯ ТРАЕКТОРИЯ · ММ";
  const repeats = r.repeats && r.repeats.length ? " · G25" : r.m98Repeats ? " · M98" : "";
  $("codeStatus").textContent = r.errors.length
    ? "Есть ошибки · экспорт заблокирован"
    : "Код разобран · " + r.motions.length + " перемещений" + repeats;
  $("statPasses").textContent = r.sections.length;
  $("statTime").textContent = timeText(r.minutes);
  $("statBlocks").textContent = r.lines.filter(function (x) {
    return C.tokenizeNC(x).words.length;
  }).length;
  const b = C.bounds(currentMotions);
  $("statSize").textContent = b.w.toFixed(2) + " × " + b.h.toFixed(2);
}
function renderCutter(ctx, opts) {
  const s = opts.s;
  const cfg = opts.cfg;
  const knownCenter = opts.knownCenter;
  const position = opts.position;
  const view = opts.view;
  const zoom = opts.zoom;
  const cw = opts.cw;
  const ch = opts.ch;
  const screen = opts.screen;
  const rr = (cfg.diameter / 2) * zoom,
    ry = view === "xy" ? rr : rr * 0.51;
  ctx.save();
  ctx.setLineDash([]);
  if (knownCenter) {
    ctx.beginPath();
    if (view === "xy") ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
    else {
      const c = C.P(position.x, position.y),
        a = C.P(c.x + cfg.diameter / 2, c.y);
      SKETCH.traceSegments(ctx, [C.arc(a, a, c, 2 * Math.PI)], function (q) {
        return screen(Object.assign({}, q, { z: position.z }));
      });
      ctx.closePath();
    }
    ctx.fillStyle = "rgba(31,101,239,0.18)";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5.5;
    ctx.stroke();
    ctx.strokeStyle = "#165bdb";
    ctx.lineWidth = 2.8;
    ctx.stroke();
    ctx.strokeStyle = "rgba(22,91,219,0.85)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(s.x - rr, s.y);
    ctx.lineTo(s.x + rr, s.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(s.x - rr, s.y - 4);
    ctx.lineTo(s.x - rr, s.y + 4);
    ctx.moveTo(s.x + rr, s.y - 4);
    ctx.lineTo(s.x + rr, s.y + 4);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(s.x - 7, s.y);
  ctx.lineTo(s.x + 7, s.y);
  ctx.moveTo(s.x, s.y - 7);
  ctx.lineTo(s.x, s.y + 7);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = "#154fb4";
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s.x, s.y, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = "#145ae0";
  ctx.fill();
  const label =
    "Ø " + Number(cfg.diameter.toFixed(3)) + " мм" + (knownCenter ? "" : " · центр задаёт стойка");
  ctx.font = 'bold 14px Consolas, "Courier New", monospace';
  const tw = ctx.measureText(label).width,
    bw = Math.round(tw + 20),
    bh = 24,
    bx = Math.round(Math.max(7, Math.min(cw - bw - 7, s.x + Math.min(rr * 0.72, 40) + 12))),
    by = Math.round(Math.max(60, Math.min(ch - bh - 45, s.y - Math.min(ry * 0.72, 40) - 31))),
    cx = Math.round(bx + bw / 2),
    cy = Math.round(by + bh / 2);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#165bdb";
  ctx.lineWidth = 1.5;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 5);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(bx, by, bw, bh);
    if (ctx.strokeRect) ctx.strokeRect(bx, by, bw, bh);
  }
  ctx.fillStyle = "#072b54";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy);
  ctx.restore();
}
function renderGrid(ctx, opts) {
  const cw = opts.cw;
  const ch = opts.ch;
  const view = opts.view;
  const zoom = opts.zoom;
  const fromScreen = opts.fromScreen;
  const screen = opts.screen;
  const badgeEl = opts.badgeEl || $("gridBadge");
  ctx.fillStyle = "#f9fbfc";
  ctx.fillRect(0, 0, cw, ch);
  if (view !== "xy") {
    if (badgeEl) badgeEl.hidden = true;
    return;
  }
  const approx = 60 / zoom,
    pow = Math.pow(10, Math.floor(Math.log10(approx))),
    step =
      [1, 2, 5, 10]
        .map(function (x) {
          return x * pow;
        })
        .find(function (x) {
          return x >= approx;
        }) || pow;
  const a = fromScreen(0, ch),
    b = fromScreen(cw, 0);
  ctx.strokeStyle = "#e3eaf0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.ceil(a.x / step) * step; x <= b.x; x += step) {
    const s = screen({ x: x, y: 0 });
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, ch);
  }
  for (let y = Math.ceil(a.y / step) * step; y <= b.y; y += step) {
    const s = screen({ x: 0, y: y });
    ctx.moveTo(0, s.y);
    ctx.lineTo(cw, s.y);
  }
  ctx.stroke();
  const gridLabel = step.toFixed(Math.max(0, -Math.floor(Math.log10(step)))) + " мм / клетка";
  if (badgeEl) {
    badgeEl.textContent = gridLabel;
    badgeEl.hidden = false;
  }
}

const api = {
  escapeHtml: escapeHtml,
  openDialog: openDialog,
  closeDialog: closeDialog,
  showToast: showToast,
  setDetails: setDetails,
  showWorkPane: showWorkPane,
  syncWorkspace: syncWorkspace,
  renderOrigin: renderOrigin,
  renderMessages: renderMessages,
  renderContours: renderContours,
  renderOperationPanel: renderOperationPanel,
  renderOperationLabels: renderOperationLabels,
  renderMachine: renderMachine,
  updatePlaneReadout: updatePlaneReadout,
  catalogueStatus: catalogueStatus,
  editCatalogueTool: editCatalogueTool,
  timeText: timeText,
  blinkMenuElement: blinkMenuElement,
  highlightMenuForIssue: highlightMenuForIssue,
  renderCalculationResult: renderCalculationResult,
  renderNcParseResult: renderNcParseResult,
  renderCutter: renderCutter,
  renderGrid: renderGrid,
};
export default api;
