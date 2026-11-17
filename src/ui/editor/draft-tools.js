/**
 * draft-tools controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.C
 * @param {*} deps.cachedGuideCrossings (read/write)
 * @param {*} deps.cachedGuideCrossingsItems (read/write)
 * @param {*} deps.circleCaption
 * @param {*} deps.circleLabel
 * @param {*} deps.clearDraft
 * @param {*} deps.clearPending
 * @param {*} deps.commit
 * @param {*} deps.D
 * @param {*} deps.env
 * @param {*} deps.fillCircleFields
 * @param {*} deps.focusCanvas
 * @param {*} deps.G
 * @param {*} deps.id
 * @param {*} deps.marksPanelPlacement (read/write)
 * @param {*} deps.model
 * @param {*} deps.N
 * @param {*} deps.newGeometry
 * @param {*} deps.parseMath
 * @param {*} deps.readCircleDraft
 * @param {*} deps.render
 * @param {*} deps.S
 * @param {*} deps.toast
 */
export function createDraftTools(deps) {
  function anchorFields(a) {
    for (const [key, value] of [
      ["ax", a.x],
      ["ay", a.y],
    ])
      deps.$("sketch_" + key).value = +value.toFixed(6);
  }

  function draftVisible() {
    return (
      deps.model.isOpen &&
      !deps.model.waitingForNew &&
      deps.model.pending.length > 0 &&
      ["line", "guide", "arcRadius", "circle", "rect"].includes(deps.model.tool)
    );
  }

  function guideReferenceAt(pointer) {
    const reference = deps.model.guideReference;
    if (!reference) return null;
    if (reference.kind !== "auto") return reference;
    const a = reference.a,
      vertical = Math.abs(pointer.x - a.x) >= Math.abs(pointer.y - a.y);
    return {
      type: "line",
      kind: "line",
      a: { ...a },
      b: vertical ? deps.C.P(a.x, a.y + 1) : deps.C.P(a.x + 1, a.y),
    };
  }

  function markNumber(value) {
    return String(Number(value.toFixed(6)));
  }

  function placeMarksPanel(anchor, viewport) {
    const hud = deps.$("draftPanel");
    if (!hud || !hud.style) return;
    const position = anchor
      ? (anchor.x < viewport.width / 2 ? "right" : "left") +
        "/" +
        (anchor.y > viewport.height / 2 ? "top" : "bottom")
      : "";
    if (position === deps.marksPanelPlacement) return;
    deps.marksPanelPlacement = position;
    if (!position) {
      for (const key of ["left", "right", "top", "bottom"]) hud.style[key] = "";
      return;
    }
    const side = position.split("/");
    hud.style.left = side[0] === "left" ? "14px" : "auto";
    hud.style.right = side[0] === "right" ? "14px" : "auto";
    hud.style.top = side[1] === "top" ? "56px" : "auto";
    hud.style.bottom = side[1] === "bottom" ? "62px" : "auto";
  }

  function referenceMarks() {
    if (!deps.N || !deps.model.guideReference || !deps.model.mouse) return [];
    const ref = guideReferenceAt(deps.model.mouse.p);
    return deps.N.referenceMarks(
      deps.model.snapContext,
      ref,
      deps.model.pending[0] || ref.a,
      deps.model.mouse.p,
    );
  }

  function renderToolMarks() {
    const panel = deps.$("draftToolMarks"),
      info = deps.$("draftToolMarksInfo");
    if (!panel || !info) return;
    const active = draftVisible() && deps.model.tool === "guide",
      marks = active ? referenceMarks() : [];
    panel.hidden = !active;
    info.hidden = !active;
    if (!active) {
      placeMarksPanel(null, null);
      return;
    }
    deps.$("draftToolDiameter").textContent = "Метки эскиза";
    let current = null;
    try {
      current = draftResult();
    } catch (ignore) {}
    for (let n = 1; n <= 4; n++) {
      const button = deps.$("draftToolQuarter" + n),
        mark = marks[n - 1];
      if (!button) continue;
      button.disabled = !mark;
      button.textContent = mark
        ? mark.label + " · " + markNumber(mark.distance)
        : ["¼", "½", "¾", "Край"][n - 1];
      button.title = mark
        ? mark.label +
          " геометрии = " +
          markNumber(mark.distance) +
          " мм; выбрать смещение, затем Enter"
        : "Выбери сторону прямоугольника или конечную область эскиза";
      button.setAttribute("aria-label", button.title);
      button.classList.toggle(
        "active",
        !!mark &&
          !!current &&
          Math.abs(current.offset - mark.offset) < 1e-8 * Math.max(1, mark.distance),
      );
    }
    info.textContent = deps.model.draft.length.trim()
      ? "Введённое число имеет приоритет над метками."
      : !marks.length
        ? "Метки появятся от ширины конечной геометрии."
        : deps.$("sketchSnap").checked
          ? "Середины, центр и доли ширины эскиза; мышь или кнопка."
          : "Привязка отключена. Метку можно выбрать кнопкой.";
  }

  function getGuideCrossings() {
    if (deps.cachedGuideCrossings && deps.cachedGuideCrossingsItems === deps.model.items) {
      return deps.cachedGuideCrossings;
    }
    const guides = (deps.model.items || []).filter((item) => deps.S.isGuide(item));
    const crossings = [];
    const seen = new Set();
    function addCrossing(p, sourceIds) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      if (Math.abs(p.x) > 1e6 || Math.abs(p.y) > 1e6) return;
      const key = Math.round(p.x * 1e6) + "," + Math.round(p.y * 1e6);
      if (seen.has(key)) return;
      seen.add(key);
      crossings.push({ p, sourceIds });
    }
    for (let i = 0; i < guides.length; i++) {
      for (let j = i + 1; j < guides.length; j++) {
        for (const p of deps.G.intersections(guides[i], guides[j])) {
          addCrossing(p, [guides[i].id, guides[j].id]);
        }
      }
    }
    for (const guide of guides) {
      for (const item of deps.model.items || []) {
        if (deps.S.isGuide(item)) continue;
        for (const p of deps.G.intersections(guide, item)) {
          addCrossing(p, [guide.id, item.id]);
        }
      }
    }
    deps.cachedGuideCrossings = crossings;
    deps.cachedGuideCrossingsItems = deps.model.items;
    return crossings;
  }

  function guideSnap(reference, pointer, zoom) {
    if (!pointer || !reference) return null;
    const tolerance = 8 / Math.max(0.000001, zoom);
    const d = deps.C.unit(deps.C.sub(reference.b, reference.a));
    const b = { a: reference.a, d, n: deps.C.left(d) };
    const raw = deps.C.dot(deps.C.sub(pointer, b.a), b.n);
    let best = null;
    let bestError = tolerance;
    let directHit = false;
    const crossings = getGuideCrossings();
    for (const cross of crossings) {
      const offset = deps.C.dot(deps.C.sub(cross.p, b.a), b.n);
      const diff = Math.abs(raw - offset);
      if (diff <= tolerance) {
        const alongDiff = Math.abs(deps.C.dot(deps.C.sub(pointer, cross.p), b.d));
        const isDirect = alongDiff <= tolerance;
        if (isDirect && (!directHit || alongDiff < bestError)) {
          directHit = true;
          bestError = alongDiff;
          best = {
            offset,
            kind: "Пересечение",
            sourcePoint: cross.p,
            sourceIds: cross.sourceIds,
            point: { ...cross.p },
            direct: true,
          };
        } else if (!directHit && diff < bestError) {
          bestError = diff;
          const base = deps.C.add(b.a, deps.C.mul(b.d, deps.C.dot(deps.C.sub(pointer, b.a), b.d)));
          best = {
            offset,
            kind: "Пересечение",
            sourcePoint: cross.p,
            sourceIds: cross.sourceIds,
            point: deps.C.add(base, deps.C.mul(b.n, offset)),
            direct: false,
          };
        }
      }
    }
    if (deps.N && deps.model.snapContext) {
      const geoSnap = deps.N.guideSnap(deps.model.snapContext, reference, pointer, tolerance);
      if (geoSnap) {
        if (!directHit && (!best || Math.abs(raw - geoSnap.offset) < bestError)) {
          if (
            geoSnap.sourcePoint &&
            Math.abs(deps.C.dot(deps.C.sub(pointer, geoSnap.sourcePoint), b.d)) <= tolerance
          ) {
            geoSnap.point = { ...geoSnap.sourcePoint };
          }
          best = geoSnap;
        }
      }
    }
    if (!best) return null;
    return { ...best, distance: Math.abs(best.offset) };
  }

  function pickGuideReference(p, zoom) {
    const snapP =
      deps.$("sketchSnap").checked && deps.N
        ? deps.N.snap(deps.model.snapContext, p, 0, 10 / zoom).p || p
        : p;
    const target = deps.model.index.hit(snapP, 10 / zoom, (item) => item.type === "line"),
      origin = deps.env.drawingOrigin ? deps.env.drawingOrigin() : deps.C.P(0, 0),
      nearX = Math.abs(snapP.y - origin.y) <= 10 / zoom,
      nearY = Math.abs(snapP.x - origin.x) <= 10 / zoom;
    let reference;
    if (target)
      reference = {
        type: "line",
        kind: "line",
        sourceId: target.id,
        a: { ...target.a },
        b: { ...target.b },
      };
    else if (nearX && nearY)
      reference = {
        type: "line",
        kind: "auto",
        a: { ...origin },
        b: deps.C.P(origin.x, origin.y + 1),
      };
    else if (nearY)
      reference = {
        type: "line",
        kind: "line",
        a: deps.C.P(origin.x, snapP.y),
        b: deps.C.P(origin.x, snapP.y + 1),
      };
    else if (nearX)
      reference = {
        type: "line",
        kind: "line",
        a: deps.C.P(snapP.x, origin.y),
        b: deps.C.P(snapP.x + 1, origin.y),
      };
    else
      reference = {
        type: "line",
        kind: "auto",
        a: { ...snapP },
        b: deps.C.P(snapP.x, snapP.y + 1),
      };
    deps.clearPending();
    deps.model.guideReference = reference;
    deps.model.pending = [target ? deps.G.projection(reference, snapP) : { ...reference.a }];
    deps.model.mouse = {
      p: { ...snapP },
      guide: { ...snapP },
      kind: target ? "Базовая линия" : "Базовая ось",
    };
    deps.render();
    deps.env.save();
    deps.focusCanvas();
  }

  function draftResult() {
    if (!draftVisible()) return null;
    const a = deps.model.pending[0],
      d = deps.model.draft,
      free =
        (deps.model.tool === "line" && !d.length.trim() && !d.angle.trim()) ||
        (deps.model.tool === "rect" && !d.width.trim() && !d.height.trim()),
      guide = deps.model.mouse
        ? free
          ? deps.model.mouse.p
          : deps.model.mouse.guide || deps.model.mouse.p
        : a;
    if (deps.model.tool === "guide") {
      const reference = guideReferenceAt(guide);
      if (!reference) return null;
      let baseRes = null;
      if (!d.length.trim() && deps.$("sketchSnap").checked) {
        const snap = guideSnap(reference, guide, deps.env.zoom());
        if (snap)
          baseRes = {
            ...deps.G.offset(reference, snap.point, String(snap.distance)),
            reference,
            snapPoint: snap.point,
            snapKind: snap.kind,
            referenceMark: snap.mark || null,
          };
      }
      if (!baseRes) {
        const evalLength = d.length.trim()
          ? String(Math.abs(deps.parseMath(d.length, "Смещение")))
          : "";
        baseRes = { ...deps.G.offset(reference, guide, evalLength), reference };
      }
      const dirRef = deps.C.unit(deps.C.sub(reference.b, reference.a));
      const n = deps.C.left(dirRef);
      if (d.angle.trim()) {
        const angle = deps.parseMath(d.angle, "Угол наклона"),
          rad = (angle * Math.PI) / 180,
          dir = deps.C.P(Math.cos(rad), Math.sin(rad));
        let anchor = baseRes.snapPoint ? { ...baseRes.snapPoint } : null;
        if (!anchor) {
          if (guide && Number.isFinite(guide.x) && Number.isFinite(guide.y)) {
            const baseAlong = deps.C.dot(deps.C.sub(guide, reference.a), dirRef);
            anchor = deps.C.add(
              deps.C.add(reference.a, deps.C.mul(dirRef, baseAlong)),
              deps.C.mul(n, baseRes.offset),
            );
          } else if (deps.model.pending.length) {
            anchor = deps.C.add(deps.model.pending[0], deps.C.mul(n, baseRes.offset));
          } else {
            anchor = baseRes.item.a;
          }
        }
        baseRes.item = { ...baseRes.item, a: anchor, b: deps.C.add(anchor, dir) };
        baseRes.angle = angle;
        baseRes.explicitAngle = true;
      } else {
        baseRes.angle = deps.D.direction(baseRes.item.a, baseRes.item.b);
      }
      const shiftVec = deps.C.mul(n, baseRes.offset);
      baseRes.dx = shiftVec.x;
      baseRes.dy = shiftVec.y;
      return baseRes;
    }
    if (deps.model.tool === "line") {
      const evalLength = d.length.trim() ? deps.parseMath(d.length, "Длина") : "",
        evalAngle = d.angle.trim() ? deps.parseMath(d.angle, "Угол") : "";
      return deps.D.line(
        a,
        guide,
        evalLength,
        evalAngle,
        deps.model.lastDirection,
        deps.$("sketchSnap").checked,
      );
    }
    if (deps.model.tool === "arcRadius") {
      const rText =
        d.radius.trim() || (deps.$("sketchRadius") ? deps.$("sketchRadius").value.trim() : "");
      const evalRadius = rText ? deps.parseMath(rText, "Радиус") : 0,
        evalTurn = d.turn.trim() ? deps.parseMath(d.turn, "Поворот дуги") : 90,
        evalAngle = d.angle.trim()
          ? deps.parseMath(d.angle, "Касательная")
          : deps.D.direction(a, guide, deps.model.lastDirection);
      return deps.D.arc(a, evalRadius, evalTurn, evalAngle);
    }
    if (deps.model.tool === "rect") {
      const evalWidth = d.width.trim() ? deps.parseMath(d.width, "Ширина") : "",
        evalHeight = d.height.trim() ? deps.parseMath(d.height, "Высота") : "";
      return deps.D.rectangle(a, guide, evalWidth, evalHeight);
    }
    const r = d.radius.trim() ? deps.readCircleDraft(d.radius) : deps.C.dist(a, guide);
    if (r <= 0.001) throw Error("Радиус должен быть больше 0,001 мм.");
    return { item: { type: "circle", c: { ...a }, r }, radius: r };
  }

  function renderDraft() {
    const hud = deps.$("draftPanel");
    if (!hud) return;
    hud.hidden = !draftVisible();
    renderToolMarks();
    if (hud.hidden) return;
    const arc = deps.model.tool === "arcRadius",
      circle = deps.model.tool === "circle",
      rect = deps.model.tool === "rect",
      guide = deps.model.tool === "guide",
      d = deps.model.draft;
    deps.$("draftCircleModeField").hidden = !circle;
    deps.$("draftRadiusLabel").textContent = (circle ? deps.circleLabel() : "Радиус R") + ", мм";
    deps.$("draftTitle").textContent = guide
      ? d.angle.trim()
        ? "Наклонная вспомогательная прямая"
        : "Параллельная вспомогательная прямая"
      : (deps.model.constructionMode ? "Вспомогательная · " : "") +
        (rect
          ? "Прямоугольник от первого угла"
          : circle
            ? "Окружность от центра"
            : arc
              ? "Дуга от текущего узла"
              : "От текущего узла");
    const visible = {
      length: guide || (!arc && !circle && !rect),
      radius: arc || circle,
      turn: arc,
      angle: !circle && !rect,
      width: rect,
      height: rect,
    };
    for (const key of Object.keys(visible)) {
      const stem = "draft" + key[0].toUpperCase() + key.slice(1),
        el = deps.$(stem);
      deps.$(stem + "Field").hidden = !visible[key];
      el.disabled = !visible[key];
      if (document.activeElement !== el) el.value = d[key];
    }
    if (deps.$("draftAngleLabel"))
      deps.$("draftAngleLabel").textContent = arc
        ? "Касательная, °"
        : guide
          ? "Угол наклона, °"
          : "Угол от X+, °";
    if (deps.$("draftLengthLabel"))
      deps.$("draftLengthLabel").textContent = guide ? "Смещение, мм" : "Длина, мм";
    deps.$("draftRadius").placeholder = circle ? "35/2" : String(deps.$("sketchRadius").value);
    if (deps.$("draftLength")) deps.$("draftLength").placeholder = guide ? "15+30-4" : "10.5";
    if (deps.$("draftWidth")) deps.$("draftWidth").placeholder = "40+10";
    if (deps.$("draftHeight")) deps.$("draftHeight").placeholder = "30/2";
    deps.$("draftHelp").textContent = guide
      ? "Смещение → Enter · Tab — угол наклона · Esc — сменить базу"
      : rect
        ? "Ширина → Tab → высота → Enter · сторона задаётся мышью"
        : arc
          ? "R → Tab → поворот · + против часовой, − по часовой"
          : circle
            ? "Enter — построить"
            : "Длина → Enter · Tab — угол · 0° →, 90° ↑";
    let text = rect
      ? "Введи ширину, Tab и высоту"
      : circle
        ? "Укажи размер мышью или введи выражение"
        : "Направь мышью и введи " + (arc ? "радиус" : "длину");
    try {
      const q = draftResult();
      if (q && !guide)
        text =
          (rect
            ? "Ш " + q.width.toFixed(3) + " × В " + q.height.toFixed(3)
            : arc
              ? "R " + q.radius.toFixed(3) + " · поворот " + q.turn.toFixed(2) + "°"
              : circle
                ? deps.circleCaption(q.radius)
                : "L " + q.length.toFixed(3) + " · ∠ " + q.angle.toFixed(2) + "°") +
          (!circle ? " · ΔX " + q.dx.toFixed(3) + " · ΔY " + q.dy.toFixed(3) : "");
    } catch (e) {
      if (Object.values(d).some((value) => value.trim())) text = e.message;
      if (rect)
        try {
          const w = d.width.trim(),
            h = d.height.trim();
          const nw = w ? deps.parseMath(w, "Ширина") : null,
            nh = h ? deps.parseMath(h, "Высота") : null;
          if ((!w || nw > 0.001) && (!h || nh > 0.001) && (!w || !h))
            text = w ? "Ширина " + nw + " мм · Введи высоту" : "Введи ширину, Tab и высоту";
        } catch (ignore) {}
    }
    if (guide)
      try {
        const result = draftResult();
        text = result
          ? (result.snapKind ? result.snapKind + " · " : "") +
            "Смещение " +
            result.distance.toFixed(3) +
            " мм" +
            (result.referenceMark ? " · " + result.referenceMark.label : "") +
            " · ∠ " +
            result.angle.toFixed(2) +
            "° · ΔX " +
            result.dx.toFixed(3) +
            " · ΔY " +
            result.dy.toFixed(3)
          : "Направь мышь в сторону смещения и введи расстояние";
      } catch (error) {
        text = error.message;
      }
    deps.$("draftReadout").textContent = text;
  }

  function applyDraft() {
    try {
      const q = draftResult();
      if (!q) return false;
      if (deps.model.tool === "guide") {
        if (q.distance <= 0.001 && !q.explicitAngle)
          throw Error("Смещение должно быть больше 0,001 мм.");
        deps.commit([...deps.model.items, { ...q.item, id: deps.id() }]);
        deps.model.guideReference = { ...q.reference, kind: "line" };
        deps.clearDraft();
        deps.focusCanvas();
        deps.render();
        deps.env.save();
        return true;
      }
      if (deps.model.tool === "rect") {
        deps.commit([
          ...deps.model.items,
          ...deps.S.rectangle(q.a, q.b, deps.id()).map(deps.newGeometry),
        ]);
        deps.clearPending();
        deps.focusCanvas();
        deps.render();
        deps.env.save();
        return true;
      }
      const item = deps.newGeometry({ ...q.item, id: deps.id() }),
        start = deps.model.chainStart || item.a;
      deps.commit([...deps.model.items, item]);
      if (item.type === "circle") {
        deps.fillCircleFields(item);
        deps.clearPending();
        deps.toast("Окружность " + deps.circleCaption(item.r));
      } else {
        deps.model.pending = [{ ...item.b }];
        deps.model.chainStart = start ? { ...start } : null;
        deps.model.lastDirection = deps.D.endDirection(item);
        deps.model.mouse = null;
        deps.clearDraft();
        anchorFields(item.b);
      }
      deps.focusCanvas();
      deps.render();
      deps.env.save();
      return true;
    } catch (e) {
      deps.toast(e.message);
      return false;
    }
  }
  return {
    anchorFields,
    draftVisible,
    guideReferenceAt,
    markNumber,
    placeMarksPanel,
    referenceMarks,
    renderToolMarks,
    getGuideCrossings,
    guideSnap,
    pickGuideReference,
    draftResult,
    renderDraft,
    applyDraft,
  };
}
