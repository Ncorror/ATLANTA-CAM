/**
 * entry-controller controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.activeResult
 * @param {*} deps.activeViewPlane
 * @param {*} deps.ATLANTA_OPERATIONS
 * @param {*} deps.C
 * @param {*} deps.calculate
 * @param {*} deps.config
 * @param {*} deps.contourSignature
 * @param {*} deps.CONTROLLER
 * @param {*} deps.dirtyDxf
 * @param {*} deps.editor
 * @param {*} deps.ENTRY
 * @param {*} deps.entryPresentation (read/write)
 * @param {*} deps.geometryIssues
 * @param {*} deps.GUIDES
 * @param {*} deps.machine
 * @param {*} deps.originEffective
 * @param {*} deps.renderContours
 * @param {*} deps.slotAxisCache (read/write)
 * @param {*} deps.state
 * @param {*} deps.toast
 * @param {*} deps.updateParams
 * @param {*} deps.updatePick
 */
export function createEntryController(deps) {
  function nearest(p, centres = true) {
    let best = null,
      ds = 12 / deps.state.zoom;
    for (const c of deps.state.pick === "start" ? deps.state.contours : deps.state.planContours)
      for (const s of c.segs)
        for (const candidate of centres && s.c ? [s.a, s.b, s.c] : [s.a, s.b]) {
          const d = deps.C.dist(p, candidate);
          if (d < ds) {
            ds = d;
            best = { p: candidate, c };
          }
        }
    return best;
  }

  function nearestEntry(point) {
    let best = null;
    const snapLimit = Math.min(5, 14 / Math.max(0.001, deps.state.zoom));
    const lineLimit = 14 / Math.max(0.001, deps.state.zoom);
    const enabledContours = (deps.state.contours || []).filter(
      (c) => c.enabled && c.segs && c.segs.length > 0,
    );
    let bestStart = null;
    let minStartDist = snapLimit;
    enabledContours.forEach((contour, idx) => {
      const startPt = contour.segs[0].a;
      const d = deps.C.dist(point, startPt);
      if (d < minStartDist) {
        minStartDist = d;
        bestStart = {
          p: { x: startPt.x, y: startPt.y },
          id: contour.id,
          contour: contour,
          index: idx + 1,
          kind: "startPoint",
        };
      }
      if (!contour.closed && contour.segs.length > 0) {
        const endPt = contour.segs[contour.segs.length - 1].b;
        const de = deps.C.dist(point, endPt);
        if (de < minStartDist) {
          minStartDist = de;
          bestStart = {
            p: { x: endPt.x, y: endPt.y },
            id: contour.id,
            contour: contour,
            index: idx + 1,
            kind: "endPoint",
          };
        }
      }
    });
    const issues = deps.geometryIssues();
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      if (!issue || !issue.point) continue;
      const d = deps.C.dist(point, issue.point);
      if (d < minStartDist) {
        minStartDist = d;
        let matchId = deps.state.active || (enabledContours[0] && enabledContours[0].id);
        for (let j = 0; j < enabledContours.length; j++) {
          const c = enabledContours[j];
          for (let k = 0; k < c.segs.length; k++) {
            if (deps.C.pSegDist(issue.point, c.segs[k]) < 1e-4) {
              matchId = c.id;
              break;
            }
          }
        }
        bestStart = {
          p: { x: issue.point.x, y: issue.point.y },
          id: matchId,
          index: issue.id,
          kind: "issuePoint",
        };
      }
    }
    if (bestStart) return bestStart;
    let bestVertex = null;
    let minVertexDist = Math.min(3.5, 10 / Math.max(0.001, deps.state.zoom));
    for (let j = 0; j < enabledContours.length; j++) {
      const contour = enabledContours[j];
      for (let k = 0; k < contour.segs.length; k++) {
        const s = contour.segs[k];
        const pts = [s.a, s.b];
        for (let m = 0; m < pts.length; m++) {
          const pt = pts[m];
          const d = deps.C.dist(point, pt);
          if (d < minVertexDist) {
            minVertexDist = d;
            bestVertex = {
              p: { x: pt.x, y: pt.y },
              id: contour.id,
              contour: contour,
              kind: "vertex",
            };
          }
        }
      }
    }
    if (bestVertex) return bestVertex;
    let limit = lineLimit;
    function probe(path, id) {
      const hit = deps.ENTRY.nearest(path, point);
      if (hit && hit.distance < limit) {
        limit = hit.distance;
        best = { p: hit.p, id: id, kind: "segment" };
      }
    }
    for (let j = 0; j < enabledContours.length; j++)
      probe(enabledContours[j].segs, enabledContours[j].id);
    return best;
  }

  function snapOrigin(p, customTolerance) {
    const tolerance = customTolerance || 14 / Math.max(0.001, deps.state.zoom);
    const entities = [];
    if (deps.editor && Array.isArray(deps.editor.items)) {
      for (const item of deps.editor.items) entities.push(item);
    }
    if (deps.state.planContours && deps.state.planContours.length > 0) {
      const hasPlanItems = entities.some((e) => !deps.C.isConstruction(e));
      if (!hasPlanItems) {
        for (const c of deps.state.planContours) {
          for (const s of c.segs) {
            if (s.type === "A") {
              entities.push({
                type: "arc",
                a: s.a,
                b: s.b,
                c: s.c,
                sw: s.sw,
                m: deps.C.point(s, 0.5),
              });
            } else {
              entities.push({ type: "line", a: s.a, b: s.b });
            }
          }
        }
      }
    }
    if (!entities.length) return null;
    const clean = (n) =>
      Math.abs(n) < 1e-9 ? 0 : Math.abs(n - Math.round(n)) < 1e-7 ? Math.round(n) : +n.toFixed(6);
    const cleanP = (pt) => deps.C.P(clean(pt.x), clean(pt.y));
    const near = [];
    for (const item of entities) {
      try {
        const d = deps.GUIDES.distance(item, p);
        if (d <= tolerance) {
          let proj = null;
          if (deps.C.isGuide(item)) {
            proj = deps.GUIDES.projection(item, p);
          } else if (item.type === "line") {
            proj = deps.GUIDES.projection(item, p);
            const v = deps.C.sub(proj, item.a),
              b = deps.C.sub(item.b, item.a),
              len = deps.C.len(b);
            const t = len > 1e-9 ? Math.max(0, Math.min(1, deps.C.dot(v, b) / (len * len))) : 0;
            proj = deps.C.add(item.a, deps.C.mul(b, t));
          } else {
            const g = deps.GUIDES.circular(item);
            const diff = deps.C.sub(p, g.c);
            const dist = deps.C.len(diff);
            proj =
              dist > 1e-9
                ? deps.C.add(g.c, deps.C.mul(diff, g.r / dist))
                : deps.C.P(g.c.x + g.r, g.c.y);
          }
          near.push({ item, distance: d, proj: cleanP(proj) });
        }
      } catch (e) {}
    }
    const candidates = [];
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        try {
          const pts = deps.GUIDES.intersections(near[i].item, near[j].item);
          for (const q of pts) {
            const d = deps.C.dist(p, q);
            if (d <= tolerance) {
              candidates.push({
                p: cleanP(q),
                kind: "Пересечение",
                distance: d,
                priority: 0,
              });
            }
          }
        } catch (e) {}
      }
    }
    for (const { item } of near) {
      const pts = [];
      if (item.type === "line" && !deps.C.isGuide(item)) {
        pts.push({ p: item.a, kind: "Конец" }, { p: item.b, kind: "Конец" });
        pts.push({
          p: deps.C.P((item.a.x + item.b.x) / 2, (item.a.y + item.b.y) / 2),
          kind: "Середина",
        });
      } else if (item.type === "circle") {
        pts.push({ p: item.c, kind: "Центр" });
        for (const d of [deps.C.P(1, 0), deps.C.P(0, 1), deps.C.P(-1, 0), deps.C.P(0, -1)]) {
          pts.push({ p: deps.C.add(item.c, deps.C.mul(d, item.r)), kind: "Квадрант" });
        }
      } else if (item.type === "arc") {
        pts.push({ p: item.a, kind: "Конец" }, { p: item.b, kind: "Конец" });
        if (item.m) pts.push({ p: item.m, kind: "Середина" });
        if (item.c) pts.push({ p: item.c, kind: "Центр" });
        else {
          try {
            const g = deps.GUIDES.circular(item);
            if (g && g.c) pts.push({ p: g.c, kind: "Центр" });
          } catch (e) {}
        }
      }
      for (const cand of pts) {
        const d = deps.C.dist(p, cand.p);
        if (d <= tolerance) {
          candidates.push({
            p: cleanP(cand.p),
            kind: cand.kind,
            distance: d,
            priority: 1,
          });
        }
      }
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance);
      return candidates[0];
    }
    if (near.length > 0) {
      near.sort((a, b) => a.distance - b.distance);
      const best = near[0];
      const kind = deps.C.isGuide(best.item)
        ? "Направляющая"
        : best.item.type === "circle"
          ? "Окружность"
          : best.item.type === "arc"
            ? "Дуга"
            : "Линия";
      return { p: best.proj, kind, distance: best.distance, priority: 2 };
    }
    return null;
  }

  function updateEntryReadout() {
    var _document$activeEleme;
    const calculated = deps.activeResult();
    let candidate =
      calculated &&
      calculated.operations &&
      calculated.operations.find((item) => item.entry && item.attachment);
    deps.entryPresentation = candidate || null;
    const circularCycle = deps.$("g12Cycle").checked || deps.$("cutSide").value === "g12";
    if (circularCycle) {
      for (const id of ["pickStart", "pickEntryStart", "pickExit", "applyEntryStart", "applyExit"])
        if (deps.$(id)) deps.$(id).disabled = true;
      deps.$("entrySummary").textContent = "G12/G13: заход и возврат в центр окружности";
      deps.$("entryStartSummary").textContent = "Начало: центр выбранного отверстия";
      deps.$("entryExitSummary").textContent = "Выход: возврат в тот же центр";
      deps.$("entryRule").textContent =
        "Траектория цикла задаётся радиусом I и корректором D/H (§3.12.5).";
      return;
    }
    if (
      !candidate &&
      deps.$("entryMode").value === "auto" &&
      deps.state.contours &&
      deps.state.contours.length
    ) {
      try {
        const autoPlan = deps.ATLANTA_OPERATIONS.planAutoEntryAndExit(
          deps.state.contours,
          deps.config(),
          deps.editor.items,
          {
            shape: deps.$("stockShape").value,
            dia: Number(deps.$("stockDia").value),
            x: Number(deps.$("stockX").value),
            y: Number(deps.$("stockY").value),
          },
        );
        if (autoPlan) {
          deps.entryPresentation = {
            attachment: autoPlan.startPoint,
            entry: autoPlan.plungePoint,
            exit: autoPlan.exitPoint,
            entryRadius: autoPlan.lead,
            programEntryRadius: autoPlan.lead,
          };
          candidate = deps.entryPresentation;
        }
      } catch (e) {}
    }
    if (!deps.entryPresentation) {
      const result = deps.activeResult();
      candidate =
        (result === null || result === void 0
          ? void 0
          : result.operations.find((item) => item.manualEntry)) ||
        (result === null || result === void 0
          ? void 0
          : result.operations.find((item) => item.entry && item.attachment));
      deps.entryPresentation =
        candidate && candidate.entry && candidate.attachment ? candidate : null;
    }
    const full =
      deps.machine === "fanuc3000c" &&
      deps.$("toolKind").value === "mill" &&
      deps.$("compMode").value === "control";
    const current =
        deps.state.contours.find((item) => item.id === deps.state.active) ||
        deps.state.contours.find((item) => item.enabled),
      side =
        (current === null || current === void 0 ? void 0 : current.side) === "auto"
          ? current.autoSide
          : current === null || current === void 0
            ? void 0
            : current.side;
    const closedControl =
      full &&
      deps.state.contours.some((item) => item.enabled && item.closed && item.side !== "on") &&
      !deps.state.contours.some((item) => item.enabled && !item.closed);
    const openControl = full && deps.state.contours.some((item) => item.enabled && !item.closed),
      fmt = (point) =>
        deps.C.planeInfo(deps.activeViewPlane).axes[0] +
        Number((point.x - deps.originEffective.x).toFixed(3)).toFixed(3) +
        " " +
        deps.C.planeInfo(deps.activeViewPlane).axes[1] +
        Number((point.y - deps.originEffective.y).toFixed(3)).toFixed(3);
    if (deps.slotAxisCache.contours !== deps.state.contours) {
      const selected = deps.state.contours.filter((item) => item.enabled);
      deps.slotAxisCache = {
        contours: deps.state.contours,
        info: selected.length === 1 ? deps.CONTROLLER.slotAxis(selected[0]) : null,
      };
    }
    const axisControl = openControl && side === "inside" && !!deps.slotAxisCache.info;
    const automatic = deps.$("entryMode").value === "auto";
    deps.$("entryManualControls").hidden = automatic;
    if (deps.$("entryAutoSettings")) deps.$("entryAutoSettings").hidden = !automatic;
    deps.$("automaticEntrySummary").hidden = !automatic;
    deps.$("automaticEntrySummary").textContent =
      candidate !== null && candidate !== void 0 && candidate.entry
        ? "Автозаход: " +
          fmt(candidate.entry) +
          (Number.isFinite(candidate.entryRadius)
            ? " · R центра " + Number(candidate.entryRadius.toFixed(3)) + " мм"
            : "")
        : "Свободная точка, подвод и касательная дуга подбираются при расчёте.";
    const boundaryEntry =
      deps.machine === "fanuc3000c" &&
      deps.$("toolKind").value === "mill" &&
      !!deps.ENTRY.boundaryBasis(current, {
        openOffsetSide: deps.$("openOffsetSide").value,
      });
    deps.$("openOffsetField").hidden =
      deps.machine !== "fanuc3000c" || !current || current.closed || side === "on";
    const openWallSec = deps.$("entryOpenWallSection");
    if (openWallSec)
      openWallSec.hidden =
        deps.machine !== "fanuc3000c" || !current || current.closed || side === "on";
    deps.$("entryRunField").hidden = !boundaryEntry;
    deps.$("resetStart").disabled =
      automatic && !deps.state.startPoint && !deps.state.entryStart && !deps.state.exitPoint;
    deps.$("resetEntryStart").disabled = !deps.state.entryStart;
    if (deps.$("resetExit")) deps.$("resetExit").disabled = !deps.state.exitPoint;
    deps.$("pickStart").disabled = false;
    deps.$("pickEntryStart").disabled = false;
    if (deps.$("pickExit")) {
      deps.$("pickExit").disabled = false;
      deps.$("pickExit").setAttribute("aria-pressed", String(deps.state.pick === "exit"));
    }
    deps.$("applyEntryStart").disabled = false;
    if (deps.$("applyExit")) deps.$("applyExit").disabled = false;
    deps.$("pickStart").setAttribute("aria-pressed", String(deps.state.pick === "start"));
    deps.$("pickEntryStart").setAttribute("aria-pressed", String(deps.state.pick === "entryStart"));
    const attachment =
      deps.state.startPoint ||
      (candidate === null || candidate === void 0 ? void 0 : candidate.attachment);
    deps.$("entrySummary").textContent = attachment
      ? "Касание: " + fmt(attachment) + (deps.state.startPoint ? " · выбрано" : " · авто")
      : "Касание: авто";
    const programmed =
      candidate === null || candidate === void 0 ? void 0 : candidate.programEntryRadius;
    if (Number.isFinite(programmed))
      deps.$("entrySummary").textContent +=
        " · R программы " + Number(programmed.toFixed(3)) + " мм";
    else if (
      Number.isFinite(candidate === null || candidate === void 0 ? void 0 : candidate.entryRadius)
    )
      deps.$("entrySummary").textContent +=
        " · R" + Number(candidate.entryRadius.toFixed(3)) + " мм";
    if (
      boundaryEntry &&
      Number.isFinite(
        candidate === null || candidate === void 0 ? void 0 : candidate.entryRadius,
      ) &&
      Number.isFinite(programmed)
    )
      deps.$("entrySummary").textContent +=
        " · R центра " + Number(candidate.entryRadius.toFixed(3)) + " мм";
    const raw = deps.state.entryStart,
      actual = candidate === null || candidate === void 0 ? void 0 : candidate.entry;
    deps.$("entryStartSummary").textContent = raw
      ? (raw.space === "program" ? "Начало в программе: " : "Начало центра фрезы: ") +
        fmt(raw) +
        (actual && raw.space === "program" ? " · с D: " + fmt(actual) : "")
      : actual
        ? "Погружение: " + fmt(actual) + " · авто"
        : "Начало: авто";
    const input =
      raw ||
      (full && side === "outside" && !boundaryEntry
        ? candidate === null || candidate === void 0
          ? void 0
          : candidate.nominalEntryStart
        : actual);
    if (
      input &&
      !["entryStartX", "entryStartY"].includes(
        (_document$activeEleme = document.activeElement) === null ||
          _document$activeEleme === void 0
          ? void 0
          : _document$activeEleme.id,
      )
    ) {
      deps.$("entryStartX").value = Number((input.x - deps.originEffective.x).toFixed(3));
      deps.$("entryStartY").value = Number((input.y - deps.originEffective.y).toFixed(3));
    }
    const exitRaw = deps.state.exitPoint,
      exitActual = candidate === null || candidate === void 0 ? void 0 : candidate.exit;
    if (deps.$("entryExitSummary")) {
      deps.$("entryExitSummary").textContent = exitRaw
        ? "Выход: " + fmt(exitRaw) + " · выбрано"
        : exitActual
          ? "Выход: " + fmt(exitActual) + " · авто"
          : "Выход: авто";
    }
    const exitInput = exitRaw || exitActual;
    var _document$activeEleme2;
    if (
      exitInput &&
      deps.$("entryExitX") &&
      deps.$("entryExitY") &&
      !["entryExitX", "entryExitY"].includes(
        (_document$activeEleme2 = document.activeElement) === null ||
          _document$activeEleme2 === void 0
          ? void 0
          : _document$activeEleme2.id,
      )
    ) {
      deps.$("entryExitX").value = Number((exitInput.x - deps.originEffective.x).toFixed(3));
      deps.$("entryExitY").value = Number((exitInput.y - deps.originEffective.y).toFixed(3));
    }
    deps.$("entryRule").textContent = boundaryEntry
      ? "Начало — центр фрезы в свободном месте. G00 на безопасной высоте, опускание, прямая и касательная дуга. Радиус дуги и длина подвода независимы."
      : axisControl
        ? "Начало — центр фрезы на оси за открытым краем. G00 на безопасной высоте, опускание, рабочий вход. Максимальный D для осевого прохода: " +
          Math.round(deps.slotAxisCache.info.radius * 1000) +
          " (" +
          deps.slotAxisCache.info.radius.toFixed(3) +
          " мм)."
        : openControl
          ? "Выбери начало и касание на начальном конце обхода. Для явного выбора стороны используй «Сторона фрезы»."
          : full && side === "outside"
            ? "Снаружи с D начало задаётся в программе. Оранжевая метка показывает фактический центр с D."
            : raw
              ? "Начало — центр фрезы. Касание — точка на стенке. Авто-R рассчитывается по этим точкам; точки не переносятся."
              : "Зелёная метка — касание. Оранжевая — погружение. Синяя — выход. Для собственного начала или выхода выбери свободное место или введи X/Y.";
    const leadMin = deps.state.startPoint || deps.state.entryStart ? ".01" : "0",
      leadRO =
        !axisControl &&
        !boundaryEntry &&
        deps.$("autoLead").checked &&
        (closedControl || !!raw || !!deps.state.startPoint);
    deps.$("lead").min = leadMin;
    deps.$("lead").readOnly = leadRO;
    if (deps.$("manualLead")) {
      deps.$("manualLead").min = leadMin;
      deps.$("manualLead").readOnly = leadRO;
    }
    if (
      leadRO &&
      Number.isFinite(
        programmed !== null && programmed !== void 0
          ? programmed
          : candidate === null || candidate === void 0
            ? void 0
            : candidate.entryRadius,
      )
    ) {
      if (deps.$("entryMode").value !== "auto" || deps.state.startPoint || deps.state.entryStart) {
        const calcR = Number(
          (programmed !== null && programmed !== void 0
            ? programmed
            : candidate.entryRadius
          ).toFixed(3),
        );
        deps.$("lead").value = calcR;
        if (deps.$("manualLead")) deps.$("manualLead").value = calcR;
      }
    }
    deps.$("leadCaption").textContent = boundaryEntry
      ? "R захода центра фрезы, мм"
      : closedControl
        ? "R захода в программе, мм"
        : "Заход / выход, мм";
    if (candidate && candidate.referenceSlot) {
      deps.$("leadCaption").textContent = "R захода в программе, мм";
      deps.$("entryRule").textContent =
        "Координаты паза и захода в программе постоянны. D изменяет только путь центра фрезы; D=0 — точно по контуру.";
    }
    deps.$("autoLeadCaption").textContent = "Авто-минимум";
  }

  function selectEntryPoint(kind, p) {
    if (!deps.state.contours.some((item) => item.enabled)) {
      deps.toast("Сначала отметь контур для обработки");
      return;
    }
    deps.$("entryMode").value = "manual";
    if (kind === "start") {
      const hit = nearestEntry(p);
      if (!hit) {
        deps.toast("Касание выбирается на стенке. Для свободной точки нажми «Погружение».");
        return;
      }
      const contour = deps.state.contours.find((item) => item.id === hit.id);
      deps.state.startPoint = {
        ...hit.p,
        contourId: hit.id,
        signature: deps.contourSignature(contour),
      };
      deps.state.active = hit.id;
      if (deps.state.entryStart)
        deps.state.entryStart = {
          ...deps.state.entryStart,
          contourId: hit.id,
          signature: deps.contourSignature(contour),
        };
    } else if (kind === "exit") {
      const contour =
        deps.state.contours.find((item) => {
          var _state$startPoint;
          return (
            item.id ===
            ((_state$startPoint = deps.state.startPoint) === null || _state$startPoint === void 0
              ? void 0
              : _state$startPoint.contourId)
          );
        }) ||
        deps.state.contours.find((item) => item.id === deps.state.active && item.enabled) ||
        deps.state.contours.find((item) => item.enabled);
      deps.state.exitPoint = {
        x: p.x,
        y: p.y,
        contourId: contour ? contour.id : null,
        signature: contour ? deps.contourSignature(contour) : null,
      };
      if (contour) deps.state.active = contour.id;
    } else {
      const contour =
        deps.state.contours.find((item) => {
          var _state$startPoint;
          return (
            item.id ===
            ((_state$startPoint = deps.state.startPoint) === null || _state$startPoint === void 0
              ? void 0
              : _state$startPoint.contourId)
          );
        }) ||
        deps.state.contours.find((item) => item.id === deps.state.active && item.enabled) ||
        deps.state.contours.find((item) => item.enabled);
      const side = contour.side === "auto" ? contour.autoSide : contour.side;
      const boundaryEntry = !!deps.ENTRY.boundaryBasis(contour, {
        openOffsetSide: deps.$("openOffsetSide").value,
      });
      const space =
        deps.machine === "fanuc3000c" &&
        deps.$("compMode").value === "control" &&
        side === "outside" &&
        !boundaryEntry
          ? "program"
          : "tool";
      deps.state.entryStart = {
        x: p.x,
        y: p.y,
        contourId: contour.id,
        signature: deps.contourSignature(contour),
        space,
      };
      deps.state.active = contour.id;
    }
    deps.state.pick = null;
    deps.dirtyDxf();
    deps.renderContours();
    deps.updateParams();
    deps.updatePick();
    deps.calculate();
  }
  return { nearest, nearestEntry, snapOrigin, updateEntryReadout, selectEntryPoint };
}
