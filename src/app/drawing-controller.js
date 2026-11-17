/**
 * drawing-controller controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.activeOperation
 * @param {*} deps.activeOperationId
 * @param {*} deps.C
 * @param {*} deps.config
 * @param {*} deps.cutSketchSignature (read/write)
 * @param {*} deps.dxfSettings
 * @param {*} deps.editor
 * @param {*} deps.enableExport
 * @param {*} deps.invalidate
 * @param {*} deps.message
 * @param {*} deps.ORIGIN
 * @param {*} deps.originBasePoint (read/write)
 * @param {*} deps.originEffective (read/write)
 * @param {*} deps.originShift (read/write)
 * @param {*} deps.parsedSettings (read/write)
 * @param {*} deps.planSignature
 * @param {*} deps.planSketchDxf (read/write)
 * @param {*} deps.renderOperationLabels
 * @param {*} deps.requestDraw
 * @param {*} deps.scheduleAutosave
 * @param {*} deps.setMachiningScene
 * @param {*} deps.sharedOriginSetup
 * @param {*} deps.sideOptions
 * @param {*} deps.SKETCH
 * @param {*} deps.state
 * @param {*} deps.toast
 * @param {*} deps.UI_RENDER
 * @param {*} deps.updateParams
 */
export function createDrawingController(deps) {
  function activateContour(id) {
    if (!deps.state.contours.some((c) => c.id === id)) return;
    deps.state.active = id;
    for (const row of deps.$("contourList").children) {
      const selected = row.dataset.contourId === id;
      row.classList.toggle("focus", selected);
      if (selected) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
    deps.requestDraw();
  }

  function renderContours() {
    deps.UI_RENDER.renderContours({
      state: deps.state,
      activeColor: deps.activeOperation().color,
      sideOptions: deps.sideOptions,
      activateContour,
      dirtyDxf,
      updateParams: deps.updateParams,
      marking: deps.config().toolKind === "scribe",
    });
  }

  function applyOrigin() {
    const resolved = deps.ORIGIN.resolve(
      deps.C.bounds(deps.state.planContours),
      deps.$("originPreset").value,
      deps.originShift.x,
      deps.originShift.y,
      deps.originBasePoint,
    );
    deps.originEffective = { x: resolved.x, y: resolved.y };
    deps.UI_RENDER.renderOrigin(resolved);
    return resolved;
  }

  function originSetup() {
    return {
      preset: deps.$("originPreset").value,
      shift: { ...deps.originShift },
      customBase: { ...deps.originBasePoint },
    };
  }

  function restoreOperationOrigin(op) {
    deps.$("localOrigin").checked = !!op.originSetup;
    const value = op.originSetup || deps.sharedOriginSetup;
    if (!value) return;
    deps.originBasePoint = { ...value.customBase };
    deps.originShift = { ...value.shift };
    deps.$("originPreset").value = value.preset;
    deps.$("originShiftX").value = String(deps.originShift.x);
    deps.$("originShiftY").value = String(deps.originShift.y);
    applyOrigin();
  }

  function changeOrigin() {
    try {
      const nextShift = {
        x: deps.ORIGIN.parse(deps.$("originShiftX").value, "ΔX"),
        y: deps.ORIGIN.parse(deps.$("originShiftY").value, "ΔY"),
      };
      deps.ORIGIN.resolve(
        deps.C.bounds(deps.state.planContours),
        deps.$("originPreset").value,
        nextShift.x,
        nextShift.y,
        deps.originBasePoint,
      );
      deps.originShift = nextShift;
      applyOrigin();
      deps.updateParams();
      deps.state.fit = true;
      dirtyDxf();
    } catch (error) {
      deps.enableExport(false);
      deps.$("originReadout").textContent = error.message;
    }
  }

  function setCustomOrigin(point) {
    const checked = {
      x: deps.ORIGIN.parse(point.x, "X нуля"),
      y: deps.ORIGIN.parse(point.y, "Y нуля"),
    };
    deps.originBasePoint = checked;
    deps.originShift = { x: 0, y: 0 };
    deps.$("originShiftX").value = "0";
    deps.$("originShiftY").value = "0";
    deps.$("originPreset").value = "custom";
    applyOrigin();
    const details = document.querySelector(".originAlternative");
    if (details) details.open = true;
  }

  function parseDxf(preserve = false) {
    const prior = preserve ? deps.editor.serialize() : null,
      oldCuts = preserve ? deps.state.contours : [];
    deps.editor.reset();
    deps.planSketchDxf = null;
    deps.cutSketchSignature = "";
    try {
      var _state$contours$4;
      const c = deps.config(),
        parsed = deps.C.parseDXF(deps.state.rawDxf, {
          scale: c.dxfUnits === "auto" ? undefined : Number(c.dxfUnits),
          tolerance: c.tolerance,
          joinTolerance: c.joinTolerance,
        });
      deps.state.planContours = parsed.contours;
      deps.state.contours = [];
      deps.state.dxfWarnings = parsed.warnings;
      deps.state.dxfUnsupported = parsed.unsupported;
      try {
        const canonical = deps.planSignature();
        let value = prior,
          items;
        if (prior && deps.SKETCH.toScene(prior.items).dxf === canonical) items = prior.items;
        else {
          const auxiliary = prior ? prior.items.filter((item) => item.construction === true) : [],
            ids = new Set(auxiliary.map((item) => item.id));
          let next = 1;
          items = deps.SKETCH.fromContours(parsed.contours).map((item) => {
            let id;
            do {
              id = "parsed-" + next++;
            } while (ids.has(id));
            ids.add(id);
            return { ...item, id };
          });
          items.push(...auxiliary);
          value = {
            items,
            open: (prior === null || prior === void 0 ? void 0 : prior.open) === true,
            tool: "line",
          };
          if (prior) deps.toast("Геометрия чтения изменена. Проверь и заново отметь обработку.");
        }
        const scene = deps.SKETCH.toScene(items, deps.activeOperationId);
        deps.state.contours = oldCuts;
        deps.setMachiningScene(scene, preserve ? undefined : deps.activeOperation().sides);
        deps.state.dxfWarnings = [
          ...new Set([
            ...parsed.warnings.filter(
              (text) =>
                !(
                  /разветв|ветвлен|неоднозначн/i.test(text) &&
                  scene.machiningContours.length &&
                  scene.machiningContours.every((c) => !c.ambiguous)
                ),
            ),
            ...deps.state.dxfWarnings,
          ]),
        ];
        deps.editor.restore({ ...value, items }, deps.state.rawDxf, canonical);
      } catch (error) {
        deps.state.contours = [];
        deps.cutSketchSignature = "";
        deps.message([
          {
            type: "warn",
            text: "План открыт, но редактор не смог перенести все элементы: " + error.message,
          },
        ]);
      }
      deps.parsedSettings = deps.dxfSettings();
      deps.state.active =
        (_state$contours$4 = deps.state.contours[0]) === null || _state$contours$4 === void 0
          ? void 0
          : _state$contours$4.id;
      applyOrigin();
      deps.updateParams();
      deps.invalidate("Отметь контуры или отверстия");
      deps.renderOperationLabels();
      renderContours();
      deps.state.fit = true;
      deps.requestDraw();
      deps.message([
        {
          text:
            "Общий план: " +
            deps.state.planContours.length +
            " контуров. Отметь геометрию для нужной операции.",
        },
        ...deps.state.dxfWarnings.map((text) => ({ type: "warn", text })),
      ]);
      return true;
    } catch (error) {
      deps.planSketchDxf = null;
      deps.cutSketchSignature = "";
      deps.state.planContours = [];
      deps.state.contours = [];
      deps.state.dxfWarnings = [];
      deps.state.dxfUnsupported = [];
      renderContours();
      deps.invalidate("Ошибка чтения DXF");
      deps.message([{ type: "error", text: error.message }]);
      return false;
    }
  }

  function dirtyDxf() {
    if (deps.state.mode === "dxf") deps.invalidate();
    deps.scheduleAutosave();
    deps.requestDraw();
  }

  function unsupportedDxfGeometry() {
    return deps.state.dxfUnsupported.filter(
      (x) =>
        ![
          "POINT",
          "TEXT",
          "MTEXT",
          "DIMENSION",
          "HATCH",
          "SOLID",
          "TRACE",
          "ATTDEF",
          "ATTRIB",
          "SEQEND",
          "VIEWPORT",
          "LEADER",
        ].includes(x),
    );
  }
  return {
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
  };
}
