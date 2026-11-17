/**
 * clipboard controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.A
 * @param {*} deps.C
 * @param {*} deps.clearPending
 * @param {*} deps.click
 * @param {*} deps.clipboard (read/write)
 * @param {*} deps.commit
 * @param {*} deps.cursor
 * @param {*} deps.env
 * @param {*} deps.focusCanvas
 * @param {*} deps.id
 * @param {*} deps.model
 * @param {*} deps.paint (read/write)
 * @param {*} deps.paste (read/write)
 * @param {*} deps.pendingCut (read/write)
 * @param {*} deps.render
 * @param {*} deps.S
 * @param {*} deps.selectionIds
 * @param {*} deps.selectionRect
 * @param {*} deps.setSelection
 * @param {*} deps.toast
 * @param {*} deps.validBoxPoint
 */
export function createClipboard(deps) {
  function copy() {
    deps.pendingCut = null;
    if (deps.model.waitingForNew) return false;
    const ids = new Set(deps.selectionIds()),
      items = ids.size ? deps.model.items.filter((item) => ids.has(item.id)) : deps.model.items;
    if (!items || !items.length) {
      deps.toast("Выбери элемент для копирования.");
      return false;
    }
    const first = items[0];
    deps.clipboard = {
      items: deps.S.clone(items),
      base: { ...(first.type === "circle" ? first.c : first.a) },
    };
    deps.toast("Скопировано: " + items.length + ". Ctrl+V — поставить копию в точку.");
    return true;
  }

  function startPaste() {
    if (!deps.clipboard) {
      deps.toast("Сначала скопируй геометрию сочетанием Ctrl+C.");
      return;
    }
    deps.clearPending(true);
    deps.setSelection([]);
    deps.model.tool = "paste";
    deps.paste = {
      items: deps.S.clone(deps.clipboard.items),
      base: { ...deps.clipboard.base },
      point: deps.cursor ? { ...deps.cursor } : { ...deps.clipboard.base },
    };
    deps.render();
    deps.focusCanvas();
  }

  function translated(item, delta) {
    const copy = { ...item };
    for (const key of ["a", "b", "m", "c"]) if (copy[key]) copy[key] = deps.C.add(copy[key], delta);
    return copy;
  }

  function translatedPaste() {
    if (!deps.paste) return [];
    const delta = deps.C.sub(deps.paste.point, deps.paste.base);
    return deps.paste.items.map((item) => translated(item, delta));
  }

  function placePaste() {
    if (!deps.paste) return;
    try {
      const items = translatedPaste().map((item) => ({ ...item, id: deps.id() }));
      deps.commit([...deps.model.items, ...items], false, {
        selectedIds: items.map((item) => item.id),
        autoGuides: false,
      });
      deps.clearPending();
      deps.model.tool = "select";
      deps.render();
      deps.focusCanvas();
      deps.env.save();
      deps.toast("Вставлено: " + items.length + ". Ctrl+Z — отменить.");
    } catch (e) {
      deps.toast(e.message);
    }
  }

  function attachmentAt(p) {
    const hit = deps.model.index.hit(p, 0.001);
    return hit ? hit.id : null;
  }

  function dimensionsAfterDelete(ids) {
    return deps.model.dimensions.filter(
      (d) =>
        !deps.model.selectedDims.includes(d.id) &&
        !ids.has(d.aItem || attachmentAt(d.a)) &&
        !ids.has(d.bItem || attachmentAt(d.b)),
    );
  }

  function remove() {
    const ids = new Set(deps.selectionIds()),
      dimIds = new Set(
        deps.model.selectedDims.length
          ? deps.model.selectedDims
          : deps.model.selectedDim
            ? [deps.model.selectedDim]
            : [],
      );
    if (!ids.size && !dimIds.size) return;
    try {
      const dims = dimensionsAfterDelete(ids).filter((d) => !dimIds.has(d.id));
      deps.commit(
        deps.model.items.filter((item) => !ids.has(item.id)),
        false,
        { dimensions: dims, selectedIds: [], selectedDims: [], node: false },
      );
      deps.clearPending();
      deps.toast(ids.size ? "Удалено элементов: " + ids.size : "Справочный размер удалён.");
    } catch (error) {
      deps.toast(error.message);
    }
  }

  function cut() {
    if (!deps.selectionIds().length || !copy()) return false;
    deps.pendingCut = deps.S.clone(deps.clipboard);
    remove();
    return true;
  }

  function startPaint(p, rectangle = true) {
    if (
      !deps.model.isOpen ||
      deps.model.waitingForNew ||
      deps.model.tool !== "machining" ||
      !deps.validBoxPoint(p)
    )
      return false;
    deps.paint = {
      a: { ...p },
      b: { ...p },
      rectangle,
      previous: p,
      ids: new Set(),
      op: deps.env.activeOperation(),
    };
    return true;
  }

  function movePaint(p, zoom) {
    if (!deps.paint) return;
    if (deps.paint.rectangle) {
      if (!deps.validBoxPoint(p)) {
        cancelPaint();
        return;
      }
      deps.paint.b = { ...p };
      deps.model.preview = null;
      const box = deps.selectionRect(deps.paint),
        ids = new Set();
      if (box.maxX - box.minX > 1e-8 && box.maxY - box.minY > 1e-8)
        for (const item of deps.model.index.rectangleHits(box, deps.paint.op.kind === "drill")) {
          if (deps.A.canMark(item, deps.paint.op)) ids.add(item.id);
        }
      deps.paint.ids = ids;
      deps.env.draw();
      return;
    }
    const a = deps.paint.previous || p,
      b = p || a;
    deps.paint.previous = p;
    const count = deps.paint.ids.size,
      hover = !!deps.model.preview;
    deps.model.preview = null;
    if (a)
      for (const item of deps.model.index.sweepHits(a, b, 10 / zoom))
        if (deps.A.canMark(item, deps.paint.op) && !deps.A.isMark(item, deps.paint.op))
          deps.paint.ids.add(item.id);
    if (hover || count !== deps.paint.ids.size) deps.env.draw();
  }

  function cancelPaint() {
    if (deps.paint) {
      deps.paint = null;
      deps.env.draw();
    }
  }

  function endPaint(p, shift, zoom, dragged) {
    if (!deps.paint) return;
    if (!dragged) {
      cancelPaint();
      if (p) deps.click(p, shift, zoom);
      return;
    }
    if (deps.paint.rectangle && !deps.validBoxPoint(p)) {
      cancelPaint();
      return;
    }
    if (p) movePaint(p, zoom);
    const { ids, op, rectangle } = deps.paint;
    cancelPaint();
    if (!ids.size) return;
    try {
      deps.commit(
        deps.model.items.map((item) =>
          ids.has(item.id)
            ? deps.A.mark(item, op, rectangle ? !deps.A.isMark(item, op) : true)
            : item,
        ),
        false,
        { selectedIds: [], selectedDims: [], node: false },
      );
    } catch (e) {
      deps.toast(e.message);
    }
  }
  return {
    copy,
    startPaste,
    translated,
    translatedPaste,
    placePaste,
    attachmentAt,
    dimensionsAfterDelete,
    remove,
    cut,
    startPaint,
    movePaint,
    cancelPaint,
    endPaint,
  };
}
