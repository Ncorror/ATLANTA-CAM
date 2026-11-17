import { zReference } from "../nc/z-reference.js";
/**
 * calculation-controller controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.A
 * @param {*} deps.activeOperation
 * @param {*} deps.activeOperationId
 * @param {*} deps.ATLANTA_OPERATIONS
 * @param {*} deps.C
 * @param {*} deps.calculation (read/write)
 * @param {*} deps.CAM_JOB
 * @param {*} deps.captureOperation
 * @param {*} deps.config
 * @param {*} deps.currentAutoFix (read/write)
 * @param {*} deps.diagnosticIssues (read/write)
 * @param {*} deps.diagnosticMaterial (read/write)
 * @param {*} deps.editor
 * @param {*} deps.enableExport
 * @param {*} deps.errorEntryPoint (read/write)
 * @param {*} deps.failedDiagnostic (read/write)
 * @param {*} deps.invalidate
 * @param {*} deps.lastCalculationErrorText (read/write)
 * @param {*} deps.M
 * @param {*} deps.machine
 * @param {*} deps.machineSelected
 * @param {*} deps.MATERIAL_VIEW
 * @param {*} deps.message
 * @param {*} deps.OPEN_WALL
 * @param {*} deps.operationLabel
 * @param {*} deps.operations
 * @param {*} deps.ORIGIN
 * @param {*} deps.originBasePoint
 * @param {*} deps.parseNc
 * @param {*} deps.requestDraw
 * @param {*} deps.restoreEntry
 * @param {*} deps.restoreEntryStart
 * @param {*} deps.restoreExit
 * @param {*} deps.saveToolProfile
 * @param {*} deps.scheduleAutosave
 * @param {*} deps.setSim
 * @param {*} deps.showFailedFrame
 * @param {*} deps.showMachine
 * @param {*} deps.SKETCH
 * @param {*} deps.state
 * @param {*} deps.toast
 * @param {*} deps.toastTimer
 * @param {*} deps.toolCatalog
 * @param {*} deps.UI_RENDER
 * @param {*} deps.unsupportedDxfGeometry
 * @param {*} deps.updateEntryReadout
 * @param {*} deps.updateParams
 * @param {*} deps.WALL_NETWORK
 * @param {*} deps.withSides
 */
export function createCalculationController(deps) {
  function calculationButton() {
    deps.$("generate").textContent = deps.calculation
      ? "Остановить расчёт"
      : deps.editor.isOpen
        ? "К обработке → рассчитать"
        : "Рассчитать траекторию";
    deps.$("generate").setAttribute("aria-busy", String(!!deps.calculation));
  }

  function cancelCalculation() {
    var _previous$job;
    if (!deps.calculation) return;
    const previous = deps.calculation;
    deps.calculation = null;
    (_previous$job = previous.job) === null || _previous$job === void 0 || _previous$job.cancel();
    calculationButton();
  }

  function completeCalculation(result) {
    deps.state.result = result;
    deps.state.fit = true;
    showResult();
    deps.scheduleAutosave();
    deps.toast("Траектория рассчитана");
  }

  function calculationError(error, material) {
    var _error$wallNetworkInf, _error$ncDiagnostic, _diagnosticMaterial, _diagnosticMaterial2;
    deps.invalidate("Расчёт остановлен");
    deps.$("code").value = "";
    clearTimeout(deps.toastTimer);
    deps.$("toast").classList.remove("show");
    let msg = error ? error.message : "";
    if (/разворот больше 180/i.test(msg)) {
      msg = "Заход из точки P в T невозможен: разворот больше 180°.";
    } else if (/Радиусный заход: выбери другое место или R/i.test(msg)) {
      msg = "Заход из точки P в T невозможен: задевает деталь или контур.";
    } else if (/Начало должно находиться вне окружности захода/i.test(msg)) {
      msg = "Заход из точки P в T невозможен: точка внутри дуги захода.";
    } else if (/материале заготовки|задевает заготовку/i.test(msg)) {
      msg = "Заход из точки P в T невозможен: Точка погружения находится в материале заготовки.";
    } else if (/нельзя построить касательную|касательную из выбранного начала/i.test(msg)) {
      msg = "Заход из точки P в T невозможен: задевает деталь или разворот больше 180°.";
    }
    deps.lastCalculationErrorText = msg;
    deps.errorEntryPoint = error ? error.entryPoint : null;
    if (!deps.errorEntryPoint && error && /заход|разворот|касани|начало/i.test(error.message)) {
      deps.errorEntryPoint =
        deps.state.entryStart ||
        deps.state.startPoint ||
        (deps.state.contours[0] && deps.state.contours[0].segs && deps.state.contours[0].segs[0].a);
    }
    let autoFix = error ? error.autoFix : null;
    if (!autoFix && (deps.errorEntryPoint || /заход|разворот|начало|касани/i.test(msg))) {
      const contour =
        deps.state.contours &&
        (deps.state.contours.find((item) => item.id === deps.state.active && item.enabled) ||
          deps.state.contours.find((item) => item.enabled));
      if (contour && deps.ATLANTA_OPERATIONS && deps.ATLANTA_OPERATIONS.solveLeadIn) {
        const side = contour.side === "auto" ? contour.autoSide : contour.side;
        const autoSol = deps.ATLANTA_OPERATIONS.solveLeadIn(
          contour,
          side,
          deps.config().direction,
          Object.assign({}, deps.config(), {
            allSketchItems: deps.editor.serialize().items,
            otherContours: deps.state.contours,
            stock: {
              shape: deps.config().stockShape,
              dia: deps.config().stockDia,
              x: deps.config().stockX,
              y: deps.config().stockY,
            },
          }),
        );
        if (autoSol && autoSol.ok) {
          autoFix = {
            T: autoSol.T,
            P: autoSol.P,
            exitPoint: autoSol.exitPoint,
            R_arc: autoSol.R_arc,
            L: autoSol.L,
          };
        }
      }
    }
    deps.diagnosticMaterial = material || null;
    deps.diagnosticIssues =
      ((_error$wallNetworkInf = error.wallNetworkInfo) === null || _error$wallNetworkInf === void 0
        ? void 0
        : _error$wallNetworkInf.issues) || null;
    if (!deps.diagnosticIssues)
      try {
        deps.diagnosticIssues = deps.WALL_NETWORK.inspect(deps.state.contours, true);
      } catch (ignored) {}
    if (!deps.diagnosticMaterial && error.wallNetworkInfo)
      deps.diagnosticMaterial = deps.MATERIAL_VIEW.analyzeNetwork(
        error.wallNetworkInfo,
        {},
        deps.config(),
      );
    if (!deps.diagnosticMaterial && error.openWallClearance)
      deps.diagnosticMaterial = deps.MATERIAL_VIEW.diagnoseOpen(
        deps.state.contours,
        deps.config(),
        error.openWallClearance,
      );
    if (deps.errorEntryPoint)
      deps.diagnosticIssues = [
        {
          id: 1,
          kind: "entry",
          point: deps.errorEntryPoint,
          text: msg || "Небезопасный заход: столкновение инструмента",
        },
        ...(deps.diagnosticIssues || []).map((issue) => ({
          ...issue,
          id: issue.id + 1,
        })),
      ];
    if (autoFix && deps.$("fixEntryAuto")) {
      deps.currentAutoFix = autoFix;
      deps.$("fixEntryAuto").style.display = "inline-block";
      if (deps.$("showEntryZones")) deps.$("showEntryZones").style.display = "inline-block";
    } else if (deps.$("fixEntryAuto")) {
      deps.$("fixEntryAuto").style.display = "none";
    }
    if (
      (_error$ncDiagnostic = error.ncDiagnostic) !== null &&
      _error$ncDiagnostic !== void 0 &&
      _error$ncDiagnostic.code &&
      error.ncDiagnostic.point
    ) {
      const d = error.ncDiagnostic;
      deps.failedDiagnostic = {
        ...d,
        previewPoints: Array.from({ length: 65 }, (_, i) => deps.C.point(d.segment, i / 64)),
      };
      deps.diagnosticIssues = [
        {
          id: 1,
          kind: "correction",
          point: d.point,
          text: d.stage + " · " + (d.block ? d.block + " · " : "") + "строка " + d.line,
        },
        ...(deps.diagnosticIssues || []).map((issue) => ({
          ...issue,
          id: issue.id + 1,
        })),
      ];
    }
    deps.updateEntryReadout();
    const notes = (
      ((_diagnosticMaterial = deps.diagnosticMaterial) === null || _diagnosticMaterial === void 0
        ? void 0
        : _diagnosticMaterial.warnings) || []
    ).map((text) => ({ type: "warn", text }));
    if (
      (_diagnosticMaterial2 = deps.diagnosticMaterial) !== null &&
      _diagnosticMaterial2 !== void 0 &&
      _diagnosticMaterial2.groups.length
    )
      notes.unshift({
        type: "warn",
        text: "Красная заливка показывает местный недорез для заданной фрезы. Проход от точки входа не рассчитан.",
      });
    deps.message([
      {
        type: "error",
        text: msg || error.message,
        action: deps.failedDiagnostic ? deps.showFailedFrame : null,
        actionText: deps.failedDiagnostic
          ? "Показать " + (deps.failedDiagnostic.block || "строку " + deps.failedDiagnostic.line)
          : "",
      },
      ...notes,
      ...deps.state.dxfWarnings.map((text) => ({ type: "warn", text })),
    ]);
    if (deps.failedDiagnostic) deps.showFailedFrame();
  }

  function plannedOperations() {
    const parts = [],
      drafts = [],
      items = deps.editor.items;
    for (const op of deps.$("activeOperationOnly").checked
      ? [deps.activeOperation()]
      : deps.operations) {
      const assigned = items.filter((item) => deps.A.isMark(item, op));
      if (!assigned.length) {
        if (op.id !== "primary") drafts.push(deps.operationLabel(op));
        continue;
      }
      const c = deps.config(op),
        tool = deps.toolCatalog.get(op.toolNumber);
      zReference(c); // Validate physical setup before the local planner overrides start/clearance.
      if (c.machine === "fanuc3000c" && c.feedInHeader) deps.A.headerFeedWord(c);
      if (op.toolNumber !== null && (!tool || !deps.A.allowed(tool, c.toolKind)))
        throw Error(deps.operationLabel(op) + ": выбери подходящий инструмент.");
      c.safeZ = +deps.C.fmt(c.safeZ, c.coordScale, c.decimal) / c.coordScale;
      const topZ = +deps.C.fmt(c.topZ, c.coordScale, c.decimal) / c.coordScale;
      if (c.safeZ < deps.A.PARK_Z || topZ >= deps.A.PARK_Z)
        throw Error(
          "Безопасный Z должен быть не ниже 30 мм, а верх заготовки должен быть ниже Z30.",
        );
      c.initialZ = c.safeZ;
      c.endZ = c.safeZ;
      c.useG92 = true;
      c.lineNumbers = false;
      c.returnXY = true;
      c.endCode = "M30";
      const part = {
        id: op.id,
        op,
        config: c,
        tool,
        name: deps.A.name(tool, c),
        label: deps.operationLabel(op),
        warnings: [],
      };
      if (op.kind === "drill") {
        if (c.machine !== "fanuc3000c")
          throw Error("Сверление доступно в профиле FANUC 3000C. Выбери его для расчёта проекта.");
        part.holes = assigned;
      } else {
        if (op.id === deps.activeOperationId)
          part.contours = deps.state.contours.map((contour) => ({ ...contour }));
        else {
          const scene = deps.SKETCH.machiningScene(
            items,
            { contours: deps.state.planContours, warnings: [] },
            op.id,
          );
          part.contours = deps.withSides(scene.machiningContours, op.sides, c.cutSide);
          part.warnings.push(...scene.machiningWarnings);
        }
        if (part.contours) {
          for (const contour of part.contours) {
            if (!contour.closed && !contour.wallDirection) {
              if (c.direction === "conventional" || c.direction === "cw")
                contour.wallDirection = "cw";
              else if (c.direction === "climb" || c.direction === "ccw")
                contour.wallDirection = "ccw";
            }
          }
        }
        const isXY = !c.workPlane || c.workPlane === "xy";
        const circularCycle = c.g12Cycle || c.cutSide === "g12";
        const hasOpen = part.contours && part.contours.some((contour) => !contour.closed);
        const firstSide = part.contours[0]
          ? part.contours[0].side === "auto"
            ? part.contours[0].autoSide
            : part.contours[0].side
          : null;
        const isClosedEligible =
          part.contours &&
          part.contours.every((contour) => contour.closed) &&
          firstSide !== "inside";
        if (
          !circularCycle &&
          c.compMode !== "tool" &&
          c.entryMode === "auto" &&
          isXY &&
          (hasOpen || isClosedEligible)
        ) {
          const autoPlan = deps.ATLANTA_OPERATIONS.planAutoEntryAndExit(part.contours, c, items, {
            shape: c.stockShape,
            dia: c.stockDia,
            x: c.stockX,
            y: c.stockY,
          });
          if (autoPlan) {
            if (autoPlan.isOpen) {
              c.startPoint = null;
              c.entryStart = null;
              c.lead = autoPlan.lead;
              c.entryRun = autoPlan.entryRun;
              c.autoLead = false;
              c.entryMode = "touch";
              part.autoPlungePoint = autoPlan.plungePoint;
              part.autoExitPoint = autoPlan.exitPoint;
              part.autoPlanned = true;
            } else {
              c.startPoint = autoPlan.startPoint;
              c.entryStart = autoPlan.entryStart;
              c.lead = autoPlan.lead;
              c.entryRun = autoPlan.entryRun;
              c.autoLead = true;
              c.entryMode = "touch";
              part.autoPlungePoint = autoPlan.plungePoint;
              part.autoExitPoint = autoPlan.exitPoint;
              part.autoPlanned = true;
              if (autoPlan.retractZFirst) {
                part.retractZFirst = true;
                part.warnings.push(
                  "Выход " +
                    (c.exitOffset || 0.1) +
                    " мм заблокирован стенкой: выполнен подъём по Z перед отводом фрезы.",
                );
              }
            }
          }
        } else if (!circularCycle && c.entryMode !== "auto") {
          c.startPoint = deps.restoreEntry(op, part.contours);
          c.entryStart = deps.restoreEntryStart(op, part.contours);
          c.exitPoint = deps.restoreExit(op, part.contours);
          if (
            (op.entry && !c.startPoint) ||
            (op.entryStart && !c.entryStart) ||
            (op.exitPoint && !c.exitPoint)
          ) {
            const error = Error(
              "Контур выбранного захода изменился. Укажи касание или начало заново. Точки сохранены; автоматического переноса нет.",
            );
            error.entryPoint = op.exitPoint || op.entryStart || op.entry;
            throw error;
          }
        }
        if (!circularCycle && (c.toolKind === "scribe" || c.compMode === "center")) c.corrector = 1;
      }
      parts.push(part);
    }
    if (!parts.length)
      throw Error("Отметь цветом операции контуры или добавь сверление и отметь окружности.");
    return { parts, drafts };
  }

  function startCalculation(parts, c, drafts) {
    deps.invalidate("Идёт расчёт траектории…");
    const token = { job: null };
    deps.calculation = token;
    calculationButton();
    function applyExitPoint(target) {
      if (target && target.result && (target.result.g12 || target.result.g25)) return;
      const ep =
        target.op && target.op.exitPoint
          ? { x: target.op.exitPoint.x, y: target.op.exitPoint.y }
          : target.autoExitPoint || null;
      if (!target || !target.result || !ep) return;
      if (target.config.workPlane && target.config.workPlane !== "xy") return;
      const originX = target.config.originX || 0;
      const originY = target.config.originY || 0;
      const localEp = { x: ep.x - originX, y: ep.y - originY };
      if (target.result.operations) {
        for (const opEntry of target.result.operations) {
          if (target.autoPlanned) {
            opEntry.manualEntry = false;
            if (target.autoPlungePoint) opEntry.entry = target.autoPlungePoint;
            if (target.autoExitPoint) opEntry.exit = target.autoExitPoint;
          }
          const oldExit =
            opEntry.exit ||
            (opEntry.leadOut && opEntry.leadOut.length
              ? opEntry.leadOut[opEntry.leadOut.length - 1].b
              : null);
          if (oldExit && deps.C.dist(oldExit, ep) > 0.001) {
            if (!opEntry.leadOut) opEntry.leadOut = [];
            opEntry.leadOut.push(deps.C.line(oldExit, ep));
            opEntry.exit = ep;
          } else if (!oldExit) {
            opEntry.exit = ep;
          }
        }
      }
      if (target.result.code && typeof target.result.code === "string") {
        const lines = target.result.code.split(/\r?\n/);
        let lastRetractIdx = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (/G00\s*Z/i.test(lines[i])) {
            lastRetractIdx = i;
            break;
          }
        }
        if (lastRetractIdx > 0 && !target.retractZFirst) {
          const isFanuc = target.config.machine === "fanuc3000c";
          const coordScale = target.config.coordScale || 1000;
          const xWord = isFanuc
            ? "X" + Math.round(localEp.x * coordScale)
            : "X" + localEp.x.toFixed(3);
          const yWord = isFanuc
            ? "Y" + Math.round(localEp.y * coordScale)
            : "Y" + localEp.y.toFixed(3);
          const feedWord = target.config.feed
            ? "F" + Math.round(Number(target.config.feed) * (target.config.feedScale || 10))
            : "";
          const hasComp = target.config.compMode === "control" || target.config.compMode === "wear";
          const g40Word = hasComp ? "G40" : "";
          const moveLine = "G01" + g40Word + xWord + yWord + feedWord;
          for (let j = lastRetractIdx + 1; j < lines.length; j++) {
            if (/G00.*G40/i.test(lines[j]) || (/G40/i.test(lines[j]) && /D00/i.test(lines[j]))) {
              lines.splice(j, 1);
              break;
            }
          }
          lines.splice(lastRetractIdx, 0, moveLine);
          let seq = 0;
          const renumbered = lines.map((line) => {
            if (/^N\d{3}/i.test(line)) {
              return "N" + String(++seq).padStart(3, "0") + line.replace(/^N\d{3}/i, "");
            }
            return line;
          });
          target.result.code = renumbered.join("\r\n");
        }
      }
    }
    function fail(part, error, material) {
      if (deps.calculation !== token) return;
      const message = part ? part.label + ": " + error.message : error.message;
      cancelCalculation();
      calculationError(
        {
          message,
          wallNetworkInfo: error.wallNetworkInfo,
          openWallClearance: error.openWallClearance,
          entryPoint: error.entryPoint,
          ncDiagnostic: error.ncDiagnostic,
        },
        material,
      );
    }
    function next(index) {
      if (deps.calculation !== token) return;
      let part;
      try {
        for (; index < parts.length; index++) {
          part = parts[index];
          if (part.op.kind === "drill") {
            part.result = deps.A.drill(part.op, part.config, part.holes, part.tool);
            continue;
          }
          const circles = part.contours.map((contour) => deps.A.getCircle(contour));
          const allCircles = circles.length > 0 && circles.every(Boolean);
          const useG12 =
            part.config.machine === "fanuc3000c" &&
            (part.config.g12Cycle || part.config.cutSide === "g12");
          if (useG12) {
            if (part.config.repeatMode === "g25" || part.config.toolKind === "g25")
              throw Error("Выбери один способ: круговой цикл G12/G13 или реверсный G25.");
            if (!allCircles) {
              throw Error(
                "Цикл расфрезерования G12/G13 применим только к круглым отверстиям. Выдели окружности или отключи цикл G12/G13.",
              );
            }
            part.result = deps.A.generateG12(part, part.op, part.config, circles, part.tool);
            applyExitPoint(part);
            part.result.material = {
              groups: [],
              warnings: [],
              complete: true,
              samples: 0,
              estimated: false,
            };
            continue;
          }
          const useG25 =
            part.config.machine === "fanuc3000c" &&
            (part.config.repeatMode === "g25" ||
              part.config.cutSide === "g25" ||
              part.config.toolKind === "g25");
          if (useG25) {
            part.result = deps.A.generateG25(part, part.op, part.config, part.tool);
            applyExitPoint(part);
            part.result.material = {
              groups: [],
              warnings: [],
              complete: true,
              samples: 0,
              estimated: false,
            };
            continue;
          }
          const segments = part.contours.reduce((sum, contour) => sum + contour.segs.length, 0);
          const openFit =
            segments > 128 &&
            part.config.autoFit &&
            part.contours.some(
              (contour) =>
                deps.OPEN_WALL.isRequested(contour) &&
                deps.M.normalizeSide(contour.side) === "inside",
            );
          if (part.config.toolKind === "mill" && (segments > 700 || openFit)) {
            const current = part,
              resume = index + 1;
            token.job = deps.CAM_JOB.run(current.contours, current.config, {
              progress: (text) => {
                if (deps.calculation === token) {
                  deps.$("codeStatus").textContent = current.label + " · " + text;
                  deps.$("canvasTag").textContent = text;
                }
              },
              complete: (data) => {
                if (deps.calculation !== token) return;
                if (data.error) fail(current, data.error, data.material);
                else {
                  current.result = data.result;
                  applyExitPoint(current);
                  next(resume);
                }
              },
            });
            return;
          }
          part.result = deps.M.generate(part.contours, part.config);
          applyExitPoint(part);
          part.result.material = deps.MATERIAL_VIEW.analyze(
            part.contours,
            part.result,
            part.config,
          );
          part.result.warnings.push(...part.result.material.warnings);
        }
        part = null;
        const result = deps.A.assemble(parts, c);
        if (drafts.length)
          result.warnings.push("Операции без отметок пропущены: " + drafts.join(", ") + ".");
        cancelCalculation();
        completeCalculation(result);
      } catch (error) {
        fail(part, error);
      }
    }
    next(0);
  }

  function calculate() {
    if (deps.calculation) {
      deps.invalidate("Расчёт отменён");
      return;
    }
    if (!deps.machineSelected) {
      deps.showMachine();
      return;
    }
    if (
      deps.editor.isOpen &&
      deps.editor.selectedIds.length &&
      !deps.editor.items.some((item) => deps.A.isMark(item, deps.activeOperation()))
    )
      deps.editor.marking();
    if (deps.editor.isOpen && !deps.editor.finish()) return;
    if (deps.state.mode === "nc") {
      deps.parseNc();
      return;
    }
    try {
      deps.ORIGIN.resolve(
        deps.C.bounds(deps.state.planContours),
        deps.$("originPreset").value,
        deps.ORIGIN.parse(deps.$("originShiftX").value, "ΔX"),
        deps.ORIGIN.parse(deps.$("originShiftY").value, "ΔY"),
        deps.originBasePoint,
      );
      if (deps.$("originPreset").value === "custom") {
        deps.ORIGIN.parse(deps.$("originX").value, "X нуля");
        deps.ORIGIN.parse(deps.$("originY").value, "Y нуля");
      }
      deps.updateParams();
      deps.saveToolProfile(deps.state.activeTool);
      deps.captureOperation();
      const dangerous = deps.unsupportedDxfGeometry();
      if (dangerous.length)
        throw Error(
          "В DXF есть неподдерживаемая геометрия: " +
            dangerous.join(", ") +
            ". Преобразуй её в линии или дуги в CAD.",
        );
      const { parts, drafts } = plannedOperations();
      startCalculation(parts, deps.config(), drafts);
    } catch (error) {
      calculationError(error);
    }
  }

  function timeText(minutes) {
    return deps.UI_RENDER.timeText(minutes);
  }

  function showResult() {
    const program = deps.state.result;
    if (!program) return;
    const rendered = deps.UI_RENDER.renderCalculationResult({
      program,
      activeOperationId: deps.activeOperationId,
      config: deps.config(),
      machine: deps.machine,
      planContours: deps.state.planContours,
    });
    const part = rendered.part,
      r = rendered.r,
      c = rendered.c,
      drilling = rendered.drilling;
    deps.enableExport(true);
    const sections = program.parts.map((entry, i) => {
      const d = entry.result.compensation,
        offset =
          d && d.kind !== "center"
            ? " · D" + String(d.number).padStart(2, "0") + " = " + d.tableValue.toFixed(3) + " мм"
            : "";
      return {
        type: "ok",
        text:
          i +
          1 +
          ". (" +
          entry.name +
          ") · " +
          (entry.result.partialOpenWall ? "предварительный обход · " : "") +
          (entry.result.drilling
            ? "G" + entry.result.drilling.cycle + " · " + entry.result.passes + " отв."
            : entry.result.passes + " прох.") +
          offset +
          " · " +
          entry.endCommand,
      };
    });
    const details = drilling
      ? {
          text:
            "Дно Z" +
            drilling.z.toFixed(3) +
            " мм · R" +
            drilling.r.toFixed(3) +
            " мм" +
            (drilling.q
              ? " · Q" + Math.round(drilling.q * 1000) + " (" + drilling.q.toFixed(3) + " мм)"
              : "") +
            " · F" +
            deps.C.feedFmt(drilling.feed, c) +
            ".",
        }
      : null;
    const warnings = [
      ...program.warnings,
      ...program.parts.flatMap((entry) =>
        [...entry.warnings, ...entry.result.warnings].map((text) =>
          entry === part ? text : entry.label + " · " + text,
        ),
      ),
      ...deps.state.dxfWarnings.filter(
        (text) =>
          !(r !== null && r !== void 0 && r.wallNetworkInfo) ||
          !/разветв|ветвлен|неоднозначн/i.test(text),
      ),
    ];
    deps.message([
      ...(details ? [details] : []),
      ...sections,
      ...[...new Set(warnings)].map((text) => ({ type: "warn", text })),
      {
        text: "Перед пуском проверь рабочий ноль, вылет инструмента, коррекции D и проход над зажимами. После M00 проверь высоту с новым инструментом и запуск шпинделя.",
      },
    ]);
    deps.updateEntryReadout();
    deps.setSim();
    deps.requestDraw();
  }
  return {
    calculationButton,
    cancelCalculation,
    completeCalculation,
    calculationError,
    plannedOperations,
    startCalculation,
    calculate,
    timeText,
    showResult,
  };
}
