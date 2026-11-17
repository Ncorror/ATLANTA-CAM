/**
 * nc-view-controller controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.activeOperationId
 * @param {*} deps.activeViewPlane (read/write)
 * @param {*} deps.C
 * @param {*} deps.codeArea
 * @param {*} deps.codeFrameCount (read/write)
 * @param {*} deps.codeFrameExecution (read/write)
 * @param {*} deps.codeFrameLayout (read/write)
 * @param {*} deps.codeFrameLine (read/write)
 * @param {*} deps.codeFrameStatus
 * @param {*} deps.codeMarker
 * @param {*} deps.config
 * @param {*} deps.failedDiagnostic
 * @param {*} deps.focusIssue
 * @param {*} deps.motionViewCache (read/write)
 * @param {*} deps.playback
 * @param {*} deps.requestDraw
 * @param {*} deps.resize
 * @param {*} deps.state
 * @param {*} deps.UI_RENDER
 */
export function createNcViewController(deps) {
  function currentMotions() {
    var _state$result2, _state$parsed;
    const source =
      deps.state.mode === "dxf"
        ? (_state$result2 = deps.state.result) === null ||
          _state$result2 === void 0 ||
          (_state$result2 = _state$result2.parts.find(
            (part) => part.id === deps.activeOperationId,
          )) === null ||
          _state$result2 === void 0
          ? void 0
          : _state$result2.motions
        : (_state$parsed = deps.state.parsed) === null || _state$parsed === void 0
          ? void 0
          : _state$parsed.motions;
    if (!source) return [];
    if (
      deps.motionViewCache.source !== source ||
      deps.motionViewCache.plane !== deps.activeViewPlane
    )
      deps.motionViewCache = {
        source,
        plane: deps.activeViewPlane,
        motions:
          deps.activeViewPlane === "xy"
            ? source
            : source.map((m) => deps.C.motionToLocal(m, deps.activeViewPlane)),
      };
    let m = deps.motionViewCache.motions;
    if (deps.state.mode === "nc" && deps.$("ncSection").value !== "all")
      m = m.filter((x) => x.section === +deps.$("ncSection").value);
    return m;
  }

  function motionPoint(m, t) {
    return deps.C.motionPoint(m, t);
  }

  function updatePlaneReadout() {
    deps.activeViewPlane = deps.UI_RENDER.updatePlaneReadout({
      state: deps.state,
      workPlaneValue: deps.$("workPlane").value,
    });
  }

  function clearCodeFrame() {
    deps.codeFrameLine = 0;
    deps.codeFrameExecution = null;
    deps.codeMarker.classList.remove("errorFrame");
    deps.codeMarker.hidden = true;
    deps.codeFrameStatus.hidden = true;
  }

  function showFailedFrame() {
    const d = deps.failedDiagnostic;
    if (!d) return;
    document.body.classList.add("show-code");
    deps.$("toggleCode").textContent = "Скрыть код";
    deps.codeArea.value = d.code;
    deps.codeArea.readOnly = true;
    deps.codeFrameLine = d.displayLine;
    deps.codeFrameCount = d.code.split(/\r?\n/).length;
    deps.codeFrameLayout = null;
    deps.codeMarker.classList.add("errorFrame");
    deps.codeFrameStatus.textContent =
      "Ошибка · " +
      (d.block ? d.block + " · " : "") +
      "строка " +
      d.line +
      (d.truncated
        ? " · фрагмент " + d.firstLine + "–" + (d.firstLine + deps.codeFrameCount - 1)
        : "");
    deps.codeFrameStatus.title =
      "Строка текста проверочной операции, включая строки %. Номер N показывается отдельно, если он есть.";
    deps.codeFrameStatus.hidden = false;
    deps.$("codeStatus").textContent =
      "Проверочный код отклонённой операции · экспорт заблокирован";
    deps.$("frameReadout").textContent = d.command;
    deps.resize();
    placeCodeFrame(true);
    deps.focusIssue({ point: d.point });
  }

  function placeCodeFrame(follow) {
    const height = deps.codeArea.clientHeight;
    if (!deps.codeFrameLine || !height) {
      deps.codeMarker.hidden = true;
      return;
    }
    if (!deps.codeFrameLayout) {
      const style = getComputedStyle(deps.codeArea);
      let lineHeight = parseFloat(style.lineHeight);
      const padding = parseFloat(style.paddingTop);
      if (!(lineHeight > 0) || !Number.isFinite(padding)) return;
      if (deps.codeFrameCount > 10 && deps.codeArea.scrollHeight > height) {
        const measured =
          (deps.codeArea.scrollHeight - padding - parseFloat(style.paddingBottom)) /
          deps.codeFrameCount;
        if (Math.abs(measured - lineHeight) < 0.5) lineHeight = measured;
      }
      deps.codeFrameLayout = { lineHeight, padding };
    }
    const { lineHeight, padding } = deps.codeFrameLayout;
    const top = padding + (deps.codeFrameLine - 1) * lineHeight;
    if (
      follow &&
      (top < deps.codeArea.scrollTop || top + lineHeight > deps.codeArea.scrollTop + height)
    ) {
      deps.codeArea.scrollTop = Math.max(0, top - height / 3);
    }
    const visibleTop = top - deps.codeArea.scrollTop;
    deps.codeMarker.style.height = lineHeight + "px";
    deps.codeMarker.style.transform = "translateY(" + visibleTop + "px)";
    deps.codeMarker.hidden = visibleTop + lineHeight <= 0 || visibleTop >= height;
  }

  function showCodeFrame(motion) {
    var _state$parsed2, _exec;
    const line = motion.line;
    if (!Number.isInteger(line) || line < 1) {
      clearCodeFrame();
      return;
    }
    if (line === deps.codeFrameLine && deps.codeFrameExecution === motion.executionIndex) return;
    deps.codeFrameLine = line;
    deps.codeFrameExecution = motion.executionIndex;
    const command =
      motion.command ||
      ((_state$parsed2 = deps.state.parsed) === null || _state$parsed2 === void 0
        ? void 0
        : _state$parsed2.lines[line - 1]) ||
      "";
    const number =
      (_exec = /^\s*(N\s*\d+)/i.exec(command)) === null || _exec === void 0 ? void 0 : _exec[1];
    const repeat = motion.subprogramReplay
      ? " · " +
        (motion.subTriggerBlock || "M98") +
        " · проход " +
        motion.subRepeat +
        "/" +
        motion.subRepeatCount +
        " · ур. " +
        motion.subDepth
      : motion.cycleReplay
        ? " · G25 " +
          (motion.cycleTriggerBlock || "N" + motion.cycleTriggerN) +
          " · повтор " +
          motion.cycleRepeat +
          "/" +
          motion.cycleRepeatCount
        : "";
    deps.codeFrameStatus.textContent =
      (number ? "Кадр " + number + " · " : "") + "строка " + line + repeat;
    deps.codeFrameStatus.hidden = false;
    deps.$("frameReadout").textContent = (command || "Строка " + line) + repeat;
    placeCodeFrame(true);
  }

  function setSim() {
    var _state$parsed3, _state$result3;
    clearCodeFrame();
    deps.codeFrameCount =
      deps.state.mode === "nc"
        ? ((_state$parsed3 = deps.state.parsed) === null || _state$parsed3 === void 0
            ? void 0
            : _state$parsed3.lines.length) || 0
        : ((_state$result3 = deps.state.result) === null || _state$result3 === void 0
            ? void 0
            : _state$result3.lineCount) || 0;
    deps.codeFrameLayout = null;
    deps.playback.setMotions(currentMotions());
    deps.requestDraw();
    deps.$("simPosition").textContent = "Z —";
    deps.$("droX").textContent = "0";
    deps.$("droY").textContent = "0";
    const localInitial = currentMotions()[0]?.a;
    const initial = localInitial && deps.C.planeToWorld(localInitial, deps.activeViewPlane);
    deps.$("droX").textContent = deps.C.fmt(initial?.x ?? 0, 1000, false);
    deps.$("droY").textContent = deps.C.fmt(initial?.y ?? 0, 1000, false);
    const z = initial?.z ?? deps.config().initialZ;
    deps.$("droZ").textContent = Number.isFinite(z) ? deps.C.fmt(z, 1000, false) : "—";
    deps.$("frameReadout").textContent = "Начальное положение · G92 не является перемещением";
  }
  return {
    currentMotions,
    motionPoint,
    updatePlaneReadout,
    clearCodeFrame,
    showFailedFrame,
    placeCodeFrame,
    showCodeFrame,
    setSim,
  };
}
