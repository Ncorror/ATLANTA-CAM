/**
 * rendering controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.auxiliaryPoints
 * @param {*} deps.C
 * @param {*} deps.draftResult
 * @param {*} deps.drawDimensions
 * @param {*} deps.drawReferenceMarks
 * @param {*} deps.env
 * @param {*} deps.guideScreenPoints
 * @param {*} deps.model
 * @param {*} deps.newGeometry
 * @param {*} deps.paint
 * @param {*} deps.paste
 * @param {*} deps.previewDelta
 * @param {*} deps.S
 * @param {*} deps.translated
 * @param {*} deps.translatedPaste
 */
export function createRendering(deps) {
  function drawAuxiliary(ctx, screen, zoom) {
    if (deps.model.waitingForNew) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#8a97a5";
    ctx.lineWidth = 1.3;
    ctx.setLineDash([10, 4, 2, 4]);
    for (const entry of deps.model.auxiliaryPaths) {
      const delta = deps.previewDelta(entry.item),
        display = delta ? deps.translated(entry.item, delta) : entry.item,
        guide = display.guide === true,
        points = guide ? deps.guideScreenPoints(display, screen) : entry.points;
      if (!points.length) continue;
      ctx.beginPath();
      if (guide) {
        for (let i = 0; i < points.length; i++) {
          const s = points[i];
          if (i) ctx.lineTo(s.x, s.y);
          else ctx.moveTo(s.x, s.y);
        }
      } else deps.S.traceSegments(ctx, deps.S.segments(display), screen);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw(ctx, screen, zoom, overlaysOnly = false) {
    if (deps.model.waitingForNew) return;
    if (!overlaysOnly) drawAuxiliary(ctx, screen, zoom);
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    function path(item, dash = false, colour, width, points) {
      const auxiliary = item.construction === true,
        guide = item.guide === true,
        pts = guide ? deps.guideScreenPoints(item, screen) : points || deps.auxiliaryPoints(item);
      if (!pts.length) return;
      ctx.beginPath();
      if (guide)
        pts.forEach((p, i) => {
          if (i) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        });
      else deps.S.traceSegments(ctx, deps.S.segments(item), screen);
      ctx.strokeStyle = colour || (auxiliary ? "#8a97a5" : "#267eac");
      ctx.lineWidth = width == null ? (auxiliary ? 1.3 : 3) : width;
      ctx.setLineDash(auxiliary ? [10, 4, 2, 4] : dash ? [5, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!deps.model.isOpen) {
      deps.drawDimensions(ctx, screen, zoom);
      ctx.restore();
      return;
    }
    for (const original of deps.model.items.filter((item) => {
      var _paint2;
      return (
        deps.model.selectedSet.has(item.id) &&
        !((_paint2 = deps.paint) !== null && _paint2 !== void 0 && _paint2.ids.has(item.id))
      );
    })) {
      const delta = deps.previewDelta(original),
        selected = delta ? deps.translated(original, delta) : original;
      const color = deps.env.markColor(selected, deps.env.activeOperation());
      if (color) {
        path(selected, false, "#fff", 7);
        path(selected, false, color, 4);
      } else path(selected, false, "#267eac", 3);
      for (const p of selected.guide === true
        ? []
        : selected.type === "circle"
          ? [selected.c]
          : selected.type === "arc"
            ? [selected.a, selected.m, selected.b]
            : [selected.a, selected.b]) {
        const s = screen(p);
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#267eac";
        ctx.fillRect(s.x - 4, s.y - 4, 8, 8);
        ctx.strokeRect(s.x - 4, s.y - 4, 8, 8);
      }
    }
    const points = deps.model.pending;
    let estimate = null;
    try {
      estimate = deps.draftResult();
    } catch (e) {}
    const q = ["machining", "erase"].includes(deps.model.tool)
      ? null
      : deps.model.tool === "guide"
        ? deps.model.mouse && deps.model.mouse.p
        : estimate
          ? estimate.b ||
            (estimate.item && estimate.item.b) ||
            (deps.model.mouse && deps.model.mouse.p)
          : deps.model.mouse && deps.model.mouse.p;
    if (deps.model.tool === "guide") deps.drawReferenceMarks(ctx, screen, q, estimate);
    if (estimate) {
      try {
        if (deps.model.tool === "rect")
          for (const item of deps.S.rectangle(estimate.a, estimate.b, "preview"))
            path(deps.newGeometry(item), true, "rgba(40,115,222,0.8)");
        else path(deps.newGeometry(estimate.item), true, "rgba(40,115,222,0.8)");
      } catch (e) {}
    } else if (points.length && q && deps.model.tool !== "guide" && deps.model.tool !== "ruler") {
      try {
        if (deps.model.tool === "circle") {
          if (!deps.model.draft.radius.trim())
            path(
              deps.newGeometry({
                type: "circle",
                c: points[0],
                r: deps.C.dist(points[0], q),
              }),
              true,
            );
        } else if (deps.model.tool === "rect")
          for (const item of deps.S.rectangle(points[0], q, "preview"))
            path(deps.newGeometry(item), true);
        else if (deps.model.tool === "arc" && points.length === 2)
          path(deps.newGeometry({ type: "arc", a: points[0], m: points[1], b: q }), true);
        else path(deps.newGeometry({ type: "line", a: points[0], b: q }), true);
      } catch (e) {}
    }
    if (deps.paste) {
      for (const item of deps.translatedPaste()) path(item, true, "rgba(40,115,222,0.8)");
      const a = screen(deps.paste.point);
      ctx.font = 'bold 14px Consolas, "Courier New", monospace';
      const text = "Щелчок — вставить",
        tw = ctx.measureText(text).width,
        bw = Math.round(tw + 20),
        bh = 24,
        bx = Math.round(a.x + 10),
        by = Math.round(a.y - 30),
        cx = Math.round(bx + bw / 2),
        cy = Math.round(by + bh / 2);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#155bc5";
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
      ctx.fillStyle = "#072b54";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx, cy);
    }
    const preview = deps.model.preview;
    if (preview) {
      if (preview.kind === "pick") {
        path(preview.item, true, preview.color || "#267eac", 2.5);
        if (deps.model.mouse) {
          const s = screen(deps.model.mouse.p);
          ctx.font = 'bold 14px Consolas, "Courier New", monospace';
          const text = preview.label,
            tw = ctx.measureText(text).width,
            bw = Math.round(tw + 20),
            bh = 24,
            bx = Math.round(s.x + 12),
            by = Math.round(s.y - 30),
            cx = Math.round(bx + bw / 2),
            cy = Math.round(by + bh / 2);
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = preview.color || "#267eac";
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
          ctx.fillStyle = "#072b54";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(text, cx, cy);
        }
      }
      if (preview.kind === "fillet" || preview.kind === "chamfer") {
        if (preview.first) path(preview.first, true);
        if (preview.second) path(preview.second, true);
        path(preview.kind === "chamfer" ? preview.chamfer : preview.arc, true);
      }
      if (preview.kind === "trim") path(preview.removed, false, "#d94b55");
      for (const p of preview.cuts || []) {
        const s = screen(p);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#267eac";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      }
    }
    const selectBox =
        deps.model.selection && deps.model.selection.kind === "box" && deps.model.selection.moved
          ? deps.model.selection
          : null,
      paintBox = deps.paint && deps.paint.rectangle ? deps.paint : null,
      box = paintBox || deps.model.box || selectBox;
    if (box) {
      const a = screen(box.a),
        b = screen(box.b),
        x = Math.min(a.x, b.x),
        y = Math.min(a.y, b.y),
        w = Math.abs(a.x - b.x),
        h = Math.abs(a.y - b.y);
      ctx.fillStyle = selectBox || paintBox ? "rgba(35,112,191,0.10)" : "rgba(184,69,80,0.10)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = paintBox ? paintBox.op.color : selectBox ? "#2370bf" : "#b84550";
      ctx.lineWidth = 1.5;
      ctx.setLineDash(selectBox && box.b.x >= box.a.x ? [] : [6, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
    for (const p of [...points, ...(deps.model.chainStart ? [deps.model.chainStart] : [])]) {
      const s = screen(p);
      ctx.fillStyle = "#267eac";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (q) {
      const s = screen(q);
      ctx.strokeStyle = "#267eac";
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x - 5, s.y - 5, 10, 10);
      if (
        deps.model.mouse &&
        (deps.model.mouse.kind === "Точка" ||
          deps.model.mouse.kind === "Пересечение" ||
          deps.model.mouse.kind === "Центр")
      ) {
        ctx.fillStyle = "#155bc5";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = 'bold 14px Consolas, "Courier New", monospace';
      const a = points[0],
        prefix = deps.model.mouse && deps.model.mouse.kind ? deps.model.mouse.kind + " · " : "",
        text =
          prefix +
          (estimate
            ? deps.model.tool === "guide"
              ? "Смещение " + estimate.distance.toFixed(3) + " мм"
              : deps.model.tool === "rect"
                ? estimate.width.toFixed(3) + " × " + estimate.height.toFixed(3) + " мм"
                : deps.model.tool === "line"
                  ? "L " + estimate.length.toFixed(3) + " мм · " + estimate.angle.toFixed(2) + "°"
                  : "R " +
                    estimate.radius.toFixed(3) +
                    " мм" +
                    (deps.model.tool === "arcRadius" ? " · " + estimate.turn.toFixed(2) + "°" : "")
            : a
              ? "ΔX " + (q.x - a.x).toFixed(3) + " · ΔY " + (q.y - a.y).toFixed(3)
              : q.x.toFixed(3) + "; " + q.y.toFixed(3));
      const tw = ctx.measureText(text).width,
        bw = Math.round(tw + 20),
        bh = 24,
        sx = Math.round(s.x),
        sy = Math.round(s.y),
        vw = ctx.canvas && ctx.canvas.width ? ctx.canvas.width : 2000,
        vh = ctx.canvas && ctx.canvas.height ? ctx.canvas.height : 2000;
      let bx = sx + 10,
        by = sy - 30;
      if (bx + bw > vw - 5) bx = Math.max(5, sx - bw - 10);
      if (by < 5) by = sy + 14;
      bx = Math.round(Math.max(4, Math.min(vw - bw - 4, bx)));
      by = Math.round(Math.max(4, Math.min(vh - bh - 4, by)));
      const cx = Math.round(bx + bw / 2),
        cy = Math.round(by + bh / 2);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#1967b8";
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
      ctx.fillStyle = "#072b54";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx, cy);
    }
    deps.drawDimensions(ctx, screen, zoom);
    ctx.restore();
  }
  return { drawAuxiliary, draw };
}
