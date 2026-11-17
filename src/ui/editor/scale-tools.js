/**
 * scale-tools controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.attachmentAt
 * @param {*} deps.begin
 * @param {*} deps.C
 * @param {*} deps.clearPending
 * @param {*} deps.closeDimEditor
 * @param {*} deps.commit
 * @param {*} deps.env
 * @param {*} deps.focusCanvas
 * @param {*} deps.model
 * @param {*} deps.parseMath
 * @param {*} deps.S
 * @param {*} deps.scale (read/write)
 * @param {*} deps.select
 * @param {*} deps.toast
 * @param {*} deps.validBoxPoint
 */
export function createScaleTools(deps) {
  function closeScale() {
    if (deps.scale) {
      deps.scale = null;
      deps.$("scaleEditor").hidden = true;
    }
  }

  function scaleSummary() {
    const width = deps.$("scaleMode").value === "width",
      input = deps.$("scaleValue");
    input.setAttribute("aria-label", width ? "Новая ширина, мм" : "Масштаб, %");
    const caption = deps.$("scaleValueLabel");
    if (caption) caption.textContent = width ? "Новая ширина, мм" : "Масштаб, %";
    const { bounds, all } = deps.scale;
    deps.$("scaleSummary").textContent =
      (all ? "Весь чертёж" : "Выделенные элементы") +
      " · сейчас " +
      bounds.w.toFixed(3) +
      " × " +
      bounds.h.toFixed(3) +
      " мм";
  }

  function openScale() {
    var _env$scaleBlocked, _model$items3;
    const blocked =
      (_env$scaleBlocked = deps.env.scaleBlocked) === null || _env$scaleBlocked === void 0
        ? void 0
        : _env$scaleBlocked.call(deps.env);
    if (blocked) {
      deps.toast(blocked);
      return;
    }
    if (!deps.model.isOpen) deps.begin();
    if (!(
      (_model$items3 = deps.model.items) !== null &&
      _model$items3 !== void 0 &&
      _model$items3.length
    )) {
      deps.toast(deps.model.issue || "Открой DXF или нарисуй элементы для масштабирования.");
      return;
    }
    if (!deps.model.selectedSet.size && deps.model.selectedDims.length) {
      deps.toast("Выдели геометрию или сними выделение размера, чтобы изменить весь чертёж.");
      return;
    }
    deps.clearPending();
    deps.closeDimEditor();
    const all = !deps.model.selectedSet.size,
      items = all
        ? deps.model.items
        : deps.model.items.filter((item) => deps.model.selectedSet.has(item.id)),
      ordinary = items.filter((item) => item.construction !== true);
    const bounds = deps.C.bounds((ordinary.length ? ordinary : items).flatMap(deps.S.segments));
    deps.scale = { all, bounds, ids: new Set(items.map((item) => item.id)) };
    const mode = deps.$("scaleMode");
    mode.value = "percent";
    mode.querySelector('[value="width"]').disabled = bounds.w <= 1e-8;
    const input = deps.$("scaleValue");
    input.value = "50";
    scaleSummary();
    deps.$("scaleEditor").hidden = false;
    input.focus();
    input.select();
  }

  function applyScale() {
    if (!deps.scale) return;
    try {
      const { all, bounds, ids } = deps.scale,
        width = deps.$("scaleMode").value === "width",
        value = deps.parseMath(
          deps.$("scaleValue").value,
          width ? "Новая ширина, мм" : "Масштаб, %",
        );
      const factor = width ? value / bounds.w : value / 100;
      if (!Number.isFinite(factor) || factor <= 0)
        throw Error("Введи положительный масштаб или ширину.");
      if (factor === 1) {
        closeScale();
        deps.focusCanvas();
        return;
      }
      const anchor = deps.C.P(bounds.minX, bounds.minY),
        point = (p) => deps.C.add(anchor, deps.C.mul(deps.C.sub(p, anchor), factor));
      const next = deps.model.items.map((item) => {
        if (!ids.has(item.id)) return item;
        if (item.type === "circle") {
          const r = item.r * factor;
          if (r <= 0.001)
            throw Error("После масштабирования радиус окружности должен быть больше 0,001 мм.");
          return { ...item, c: point(item.c), r };
        }
        const out = { ...item, a: point(item.a), b: point(item.b) };
        if (item.type === "arc") out.m = point(item.m);
        return out;
      });
      const dimensions = deps.model.dimensions.map((dim) => {
        const both = all || deps.model.selectedDims.includes(dim.id),
          aMove = both || ids.has(dim.aItem || deps.attachmentAt(dim.a)),
          bMove = both || ids.has(dim.bItem || deps.attachmentAt(dim.b));
        if (!aMove && !bMove) return dim;
        const a = aMove ? point(dim.a) : dim.a,
          b = bMove ? point(dim.b) : dim.b;
        return {
          ...dim,
          a,
          b,
          h: aMove && bMove ? (dim.h || 0) * factor : dim.h,
          length: deps.C.dist(a, b),
          dx: b.x - a.x,
          dy: b.y - a.y,
        };
      });
      if (
        dimensions.some(
          (dim) =>
            !deps.validBoxPoint(dim.a) ||
            !deps.validBoxPoint(dim.b) ||
            !Number.isFinite(dim.h || 0),
        )
      )
        throw Error("Размеры после масштабирования выходят за пределы эскиза.");
      deps.commit(next, true, { dimensions, node: false });
      if (deps.model.selectedIds.length === 1)
        deps.select(deps.model.items.find((item) => item.id === deps.model.selected));
      deps.focusCanvas();
      deps.toast(
        "Новый габарит " +
          (bounds.w * factor).toFixed(3) +
          " × " +
          (bounds.h * factor).toFixed(3) +
          " мм. Пересчитай траекторию.",
      );
    } catch (e) {
      deps.toast(e.message);
    }
  }
  return { closeScale, scaleSummary, openScale, applyScale };
}
