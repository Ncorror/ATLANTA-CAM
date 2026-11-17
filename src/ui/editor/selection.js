/**
 * selection controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.A
 * @param {*} deps.attachmentAt
 * @param {*} deps.C
 * @param {*} deps.checkpoint
 * @param {*} deps.closeDimEditor
 * @param {*} deps.commit
 * @param {*} deps.dimMidpoint
 * @param {*} deps.env
 * @param {*} deps.finiteReferenceIds
 * @param {*} deps.focusCanvas
 * @param {*} deps.G
 * @param {*} deps.guideReferenceAt
 * @param {*} deps.hitDimension
 * @param {*} deps.markNumber
 * @param {*} deps.model
 * @param {*} deps.paint
 * @param {*} deps.pendingCut (read/write)
 * @param {*} deps.placeMarksPanel
 * @param {*} deps.referenceMarks
 * @param {*} deps.render
 * @param {*} deps.S
 * @param {*} deps.select
 * @param {*} deps.selectionIds
 * @param {*} deps.setSelection
 * @param {*} deps.toast
 * @param {*} deps.translated
 * @param {*} deps.updateSnapContext
 */
export function createSelection(deps) {
  function insideSelection(p) {
    if (!deps.model.selectedSet.size) return false;
    const selected = deps.model.items.filter(
      (item) => deps.model.selectedSet.has(item.id) && item.guide !== true,
    );
    if (!selected.length) return false;
    const bounds = deps.C.bounds(selected.flatMap(deps.S.segments));
    return p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY;
  }

  function startSelection(p, shift, zoom) {
    if (
      !deps.model.isOpen ||
      deps.model.waitingForNew ||
      deps.model.tool !== "select" ||
      !validBoxPoint(p)
    )
      return false;
    deps.pendingCut = null;
    cancelSelection();
    deps.closeDimEditor();
    const before = deps.checkpoint();
    deps.model.referenceIds = [];
    deps.updateSnapContext();
    const hit = deps.model.index.hit(p, 10 / Math.max(0.000001, zoom)),
      dim = deps.hitDimension(p, zoom),
      ids = deps.selectionIds(),
      dimHit = !hit && dim;
    const interiorDrag = !hit && !dimHit && !shift && insideSelection(p);
    deps.model.selection = {
      bindings: deps.model.dimensions.map((d) => ({
        a: d.aItem || deps.attachmentAt(d.a),
        b: d.bItem || deps.attachmentAt(d.b),
      })),
      a: { ...p },
      b: { ...p },
      zoom: zoom || 1,
      shift: !!shift,
      before,
      hitId: hit && hit.id,
      dimId: dimHit && dim.id,
      kind: hit || interiorDrag ? "drag" : dimHit ? "dimension" : "box",
      moved: false,
      delta: deps.C.P(0, 0),
    };
    if (hit) {
      if (!ids.includes(hit.id))
        deps.setSelection(
          shift ? [...ids, hit.id] : [hit.id],
          shift ? deps.model.selectedDims : [],
        );
      else if (!shift) deps.setSelection(ids, deps.model.selectedDims);
    } else if (dimHit)
      deps.setSelection(shift ? ids : [], shift ? [...deps.model.selectedDims, dim.id] : [dim.id]);
    deps.env.draw();
    return true;
  }

  function moveSelection(p, zoom) {
    const tx = deps.model.selection;
    if (!tx) return false;
    if (!validBoxPoint(p)) {
      cancelSelection();
      return false;
    }
    tx.b = { ...p };
    tx.delta = deps.C.sub(p, tx.a);
    tx.moved = tx.moved || deps.C.dist(p, tx.a) * Math.max(0.000001, zoom || tx.zoom) > 3;
    deps.env.draw();
    return true;
  }

  function selectionRect(tx) {
    return {
      minX: Math.min(tx.a.x, tx.b.x),
      maxX: Math.max(tx.a.x, tx.b.x),
      minY: Math.min(tx.a.y, tx.b.y),
      maxY: Math.max(tx.a.y, tx.b.y),
    };
  }

  function contained(item, rect) {
    if (item.guide === true) return false;
    const b = deps.C.bounds([{ segs: deps.S.segments(item) }]),
      e = 1e-8;
    return (
      b.minX >= rect.minX - e &&
      b.maxX <= rect.maxX + e &&
      b.minY >= rect.minY - e &&
      b.maxY <= rect.maxY + e
    );
  }

  function movedDimensions(ids, delta, selectedDims, bindings, labelOnly = false) {
    return deps.model.dimensions.map((dim, i) => {
      if (labelOnly && selectedDims.includes(dim.id)) {
        const length = deps.C.dist(dim.a, dim.b),
          normal = deps.C.P(-(dim.b.y - dim.a.y) / length, (dim.b.x - dim.a.x) / length);
        return { ...dim, h: (dim.h || 0) + deps.C.dot(delta, normal) };
      }
      const binding = bindings && bindings[i],
        aMove =
          selectedDims.includes(dim.id) ||
          ids.has(binding ? binding.a : dim.aItem || deps.attachmentAt(dim.a)),
        bMove =
          selectedDims.includes(dim.id) ||
          ids.has(binding ? binding.b : dim.bItem || deps.attachmentAt(dim.b));
      if (!aMove && !bMove) return dim;
      const a = aMove ? deps.C.add(dim.a, delta) : dim.a,
        b = bMove ? deps.C.add(dim.b, delta) : dim.b;
      return {
        ...dim,
        a,
        b,
        length: deps.C.dist(a, b),
        dx: b.x - a.x,
        dy: b.y - a.y,
      };
    });
  }

  function endSelection(p, inside = true) {
    const tx = deps.model.selection;
    if (!tx) return false;
    if (!validBoxPoint(p) || (!inside && tx.kind !== "drag")) {
      cancelSelection();
      return false;
    }
    moveSelection(p, tx.zoom);
    deps.model.selection = null;
    try {
      if (tx.moved && tx.kind === "box") {
        const rect = selectionRect(tx),
          crossing = tx.b.x < tx.a.x,
          ids = deps.model.items
            .filter((item) =>
              crossing ? deps.G.intersectsRect(item, rect) : contained(item, rect),
            )
            .map((item) => item.id),
          dimIds = deps.model.dimensions
            .filter((d) => {
              const a = deps.dimMidpoint(d);
              return a.x >= rect.minX && a.x <= rect.maxX && a.y >= rect.minY && a.y <= rect.maxY;
            })
            .map((d) => d.id);
        deps.setSelection(
          tx.shift ? [...tx.before.selectedIds, ...ids] : ids,
          tx.shift ? [...tx.before.selectedDims, ...dimIds] : dimIds,
        );
      } else if (tx.moved) {
        const ids = new Set(deps.selectionIds()),
          dims = movedDimensions(
            ids,
            tx.delta,
            deps.model.selectedDims,
            tx.bindings,
            tx.kind === "dimension" && !ids.size,
          );
        deps.commit(
          deps.model.items.map((item) =>
            ids.has(item.id) ? deps.translated(item, tx.delta) : item,
          ),
          !inside,
          { before: tx.before, dimensions: dims, node: false },
        );
      } else if (tx.hitId) {
        const old = tx.before.selectedIds;
        if (tx.shift && old.includes(tx.hitId))
          deps.setSelection(
            old.filter((value) => value !== tx.hitId),
            tx.before.selectedDims,
          );
        else if (!tx.shift) deps.setSelection([tx.hitId]);
        const item = deps.model.items.find((value) => value.id === deps.model.selected);
        if (item && deps.selectionIds().length === 1) deps.select(item);
      } else if (tx.kind !== "dimension" && !tx.shift) deps.setSelection([]);
      deps.render();
      deps.env.save();
      deps.focusCanvas();
      return true;
    } catch (error) {
      deps.setSelection(tx.before.selectedIds, tx.before.selectedDims);
      deps.toast(error.message);
      deps.env.draw();
      return false;
    }
  }

  function cancelSelection() {
    const tx = deps.model.selection;
    if (!tx) return false;
    deps.model.selection = null;
    deps.model.referenceIds = deps.finiteReferenceIds(tx.before.referenceIds);
    deps.setSelection(tx.before.selectedIds || [], tx.before.selectedDims || []);
    deps.env.draw();
    return true;
  }

  function previewDelta(item) {
    const tx = deps.model.selection;
    return tx && tx.moved && tx.kind === "drag" && deps.model.selectedSet.has(item.id)
      ? tx.delta
      : null;
  }

  function validBoxPoint(p) {
    return (
      p &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      Math.abs(p.x) < 1e6 &&
      Math.abs(p.y) < 1e6
    );
  }

  function startBox(p) {
    if (
      !deps.model.isOpen ||
      deps.model.waitingForNew ||
      deps.model.tool !== "auxErase" ||
      !validBoxPoint(p)
    )
      return false;
    deps.setSelection([]);
    deps.model.box = { a: { ...p }, b: { ...p } };
    deps.env.draw();
    return true;
  }

  function moveBox(p) {
    if (!deps.model.box) return false;
    if (!validBoxPoint(p)) {
      cancelBox();
      return false;
    }
    deps.model.box.b = { ...p };
    deps.env.draw();
    return true;
  }

  function cancelBox() {
    const active = !!deps.model.box;
    deps.model.box = null;
    if (active) deps.env.draw();
    return active;
  }

  function endBox(p) {
    if (!deps.model.box) return false;
    if (!validBoxPoint(p)) {
      cancelBox();
      return false;
    }
    const a = deps.model.box.a,
      rect = {
        minX: Math.min(a.x, p.x),
        maxX: Math.max(a.x, p.x),
        minY: Math.min(a.y, p.y),
        maxY: Math.max(a.y, p.y),
      };
    deps.model.box = null;
    if (rect.maxX - rect.minX <= 1e-7 || rect.maxY - rect.minY <= 1e-7) {
      deps.env.draw();
      return false;
    }
    try {
      const ids = new Set(
        deps.model.items
          .filter((item) => item.construction === true && deps.G.intersectsRect(item, rect))
          .map((item) => item.id),
      );
      if (!ids.size) {
        deps.toast("Рамка не пересекает вспомогательную геометрию.");
        deps.env.draw();
        return false;
      }
      deps.setSelection([]);
      deps.commit(deps.model.items.filter((item) => !ids.has(item.id)));
      deps.toast("Удалено вспомогательных элементов: " + ids.size + ". Ctrl+Z — вернуть.");
      return true;
    } catch (error) {
      deps.toast(error.message);
      deps.env.draw();
      return false;
    }
  }

  function guideScreenPoints(item, screen) {
    const viewport = deps.env.viewport ? deps.env.viewport() : { width: 1000, height: 700 };
    return deps.G.clipScreen(screen(item.a), screen(item.b), viewport.width, viewport.height);
  }

  function drawPlan(ctx, screen, zoom, markedOnly = false) {
    if (deps.model.waitingForNew) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    const op = deps.env.activeOperation();
    for (const { item, points } of deps.model.planPaths) {
      var _paint;
      const painted =
          (_paint = deps.paint) === null || _paint === void 0 ? void 0 : _paint.ids.has(item.id),
        removing = painted && deps.paint.rectangle && deps.A.isMark(item, deps.paint.op),
        colour = painted
          ? removing
            ? deps.env.markColor(item, op, true)
            : deps.paint.op.color
          : deps.env.markColor(item, op);
      if (markedOnly && !colour) continue;
      const delta = previewDelta(item);
      ctx.beginPath();
      deps.S.traceSegments(ctx, deps.S.segments(item), (p) =>
        screen(delta ? deps.C.add(p, delta) : p),
      );
      ctx.strokeStyle = colour || "#405870";
      ctx.lineWidth = colour ? 4 : 2.2;
      ctx.stroke();
      if (item.type === "circle" && colour && markedOnly) {
        const colors = deps.env.drillColors(item, op, removing);
        if (
          painted &&
          !removing &&
          deps.paint.op.kind === "drill" &&
          !colors.includes(deps.paint.op.color)
        )
          colors.unshift(deps.paint.op.color);
        const center = screen(delta ? deps.C.add(item.c, delta) : item.c);
        colors.slice(0, 5).forEach((color, i) => {
          ctx.beginPath();
          ctx.arc(
            center.x + (i - (Math.min(colors.length, 5) - 1) / 2) * 6,
            center.y,
            3.2,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }
    }
    ctx.restore();
  }

  function drawReferenceMarks(ctx, screen, pointer, estimate) {
    if (deps.model.tool !== "guide" || !deps.model.guideReference || !pointer) return;
    const marks = deps.referenceMarks();
    if (!marks.length) return;
    const reference = deps.guideReferenceAt(pointer),
      viewport = deps.env.viewport ? deps.env.viewport() : { width: 1000, height: 700 },
      base = screen(deps.G.projection(reference, deps.model.pending[0] || reference.a)),
      last = screen(marks[marks.length - 1].p);
    deps.placeMarksPanel(base, viewport);
    ctx.save();
    ctx.strokeStyle = "#7c9baa";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 14px Consolas, "Courier New", monospace';
    for (const mark of marks) {
      const s = screen(mark.p);
      if (s.x < 0 || s.y < 0 || s.x > viewport.width || s.y > viewport.height) continue;
      const active =
        !!estimate && Math.abs(estimate.offset - mark.offset) < 1e-8 * Math.max(1, mark.distance);
      ctx.beginPath();
      ctx.arc(s.x, s.y, active ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = active ? "#8a0010" : "#ffffff";
      ctx.strokeStyle = active ? "#8a0010" : "#1967b8";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      const text = mark.label + " " + deps.markNumber(mark.distance),
        tw = ctx.measureText(text).width,
        bw = Math.round(tw + 18),
        bh = 24,
        bx = Math.round(Math.max(3, Math.min(viewport.width - bw - 5, s.x + 8))),
        by = Math.round(Math.max(3, Math.min(viewport.height - bh - 3, s.y + 6))),
        cx = Math.round(bx + bw / 2),
        cy = Math.round(by + bh / 2);
      ctx.fillStyle = active ? "#fffde8" : "#ffffff";
      ctx.strokeStyle = active ? "#8a0010" : "#1967b8";
      ctx.lineWidth = 1.5;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 5);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(bx, by, bw, bh);
        if (ctx.strokeRect) ctx.strokeRect(bx, by, bw, bh);
      }
      ctx.fillStyle = active ? "#8a0010" : "#072b54";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx, cy);
    }
    ctx.restore();
  }
  return {
    insideSelection,
    startSelection,
    moveSelection,
    selectionRect,
    contained,
    movedDimensions,
    endSelection,
    cancelSelection,
    previewDelta,
    validBoxPoint,
    startBox,
    moveBox,
    cancelBox,
    endBox,
    guideScreenPoints,
    drawPlan,
    drawReferenceMarks,
  };
}
