/**
 * nc-editor-controller controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.C
 * @param {*} deps.currentMotions
 * @param {*} deps.enableExport
 * @param {*} deps.invalidate
 * @param {*} deps.M
 * @param {*} deps.machine
 * @param {*} deps.message
 * @param {*} deps.profile
 * @param {*} deps.requestDraw
 * @param {*} deps.scheduleAutosave
 * @param {*} deps.setSim
 * @param {*} deps.state
 * @param {*} deps.toast
 * @param {*} deps.UI_RENDER
 * @param {*} deps.updatePlaneReadout
 */
export function createNcEditorController(deps) {
  function parseNc() {
    try {
      var _r$motions$find, _r$records$find, _r$repeats;
      const section = deps.$("ncSection").value,
        text = deps.$("code").value;
      if (!text.trim()) throw Error("Вставь или открой программу.");
      if (text.length > 2000000) throw Error("Код больше 2 МБ. Разделите его на операции.");
      deps.state.ncText = text;
      deps.$("postDescription").textContent =
        "Просмотр " +
        deps.M.profiles[deps.machine].name +
        ". G41/G42 и D выполняет стойка. Координаты ×1000. F ×10.";
      deps.state.parsed = deps.C.parseNC(text, deps.profile());
      const r = deps.state.parsed;
      deps.state.ncCodePlane = deps.C.planeInfo(
        ((_r$motions$find = r.motions.find((m) => m.type === "arc")) === null ||
        _r$motions$find === void 0
          ? void 0
          : _r$motions$find.plane) ||
          ((_r$records$find = r.records.find((r) => r.plane && r.plane !== 17)) === null ||
          _r$records$find === void 0
            ? void 0
            : _r$records$find.plane) ||
          17,
      ).id;
      deps.state.ncPlane = deps.state.ncCodePlane;
      deps.updatePlaneReadout();
      deps.enableExport(!r.errors.length);
      deps.UI_RENDER.renderNcParseResult({
        result: r,
        machine: deps.machine,
        section,
        currentMotions: deps.currentMotions(),
      });
      deps.message([
        ...r.errors.slice(0, 30).map((text) => ({ type: "error", text })),
        ...r.warnings.slice(0, 16).map((text) => ({ type: "warn", text })),
        ...(r.repeats || []).map((c) => ({
          text:
            "G25 " +
            c.block +
            ": N" +
            c.first +
            "–N" +
            c.last +
            " · " +
            c.count +
            " повторов после исходного прохода" +
            (c.executions > 1 ? " · вызовов " + c.executions : "") +
            ".",
        })),
        ...(!r.errors.length
          ? [
              {
                type: "ok",
                text: "Поддерживаемые команды разобраны. Перед запуском проверь фактические коррекции и положения станка.",
              },
            ]
          : []),
      ]);
      deps.state.fit = true;
      deps.setSim();
      deps.requestDraw();
      deps.scheduleAutosave();
      return !r.errors.length;
    } catch (e) {
      deps.invalidate("Ошибка разбора программы");
      deps.message([{ type: "error", text: e.message }]);
      return false;
    }
  }

  function optionalNumber(id) {
    const s = deps.$(id).value.trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) throw Error("Проверь значение " + id);
    return n;
  }

  function applyNc() {
    try {
      const changes = {
        section: deps.$("ncSection").value,
        dx: Number(deps.$("ncDx").value),
        dy: Number(deps.$("ncDy").value),
        depth: optionalNumber("ncDepth"),
        feed: optionalNumber("ncFeed"),
        safeZ: optionalNumber("ncSafe"),
        includeCycles: deps.$("ncCycles").checked,
      };
      if (!Number.isFinite(changes.dx) || !Number.isFinite(changes.dy))
        throw Error("Сдвиги XY должны быть числами.");
      const prior = deps.$("code").value,
        r = deps.C.transformNC(prior, deps.profile(), changes);
      if (!r.replaced) {
        deps.toast("Подходящих для замены команд не найдено");
        return;
      }
      deps.state.undo.push(prior);
      if (deps.state.undo.length > 20) deps.state.undo.shift();
      deps.$("undoNc").disabled = false;
      deps.$("code").value = r.code;
      parseNc();
      deps.toast("Изменено команд: " + r.replaced);
    } catch (e) {
      deps.message([{ type: "error", text: e.message }]);
    }
  }

  function download(name, content, type = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type }),
      u = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
  }

  function exportCode(ext) {
    var _state$result5;
    if (!deps.state.ready) {
      deps.toast("Сначала рассчитай или проверь траекторию");
      return;
    }
    let code = deps.$("code").value.replace(/\r?\n/g, "\r\n");
    if (deps.state.mode === "nc") {
      const nonAscii = code.replace(/\([^)]*\)/g, "").replace(/;[^\r\n]*/g, "");
      if (/[^\x00-\x7F]/.test(nonAscii)) {
        deps.message([
          {
            type: "error",
            text: "В командах есть символы вне ASCII. Исправь текст перед экспортом.",
          },
        ]);
        return;
      }
      code = code
        .replace(/\([^)]*\)/g, (t) => t.replace(/[^\x00-\x7F]/g, "?"))
        .replace(/;[^\r\n]*/g, (t) => t.replace(/[^\x00-\x7F]/g, "?"));
    }
    if (!code.endsWith("\r\n")) code += "\r\n";
    const cp =
        ((_state$result5 = deps.state.result) === null || _state$result5 === void 0
          ? void 0
          : _state$result5.parts.length) === 1
          ? deps.state.result.parts[0].result.compensation
          : null,
      suffix =
        deps.state.mode === "dxf" && cp && cp.kind !== "center"
          ? "_D" +
            String(cp.number).padStart(2, "0") +
            (cp.kind === "wear" ? "_ZERO" : "_R" + cp.tableValue.toFixed(3))
          : "";
    download(
      "ATLANTA_" +
        deps.machine +
        "_" +
        (deps.state.mode === "dxf" ? "operations" : "edited") +
        suffix +
        "." +
        ext,
      code,
    );
    deps.toast("Файл " + ext.toUpperCase() + " сохранён");
  }
  return { parseNc, optionalNumber, applyNc, download, exportCode };
}
