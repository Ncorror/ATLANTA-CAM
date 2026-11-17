/**
 * operations-controller controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.A
 * @param {*} deps.activeOperationId (read/write)
 * @param {*} deps.boolIds
 * @param {*} deps.C
 * @param {*} deps.calculation
 * @param {*} deps.contourSignature
 * @param {*} deps.cutSketchSignature (read/write)
 * @param {*} deps.defaultDrill
 * @param {*} deps.diagnosticIssues (read/write)
 * @param {*} deps.diagnosticMaterial (read/write)
 * @param {*} deps.drillKeys
 * @param {*} deps.editor
 * @param {*} deps.failedDiagnostic
 * @param {*} deps.initialToolProfiles
 * @param {*} deps.invalidate
 * @param {*} deps.M
 * @param {*} deps.machine
 * @param {*} deps.machineDefaults
 * @param {*} deps.machineSelected
 * @param {*} deps.nextOperation (read/write)
 * @param {*} deps.operationKeys
 * @param {*} deps.operations
 * @param {*} deps.ORIGIN
 * @param {*} deps.originSetup
 * @param {*} deps.renderContours
 * @param {*} deps.requestDraw
 * @param {*} deps.restoreOperationOrigin
 * @param {*} deps.scheduleAutosave
 * @param {*} deps.setMachiningScene
 * @param {*} deps.sharedOriginSetup (read/write)
 * @param {*} deps.showMachine
 * @param {*} deps.showResult
 * @param {*} deps.showWorkPane
 * @param {*} deps.SKETCH
 * @param {*} deps.state
 * @param {*} deps.toolCatalog
 * @param {*} deps.UI_RENDER
 * @param {*} deps.updateParams
 * @param {*} deps.updatePick
 */
export function createOperationsController(deps) {
  function primaryOperation() {
    return {
      id: "primary",
      kind: "profile",
      color: deps.A.colors.profile,
      toolNumber: null,
      params: null,
      sides: [],
      entry: null,
      entryStart: null,
      exitPoint: null,
    };
  }

  function activeOperation() {
    return deps.operations.find((op) => op.id === deps.activeOperationId);
  }

  function activeResult() {
    var _state$result;
    return (_state$result = deps.state.result) === null ||
      _state$result === void 0 ||
      (_state$result = _state$result.parts.find((part) => part.id === deps.activeOperationId)) ===
        null ||
      _state$result === void 0
      ? void 0
      : _state$result.result;
  }

  function markColor(item, op, removing = false) {
    var _item$millOps, _item$drillOps, _operations$find;
    if (removing) {
      const other = deps.operations.find(
        (candidate) => candidate.id !== op.id && deps.A.isMark(item, candidate),
      );
      return other ? other.color : null;
    }
    if (
      !item.machining &&
      !(
        (_item$millOps = item.millOps) !== null &&
        _item$millOps !== void 0 &&
        _item$millOps.length
      ) &&
      !(
        (_item$drillOps = item.drillOps) !== null &&
        _item$drillOps !== void 0 &&
        _item$drillOps.length
      )
    )
      return;
    return deps.A.isMark(item, op)
      ? op.color
      : (_operations$find = deps.operations.find((candidate) => deps.A.isMark(item, candidate))) ===
            null || _operations$find === void 0
        ? void 0
        : _operations$find.color;
  }

  function drillColors(item, op, removing = false) {
    const marked = deps.operations.filter(
      (candidate) =>
        candidate.kind === "drill" &&
        (!removing || candidate.id !== op.id) &&
        deps.A.isMark(item, candidate),
    );
    return [
      ...new Set([
        ...(!removing && op.kind === "drill" && deps.A.isMark(item, op) ? [op.color] : []),
        ...marked.map((candidate) => candidate.color),
      ]),
    ];
  }

  function hasMarks() {
    return deps.editor.items.some((item) => deps.operations.some((op) => deps.A.isMark(item, op)));
  }

  function operationKind(op) {
    var _op$params;
    return op.kind === "drill"
      ? "drill"
      : op.id === deps.activeOperationId
        ? deps.$("toolKind").value
        : ((_op$params = op.params) === null || _op$params === void 0
            ? void 0
            : _op$params.toolKind) || "mill";
  }

  function operationLabel(op) {
    const kind = operationKind(op),
      tool = deps.toolCatalog.get(op.toolNumber),
      label =
        kind === "drill" ? "G" + op.drill.cycle : kind === "scribe" ? "Разметка" : "Фрезерование";
    return label + (tool ? " · " + deps.A.name(tool) : "");
  }

  function captureOperation() {
    const op = activeOperation();
    if (deps.$("localOrigin").checked) op.originSetup = deps.originSetup();
    else {
      delete op.originSetup;
      deps.sharedOriginSetup = deps.originSetup();
    }
    op.params = Object.fromEntries(
      deps.operationKeys.map((id) => [
        id,
        deps.boolIds.includes(id) ? deps.$(id).checked : deps.$(id).value,
      ]),
    );
    if (op.kind === "drill")
      for (const [key, id] of Object.entries(deps.drillKeys)) op.drill[key] = deps.$(id).value;
    else {
      op.sides = deps.state.contours.map((contour) => [
        deps.contourSignature(contour),
        contour.side,
      ]);
      op.entry = saveEntryPoint(deps.state.startPoint);
      op.entryStart = saveEntryPoint(deps.state.entryStart);
      op.exitPoint = saveEntryPoint(deps.state.exitPoint);
    }
  }

  function normalizeDirection(dir, side) {
    if (dir === "climb" || dir === "conventional") return dir;
    if (side === "inside") {
      return dir === "cw" ? "climb" : "conventional";
    } else {
      return dir === "cw" ? "conventional" : "climb";
    }
  }

  function applyOperationValues(op) {
    deps.$("zReferenceEnabled").checked = op.params ? op.params.zReferenceEnabled === true : true;
    deps.$("zReferencePlate").value = String(op.params?.zReferencePlate ?? 30);
    deps.$("zReferenceSurfaceMode").value = op.params?.zReferenceSurfaceMode || "top";
    deps.$("zReferenceSurfaceZ").value = String(op.params?.zReferenceSurfaceZ ?? 0);
    var _op$params$cornerRadi,
      _op$params2,
      _op$params$workPlane,
      _op$params3,
      _op$params4,
      _op$params$openOffset,
      _op$params5,
      _op$params$entryRun,
      _op$params6,
      _op$params7,
      _op$params$entryAngle,
      _op$params8,
      _op$params9,
      _op$params0,
      _op$params$headerFeed,
      _op$params1,
      _op$params$entryMode,
      _op$params10,
      _op$params11;
    deps.$("cornerRadius").value =
      (_op$params$cornerRadi =
        (_op$params2 = op.params) === null || _op$params2 === void 0
          ? void 0
          : _op$params2.cornerRadius) !== null && _op$params$cornerRadi !== void 0
        ? _op$params$cornerRadi
        : "0";
    deps.$("workPlane").value = deps.C.planeInfo(
      (_op$params$workPlane =
        (_op$params3 = op.params) === null || _op$params3 === void 0
          ? void 0
          : _op$params3.workPlane) !== null && _op$params$workPlane !== void 0
        ? _op$params$workPlane
        : "xy",
    ).id;
    deps.$("workPlaneExplicit").checked =
      ((_op$params4 = op.params) === null || _op$params4 === void 0
        ? void 0
        : _op$params4.workPlaneExplicit) === true;
    deps.$("openOffsetSide").value =
      (_op$params$openOffset =
        (_op$params5 = op.params) === null || _op$params5 === void 0
          ? void 0
          : _op$params5.openOffsetSide) !== null && _op$params$openOffset !== void 0
        ? _op$params$openOffset
        : "auto";
    deps.$("entryRun").value =
      (_op$params$entryRun =
        (_op$params6 = op.params) === null || _op$params6 === void 0
          ? void 0
          : _op$params6.entryRun) !== null && _op$params$entryRun !== void 0
        ? _op$params$entryRun
        : "";
    deps.$("directedEntry").checked =
      ((_op$params7 = op.params) === null || _op$params7 === void 0
        ? void 0
        : _op$params7.directedEntry) === true;
    deps.$("entryAngle").value =
      (_op$params$entryAngle =
        (_op$params8 = op.params) === null || _op$params8 === void 0
          ? void 0
          : _op$params8.entryAngle) !== null && _op$params$entryAngle !== void 0
        ? _op$params$entryAngle
        : "90";
    if (op.params)
      for (const id of deps.operationKeys) {
        const value = op.params[id];
        if (value == null) continue;
        if (deps.boolIds.includes(id)) deps.$(id).checked = value === true;
        else
          deps.$(id).value =
            id === "cutSide"
              ? deps.M.normalizeSide(String(value))
              : id === "direction"
                ? normalizeDirection(String(value), op.params.cutSide)
                : String(value);
      }
    deps.$("coordinateMode").value =
      op.kind === "profile" &&
      ((_op$params9 = op.params) === null || _op$params9 === void 0
        ? void 0
        : _op$params9.coordinateMode) === "g91"
        ? "g91"
        : "g90";
    deps.$("feedInHeader").checked =
      ((_op$params0 = op.params) === null || _op$params0 === void 0
        ? void 0
        : _op$params0.feedInHeader) !== false;
    deps.$("headerFeed").value =
      (_op$params$headerFeed =
        (_op$params1 = op.params) === null || _op$params1 === void 0
          ? void 0
          : _op$params1.headerFeed) !== null && _op$params$headerFeed !== void 0
        ? _op$params$headerFeed
        : deps.A.DEFAULT_HEADER_FEED;
    deps.$("entryMode").value =
      (_op$params$entryMode =
        (_op$params10 = op.params) === null || _op$params10 === void 0
          ? void 0
          : _op$params10.entryMode) !== null && _op$params$entryMode !== void 0
        ? _op$params$entryMode
        : op.entry || op.entryStart
          ? "manual"
          : "auto";
    if (deps.$("entryMode").value === "auto") deps.$("autoLead").checked = true;
    if (
      ((_op$params11 = op.params) === null || _op$params11 === void 0
        ? void 0
        : _op$params11.correctionValue) == null
    ) {
      var _tool$correctionRadiu, _tool$diameter;
      const tool = deps.toolCatalog.get(op.toolNumber);
      deps.$("correctionValue").value = String(
        Math.round(
          ((_tool$correctionRadiu =
            tool === null || tool === void 0 ? void 0 : tool.correctionRadius) !== null &&
          _tool$correctionRadiu !== void 0
            ? _tool$correctionRadiu
            : ((_tool$diameter = tool === null || tool === void 0 ? void 0 : tool.diameter) !==
                null && _tool$diameter !== void 0
                ? _tool$diameter
                : Number(deps.$("diameter").value)) /
                2 +
              Number(deps.$("allowance").value)) * 1000,
        ),
      );
    }
    if (!["mill", "scribe", "g25"].includes(deps.$("toolKind").value))
      deps.$("toolKind").value = "mill";
    if (deps.$("toolKind").value === "g25" && deps.$("repeatMode"))
      deps.$("repeatMode").value = "g25";
    deps.state.activeTool = deps.$("toolKind").value;
    if (op.kind === "drill")
      for (const [key, id] of Object.entries(deps.drillKeys)) deps.$(id).value = op.drill[key];
  }

  function saveEntryPoint(point) {
    if (!point) return null;
    const contour = deps.state.contours.find((item) => item.id === point.contourId);
    const signature = point.signature || (contour ? deps.contourSignature(contour) : null);
    return signature
      ? {
          x: point.x,
          y: point.y,
          signature,
          space: point.space === "program" ? "program" : "tool",
        }
      : null;
  }

  function restorePoint(point, contours) {
    if (!point) return null;
    const match = contours.find((contour) => deps.contourSignature(contour) === point.signature);
    return match
      ? {
          x: point.x,
          y: point.y,
          signature: point.signature,
          space: point.space === "program" ? "program" : "tool",
          contourId: match.id,
        }
      : null;
  }

  function restoreEntry(op, contours) {
    return restorePoint(op.entry, contours);
  }

  function restoreEntryStart(op, contours) {
    return restorePoint(op.entryStart, contours);
  }

  function restoreExit(op, contours) {
    return restorePoint(op.exitPoint, contours);
  }

  function applyCatalogueTool() {
    const op = activeOperation(),
      kind = operationKind(op),
      tool = deps.toolCatalog.get(op.toolNumber),
      useTool = tool && deps.A.allowed(tool, kind) && kind !== "drill";
    for (const id of ["diameter", "flutes"]) deps.$(id).readOnly = !!useTool;
    if (useTool) {
      deps.$("diameter").value = String(deps.A.effectiveDiameter(tool));
      deps.$("flutes").value = String(tool.flutes);
    }
  }

  function addToolOptions(select, predicate) {
    for (const [type, label] of Object.entries(deps.A.toolTypes)) {
      const group = document.createElement("optgroup");
      group.label = label;
      for (const tool of deps.toolCatalog.values())
        if (tool.type === type && predicate(tool)) {
          const option = new Option(
            "№" +
              tool.number +
              " · " +
              deps.A.name(tool) +
              (type === "drill" || type === "end_mill" || type === "ball_mill"
                ? ""
                : " · Ø" + tool.diameter),
            String(tool.number),
          );
          group.appendChild(option);
        }
      if (group.children.length) select.appendChild(group);
    }
  }

  function updateDrillFields() {
    deps.$("drillPeckField").hidden = !["73", "83"].includes(deps.$("drillCycle").value);
    deps.$("drillDwellField").hidden = deps.$("drillCycle").value !== "82";
    for (const id of Object.values(deps.drillKeys))
      deps.$(id).disabled = id === "drillFeed" && deps.$("feedInHeader").checked;
    if (deps.$("drillHint")) deps.$("drillHint").hidden = true;
  }

  function renderOperationPanel() {
    const op = activeOperation();
    deps.UI_RENDER.renderOperationPanel({
      op,
      kind: operationKind(op),
      operations: deps.operations,
      editor: deps.editor,
      operationLabel,
      addToolOptions,
      updateDrillFields,
      applyCatalogueTool,
      machine: deps.machine,
    });
  }

  function refreshActiveGeometry() {
    var _state$contours$;
    const op = activeOperation(),
      scene = deps.SKETCH.toScene(deps.editor.items, op.id);
    deps.state.contours = [];
    deps.cutSketchSignature = "";
    deps.setMachiningScene(scene, op.sides);
    deps.state.startPoint = restoreEntry(op, deps.state.contours) || (op.entry && { ...op.entry });
    deps.state.entryStart =
      restoreEntryStart(op, deps.state.contours) || (op.entryStart && { ...op.entryStart });
    deps.state.exitPoint =
      restoreExit(op, deps.state.contours) || (op.exitPoint && { ...op.exitPoint });
    deps.state.active =
      (_state$contours$ = deps.state.contours[0]) === null || _state$contours$ === void 0
        ? void 0
        : _state$contours$.id;
    deps.renderContours();
    deps.editor.refreshOperation();
  }

  function selectOperation(id, { save = true } = {}) {
    if (!deps.operations.some((op) => op.id === id)) return;
    if (save) captureOperation();
    if (deps.calculation || deps.failedDiagnostic || deps.$("activeOperationOnly").checked)
      deps.invalidate("Выбрана другая операция · пересчитай траекторию");
    deps.diagnosticMaterial = null;
    deps.diagnosticIssues = null;
    deps.activeOperationId = id;
    applyOperationValues(activeOperation());
    deps.restoreOperationOrigin(activeOperation());
    refreshActiveGeometry();
    renderOperationPanel();
    deps.updateParams();
    if (deps.state.mode === "dxf" && deps.state.result) deps.showResult();
    deps.scheduleAutosave();
    deps.requestDraw();
  }

  function startMarking() {
    if (!deps.machineSelected) {
      deps.showMachine();
      return;
    }
    deps.state.pick = null;
    deps.updatePick();
    deps.editor.begin();
    deps.editor.marking();
    deps.showWorkPane("operations", true);
  }

  function addOperation(kind) {
    if (deps.operations.length >= deps.A.MAX_OPERATIONS) return;
    captureOperation();
    const params = {
      ...activeOperation().params,
      cornerRadius: "0",
      coordinateMode: "g90",
      feedInHeader: true,
      headerFeed: String(deps.A.DEFAULT_HEADER_FEED),
    };
    const op = {
      id: "o" + deps.nextOperation++,
      kind,
      color: deps.A.colors[kind],
      toolNumber: null,
      params,
      sides: [],
      entry: null,
      entryStart: null,
      exitPoint: null,
    };
    if (kind === "drill") op.drill = { ...deps.defaultDrill };
    else {
      Object.assign(params, deps.initialToolProfiles.mill, {
        toolKind: "mill",
        cutSide: "auto",
        compMode: deps.machineDefaults[deps.machine].compMode,
        corrector: "1",
      });
      if (deps.toolCatalog.has(119) && deps.A.allowed(deps.toolCatalog.get(119), "mill"))
        op.toolNumber = 119;
    }
    deps.operations.push(op);
    deps.invalidate();
    selectOperation(op.id, { save: false });
    startMarking();
  }

  function moveOperation(delta) {
    const op = activeOperation(),
      position = deps.operations.indexOf(op),
      next = position + delta;
    if (next < 0 || next >= deps.operations.length) return;
    [deps.operations[position], deps.operations[next]] = [
      deps.operations[next],
      deps.operations[position],
    ];
    deps.invalidate();
    renderOperationPanel();
    deps.scheduleAutosave();
  }

  function removeOperation() {
    const op = activeOperation();
    const position = deps.operations.indexOf(op);
    deps.editor.clearOperation(op);
    deps.operations.splice(position, 1);
    if (!deps.operations.length)
      deps.operations.push({ ...primaryOperation(), id: "o" + deps.nextOperation++ });
    deps.invalidate();
    selectOperation(deps.operations[Math.min(position, deps.operations.length - 1)].id, {
      save: false,
    });
  }

  function restoreOperations(p) {
    return deps.A.restoreOperations(
      p,
      deps.operationKeys,
      deps.drillKeys,
      deps.defaultDrill,
      deps.ORIGIN,
    );
  }
  return {
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
  };
}
