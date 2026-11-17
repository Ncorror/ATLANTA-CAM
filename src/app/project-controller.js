/**
 * project-controller controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.A
 * @param {*} deps.activeOperation
 * @param {*} deps.activeOperationId (read/write)
 * @param {*} deps.applyMachine
 * @param {*} deps.applyOperationValues
 * @param {*} deps.applyOrigin
 * @param {*} deps.applyToolProfile
 * @param {*} deps.boolIds
 * @param {*} deps.C
 * @param {*} deps.calculation
 * @param {*} deps.captureOperation
 * @param {*} deps.contourSignature
 * @param {*} deps.cutSketchSignature (read/write)
 * @param {*} deps.diagnosticIssues (read/write)
 * @param {*} deps.diagnosticMaterial (read/write)
 * @param {*} deps.dirtyDxf
 * @param {*} deps.dxfSettings
 * @param {*} deps.editor
 * @param {*} deps.fixParkFields
 * @param {*} deps.importCatalogue
 * @param {*} deps.initialToolProfiles
 * @param {*} deps.invalidate
 * @param {*} deps.M
 * @param {*} deps.machine (read/write)
 * @param {*} deps.machineDefaults
 * @param {*} deps.machineKeys
 * @param {*} deps.machineSelected (read/write)
 * @param {*} deps.machineSettings
 * @param {*} deps.marksSignature (read/write)
 * @param {*} deps.message
 * @param {*} deps.nextOperation (read/write)
 * @param {*} deps.numberIds
 * @param {*} deps.operations (read/write)
 * @param {*} deps.ORIGIN
 * @param {*} deps.originBasePoint (read/write)
 * @param {*} deps.originSetup
 * @param {*} deps.originShift (read/write)
 * @param {*} deps.parsedSettings (read/write)
 * @param {*} deps.parseDxf
 * @param {*} deps.persistMachine
 * @param {*} deps.persistTools
 * @param {*} deps.planSignature
 * @param {*} deps.planSketchDxf (read/write)
 * @param {*} deps.primaryOperation
 * @param {*} deps.renderContours
 * @param {*} deps.renderOperationLabels
 * @param {*} deps.renderOperationPanel
 * @param {*} deps.requestDraw
 * @param {*} deps.restoreDone
 * @param {*} deps.restoreEntry
 * @param {*} deps.restoreEntryStart
 * @param {*} deps.restoreExit
 * @param {*} deps.restoreOperationOrigin
 * @param {*} deps.restoreOperations
 * @param {*} deps.saveToolProfile
 * @param {*} deps.selectIds
 * @param {*} deps.setMachiningScene
 * @param {*} deps.setMode
 * @param {*} deps.sharedOriginSetup (read/write)
 * @param {*} deps.showWorkPane
 * @param {*} deps.SKETCH
 * @param {*} deps.state
 * @param {*} deps.syncWorkspace
 * @param {*} deps.timer (read/write)
 * @param {*} deps.toast
 * @param {*} deps.toolCatalog (read/write)
 * @param {*} deps.toolKeys
 * @param {*} deps.updateParams
 */
export function createProjectController(deps) {
  function projectObject() {
    deps.captureOperation();
    const values = {};
    for (const id of [...deps.numberIds, ...deps.selectIds]) values[id] = deps.$(id).value;
    for (const id of deps.boolIds) values[id] = deps.$(id).checked;
    return {
      app: "ATLANTA_CAM_OFFLINE",
      version: 5,
      operations: deps.operations,
      activeOperationId: deps.activeOperationId,
      nextOperation: deps.nextOperation,
      tools: [...deps.toolCatalog.values()],
      originSetup: deps.sharedOriginSetup || deps.originSetup(),
      target: {
        os: "Windows 7 SP1",
        arch: "x86",
        browser: "Firefox 115 ESR",
        offline: true,
      },
      machine: deps.machine,
      machineSettings: deps.machineSettings,
      sketch: deps.editor.serialize(),
      mode: deps.state.mode,
      values,
      toolProfiles: deps.state.toolProfiles,
      rawDxf: deps.state.rawDxf,
      dxfName: deps.state.dxfName,
      ncText: deps.state.mode === "nc" ? deps.$("code").value : deps.state.ncText,
      ncName: deps.state.ncName,
    };
  }

  function autosaveStatus(message, error = false) {
    const status = deps.$("autosaveStatus");
    if (!status) return;
    status.textContent = message;
    status.style.color = error ? "#ffb5a8" : "#bdd7e6";
    status.title = error ? "Сохрани проект в JSON кнопкой «Сохранить проект»." : message;
  }

  function scheduleAutosave() {
    if (!deps.restoreDone) return;
    deps.persistMachine();
    clearTimeout(deps.timer);
    deps.timer = setTimeout(() => {
      try {
        const serialized = JSON.stringify(projectObject());
        if (serialized.length > 2500000) throw Error("Проект слишком большой для автосохранения");
        localStorage.setItem("atlanta-cam-v5", serialized);
        autosaveStatus("Автосохранено в браузере");
      } catch (e) {
        autosaveStatus("Автосохранение недоступно · сохрани JSON", true);
      }
    }, 650);
  }

  function restoreProject(p, silent = false) {
    var _savedOrigin$customBa,
      _savedOrigin$customBa2,
      _savedOrigin$customBa3,
      _savedOrigin$customBa4,
      _p$startPoint,
      _savedOrigin$shift$x,
      _savedOrigin$shift,
      _savedOrigin$shift$y,
      _savedOrigin$shift2;
    if (
      !p ||
      typeof p !== "object" ||
      p.app !== "ATLANTA_CAM_OFFLINE" ||
      ![1, 2, 3, 4, 5].includes(p.version) ||
      !p.values ||
      typeof p.values !== "object" ||
      Array.isArray(p.values)
    )
      throw Error("Это не проект ATLANTA Контур.");
    if (
      typeof p.rawDxf !== "string" ||
      typeof p.ncText !== "string" ||
      p.rawDxf.length + p.ncText.length > 6000000
    )
      throw Error("Слишком большой или повреждённый проект.");
    const loaded = p.version === 5 ? deps.restoreOperations(p) : null;
    if (p.sketch) {
      if (!Array.isArray(p.sketch.items)) throw Error("Повреждён список элементов проекта.");
      deps.SKETCH.validate(p.sketch.items);
      if (p.sketch.dimensions != null) {
        const point = (q) =>
          q &&
          Number.isFinite(q.x) &&
          Number.isFinite(q.y) &&
          Math.abs(q.x) <= 1e6 &&
          Math.abs(q.y) <= 1e6;
        if (
          !Array.isArray(p.sketch.dimensions) ||
          p.sketch.dimensions.length > 10000 ||
          p.sketch.dimensions.some(
            (d) =>
              !d ||
              !point(d.a) ||
              !point(d.b) ||
              !Number.isFinite(d.length) ||
              !Number.isFinite(d.h),
          )
        )
          throw Error("Повреждены размеры чертежа в проекте.");
      }
    }
    // Validate all external geometry and origin data before clearing the open plan.
    const checkedOrigin =
      p.version >= 4 && p.originSetup
        ? p.originSetup
        : {
            preset: p.values.originPreset || "center",
            customBase: { x: p.values.originX || 0, y: p.values.originY || 0 },
            shift: { x: 0, y: 0 },
          };
    if (!checkedOrigin || typeof checkedOrigin !== "object") throw Error("Повреждён ноль проекта.");
    deps.ORIGIN.resolve(
      { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      checkedOrigin.preset,
      checkedOrigin.shift ? checkedOrigin.shift.x : 0,
      checkedOrigin.shift ? checkedOrigin.shift.y : 0,
      checkedOrigin.customBase || { x: 0, y: 0 },
    );
    if (checkedOrigin.customBase) {
      deps.ORIGIN.parse(checkedOrigin.customBase.x);
      deps.ORIGIN.parse(checkedOrigin.customBase.y);
    }
    if (p.sketch) deps.SKETCH.toScene(p.sketch.items, loaded ? p.activeOperationId : "primary");
    else if (p.rawDxf)
      deps.C.parseDXF(p.rawDxf, {
        scale: p.values.dxfUnits === "auto" ? undefined : Number(p.values.dxfUnits || 1),
        tolerance: Number(p.values.tolerance || 0.02),
        joinTolerance: Number(p.values.joinTolerance || 0.02),
      });
    for (const id of deps.numberIds) {
      if (p.values[id] != null && !Number.isFinite(Number(p.values[id])))
        throw Error("Повреждён числовой параметр проекта: " + id);
    }
    if (loaded)
      for (const op of loaded.list)
        for (const id of deps.numberIds) {
          if (op.params && op.params[id] != null && !Number.isFinite(Number(op.params[id])))
            throw Error("Повреждён параметр операции: " + id);
        }
    for (const values of [p.values, ...(loaded ? loaded.list.map((op) => op.params) : [])]) {
      if (values?.zReferenceEnabled !== true) continue;
      const plate = Number(values.zReferencePlate ?? 30);
      if (!Number.isFinite(plate) || plate <= 0 || plate > 999.999)
        throw Error("Повреждена высота плитки для привязки Z.");
      if (!["top", "manual"].includes(values.zReferenceSurfaceMode ?? "top"))
        throw Error("Повреждена поверхность для привязки Z.");
    }
    deps.invalidate("Открытие проекта");
    if (deps.state.mode === "dxf") deps.$("code").value = "";
    deps.editor.reset();
    deps.planSketchDxf = null;
    deps.cutSketchSignature = "";
    deps.marksSignature = "";
    deps.operations = (loaded === null || loaded === void 0 ? void 0 : loaded.list) || [
      deps.primaryOperation(),
    ];
    deps.activeOperationId = loaded ? p.activeOperationId : "primary";
    deps.nextOperation = (loaded === null || loaded === void 0 ? void 0 : loaded.next) || 1;
    deps.$("activeOperationOnly").checked = p.values.activeOperationOnly === true;
    deps.$("workPlane").value = "xy";
    deps.$("workPlaneExplicit").checked = false;
    deps.$("coordinateMode").value = "g90";
    deps.$("feedInHeader").checked = true;
    deps.$("headerFeed").value = deps.A.DEFAULT_HEADER_FEED;
    if (loaded) deps.toolCatalog = loaded.tools;
    const projectMachine = deps.M.profiles[p.machine] ? p.machine : "fanuc3000c",
      other = deps.machineSelected && projectMachine !== deps.machine;
    if (!deps.machineSelected && p.version >= 3 && deps.M.profiles[p.machine]) {
      deps.machine = p.machine;
      deps.machineSelected = true;
      if (p.machineSettings && typeof p.machineSettings === "object")
        for (const key of Object.keys(deps.M.profiles))
          if (p.machineSettings[key])
            deps.machineSettings[key] = {
              ...deps.machineDefaults[key],
              ...p.machineSettings[key],
            };
      deps.applyMachine();
    }
    deps.$("zReferenceEnabled").checked = p.values.zReferenceEnabled === true;
    deps.$("zReferencePlate").value = String(p.values.zReferencePlate ?? 30);
    deps.$("zReferenceSurfaceMode").value = p.values.zReferenceSurfaceMode || "top";
    deps.$("zReferenceSurfaceZ").value = String(p.values.zReferenceSurfaceZ ?? 0);
    for (const id of [...deps.numberIds, ...deps.selectIds])
      if (p.values[id] != null && !(other && deps.machineKeys.includes(id)))
        deps.$(id).value =
          id === "cutSide" ? deps.M.normalizeSide(String(p.values[id])) : String(p.values[id]);
    for (const id of deps.boolIds)
      if (typeof p.values[id] === "boolean" && !(other && deps.machineKeys.includes(id)))
        deps.$(id).checked = p.values[id];
    if (p.version === 1) {
      deps.$("toolKind").value = "mill";
      deps.$("depth").value = -Math.abs(Number(deps.$("depth").value));
    }
    if (!["mill", "scribe", "g25"].includes(deps.$("toolKind").value))
      deps.$("toolKind").value = "scribe";
    deps.$("depth").value = -Math.abs(Number(deps.$("depth").value));
    deps.$("dialect").value = "legacy";
    deps.$("coordScale").value = 1000;
    deps.$("feedScale").value = deps.M.profiles[deps.machine].feedScale;
    deps.state.activeTool = deps.$("toolKind").value;
    deps.state.toolProfiles = JSON.parse(JSON.stringify(deps.initialToolProfiles));
    if (p.version >= 2 && p.toolProfiles)
      for (const kind of ["scribe", "mill"])
        if (p.toolProfiles[kind])
          for (const key of deps.toolKeys)
            if (p.toolProfiles[kind][key] != null)
              deps.state.toolProfiles[kind][key] = p.toolProfiles[kind][key];
    deps.saveToolProfile(deps.state.activeTool);
    deps.fixParkFields();
    if (loaded) deps.applyOperationValues(deps.activeOperation());
    const savedOrigin =
      p.version >= 4 && p.originSetup
        ? p.originSetup
        : {
            preset: p.values.originPreset || "center",
            shift: { x: 0, y: 0 },
            customBase: {
              x: Number(p.values.originX) || 0,
              y: Number(p.values.originY) || 0,
            },
          };
    deps.sharedOriginSetup = JSON.parse(JSON.stringify(savedOrigin));
    deps.originBasePoint = {
      x: deps.ORIGIN.parse(
        (_savedOrigin$customBa =
          (_savedOrigin$customBa2 = savedOrigin.customBase) === null ||
          _savedOrigin$customBa2 === void 0
            ? void 0
            : _savedOrigin$customBa2.x) !== null && _savedOrigin$customBa !== void 0
          ? _savedOrigin$customBa
          : 0,
      ),
      y: deps.ORIGIN.parse(
        (_savedOrigin$customBa3 =
          (_savedOrigin$customBa4 = savedOrigin.customBase) === null ||
          _savedOrigin$customBa4 === void 0
            ? void 0
            : _savedOrigin$customBa4.y) !== null && _savedOrigin$customBa3 !== void 0
          ? _savedOrigin$customBa3
          : 0,
      ),
    };
    deps.originShift = { x: 0, y: 0 };
    deps.$("originShiftX").value = "0";
    deps.$("originShiftY").value = "0";
    deps.state.rawDxf = p.rawDxf;
    deps.state.dxfName = String(p.dxfName || "Проект плана");
    deps.state.ncText = p.ncText;
    deps.state.ncName = String(p.ncName || "Проект NC");
    deps.state.result = null;
    deps.state.parsed = null;
    deps.state.undo = [];
    deps.$("undoNc").disabled = true;
    deps.state.planContours = [];
    deps.state.contours = [];
    deps.state.dxfWarnings = [];
    deps.state.dxfUnsupported = [];
    if (deps.state.rawDxf) deps.parseDxf();
    if (p.sketch) {
      const value = deps.SKETCH.clone(p.sketch);
      if (p.version < 4) for (const item of value.items || []) delete item.machining;
      const scene = deps.SKETCH.toScene(value.items, deps.activeOperationId);
      if (scene.dxf !== deps.state.rawDxf && scene.dxf !== deps.planSignature()) {
        deps.state.rawDxf = scene.dxf;
        deps.planSketchDxf = scene.dxf;
        deps.state.planContours = scene.contours;
      }
      {
        deps.editor.restore(value, deps.state.rawDxf, deps.planSignature());
        deps.setMachiningScene(scene, loaded ? deps.activeOperation().sides : undefined);
      }
    }
    if (p.version === 4)
      for (const stored of p.contours || []) {
        const c = deps.state.contours.find((contour) =>
          stored.signature
            ? deps.contourSignature(contour) === stored.signature
            : contour.id === stored.id,
        );
        if (c && ["auto", "inside", "outside", "on", "wall", "network"].includes(stored.side))
          c.side = stored.side;
      }
    deps.state.startPoint = loaded
      ? deps.restoreEntry(deps.activeOperation(), deps.state.contours)
      : p.version === 4 &&
          p.startPoint &&
          Number.isFinite(p.startPoint.x) &&
          Number.isFinite(p.startPoint.y)
        ? deps.C.P(p.startPoint.x, p.startPoint.y)
        : null;
    deps.state.entryStart = loaded
      ? deps.restoreEntryStart(deps.activeOperation(), deps.state.contours) ||
        (deps.activeOperation().entryStart && { ...deps.activeOperation().entryStart })
      : null;
    deps.state.exitPoint = loaded
      ? deps.restoreExit(deps.activeOperation(), deps.state.contours) ||
        (deps.activeOperation().exitPoint && { ...deps.activeOperation().exitPoint })
      : null;
    if (loaded && !deps.state.startPoint && deps.activeOperation().entry)
      deps.state.startPoint = { ...deps.activeOperation().entry };
    if (
      deps.state.startPoint &&
      typeof ((_p$startPoint = p.startPoint) === null || _p$startPoint === void 0
        ? void 0
        : _p$startPoint.contourId) === "string" &&
      p.startPoint.contourId.length < 100
    )
      deps.state.startPoint.contourId = p.startPoint.contourId;
    deps.$("originPreset").value = savedOrigin.preset;
    deps.originShift = {
      x: deps.ORIGIN.parse(
        (_savedOrigin$shift$x =
          (_savedOrigin$shift = savedOrigin.shift) === null || _savedOrigin$shift === void 0
            ? void 0
            : _savedOrigin$shift.x) !== null && _savedOrigin$shift$x !== void 0
          ? _savedOrigin$shift$x
          : 0,
      ),
      y: deps.ORIGIN.parse(
        (_savedOrigin$shift$y =
          (_savedOrigin$shift2 = savedOrigin.shift) === null || _savedOrigin$shift2 === void 0
            ? void 0
            : _savedOrigin$shift2.y) !== null && _savedOrigin$shift$y !== void 0
          ? _savedOrigin$shift$y
          : 0,
      ),
    };
    deps.$("originShiftX").value = String(deps.originShift.x);
    deps.$("originShiftY").value = String(deps.originShift.y);
    deps.applyOrigin();
    deps.restoreOperationOrigin(deps.activeOperation());
    deps.renderContours();
    deps.renderOperationPanel();
    deps.state.mode = "dxf";
    deps.setMode(p.mode === "nc" ? "nc" : "dxf");
    deps.updateParams();
    deps.state.fit = true;
    if (deps.editor.isOpen) {
      deps.invalidate("План восстановлен · закончи рисование");
      deps.$("generate").textContent = "К обработке → рассчитать";
    }
    if (p.version < 4)
      deps.message([
        {
          text: "Проект предыдущей версии открыт как общий план. Отметь цветом операции только нужные элементы обработки.",
        },
      ]);
    if (other)
      deps.message([
        {
          type: "warn",
          text:
            "Проект сохранён для " +
            deps.M.profiles[projectMachine].name +
            ". Сейчас выбран " +
            deps.M.profiles[deps.machine].name +
            ".",
        },
      ]);
    deps.showWorkPane(deps.editor.isOpen ? "drawing" : "operations");
    deps.syncWorkspace();
    if (!silent) deps.toast("Проект открыт · " + deps.M.profiles[deps.machine].name);
    deps.persistMachine();
    if (loaded) deps.persistTools();
  }

  function importGeometryProject(project, name) {
    var _state$contours$5;
    const items = project.items.map((item, i) => ({
        ...item,
        id: "import-" + (i + 1),
      })),
      scene = deps.SKETCH.toScene(items, deps.activeOperationId);
    resetOperationGeometry();
    deps.editor.reset();
    deps.planSketchDxf = scene.dxf;
    deps.state.rawDxf = scene.dxf;
    deps.state.dxfName = name + " · план";
    deps.state.result = null;
    deps.state.startPoint = null;
    deps.state.planContours = scene.contours;
    deps.state.contours = [];
    deps.setMachiningScene(scene);
    deps.state.active =
      (_state$contours$5 = deps.state.contours[0]) === null || _state$contours$5 === void 0
        ? void 0
        : _state$contours$5.id;
    deps.state.dxfUnsupported = [];
    deps.$("originPreset").value = "center";
    deps.originShift = { x: 0, y: 0 };
    deps.$("originShiftX").value = "0";
    deps.$("originShiftY").value = "0";
    deps.$("dxfUnits").value = "1";
    deps.parsedSettings = deps.dxfSettings();
    deps.setMode("dxf");
    deps.editor.restore({ items, open: false, tool: "line" }, scene.dxf);
    deps.applyOrigin();
    deps.renderOperationLabels();
    deps.renderContours();
    deps.updateParams();
    deps.invalidate("План открыт · отметь нужную обработку");
    deps.state.fit = true;
    deps.requestDraw();
    deps.message([
      {
        text: "В обработку отмечено элементов: " + scene.markedCount + ". Остальное — общий план.",
      },
    ]);
  }

  function resetOperationGeometry() {
    for (const op of deps.operations) {
      op.sides = [];
      op.entry = null;
      op.entryStart = null;
      op.exitPoint = null;
    }
    deps.state.contours = [];
    deps.state.startPoint = null;
    deps.state.entryStart = null;
    deps.state.exitPoint = null;
    deps.cutSketchSignature = "";
    deps.marksSignature = "";
  }

  function resetOperations() {
    deps.operations = [deps.primaryOperation()];
    deps.activeOperationId = "primary";
    deps.nextOperation = 1;
    deps.sharedOriginSetup = null;
    deps.diagnosticMaterial = null;
    deps.diagnosticIssues = null;
    deps.state.result = null;
    deps.state.ready = false;
    deps.$("code").value = "";
    resetOperationGeometry();
    deps.$("toolKind").value = "mill";
    deps.applyToolProfile("mill");
    deps.applyOperationValues(deps.activeOperation());
    deps.restoreOperationOrigin(deps.activeOperation());
    deps.renderOperationPanel();
    deps.renderOperationLabels();
    deps.renderContours();
    deps.updateParams();
    deps.dirtyDxf();
    deps.invalidate("Новый чертёж · обработка очищена");
    scheduleAutosave();
  }

  async function loadFile(file) {
    if (!file) return;
    if (deps.calculation) deps.invalidate("Открытие файла · расчёт отменён");
    try {
      if (file.size > 6000000) throw Error("Файл больше 6 МБ. Подготовьте меньший 2D файл.");
      const buf = await file.arrayBuffer();
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
      } catch (e) {
        text = new TextDecoder("windows-1251").decode(buf);
      }
      const ext = file.name.split(".").at(-1).toLowerCase();
      if (ext === "json") {
        const project = JSON.parse(text);
        if (["ATLANTA-workspace", "ATLANTA-tools"].includes(project.format))
          deps.importCatalogue(project);
        else if (project.app === "ATLANTA_CAM_OFFLINE") restoreProject(project);
        else if (Array.isArray(project.items)) {
          importGeometryProject(project, file.name);
          deps.editor.begin();
        } else throw Error("Неизвестный формат проекта JSON.");
        scheduleAutosave();
        return;
      }
      if (ext === "dxf" || /^\s*0\s*\r?\n\s*SECTION/m.test(text)) {
        resetOperationGeometry();
        deps.state.rawDxf = text;
        deps.state.dxfName = file.name;
        deps.state.startPoint = null;
        deps.state.result = null;
        deps.setMode("dxf");
        deps.parseDxf();
        deps.editor.begin();
      } else {
        if (deps.editor.isOpen && !deps.editor.finish()) return;
        deps.state.ncText = text;
        deps.state.ncName = file.name;
        deps.state.undo = [];
        deps.$("undoNc").disabled = true;
        deps.setMode("nc");
      }
      scheduleAutosave();
    } catch (e) {
      if (!/\.json$/i.test(file.name)) {
        deps.invalidate("Ошибка открытия файла");
        if (deps.state.mode === "dxf") deps.$("code").value = "";
      }
      deps.message([{ type: "error", text: e.message }]);
    }
  }
  return {
    projectObject,
    autosaveStatus,
    scheduleAutosave,
    restoreProject,
    importGeometryProject,
    resetOperationGeometry,
    resetOperations,
    loadFile,
  };
}
