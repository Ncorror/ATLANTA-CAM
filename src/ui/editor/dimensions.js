/**
 * dimensions controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.C
 * @param {*} deps.circleMode
 * @param {*} deps.cleanDimensions
 * @param {*} deps.commit
 * @param {*} deps.env
 * @param {*} deps.focusCanvas
 * @param {*} deps.model
 * @param {*} deps.movedDimensions
 * @param {*} deps.parseMath
 * @param {*} deps.S
 * @param {*} deps.selectionIds
 * @param {*} deps.setSelection
 * @param {*} deps.snapshot
 * @param {*} deps.toast
 */
export function createDimensions(deps) {
  function dimMidpoint(d) {
    const L = deps.C.dist(d.a, d.b);
    if (L < 1e-6) return d.a;
    const u = deps.C.P((d.b.x - d.a.x) / L, (d.b.y - d.a.y) / L),
      n = deps.C.P(-u.y, u.x);
    return deps.C.add(deps.C.P((d.a.x + d.b.x) / 2, (d.a.y + d.b.y) / 2), deps.C.mul(n, d.h || 0));
  }

  function hitDimension(p, zoom, screenPoint) {
    return (deps.model.dimensions || []).find((d) => {
      if (d.screenBox && screenPoint) {
        if (
          screenPoint.x >= d.screenBox.minX - 8 &&
          screenPoint.x <= d.screenBox.maxX + 8 &&
          screenPoint.y >= d.screenBox.minY - 8 &&
          screenPoint.y <= d.screenBox.maxY + 8
        )
          return true;
      }
      const L = deps.C.dist(d.a, d.b);
      if (L < 1e-6) return false;
      const u = deps.C.P((d.b.x - d.a.x) / L, (d.b.y - d.a.y) / L),
        n = deps.C.P(-u.y, u.x);
      const d1 = deps.C.add(d.a, deps.C.mul(n, d.h || 0)),
        d2 = deps.C.add(d.b, deps.C.mul(n, d.h || 0));
      const mid = deps.C.P((d1.x + d2.x) / 2, (d1.y + d2.y) / 2);
      return (
        deps.C.pSegDist(p, deps.C.line(d1, d2)) < 12 / zoom ||
        deps.C.dist(p, mid) < 18 / zoom ||
        (Math.abs(d.h) > 0.001 &&
          (deps.C.pSegDist(p, deps.C.line(d.a, d1)) < 8 / zoom ||
            deps.C.pSegDist(p, deps.C.line(d.b, d2)) < 8 / zoom))
      );
    });
  }

  function drawDimensions(ctx, screen, zoom) {
    const tx = deps.model.selection,
      dims =
        tx && tx.moved && tx.kind !== "box"
          ? deps.movedDimensions(
              deps.model.selectedSet,
              tx.delta,
              deps.model.selectedDims,
              tx.bindings,
              tx.kind === "dimension" && !deps.model.selectedSet.size,
            )
          : deps.model.dimensions || [],
      isRuler = deps.model.tool === "ruler";
    const all = [...dims];
    if (isRuler && deps.model.pending.length === 2 && deps.model.mouse) {
      const a = deps.model.pending[0],
        b = deps.model.pending[1],
        L = deps.C.dist(a, b);
      if (L > 1e-6) {
        const u = deps.C.P((b.x - a.x) / L, (b.y - a.y) / L),
          n = deps.C.P(-u.y, u.x),
          cur = deps.model.mouse.p;
        const h = (cur.x - a.x) * n.x + (cur.y - a.y) * n.y;
        all.push({ id: "__preview__", a, b, h, length: L, preview: true });
      }
    } else if (isRuler && deps.model.pending.length === 1 && deps.model.mouse) {
      all.push({
        id: "__preview__",
        a: deps.model.pending[0],
        b: deps.model.mouse.p,
        h: 0,
        length: deps.C.dist(deps.model.pending[0], deps.model.mouse.p),
        preview: true,
      });
    }
    if (!all.length) return;
    ctx.save();
    ctx.font = 'bold 14px Consolas, "Courier New", monospace';
    for (const dim of all) {
      const a = dim.a,
        b = dim.b,
        h = dim.h || 0,
        L = dim.length || deps.C.dist(a, b);
      if (L < 1e-6) continue;
      const u = deps.C.P((b.x - a.x) / L, (b.y - a.y) / L),
        n = deps.C.P(-u.y, u.x);
      const d1 = deps.C.add(a, deps.C.mul(n, h)),
        d2 = deps.C.add(b, deps.C.mul(n, h));
      const sign = h >= 0 ? 1 : -1,
        overshoot = Math.min(3, Math.max(1, Math.abs(h) * 0.2 || 2));
      const e1 = deps.C.add(d1, deps.C.mul(n, sign * overshoot)),
        e2 = deps.C.add(d2, deps.C.mul(n, sign * overshoot));
      const sa = screen(a),
        sb = screen(b),
        sd1 = screen(d1),
        sd2 = screen(d2),
        se1 = screen(e1),
        se2 = screen(e2);
      const sm = screen(deps.C.P((d1.x + d2.x) / 2, (d1.y + d2.y) / 2));
      const dx = sd2.x - sd1.x,
        dy = sd2.y - sd1.y,
        slen = Math.hypot(dx, dy);
      if (slen < 1) continue;
      const sux = dx / slen,
        suy = dy / slen,
        snx = -suy,
        sny = sux;
      const isSelected =
          deps.model.selectedDims.includes(dim.id) || dim.id === deps.model.selectedDim,
        isHoverEraser =
          deps.model.preview &&
          deps.model.preview.kind === "dim" &&
          deps.model.preview.dim.id === dim.id;
      const col = isHoverEraser
        ? "#d94b55"
        : dim.preview
          ? "#2873de"
          : isSelected
            ? "#d52b3e"
            : "#155396";
      if (Math.abs(h) > 0.001) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(se1.x, se1.y);
        ctx.moveTo(sb.x, sb.y);
        ctx.lineTo(se2.x, se2.y);
        ctx.stroke();
      } else {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(sd1.x - snx * 7, sd1.y - sny * 7);
        ctx.lineTo(sd1.x + snx * 7, sd1.y + sny * 7);
        ctx.moveTo(sd2.x - snx * 7, sd2.y - sny * 7);
        ctx.lineTo(sd2.x + snx * 7, sd2.y + sny * 7);
        ctx.stroke();
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = isSelected ? 1.8 : 1.3;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(sd1.x, sd1.y);
      ctx.lineTo(sd2.x, sd2.y);
      ctx.stroke();
      const arrowLen = Math.min(10, Math.max(5, slen / 3)),
        arrowW = 3.5;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(sd1.x, sd1.y);
      ctx.lineTo(sd1.x + sux * arrowLen + snx * arrowW, sd1.y + suy * arrowLen + sny * arrowW);
      ctx.lineTo(sd1.x + sux * arrowLen - snx * arrowW, sd1.y + suy * arrowLen - sny * arrowW);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sd2.x, sd2.y);
      ctx.lineTo(sd2.x - sux * arrowLen + snx * arrowW, sd2.y - suy * arrowLen + sny * arrowW);
      ctx.lineTo(sd2.x - sux * arrowLen - snx * arrowW, sd2.y - suy * arrowLen - sny * arrowW);
      ctx.closePath();
      ctx.fill();
      const text = L.toFixed(3) + " мм",
        tw = ctx.measureText(text).width,
        bw = Math.round(tw + 20),
        bh = 24,
        cx = Math.round(sm.x),
        cy = Math.round(sm.y),
        bx = Math.round(cx - bw / 2),
        by = Math.round(cy - bh / 2);
      if (!dim.preview)
        dim.screenBox = {
          minX: bx,
          maxX: bx + bw,
          minY: by,
          maxY: by + bh,
          cx,
          cy,
        };
      ctx.fillStyle = isSelected ? "#fffde8" : "#ffffff";
      ctx.strokeStyle = col;
      ctx.lineWidth = isSelected ? 2 : 1.4;
      ctx.beginPath();
      const rad = 4;
      ctx.moveTo(bx + rad, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, rad);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, rad);
      ctx.arcTo(bx, by + bh, bx, by, rad);
      ctx.arcTo(bx, by, bx + bw, by, rad);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isHoverEraser ? "#b00010" : isSelected ? "#8a0010" : "#072b54";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx, cy);
    }
    ctx.restore();
  }

  function openDimEditor(dim) {
    deps.model.activeDim = dim;
    deps.setSelection([], [dim.id]);
    const popup = deps.$("dimEditor");
    if (!popup) return;
    const input = deps.$("dimEditorInput");
    if (input) input.value = dim.length.toFixed(3);
    popup.hidden = false;
    const box = dim.screenBox || { cx: 200, cy: 150 };
    const wrap = deps.$("canvasWrap") || document.body;
    const r = wrap.getBoundingClientRect
      ? wrap.getBoundingClientRect()
      : { width: 1000, height: 700 };
    const left = Math.max(10, Math.min(r.width - 250, box.cx - 120));
    const top = Math.max(45, Math.min(r.height - 180, box.cy - 70));
    if (popup.style) {
      popup.style.left = left + "px";
      popup.style.top = top + "px";
    }
    if (input)
      try {
        input.focus();
        input.select();
      } catch (e) {}
    deps.env.draw();
  }

  function applyDimEdit() {
    const popup = deps.$("dimEditor");
    if (!popup || !deps.model.activeDim) return;
    const original = deps.model.activeDim,
      dim = deps.S.clone(original),
      input = deps.$("dimEditorInput");
    let val;
    try {
      val = deps.parseMath(input.value || "", "Размер");
    } catch (err) {
      deps.toast("Введи положительный размер в мм.");
      return;
    }
    if (!Number.isFinite(val) || val <= 0.001 || val > 1e6) {
      deps.toast("Введи положительный размер в мм.");
      return;
    }
    const dirRadio = popup.querySelector
      ? popup.querySelector('input[name="dimDir"]:checked')
      : null;
    const dir = dirRadio ? dirRadio.value : "p2";
    try {
      const nextItems = deps.S.expandDimension(deps.model.items, dim.a, dim.b, val, dir);
      const oldLen = deps.C.dist(dim.a, dim.b),
        delta = val - oldLen;
      const u = deps.C.P((dim.b.x - dim.a.x) / oldLen, (dim.b.y - dim.a.y) / oldLen);
      if (dir === "p2") dim.b = deps.C.add(dim.b, deps.C.mul(u, delta));
      else if (dir === "p1") dim.a = deps.C.add(dim.a, deps.C.mul(u, -delta));
      else if (dir === "center") {
        dim.b = deps.C.add(dim.b, deps.C.mul(u, delta / 2));
        dim.a = deps.C.add(dim.a, deps.C.mul(u, -delta / 2));
      }
      dim.length = val;
      dim.dx = dim.b.x - dim.a.x;
      dim.dy = dim.b.y - dim.a.y;
      deps.commit(nextItems, false, {
        dimensions: deps.model.dimensions.map((value) => (value.id === dim.id ? dim : value)),
        node: false,
      });
      deps.toast("Размер изменён: " + val.toFixed(3) + " мм. Геометрия расширена.");
      deps.focusCanvas();
    } catch (err) {
      deps.toast(err.message || "Ошибка изменения размера.");
    }
  }

  function dblclick(p, screenPoint, zoom) {
    if (!deps.model.isOpen) return;
    const dims = deps.model.dimensions || [];
    const hit = dims.find((d) => {
      if (d.screenBox && screenPoint)
        return (
          screenPoint.x >= d.screenBox.minX - 8 &&
          screenPoint.x <= d.screenBox.maxX + 8 &&
          screenPoint.y >= d.screenBox.minY - 8 &&
          screenPoint.y <= d.screenBox.maxY + 8
        );
      return deps.C.dist(p, dimMidpoint(d)) < 18 / zoom;
    });
    if (hit) openDimEditor(hit);
  }

  function serialize() {
    return deps.model.items && !deps.model.waitingForNew
      ? {
          items: deps.snapshot(),
          dimensions: deps.cleanDimensions(deps.model.dimensions),
          selectedIds: deps.selectionIds(),
          referenceIds: deps.model.referenceIds.slice(),
          selectedDims: deps.model.selectedDims.slice(),
          open: deps.model.isOpen,
          tool: deps.model.tool === "paste" ? "select" : deps.model.tool,
          constructionMode: deps.model.constructionMode,
          guideReference: deps.S.clone(deps.model.guideReference),
          guidePointer:
            deps.model.tool === "guide" && deps.model.mouse ? { ...deps.model.mouse.p } : null,
          radius: deps.$("sketchRadius").value,
          chamfer: deps.$("sketchChamfer").value,
          circleMode: deps.circleMode,
          snap: deps.$("sketchSnap").checked,
          step: deps.$("sketchStep").value,
          pending: deps.S.clone(deps.model.pending),
          chainStart: deps.model.chainStart,
          lastDirection: deps.model.lastDirection,
          draft: { ...deps.model.draft },
        }
      : null;
  }
  return {
    dimMidpoint,
    hitDimension,
    drawDimensions,
    openDimEditor,
    applyDimEdit,
    dblclick,
    serialize,
  };
}
