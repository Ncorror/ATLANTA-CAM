/**
 * geometry-tools controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.A
 * @param {*} deps.anchorFields
 * @param {*} deps.applyDraft
 * @param {*} deps.attachmentAt
 * @param {*} deps.B
 * @param {*} deps.C
 * @param {*} deps.checkpoint
 * @param {*} deps.circleCaption
 * @param {*} deps.circleMode
 * @param {*} deps.clearDraft
 * @param {*} deps.clearPending
 * @param {*} deps.commit
 * @param {*} deps.cursor (read/write)
 * @param {*} deps.D
 * @param {*} deps.endBox
 * @param {*} deps.endSelection
 * @param {*} deps.env
 * @param {*} deps.fieldNames
 * @param {*} deps.fillCircleFields
 * @param {*} deps.focusCanvas
 * @param {*} deps.G
 * @param {*} deps.guideReferenceAt
 * @param {*} deps.guideSnap
 * @param {*} deps.hitDimension
 * @param {*} deps.id
 * @param {*} deps.model
 * @param {*} deps.moveBox
 * @param {*} deps.N
 * @param {*} deps.newGeometry
 * @param {*} deps.parseMath
 * @param {*} deps.paste
 * @param {*} deps.pendingCut (read/write)
 * @param {*} deps.pickAnchor
 * @param {*} deps.pickGuideReference
 * @param {*} deps.placePaste
 * @param {*} deps.render
 * @param {*} deps.renderDraft
 * @param {*} deps.S
 * @param {*} deps.select
 * @param {*} deps.setSelection
 * @param {*} deps.startBox
 * @param {*} deps.startSelection
 * @param {*} deps.toast
 */
export function createGeometryTools(deps) {
  function submit() {
    if (deps.model.waitingForNew) {
      deps.toast("Нажми «Новый эскиз».");
      return;
    }
    if (
      (deps.model.items || []).some(
        (item) => item.id === deps.model.selected && item.guide === true,
      )
    ) {
      deps.toast(
        "Бесконечная направляющая не становится контуром. Для рабочего отрезка выбери «Линия».",
      );
      return;
    }
    try {
      const type = deps.$("sketchType").value,
        val = (key) => {
          const el = deps.$("sketch_" + key);
          if (!el.value.trim()) throw Error("Заполни поле «" + deps.fieldNames[key] + "».");
          return deps.parseMath(el.value, deps.fieldNames[key] || key);
        },
        pt = (x, y) => deps.C.P(val(x), val(y));
      let item, added;
      if (type === "line")
        item =
          deps.$("sketchLineMode").value === "polar"
            ? deps.S.lineWithLengthAngle(pt("ax", "ay"), val("length"), val("angle"))
            : { type, a: pt("ax", "ay"), b: pt("bx", "by") };
      else if (type === "arc")
        item = {
          type,
          a: pt("ax", "ay"),
          m: pt("mx", "my"),
          b: pt("bx", "by"),
        };
      else if (type === "circle")
        item = {
          type,
          c: pt("cx", "cy"),
          r: deps.D.circleRadius(deps.$("sketch_dia").value, deps.circleMode),
        };
      else {
        const a = pt("ax", "ay"),
          w = val("w"),
          h = val("h");
        if (w <= 0.001 || h <= 0.001) throw Error("Ширина и высота должны быть больше 0,001 мм.");
        added = deps.S.rectangle(a, deps.C.P(a.x + w, a.y + h), deps.id());
      }
      if (deps.model.selected) {
        deps.clearPending();
        if (!item) throw Error("Для замены выбери линию, дугу или окружность.");
        deps.commit(
          deps.S.replace(
            deps.model.items,
            deps.model.selected,
            item,
            deps.$("sketchLinked").checked,
          ),
          true,
        );
        deps.select(deps.model.items.find((p) => p.id === deps.model.selected));
        deps.toast("Размеры применены");
      } else {
        if (item) added = [{ ...item, id: deps.id() }];
        deps.commit(
          [...deps.model.items, ...added.map(deps.newGeometry)],
          !deps.model.items.length,
        );
        if (type === "line") {
          const start = deps.model.chainStart || item.a;
          deps.model.tool = "line";
          deps.model.pending = [{ ...item.b }];
          deps.model.chainStart = { ...start };
          deps.model.lastDirection = deps.D.endDirection(item);
          deps.model.mouse = null;
          deps.clearDraft();
          deps.anchorFields(item.b);
        } else deps.clearPending();
        if (type === "circle") deps.fillCircleFields(item);
        deps.render();
        deps.focusCanvas();
        deps.env.save();
        deps.toast(
          type === "circle" ? "Окружность " + deps.circleCaption(item.r) : "Элемент добавлен",
        );
      }
    } catch (e) {
      deps.toast(e.message);
    }
  }

  function snapped(p, shift, zoom) {
    if (!deps.$("sketchSnap").checked) {
      const a = deps.model.pending.at(-1),
        q = { ...p };
      if (shift && deps.model.tool === "line" && a) {
        if (Math.abs(q.x - a.x) > Math.abs(q.y - a.y)) q.y = a.y;
        else q.x = a.x;
      }
      return { p: q, kind: "" };
    }
    const step = Number(deps.$("sketchStep").value);
    return (deps.N ? deps.N.snap : deps.B.snap)(
      deps.N ? deps.model.snapContext : deps.model.index,
      p,
      step > 0 ? step : 0,
      10 / zoom,
      deps.model.chainStart ? [deps.model.chainStart, ...deps.model.pending] : deps.model.pending,
      shift && deps.model.tool === "line",
    );
  }

  function rulerSnap(p, shift, zoom) {
    const base = snapped(p, shift, zoom);
    if (base.kind) return base;
    if (deps.model.pending.length === 1) {
      const a = deps.model.pending[0];
      let bestProj = null,
        minD = 12 / zoom;
      for (const item of deps.model.items || []) {
        if (item.type === "line" && !deps.C.isGuide(item)) {
          const proj = deps.G.projection(item, a);
          if (deps.C.pSegDist(proj, deps.C.line(item.a, item.b)) < 0.001) {
            const d = deps.C.dist(p, proj);
            if (d < minD) {
              minD = d;
              bestProj = proj;
            }
          }
        }
      }
      if (bestProj) return { p: bestProj, kind: "Перпендикуляр" };
    }
    return base;
  }

  function radius() {
    const value = deps.parseMath(deps.$("sketchRadius").value, "Радиус R");
    if (value <= 0) throw Error("Введи положительный радиус R в миллиметрах.");
    return value;
  }

  function chamferSize() {
    const value = deps.parseMath(deps.$("sketchChamfer").value, "Фаска C");
    if (value <= 0.001) throw Error("Размер фаски C должен быть больше 0,001 мм.");
    return value;
  }

  function cornerPieces(target, p, forCommit = false) {
    const first = deps.model.firstFillet;
    if (!first || first.id === target.id)
      throw Error("Выбери две разные прямые и щёлкни внутри нужных участков.");
    let local, byId;
    if (forCommit)
      local = deps.B.autoNode
        ? deps.B.autoNode(deps.model.items, deps.id, { changedIds: [first.id, target.id] })
        : deps.model.items;
    else {
      const cache = first.cornerCache;
      if (cache && cache.source === deps.model.items && cache.targetId === target.id) {
        local = cache.items;
        byId = cache.byId;
      } else {
        let number = 1;
        const used = new Set(
            [...deps.model.items, ...deps.model.dimensions].map((item) => item.id),
          ),
          temporaryId = () => {
            let value;
            do {
              value = "__corner_preview_" + number++;
            } while (used.has(value));
            used.add(value);
            return value;
          };
        local = deps.B.autoNode
          ? deps.B.autoNode(deps.model.items, temporaryId, {
              changedIds: [first.id, target.id],
            })
          : deps.model.items;
        byId = new Map(local.map((item) => [item.id, item]));
        first.cornerCache = {
          source: deps.model.items,
          targetId: target.id,
          items: local,
          byId,
        };
      }
    }
    if (!byId) byId = new Map(local.map((item) => [item.id, item]));
    function picked(sourceId, point) {
      const mapped = (local.sourceMap && local.sourceMap.get(sourceId)) || [sourceId];
      let best = null,
        distance = Infinity,
        tied = false;
      for (const value of mapped) {
        const item = byId.get(value);
        if (!item || item.type !== "line" || item.guide === true) continue;
        const d = deps.C.pSegDist(point, deps.C.line(item.a, item.b));
        if (d < distance - 1e-8) {
          best = item;
          distance = d;
          tied = false;
        } else if (Math.abs(d - distance) < 1e-8) tied = true;
      }
      if (!best || tied) throw Error("Щёлкни внутри нужного участка прямой, вдали от узла.");
      return best;
    }
    const a = picked(first.id, first.p),
      b = picked(target.id, p);
    if (!deps.B.intersections(a, b).length)
      throw Error("Выбранные конечные участки не соприкасаются. Выбери две стороны одного угла.");
    return { items: local, first: a, second: b };
  }

  function construct(p, zoom) {
    const target = deps.model.index.hit(p, 10 / zoom, (item) => item.guide !== true);
    if (!target)
      throw Error(
        "Щёлкни по отрезку, дуге или окружности. Бесконечные направляющие не обрезаются и не скругляются.",
      );
    if (deps.model.tool === "fillet" || deps.model.tool === "chamfer") {
      const bevel = deps.model.tool === "chamfer";
      if (target.type !== "line")
        throw Error(
          (bevel ? "Фаска C" : "Скругление R") +
            " соединяет две прямые. Для дуги или окружности используй «Обрезать».",
        );
      const size = bevel ? chamferSize() : radius();
      if (!deps.model.firstFillet) {
        deps.model.firstFillet = { id: target.id, p: { ...p } };
        deps.setSelection([target.id]);
        deps.model.mouse = null;
        deps.render();
        return;
      }
      const before = deps.checkpoint(),
        local = cornerPieces(target, p, true),
        r = (bevel ? deps.B.chamfer : deps.B.fillet)(
          local.items,
          local.first.id,
          local.second.id,
          size,
          deps.id(),
          deps.model.firstFillet.p,
          p,
        );
      if (local.items.sourceMap)
        Object.defineProperty(r.items, "sourceMap", {
          value: local.items.sourceMap,
          enumerable: false,
        });
      deps.commit(r.items, false, {
        before,
        node: false,
        selectedIds: [(bevel ? r.chamfer : r.arc).id],
      });
      deps.clearPending();
      deps.render();
      deps.env.save();
      deps.toast(
        (bevel ? "Фаска C" : "Скругление R") +
          size +
          (bevel ? " создана. Концы линий обрезаны." : " создано. Концы линий обрезаны."),
      );
    } else if (deps.model.tool === "trim") {
      const r = deps.B.trim(deps.model.items, target.id, p, deps.id, deps.model.index);
      deps.clearPending();
      deps.setSelection([]);
      deps.commit(r.items, false, { node: false });
      deps.toast("Лишний участок удалён. Остальные участки сохранены.");
    } else {
      const r = deps.B.split(deps.model.items, target.id, deps.id, deps.model.index);
      deps.clearPending();
      deps.setSelection([target.id]);
      deps.commit(r.items, false, { node: false });
      deps.toast("Элемент разделён: " + r.pieces.length + " участков.");
    }
  }

  function machiningHit(p, zoom, op) {
    const tolerance = 10 / zoom,
      edge = deps.model.index.hit(p, tolerance, (item) => deps.A.canMark(item, op));
    if (edge || op.kind !== "drill") return edge;
    let best = null,
      nearest = tolerance;
    for (const entry of deps.model.planPaths)
      if (entry.item.type === "circle") {
        const distance = deps.C.dist(p, entry.item.c);
        if (distance < nearest) {
          nearest = distance;
          best = entry.item;
        }
      }
    return best;
  }

  function click(p, shift, zoom) {
    if (!deps.model.isOpen) return;
    deps.pendingCut = null;
    if (deps.model.waitingForNew) {
      deps.toast("Нажми «Новый эскиз», чтобы начать рисование.");
      return;
    }
    try {
      deps.cursor = { ...p };
      if (deps.model.tool === "ruler") {
        if (!deps.model.pending.length) {
          const q = rulerSnap(p, shift, zoom).p;
          deps.model.pending = [q];
          deps.toast(
            "Линейка: указана точка 1 (" +
              q.x.toFixed(3) +
              "; " +
              q.y.toFixed(3) +
              "). Укажи точку 2 (второй край паза).",
          );
        } else if (deps.model.pending.length === 1) {
          const q = rulerSnap(p, shift, zoom).p;
          const len = deps.C.dist(deps.model.pending[0], q);
          if (len <= 0.001) {
            deps.toast("Точка 2 слишком близко к точке 1. Выбери другую точку.");
            return;
          }
          deps.model.pending.push(q);
          deps.toast(
            "Точка 2 выбрана (" +
              len.toFixed(3) +
              " мм). 3-й щелчок: перемести мышь выше или ниже для выноса размера.",
          );
        } else if (deps.model.pending.length === 2) {
          const a = deps.model.pending[0],
            b = deps.model.pending[1],
            L = deps.C.dist(a, b);
          const u = deps.C.P((b.x - a.x) / L, (b.y - a.y) / L),
            n = deps.C.P(-u.y, u.x);
          const h = (p.x - a.x) * n.x + (p.y - a.y) * n.y;
          const dim = {
            id: deps.id(),
            a: { ...a },
            b: { ...b },
            h: h,
            length: L,
            dx: b.x - a.x,
            dy: b.y - a.y,
          };
          dim.aItem = deps.attachmentAt(a);
          dim.bItem = deps.attachmentAt(b);
          deps.commit(deps.model.items, false, {
            dimensions: [...deps.model.dimensions, dim],
            selectedIds: [],
            selectedDims: [dim.id],
            node: false,
          });
          deps.model.pending = [];
          deps.toast(
            "Размер вынесен: " +
              dim.length.toFixed(3) +
              " мм (двойной клик по числу — изменить размер).",
          );
          deps.env.save();
        }
        deps.model.mouse = null;
        deps.render();
        return;
      }
      if (deps.model.tool === "machining") {
        const op = deps.env.activeOperation(),
          target = machiningHit(p, zoom, op);
        if (!target) {
          deps.toast(
            op.kind === "drill"
              ? "Щёлкни по рабочей окружности или её центру."
              : "Отметь рабочую линию, дугу или окружность.",
          );
          return;
        }
        const marked = !deps.A.isMark(target, op);
        deps.clearPending();
        deps.commit(
          deps.model.items.map((item) =>
            item.id === target.id ? deps.A.mark(item, op, marked) : item,
          ),
          false,
          { selectedIds: [], selectedDims: [], node: false },
        );
        deps.toast(
          marked ? "Элемент добавлен в выбранную операцию." : "Отметка выбранной операции снята.",
        );
        return;
      }
      if (deps.model.tool === "erase") {
        const hitDim = deps.hitDimension(p, zoom);
        if (hitDim) {
          deps.commit(deps.model.items, false, {
            dimensions: deps.model.dimensions.filter((d) => d.id !== hitDim.id),
            selectedIds: [],
            selectedDims: [],
            node: false,
          });
          deps.toast("Справочный размер стёрт. Ctrl+Z — вернуть.");
          return;
        }
        const target = deps.model.index.hit(p, 10 / zoom);
        if (!target) {
          deps.toast("Щёлкни по элементу или размеру, который нужно стереть.");
          return;
        }
        deps.clearPending();
        deps.setSelection([]);
        deps.commit(deps.model.items.filter((item) => item.id !== target.id));
        deps.toast("Элемент стёрт. Ctrl+Z — вернуть.");
        return;
      }
      if (deps.model.tool === "guide") {
        if (!deps.model.guideReference) deps.pickGuideReference(p, zoom);
        else {
          let targetPoint = { ...p },
            snapKind = "";
          if (deps.$("sketchSnap").checked && !deps.model.draft.length.trim()) {
            const geoSnap = deps.guideSnap(deps.guideReferenceAt(p), p, zoom);
            if (geoSnap) {
              targetPoint = geoSnap.point;
              snapKind = geoSnap.kind;
            }
          }
          deps.model.mouse = {
            p: targetPoint,
            guide: targetPoint,
            kind: snapKind,
          };
          deps.applyDraft();
        }
        return;
      }
      if (deps.model.tool === "auxErase") {
        if (deps.model.box) deps.endBox(p);
        else deps.startBox(p);
        return;
      }
      if (deps.model.tool === "paste") {
        deps.paste.point = snapped(p, shift, zoom).p;
        deps.placePaste();
        return;
      }
      if (deps.pickAnchor) {
        const q = snapped(p, shift, zoom).p;
        deps.clearPending();
        deps.model.pending = [q];
        deps.model.chainStart = { ...q };
        deps.model.tool = "line";
        deps.anchorFields(q);
        deps.render();
        deps.focusCanvas();
        return;
      }
      if (deps.model.tool === "select") {
        if (deps.startSelection(p, shift, zoom)) deps.endSelection(p);
        return;
      }
      if (["fillet", "chamfer", "trim", "split"].includes(deps.model.tool)) {
        construct(p, zoom);
        return;
      }
      if (deps.model.tool === "arcRadius" && deps.model.pending.length) {
        deps.model.mouse = { ...snapped(p, shift, zoom), guide: { ...p } };
        deps.applyDraft();
        return;
      }
      if (deps.model.pending.length && deps.model.tool === "line" && deps.model.chainStart) {
        const s = snapped(p, shift, zoom);
        if (deps.C.dist(s.p, deps.model.chainStart) < 0.0005) {
          deps.clearDraft();
        }
      }
      if (
        deps.model.pending.length &&
        ((deps.model.tool === "line" &&
          (deps.model.draft.length.trim() || deps.model.draft.angle.trim())) ||
          (deps.model.tool === "circle" && deps.model.draft.radius.trim()) ||
          (deps.model.tool === "rect" &&
            (deps.model.draft.width.trim() || deps.model.draft.height.trim())))
      ) {
        deps.model.mouse = { ...snapped(p, shift, zoom), guide: { ...p } };
        deps.applyDraft();
        return;
      }
      const q = snapped(p, shift, zoom).p,
        n = deps.model.pending.length;
      if (deps.model.tool === "line") {
        if (!n) {
          deps.model.pending = [q];
          deps.model.chainStart = { ...q };
          deps.anchorFields(q);
        } else {
          const first = deps.model.pending[0],
            item = deps.newGeometry({ id: deps.id(), type: "line", a: first, b: q });
          deps.commit([...deps.model.items, item]);
          deps.model.lastDirection = deps.D.endDirection(item);
          if (deps.model.chainStart && deps.C.dist(q, deps.model.chainStart) < 0.0005)
            deps.clearPending();
          else {
            deps.model.pending = [q];
            deps.anchorFields(q);
            deps.clearDraft();
          }
        }
      } else if (!n) {
        deps.model.pending = [q];
        deps.anchorFields(q);
        const incoming = [...deps.model.items]
          .reverse()
          .find((item) => item.b && deps.C.dist(item.b, q) < 0.0005);
        deps.model.lastDirection = incoming ? deps.D.endDirection(incoming) : 0;
      } else if (deps.model.tool === "arc" && n === 1) {
        if (deps.C.dist(deps.model.pending[0], q) < 0.001)
          throw Error("Точки дуги должны различаться.");
        deps.model.pending.push(q);
      } else {
        let added;
        if (deps.model.tool === "arc")
          added = [
            {
              id: deps.id(),
              type: "arc",
              a: deps.model.pending[0],
              m: deps.model.pending[1],
              b: q,
            },
          ];
        else if (deps.model.tool === "circle")
          added = [
            {
              id: deps.id(),
              type: "circle",
              c: deps.model.pending[0],
              r: deps.C.dist(deps.model.pending[0], q),
            },
          ];
        else added = deps.S.rectangle(deps.model.pending[0], q, deps.id());
        deps.commit([...deps.model.items, ...added.map(deps.newGeometry)]);
        deps.clearPending();
      }
      deps.model.mouse = null;
      deps.render();
    } catch (e) {
      deps.toast(e.message);
    }
  }

  function move(p, shift, zoom) {
    deps.cursor = { ...p };
    if (!deps.model.isOpen || deps.model.waitingForNew || deps.model.tool === "select") return;
    if (deps.model.tool === "ruler") {
      if (deps.model.pending.length === 0) {
        deps.model.mouse = snapped(p, shift, zoom);
      } else if (deps.model.pending.length === 1) {
        deps.model.mouse = rulerSnap(p, shift, zoom);
        const p1 = deps.model.pending[0],
          p2 = deps.model.mouse.p,
          len = deps.C.dist(p1, p2);
        deps.$("draftReadout").textContent = "Линейка: L " + len.toFixed(3) + " мм · укажи точку 2";
      } else if (deps.model.pending.length === 2) {
        deps.model.mouse = { p: { ...p }, kind: "" };
        const a = deps.model.pending[0],
          b = deps.model.pending[1],
          L = deps.C.dist(a, b);
        const u = deps.C.P((b.x - a.x) / L, (b.y - a.y) / L),
          n = deps.C.P(-u.y, u.x);
        const h = (p.x - a.x) * n.x + (p.y - a.y) * n.y;
        deps.$("draftReadout").textContent =
          "Линейка: L " +
          L.toFixed(3) +
          " мм · вынос " +
          (h >= 0 ? "+" : "-") +
          Math.abs(h).toFixed(2) +
          " мм · щелчок 3 зафиксирует положение";
      }
      deps.env.draw();
      return;
    }
    if (deps.model.tool === "erase") {
      deps.model.mouse = { p: { ...p }, kind: "" };
      const hitDim = deps.hitDimension(p, zoom);
      if (hitDim) {
        deps.model.preview = {
          kind: "dim",
          dim: hitDim,
          label: "Стереть размер " + hitDim.length.toFixed(3) + " мм",
        };
        deps.env.draw();
        return;
      }
      const target = deps.model.index.hit(p, 10 / zoom);
      deps.model.preview = target ? { kind: "pick", item: target, label: "Стереть элемент" } : null;
      deps.env.draw();
      return;
    }
    if (deps.model.tool === "machining") {
      deps.model.mouse = { p: { ...p }, kind: "" };
      const op = deps.env.activeOperation(),
        target = machiningHit(p, zoom, op);
      deps.model.preview = target
        ? {
            kind: "pick",
            item: target,
            color: op.color,
            label: deps.A.isMark(target, op) ? "Снять отметку" : "Отметить для операции",
          }
        : null;
      deps.env.draw();
      return;
    }
    if (deps.model.tool === "auxErase") {
      deps.moveBox(p);
      return;
    }
    if (deps.model.tool === "guide") {
      if (deps.model.guideReference) {
        let targetPoint = { ...p },
          snapKind = "";
        if (deps.$("sketchSnap").checked && !deps.model.draft.length.trim()) {
          const geoSnap = deps.guideSnap(deps.guideReferenceAt(p), p, zoom);
          if (geoSnap) {
            targetPoint = geoSnap.point;
            snapKind = geoSnap.kind;
          }
        }
        deps.model.mouse = { p: targetPoint, guide: targetPoint, kind: snapKind };
        deps.renderDraft();
        deps.env.draw();
      }
      return;
    }
    if (deps.model.tool === "paste") {
      deps.paste.point = snapped(p, shift, zoom).p;
      deps.env.draw();
      return;
    }
    if (["fillet", "chamfer", "trim", "split"].includes(deps.model.tool)) {
      deps.model.mouse = { p: { ...p }, kind: "" };
      deps.model.preview = null;
      const target = deps.model.index.hit(p, 10 / zoom, (item) => item.guide !== true);
      if (target)
        try {
          if (
            (deps.model.tool === "fillet" || deps.model.tool === "chamfer") &&
            deps.model.firstFillet &&
            target.id !== deps.model.firstFillet.id
          ) {
            const local = cornerPieces(target, p),
              bevel = deps.model.tool === "chamfer";
            deps.model.preview = {
              kind: bevel ? "chamfer" : "fillet",
              ...(bevel ? deps.B.chamferPlan : deps.B.filletPlan)(
                local.first,
                local.second,
                bevel ? chamferSize() : radius(),
                deps.model.firstFillet.p,
                p,
              ),
            };
            if (bevel)
              deps.model.preview.cuts = [
                deps.model.preview.chamfer.a,
                deps.model.preview.chamfer.b,
              ];
          } else if (deps.model.tool === "trim")
            deps.model.preview = {
              kind: "trim",
              ...deps.B.trimPlan(target, deps.model.index.neighbours(target), p),
            };
          else if (deps.model.tool === "split")
            deps.model.preview = {
              kind: "split",
              ...deps.B.splitPlan(target, deps.model.index.neighbours(target)),
            };
        } catch (e) {}
    } else {
      deps.model.mouse = snapped(p, shift, zoom);
      deps.model.mouse.guide = { ...p };
      if (shift && deps.model.tool === "line" && deps.model.pending.length) {
        const a = deps.model.pending[0],
          q = deps.model.mouse.guide;
        if (Math.abs(q.x - a.x) > Math.abs(q.y - a.y)) q.y = a.y;
        else q.x = a.x;
      }
      deps.renderDraft();
    }
    deps.env.draw();
  }
  return {
    submit,
    snapped,
    rulerSnap,
    radius,
    chamferSize,
    cornerPieces,
    construct,
    machiningHit,
    click,
    move,
  };
}
