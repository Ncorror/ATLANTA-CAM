import { referenceSurfaceZ, zReference } from "../nc/z-reference.js";
/**
 * configuration-controller controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.A
 * @param {*} deps.activeOperation
 * @param {*} deps.activeOperationId
 * @param {*} deps.boolIds
 * @param {*} deps.C
 * @param {*} deps.calculate
 * @param {*} deps.captureOperation
 * @param {*} deps.editor
 * @param {*} deps.hasMarks
 * @param {*} deps.invalidate
 * @param {*} deps.M
 * @param {*} deps.machine (read/write)
 * @param {*} deps.machineDefaults
 * @param {*} deps.machineKeys
 * @param {*} deps.machineSelected (read/write)
 * @param {*} deps.machineSettings
 * @param {*} deps.message
 * @param {*} deps.numberIds
 * @param {*} deps.operationKeys
 * @param {*} deps.ORIGIN
 * @param {*} deps.originEffective
 * @param {*} deps.originSetup
 * @param {*} deps.renderOperationPanel
 * @param {*} deps.scheduleAutosave
 * @param {*} deps.selectIds
 * @param {*} deps.sharedOriginSetup
 * @param {*} deps.state
 * @param {*} deps.toast
 * @param {*} deps.toolCatalog
 * @param {*} deps.UI_RENDER
 * @param {*} deps.updateParams
 */
export function createConfigurationController(deps) {
  function config(op = deps.activeOperation()) {
    var _op$params$correction, _op$params18, _op$params$entryRun2, _op$params19, _op$params20;
    const c = {};
    for (const id of deps.numberIds) c[id] = Number(deps.$(id).value);
    for (const id of deps.boolIds) c[id] = deps.$(id).checked;
    for (const id of deps.selectIds) c[id] = deps.$(id).value;
    if (op.id !== deps.activeOperationId && op.params)
      for (const id of deps.operationKeys) {
        if (op.params[id] == null) continue;
        c[id] = deps.numberIds.includes(id)
          ? Number(op.params[id])
          : deps.boolIds.includes(id)
            ? op.params[id] === true
            : String(op.params[id]);
      }
    if (op.id !== deps.activeOperationId) {
      c.zReferenceEnabled = op.params?.zReferenceEnabled === true;
      c.zReferencePlate = Number(op.params?.zReferencePlate ?? 30);
      c.zReferenceSurfaceMode = op.params?.zReferenceSurfaceMode || "top";
      c.zReferenceSurfaceZ = Number(op.params?.zReferenceSurfaceZ ?? 0);
    }
    if (op.id !== deps.activeOperationId) {
      var _op$params$cornerRadi2,
        _op$params12,
        _op$params$workPlane2,
        _op$params13,
        _op$params14,
        _op$params15,
        _op$params16,
        _op$params$headerFeed2,
        _op$params17;
      c.cornerRadius = Number(
        (_op$params$cornerRadi2 =
          (_op$params12 = op.params) === null || _op$params12 === void 0
            ? void 0
            : _op$params12.cornerRadius) !== null && _op$params$cornerRadi2 !== void 0
          ? _op$params$cornerRadi2
          : 0,
      );
      c.workPlane =
        (_op$params$workPlane2 =
          (_op$params13 = op.params) === null || _op$params13 === void 0
            ? void 0
            : _op$params13.workPlane) !== null && _op$params$workPlane2 !== void 0
          ? _op$params$workPlane2
          : "xy";
      c.workPlaneExplicit =
        ((_op$params14 = op.params) === null || _op$params14 === void 0
          ? void 0
          : _op$params14.workPlaneExplicit) === true;
      c.coordinateMode =
        (_op$params15 = op.params) === null || _op$params15 === void 0
          ? void 0
          : _op$params15.coordinateMode;
      c.feedInHeader =
        ((_op$params16 = op.params) === null || _op$params16 === void 0
          ? void 0
          : _op$params16.feedInHeader) !== false;
      c.headerFeed = Number(
        (_op$params$headerFeed2 =
          (_op$params17 = op.params) === null || _op$params17 === void 0
            ? void 0
            : _op$params17.headerFeed) !== null && _op$params$headerFeed2 !== void 0
          ? _op$params$headerFeed2
          : deps.A.DEFAULT_HEADER_FEED,
      );
    }
    if (
      String(
        op.id === deps.activeOperationId
          ? deps.$("correctionValue").value
          : (_op$params$correction =
                (_op$params18 = op.params) === null || _op$params18 === void 0
                  ? void 0
                  : _op$params18.correctionValue) !== null && _op$params$correction !== void 0
            ? _op$params$correction
            : deps.$("correctionValue").value,
      ).trim() === ""
    )
      c.correctionValue = NaN;
    if (
      String(
        op.id === deps.activeOperationId
          ? deps.$("entryRun").value
          : (_op$params$entryRun2 =
                (_op$params19 = op.params) === null || _op$params19 === void 0
                  ? void 0
                  : _op$params19.entryRun) !== null && _op$params$entryRun2 !== void 0
            ? _op$params$entryRun2
            : "",
      ).trim() === ""
    )
      c.entryRun = undefined;
    c.openOffsetSide =
      (op.id === deps.activeOperationId
        ? deps.$("openOffsetSide").value
        : (_op$params20 = op.params) === null || _op$params20 === void 0
          ? void 0
          : _op$params20.openOffsetSide) || "auto";
    c.coordinateMode = op.kind === "profile" && c.coordinateMode === "g91" ? "g91" : "g90";
    if (deps.machine === "fanuc3000c") {
      c.useG92 = true;
      c.toolNameSpaces = deps.$("toolNameSpaces").valueAsNumber;
    }
    if (deps.machine === "fanuc3000c" && c.toolKind === "mill" && c.compMode === "control")
      c.allowance = 0;
    c.depth = Math.abs(c.depth);
    const setup = op.originSetup || deps.sharedOriginSetup || deps.originSetup();
    const zero =
      op.id === deps.activeOperationId
        ? deps.originEffective
        : deps.ORIGIN.resolve(
            deps.C.bounds(deps.state.planContours),
            setup.preset,
            setup.shift.x,
            setup.shift.y,
            setup.customBase,
          );
    c.originX = zero.x;
    c.originY = zero.y;
    c.originIsLocal = !!op.originSetup;
    Object.assign(c, deps.M.profile(deps.machine), {
      dialect: "legacy",
      initialX: 0,
      initialY: 0,
      initialZ: deps.A.PARK_Z,
      endZ: deps.A.PARK_Z,
      returnXY: true,
      startPoint: op.id === deps.activeOperationId ? deps.state.startPoint : null,
      entryStart: op.id === deps.activeOperationId ? deps.state.entryStart : null,
      exitPoint: op.id === deps.activeOperationId ? deps.state.exitPoint : null,
    });
    if (c.entryMode === "auto") {
      c.autoLead = true;
      c.directedEntry = false;
      c.entryRun = Number(c.entryRun !== undefined && c.entryRun !== "" ? c.entryRun : 0.1);
      c.entryAngle = Number(c.entryAngle !== undefined && c.entryAngle !== "" ? c.entryAngle : 0);
      c.exitOffset = Number(c.exitOffset !== undefined && c.exitOffset !== "" ? c.exitOffset : 0.1);
      c.safetyGap = Number(c.safetyGap !== undefined && c.safetyGap !== "" ? c.safetyGap : 0.1);
      c.startPoint = null;
      c.entryStart = null;
      c.exitPoint = null;
      c.lead = Number(c.lead !== undefined && c.lead !== "" && c.lead !== "0" ? c.lead : 0.1);
    } else if (Number.isFinite(c.manualLead) && c.manualLead >= 0) {
      c.lead = c.manualLead;
    }
    if (c.toolKind === "g25") {
      c.repeatMode = "g25";
      c.toolKind = "mill";
    }
    if (op.kind === "drill") {
      c.toolKind = "drill";
      c.depth = Number(op.drill.depth);
      c.feed = Number(op.drill.feed);
      c.stockShape = "none";
    }
    if (deps.machine === "fanuc3000c" && c.feedInHeader) {
      c.feed = c.plunge = c.headerFeed / c.feedScale;
      c.slowArcs = false;
    }
    const tool = deps.toolCatalog.get(op.toolNumber);
    if (tool && deps.A.allowed(tool, c.toolKind)) {
      c.diameter = c.toolKind === "drill" ? tool.diameter : deps.A.effectiveDiameter(tool);
      c.flutes = tool.flutes;
      c.toolShape = tool.type;
      c.toolProfileRadius = Number(tool.profileRadius) || 0;
      c.toolWorkingLength = tool.workingLength;
    }
    c.zReferenceEnabled = c.zReferenceEnabled && c.toolKind === "mill";
    if (c.zReferenceEnabled) {
      c.zReferenceSurfaceZ = referenceSurfaceZ(
        c,
        deps.C.bounds(deps.state.planContours),
        deps.state.planContours.length > 0,
      );
      // Physical touch-off is separate from the planner's local clearance/start height.
      try {
        c.initialZ = c.endZ = zReference(c).z;
      } catch {
        c.initialZ = c.endZ = NaN;
      }
    }
    return c;
  }

  function profile() {
    return deps.M.profile(deps.machine);
  }

  function captureMachine() {
    const values = {};
    for (const id of deps.machineKeys)
      values[id] = deps.boolIds.includes(id) ? deps.$(id).checked : deps.$(id).value;
    deps.machineSettings[deps.machine] = values;
  }

  function fixParkFields() {
    deps.$("initialX").value = deps.$("initialY").value = "0";
    deps.$("initialZ").value = deps.$("endZ").value = String(deps.A.PARK_Z);
    deps.$("returnXY").checked = true;
    if (Number(deps.$("safeZ").value) < deps.A.PARK_Z)
      deps.$("safeZ").value = String(deps.A.PARK_Z);
  }

  function applyMachine() {
    const values = deps.machineSettings[deps.machine] || deps.machineDefaults[deps.machine];
    for (const id of deps.machineKeys) {
      var _values$id;
      const v =
        (_values$id = values[id]) !== null && _values$id !== void 0
          ? _values$id
          : deps.machineDefaults[deps.machine][id];
      if (deps.boolIds.includes(id)) deps.$(id).checked = v === true;
      else deps.$(id).value = String(v);
    }
    fixParkFields();
  }

  function persistMachine() {
    if (!deps.machineSelected) return false;
    captureMachine();
    try {
      localStorage.setItem(
        "atlanta-machine-v1",
        JSON.stringify({ version: 1, machine: deps.machine, settings: deps.machineSettings }),
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  function renderMachine() {
    deps.UI_RENDER.renderMachine({
      machine: deps.machine,
      machineSelected: deps.machineSelected,
      activeKind: deps.activeOperation().kind,
      hasStartPoint: !!deps.state.startPoint,
    });
  }

  function showMachine() {
    renderMachine();
    deps.UI_RENDER.openDialog("machineDialog");
  }

  function chooseMachine(next) {
    if (!deps.M.profiles[next]) return;
    if (deps.machineSelected) {
      captureMachine();
      deps.captureOperation();
    }
    const changed = !deps.machineSelected || deps.machine !== next;
    deps.machine = next;
    deps.machineSelected = true;
    applyMachine();
    deps.renderOperationPanel();
    renderMachine();
    const remembered = persistMachine();
    deps.UI_RENDER.closeDialog("machineDialog");
    deps.updateParams();
    if (changed) {
      deps.invalidate("Выбран " + deps.M.profiles[deps.machine].name + " · требуется новый расчёт");
      if (deps.state.mode === "dxf") {
        deps.$("code").value = "";
        if (deps.hasMarks() && !deps.editor.isOpen) deps.calculate();
      } else {
        deps.message([
          {
            type: "warn",
            text:
              "Выбран " +
              deps.M.profiles[deps.machine].name +
              ". Исходный текст не преобразован. Проверь программу в выбранном профиле перед экспортом.",
          },
        ]);
      }
    }
    deps.scheduleAutosave();
    if (!remembered)
      deps.toast(
        "Браузер не сохраняет настройки. Сохрани проект JSON: он запомнит выбранный станок.",
      );
    else deps.toast("Выбран " + deps.M.profiles[deps.machine].name + " · выбор сохранён");
  }
  return {
    config,
    profile,
    captureMachine,
    fixParkFields,
    applyMachine,
    persistMachine,
    renderMachine,
    showMachine,
    chooseMachine,
  };
}
