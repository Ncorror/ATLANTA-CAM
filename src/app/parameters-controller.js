import { zReference } from "../nc/z-reference.js";
/**
 * parameters-controller controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.A
 * @param {*} deps.activeOperation
 * @param {*} deps.boolIds
 * @param {*} deps.C
 * @param {*} deps.config
 * @param {*} deps.editor
 * @param {*} deps.initialToolProfiles
 * @param {*} deps.M
 * @param {*} deps.machine
 * @param {*} deps.OPEN_WALL
 * @param {*} deps.renderMachine
 * @param {*} deps.state
 * @param {*} deps.syncWorkspace
 * @param {*} deps.toolCatalog
 * @param {*} deps.toolKeys
 * @param {*} deps.updateEntryReadout
 * @param {*} deps.updatePlaneReadout
 * @param {*} deps.WALL_NETWORK
 */
export function createParametersController(deps) {
  function saveToolProfile(kind) {
    const values = {};
    for (const id of deps.toolKeys)
      values[id] = deps.boolIds.includes(id) ? deps.$(id).checked : deps.$(id).value;
    deps.state.toolProfiles[kind] = values;
  }

  function applyToolProfile(kind) {
    const values =
      deps.state.toolProfiles[kind] ||
      deps.initialToolProfiles[kind] ||
      deps.initialToolProfiles.mill;
    for (const id of deps.toolKeys)
      if (values[id] != null) {
        if (deps.boolIds.includes(id)) deps.$(id).checked = values[id] === true;
        else deps.$(id).value = String(values[id]);
      }
    deps.state.activeTool = kind;
  }

  function updateParams() {
    deps.updatePlaneReadout();
    const c = deps.config(),
      marking = c.toolKind === "scribe",
      drilling = c.toolKind === "drill";
    deps.$("zReferenceSection").hidden = marking || drilling;
    deps.$("zReferencePlate").disabled = !c.zReferenceEnabled;
    deps.$("zReferenceSurfaceMode").disabled = !c.zReferenceEnabled;
    deps.$("zReferenceSurfaceField").hidden = c.zReferenceSurfaceMode !== "manual";
    deps.$("zReferenceSurfaceZ").disabled = !c.zReferenceEnabled;
    let reference;
    try {
      reference = zReference(c);
      deps.$("initialZ").value = deps.$("endZ").value = String(reference.z);
      deps.$("zReferenceSummary").textContent = "Z" + deps.C.fmt(reference.z, 1000, false);
      deps.$("zReferenceReadout").textContent = c.zReferenceEnabled
        ? "Поверхность Z" +
          Number(reference.surfaceZ || 0).toFixed(3) +
          " + плитка " +
          reference.plate +
          " + R" +
          reference.radius +
          " мм\n" +
          reference.command +
          " (" +
          reference.comment +
          ")"
        : "Фиксированная привязка прежнего проекта: G92X0Y0Z30000. Для касания плитки включите расчёт по радиусу.";
    } catch (error) {
      deps.$("zReferenceSummary").textContent = "Проверьте размеры";
      deps.$("zReferenceReadout").textContent = error.message;
    }
    const fixedFeed = deps.machine === "fanuc3000c" && c.feedInHeader;
    deps.$("headerFeed").disabled = !fixedFeed;
    deps.$("headerFeedField").hidden = !fixedFeed;
    deps.$("feedField").hidden = fixedFeed || drilling;
    deps.$("feedCodeReadout").hidden = fixedFeed || drilling;
    deps.$("contoursDetail").hidden = drilling;
    for (const id of ["feed", "plunge", "slowArcs", "slowFeedPercent"])
      deps.$(id).disabled = fixedFeed;
    deps.$("drillFeed").disabled = fixedFeed;
    deps.$("profileFields").hidden = drilling;
    document.body.classList.toggle("scribe", marking);
    deps.$("millFields").hidden = marking || drilling;
    const repMode =
      deps.$("toolKind").value === "g25"
        ? "g25"
        : c.repeatMode || (c.cutSide === "g25" ? "g25" : "none");
    if (deps.$("repeatMode")) deps.$("repeatMode").value = repMode;
    if (deps.$("g25Fields")) deps.$("g25Fields").hidden = repMode !== "g25";
    if (deps.$("m98Fields")) deps.$("m98Fields").hidden = repMode !== "m98";
    if (deps.$("m98PField") && deps.$("m98ReturnMode"))
      deps.$("m98PField").hidden = deps.$("m98ReturnMode").value !== "p";
    document.querySelectorAll(".millExpert").forEach((x) => (x.hidden = marking || drilling));
    deps.$("correctorField").hidden =
      marking ||
      drilling ||
      (!(c.g12Cycle || c.cutSide === "g12") && ["center", "tool"].includes(c.compMode));
    deps.$("toolProfileFields").hidden = marking || drilling || c.compMode !== "tool";
    const selectedProfileTool = deps.toolCatalog.get(deps.activeOperation().toolNumber);
    for (const id of ["toolShape", "toolProfileRadius", "toolWorkingLength"]) {
      deps.$(id).disabled = !!selectedProfileTool;
      if (selectedProfileTool) deps.$(id).value = c[id];
    }
    deps.$("toolProfileRadius").closest("label").hidden = c.toolShape !== "bull_mill";
    deps.$("g25ShiftLabel").textContent =
      "Смещение по " + deps.C.planeInfo(c.workPlane).axes[2] + ", мм";
    const repeatPasses = (Number(c.g25R) + 1) * (c.g25Reverse !== false ? 2 : 1);
    deps.$("g25Travel").textContent = Number.isFinite(repeatPasses * c.g25Shift)
      ? repeatPasses +
        " проходов, суммарный сдвиг " +
        deps.C.planeInfo(c.workPlane).axes[2] +
        " " +
        Number((repeatPasses * c.g25Shift).toFixed(3)) +
        " мм"
      : "Укажи смещение и количество повторов.";
    try {
      deps.$("toolProfileReadout").textContent =
        "Радиус контакта на конечной глубине «" +
        Math.abs(c.depth) +
        " мм» — " +
        deps.M.toolRadius(c, Math.abs(c.depth)).toFixed(3) +
        " мм. Расчёт выполняется для каждой глубины прохода.";
    } catch (error) {
      deps.$("toolProfileReadout").textContent = error.message;
    }
    deps.$("corrector").max = deps.machine === "fanuc3000c" ? 31 : 99;
    deps.$("corrector").min = deps.machine === "fanuc3000c" ? 0 : 1;
    deps.$("originFields").hidden = c.originPreset !== "custom";
    deps.$("originReadout").textContent =
      "Ноль в плане: X" + c.originX.toFixed(3) + " · Y" + c.originY.toFixed(3);
    deps.$("originSetupSummary").textContent =
      "X" + c.originX.toFixed(3) + " · Y" + c.originY.toFixed(3);
    if (deps.state.mode === "dxf") {
      deps.$("viewTitle").textContent = drilling
        ? "Сверление G" + deps.activeOperation().drill.cycle
        : marking
          ? "Разметка конусом"
          : "Фрезерование Ø" + c.diameter + " мм";
      deps.$("viewSubtitle").textContent =
        deps.C.planeInfo(c.workPlane || "xy").axes[2] +
        (c.topZ - c.depth).toFixed(3) +
        " мм · F" +
        c.feed +
        " мм/мин" +
        " · " +
        (c.originPreset === "center" ? "ноль в центре" : "свой ноль");
    }
    deps.$("fz").textContent =
      c.rpm > 0 && c.flutes > 0 ? (c.feed / c.rpm / c.flutes).toFixed(4) + " мм" : "—";
    deps.$("vc").textContent = ((Math.PI * c.diameter * c.rpm) / 1000).toFixed(1) + " м/мин";
    const forcedNetwork =
        !marking &&
        !drilling &&
        deps.state.contours.some(
          (contour) =>
            contour.enabled &&
            (contour.side === "network" ||
              (c.autoFit && contour.ambiguous && contour.side !== "on")),
        ),
      coupledOutside =
        !marking &&
        !drilling &&
        !forcedNetwork &&
        c.autoFit &&
        deps.WALL_NETWORK.outsideInteraction(deps.state.contours, c),
      network = forcedNetwork || coupledOutside;
    const openWall =
      !marking &&
      !drilling &&
      !network &&
      deps.state.contours.some((contour) => contour.enabled && deps.OPEN_WALL.isRequested(contour));
    deps.$("openWallHelp").hidden = !openWall && !network;
    deps.$("returnXY").checked = true;
    const outer =
        coupledOutside ||
        deps.state.contours.some(
          (contour) => contour.enabled && deps.M.normalizeSide(contour.side) === "outside",
        ),
      sideText = outer ? "снаружи" : "внутри";
    deps.$("openWallHelp").textContent = network
      ? "Обход " + sideText + " выбранных стенок. Недорез показан красным."
      : "Открытая стенка · " + sideText + ". Вход у открытого края.";
    if (openWall && !outer && c.autoFit)
      deps.$("openWallHelp").textContent += " Тесные углы остаются на доработку.";
    deps.$("slowFeedPercentField").hidden = marking || !c.slowArcs;
    try {
      const main = deps.C.feedFmt(c.feed, c),
        plunge = deps.C.feedFmt(c.plunge, c),
        slow = deps.C.feedFmt(deps.C.arcFeed(c), c);
      deps.$("feedCodeReadout").textContent = fixedFeed
        ? "Единая " + deps.A.headerFeedWord(c) + " для врезания и резания."
        : "В коде: основная F" + main + " · врезание F" + plunge + " (F20 = 2 мм/мин)";
      deps.$("feedSlowReadout").textContent = c.slowArcs
        ? "На дугах и углах пути центра — до F" + slow + "; на прямой возвращается F" + main + "."
        : "Замедление отключено. Используется основная подача.";
    } catch (error) {
      deps.$("feedCodeReadout").textContent = error.message;
      deps.$("feedSlowReadout").textContent = "Проверь подачу и процент замедления.";
    }
    deps.$("compModeHelp").textContent = marking
      ? "Конус идёт по линии с G40."
      : c.g12Cycle || c.cutSide === "g12"
        ? "G12/G13: радиус отверстия задаёт I, радиус корректора задаёт D/H. Значение таблицы: 8000 = 8 мм."
        : c.compMode === "tool"
          ? "G40 — смещение центра по форме фрезы и глубине контакта. Припуск равен нулю."
          : c.compMode === "center"
            ? "G40 — центр рассчитан по физическому диаметру."
            : c.compMode === "wear"
              ? "Координаты центра рассчитаны. В таблице стойки D = 0."
              : "Значение D задаётся в отсчётах 0,001 мм. 4000 = 4,000 мм. Ø фрезы задаётся отдельно. Припуск задаётся значением D.";
    deps.$("correctionValue").disabled =
      marking || drilling || (!(c.g12Cycle || c.cutSide === "g12") && c.compMode !== "control");
    deps.$("corrector").readOnly = false;
    deps.$("allowance").disabled = ["control", "tool"].includes(c.compMode);
    deps.$("stockAllowance").disabled = c.compMode === "tool";
    deps.$("stockCircle").hidden = c.stockShape !== "circle";
    deps.$("scales").hidden = c.decimal;
    deps.$("coordScale").readOnly = c.dialect === "legacy";
    deps.$("feedScale").readOnly = c.dialect === "legacy";
    try {
      deps.$("formatExample").textContent =
        "30 мм → Z" +
        deps.C.fmt(30, c.coordScale, c.decimal) +
        "\n4 мм/мин → F" +
        deps.C.feedFmt(4, c) +
        "  ·  30 мм/мин → F" +
        deps.C.feedFmt(30, c);
    } catch (e) {
      deps.$("formatExample").textContent = e.message;
    }
    deps.$("zPreview").textContent =
      "Верх " +
      deps.C.planeInfo(c.workPlane || "xy").axes[2] +
      c.topZ +
      " → низ " +
      deps.C.planeInfo(c.workPlane || "xy").axes[2] +
      (c.topZ - c.depth) +
      " мм\nНачало " +
      (reference ? reference.command : "— проверьте привязку Z");
    deps.$("codeCaption").textContent =
      deps.M.profiles[deps.machine].name +
      " · " +
      (c.decimal ? "Десятичные мм" : "X/Y/Z ×" + c.coordScale + " · F ×" + c.feedScale) +
      " · CRLF · ASCII";
    deps.renderMachine();
    deps.updateEntryReadout();
    if (deps.editor.isOpen) {
      deps.$("viewTitle").textContent = "Чертёж детали";
      deps.$("viewSubtitle").textContent = "";
    }
    deps.syncWorkspace();
    deps.editor.refreshToolDimensions();
  }
  return { saveToolProfile, applyToolProfile, updateParams };
}
