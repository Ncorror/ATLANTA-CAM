/**
 * viewport-controller controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.activeOperation
 * @param {*} deps.activeResult
 * @param {*} deps.activeViewPlane
 * @param {*} deps.C
 * @param {*} deps.canvas
 * @param {*} deps.ch (read/write)
 * @param {*} deps.codeFrameLayout (read/write)
 * @param {*} deps.config
 * @param {*} deps.ctx
 * @param {*} deps.currentMotions
 * @param {*} deps.cw (read/write)
 * @param {*} deps.diagnosticMaterial
 * @param {*} deps.drawPending (read/write)
 * @param {*} deps.editor
 * @param {*} deps.entryPresentation
 * @param {*} deps.failedDiagnostic
 * @param {*} deps.focusedIssueId
 * @param {*} deps.geometryIssues
 * @param {*} deps.MATERIAL_VIEW
 * @param {*} deps.motionPoint
 * @param {*} deps.pixelScale (read/write)
 * @param {*} deps.placeCodeFrame
 * @param {*} deps.playback
 * @param {*} deps.restCache (read/write)
 * @param {*} deps.restCanvas
 * @param {*} deps.restSweepCanvas
 * @param {*} deps.sceneComp (read/write)
 * @param {*} deps.sceneDirty (read/write)
 * @param {*} deps.sceneSnapshot (read/write)
 * @param {*} deps.showCodeFrame
 * @param {*} deps.SKETCH
 * @param {*} deps.state
 * @param {*} deps.UI_RENDER
 */
export function createViewportController(deps) {
  function rawToWorld(p, z = 0, c = deps.config()) {
    return { x: p.x - c.originX, y: p.y - c.originY, z };
  }

  function project(p) {
    if (deps.state.view === "xy") return { u: p.x, v: p.y };
    const q = deps.C.planeToWorld(p, deps.activeViewPlane);
    return {
      u: (q.x - q.y) * Math.SQRT1_2,
      v: (q.x + q.y) * 0.36 - q.z * 0.75,
    };
  }

  function screen(p) {
    const q = project(p);
    return {
      x: deps.cw / 2 + (q.u - deps.state.center.u) * deps.state.zoom + deps.state.pan.x,
      y: deps.ch / 2 - (q.v - deps.state.center.v) * deps.state.zoom + deps.state.pan.y,
    };
  }

  function fromScreen(x, y) {
    return {
      x: (x - deps.cw / 2 - deps.state.pan.x) / deps.state.zoom + deps.state.center.u,
      y: -(y - deps.ch / 2 - deps.state.pan.y) / deps.state.zoom + deps.state.center.v,
    };
  }

  function fitView(firstShape = false) {
    const points = [],
      cfg = deps.config();
    if (deps.state.mode === "dxf") {
      for (const c of deps.state.planContours)
        for (const p of deps.C.flatten(c.segs, 0.1)) points.push(rawToWorld(p, 0, cfg));
      for (const item of deps.editor.items)
        if (item.construction === true && !deps.SKETCH.isGuide(item)) {
          const b = deps.C.bounds([{ segs: deps.SKETCH.segments(item) }]);
          for (const p of [
            deps.C.P(b.minX, b.minY),
            deps.C.P(b.maxX, b.minY),
            deps.C.P(b.minX, b.maxY),
            deps.C.P(b.maxX, b.maxY),
          ])
            points.push(rawToWorld(p, 0, cfg));
        }
    }
    for (const m of deps.currentMotions()) {
      points.push(m.a, m.b);
      if (m.type === "arc") for (let i = 1; i < 25; i++) points.push(deps.motionPoint(m, i / 25));
    }
    if (!points.length) points.push({ x: -20, y: -20, z: 0 }, { x: 20, y: 20, z: 0 });
    const q = points.map(project),
      b = deps.C.bounds(q.map((p) => deps.C.P(p.u, p.v)));
    deps.state.center = { u: b.cx, v: b.cy };
    if (firstShape && deps.ch > 0) {
      const h = b.h > 0.001 ? b.h : b.w > 0.001 ? b.w : 20;
      const targetZoom = (deps.ch * 0.5) / h;
      const maxZoomW = deps.cw > 100 && b.w > 0.001 ? (deps.cw - 100) / b.w : targetZoom;
      deps.state.zoom = Math.max(0.001, Math.min(targetZoom, maxZoomW));
      deps.state.pan = { x: 0, y: 0 };
    } else {
      deps.state.zoom = Math.max(
        0.001,
        Math.min((deps.cw - 100) / (b.w || 20), (deps.ch - 125) / (b.h || 20)),
      );
      deps.state.pan = { x: 0, y: 12 };
    }
    deps.state.fit = false;
  }

  function queueDraw() {
    if (deps.drawPending) return;
    deps.drawPending = true;
    requestAnimationFrame(() => {
      deps.drawPending = false;
      draw();
    });
  }

  function requestDraw() {
    deps.sceneDirty = true;
    queueDraw();
  }

  function strokePoints(points, color, width = 1, dash = []) {
    if (!points.length) return;
    deps.ctx.beginPath();
    let s = screen(points[0]);
    deps.ctx.moveTo(s.x, s.y);
    for (const p of points.slice(1)) {
      s = screen(p);
      deps.ctx.lineTo(s.x, s.y);
    }
    deps.ctx.strokeStyle = color;
    deps.ctx.lineWidth = width;
    deps.ctx.lineJoin = "round";
    deps.ctx.lineCap = "round";
    deps.ctx.setLineDash(dash);
    deps.ctx.stroke();
    deps.ctx.setLineDash([]);
  }

  function strokeSegments(segments, color, width = 1, dash = [], convert = (p) => p) {
    if (!segments.length) return;
    deps.ctx.beginPath();
    deps.SKETCH.traceSegments(deps.ctx, segments, (p) => screen(convert(p)));
    deps.ctx.strokeStyle = color;
    deps.ctx.lineWidth = width;
    deps.ctx.lineJoin = "round";
    deps.ctx.lineCap = "round";
    deps.ctx.setLineDash(dash);
    deps.ctx.stroke();
    deps.ctx.setLineDash([]);
  }

  function drawGrid() {
    deps.UI_RENDER.renderGrid(deps.ctx, {
      cw: deps.cw,
      ch: deps.ch,
      view: deps.state.view,
      zoom: deps.state.zoom,
      fromScreen,
      screen,
      badgeEl: deps.$("gridBadge"),
    });
  }

  function drawMaterial(cfg) {
    var _activeResult2;
    const material =
      deps.state.mode === "dxf"
        ? ((_activeResult2 = deps.activeResult()) === null || _activeResult2 === void 0
            ? void 0
            : _activeResult2.material) || deps.diagnosticMaterial
        : null;
    deps.$("restLegend").hidden = !material || !material.groups.length;
    if (!material || !material.groups.length) {
      deps.restCache.material = null;
      return;
    }
    const key = [
      deps.cw,
      deps.ch,
      deps.pixelScale,
      deps.state.view,
      deps.state.zoom,
      deps.state.pan.x,
      deps.state.pan.y,
      deps.state.center.u,
      deps.state.center.v,
      deps.activeViewPlane,
      cfg.originX,
      cfg.originY,
      cfg.topZ,
    ].join("/");
    if (deps.restCache.material !== material || deps.restCache.key !== key) {
      deps.$("restLegend").title = material.diagnostic
        ? "Местная оценка недоступных участков открытой стенки. Заданный припуск исключён."
        : "Расчётный остаток у стенки после всех проходов; заданный припуск не закрашивается";
      deps.restCanvas.width = deps.canvas.width;
      deps.restCanvas.height = deps.canvas.height;
      const fill = deps.restCanvas.getContext("2d");
      fill.setTransform(deps.pixelScale, 0, 0, deps.pixelScale, 0, 0);
      function ring(points) {
        if (!points.length) return;
        const first = screen(rawToWorld(points[0], cfg.topZ, cfg));
        fill.moveTo(first.x, first.y);
        for (let i = 1; i < points.length; i++) {
          const p = screen(rawToWorld(points[i], cfg.topZ, cfg));
          fill.lineTo(p.x, p.y);
        }
        fill.closePath();
      }
      for (const group of material.groups) {
        if (group.sweep) {
          if (deps.restSweepCanvas.width !== deps.canvas.width)
            deps.restSweepCanvas.width = deps.canvas.width;
          if (deps.restSweepCanvas.height !== deps.canvas.height)
            deps.restSweepCanvas.height = deps.canvas.height;
          const layer = deps.restSweepCanvas.getContext("2d");
          layer.setTransform(1, 0, 0, 1, 0, 0);
          layer.clearRect(0, 0, deps.canvas.width, deps.canvas.height);
          const origin = screen(rawToWorld({ x: 0, y: 0 }, cfg.topZ, cfg)),
            x = screen(rawToWorld({ x: 1, y: 0 }, cfg.topZ, cfg)),
            y = screen(rawToWorld({ x: 0, y: 1 }, cfg.topZ, cfg));
          layer.scale(deps.pixelScale, deps.pixelScale);
          layer.transform(
            x.x - origin.x,
            x.y - origin.y,
            y.x - origin.x,
            y.y - origin.y,
            origin.x,
            origin.y,
          );
          deps.MATERIAL_VIEW.drawSweep(layer, group.sweep);
          fill.save();
          fill.globalAlpha = 0.82;
          fill.drawImage(
            deps.restSweepCanvas,
            0,
            0,
            deps.canvas.width,
            deps.canvas.height,
            0,
            0,
            deps.cw,
            deps.ch,
          );
          fill.restore();
          continue;
        }
        fill.save();
        fill.beginPath();
        if (group.side === "outside") fill.rect(0, 0, deps.cw, deps.ch);
        ring(group.boundaryPoints);
        fill.clip(group.side === "outside" ? "evenodd" : "nonzero");
        fill.beginPath();
        for (const polygon of group.polygons) ring(polygon);
        fill.fillStyle = "rgba(220,37,48,0.82)";
        fill.fill();
        fill.restore();
      }
      deps.restCache = { material, key };
    }
    deps.ctx.drawImage(
      deps.restCanvas,
      0,
      0,
      deps.restCanvas.width,
      deps.restCanvas.height,
      0,
      0,
      deps.cw,
      deps.ch,
    );
  }

  function drawCutter(s, cfg, knownCenter, position) {
    deps.UI_RENDER.renderCutter(deps.ctx, {
      s,
      cfg,
      knownCenter,
      position,
      view: deps.state.view,
      zoom: deps.state.zoom,
      cw: deps.cw,
      ch: deps.ch,
      screen,
    });
  }

  function getPlungeGeometry() {
    const selected = deps.entryPresentation;
    let centre = null,
      radius = 0,
      sign = -1,
      touch = null;
    if (selected && selected.entryCircle) {
      centre = selected.entryCircle.c;
      radius = selected.entryCircle.r;
      const firstArc = selected.leadIn && selected.leadIn.find((s) => s.type === "A");
      if (firstArc) {
        sign = Math.sign(firstArc.sw) || -1;
        touch = firstArc.b;
      } else {
        touch = selected.attachment || deps.state.startPoint;
      }
    } else {
      const contour =
        deps.state.contours &&
        (deps.state.contours.find((item) => item.id === deps.state.active && item.enabled) ||
          deps.state.contours.find((item) => item.enabled));
      if (!contour || !contour.segs || !contour.segs.length) return null;
      const pt = deps.state.startPoint || contour.segs[0].a;
      let bestSeg = contour.segs[0],
        bestDist = Infinity;
      for (let i = 0; i < contour.segs.length; i++) {
        const d = deps.C.pSegDist(pt, contour.segs[i]);
        if (d < bestDist) {
          bestDist = d;
          bestSeg = contour.segs[i];
        }
      }
      const t = deps.C.tangent(bestSeg);
      const cfg = deps.config();
      radius = cfg.autoLead
        ? Math.max(cfg.diameter / 2, cfg.lead || 0)
        : cfg.lead || cfg.diameter / 2;
      if (!(radius > 0.001)) radius = cfg.diameter / 2 || 5;
      const side = contour.side === "auto" ? contour.autoSide : contour.side;
      sign = side === "inside" ? -1 : 1;
      const n = deps.C.mul(deps.C.left(t), sign);
      centre = deps.C.add(pt, deps.C.mul(n, radius));
      touch = pt;
    }
    if (!centre || !(radius > 0.001) || !touch) return null;
    const n = deps.C.unit(deps.C.sub(centre, touch));
    const circleTouch = deps.C.sub(centre, deps.C.mul(n, radius));
    const t = deps.C.mul(deps.C.P(n.y, -n.x), sign);
    return { centre, radius, sign, touch: circleTouch, t, n };
  }

  function isPlungeAllowed(p, g) {
    const geom = g || getPlungeGeometry();
    if (!geom) return true;
    const u = (p.x - geom.touch.x) * geom.t.x + (p.y - geom.touch.y) * geom.t.y;
    const v = (p.x - geom.touch.x) * geom.n.x + (p.y - geom.touch.y) * geom.n.y;
    const distSq = u * u + (v - geom.radius) * (v - geom.radius);
    if (distSq <= geom.radius * geom.radius + 1e-4) return false;
    return v > 2 * geom.radius || (v > 1e-4 && u < -1e-4);
  }

  function drawPlungeZones(cfg) {
    if (
      (deps.state.pick !== "entryStart" && !deps.state.showEntryZones) ||
      deps.state.view !== "xy"
    )
      return;
    const g = getPlungeGeometry();
    if (!g) return;
    const corners = [
      fromScreen(0, 0),
      fromScreen(deps.cw, 0),
      fromScreen(0, deps.ch),
      fromScreen(deps.cw, deps.ch),
    ].map((p) => ({
      u: (p.x + cfg.originX - g.touch.x) * g.t.x + (p.y + cfg.originY - g.touch.y) * g.t.y,
      v: (p.x + cfg.originX - g.touch.x) * g.n.x + (p.y + cfg.originY - g.touch.y) * g.n.y,
    }));
    const margin = Math.max(deps.cw, deps.ch) / (deps.state.zoom || 1) + 200;
    let uMin = Infinity,
      uMax = -Infinity,
      vMin = Infinity,
      vMax = -Infinity;
    for (let i = 0; i < 4; i++) {
      uMin = Math.min(uMin, corners[i].u);
      uMax = Math.max(uMax, corners[i].u);
      vMin = Math.min(vMin, corners[i].v);
      vMax = Math.max(vMax, corners[i].v);
    }
    uMin -= margin;
    uMax += margin;
    vMin -= margin;
    vMax += margin;
    const toSc = (u, v) =>
      screen(
        rawToWorld(
          deps.C.P(g.touch.x + u * g.t.x + v * g.n.x, g.touch.y + u * g.t.y + v * g.n.y),
          cfg.topZ,
          cfg,
        ),
      );
    const semi = [];
    for (let i = 0; i <= 32; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / 32;
      semi.push(toSc(-g.radius * Math.cos(a), g.radius + g.radius * Math.sin(a)));
    }
    deps.ctx.save();
    const zones = [
      [vMax, "rgba(40,180,80,.1)"],
      [vMin, "rgba(235,45,55,.1)"],
    ];
    for (let z = 0; z < 2; z++) {
      const vL = zones[z][0],
        col = zones[z][1];
      deps.ctx.beginPath();
      const s0 = toSc(uMin, 0);
      deps.ctx.moveTo(s0.x, s0.y);
      for (let i = 0; i < semi.length; i++) deps.ctx.lineTo(semi[i].x, semi[i].y);
      const p1 = toSc(uMax, 2 * g.radius),
        p2 = toSc(uMax, vL),
        p3 = toSc(uMin, vL);
      deps.ctx.lineTo(p1.x, p1.y);
      deps.ctx.lineTo(p2.x, p2.y);
      deps.ctx.lineTo(p3.x, p3.y);
      deps.ctx.closePath();
      deps.ctx.fillStyle = col;
      deps.ctx.fill();
    }
    deps.ctx.beginPath();
    const s0 = toSc(uMin, 0);
    deps.ctx.moveTo(s0.x, s0.y);
    for (let i = 0; i < semi.length; i++) deps.ctx.lineTo(semi[i].x, semi[i].y);
    deps.ctx.lineTo(toSc(uMax, 2 * g.radius).x, toSc(uMax, 2 * g.radius).y);
    deps.ctx.strokeStyle = "rgba(180,130,40,.45)";
    deps.ctx.lineWidth = 1.5;
    deps.ctx.stroke();
    const cSc = screen(rawToWorld(g.centre, cfg.topZ, cfg));
    deps.ctx.beginPath();
    deps.ctx.arc(cSc.x, cSc.y, g.radius * deps.state.zoom, 0, Math.PI * 2);
    deps.ctx.strokeStyle = "rgba(30,126,170,.4)";
    deps.ctx.lineWidth = 1.2;
    deps.ctx.setLineDash([4, 4]);
    deps.ctx.stroke();
    deps.ctx.restore();
  }

  function drawScene(cfg) {
    drawGrid();
    drawMaterial(cfg);
    if (deps.state.mode === "dxf")
      deps.editor.drawAuxiliary(
        deps.ctx,
        (p) => screen(rawToWorld(p, cfg.topZ, cfg)),
        deps.state.zoom,
      );
    if (deps.state.mode === "dxf") {
      if (cfg.stockShape === "circle" && cfg.stockDia > 0) {
        const c = deps.C.P(cfg.stockX, cfg.stockY),
          a = deps.C.P(c.x + cfg.stockDia / 2, c.y);
        strokeSegments([deps.C.arc(a, a, c, 2 * Math.PI)], "#7e6546", 1, [7, 5], (p) => ({
          ...p,
          z: cfg.topZ,
        }));
      }
      if (deps.editor.items.length)
        deps.editor.drawPlan(
          deps.ctx,
          (p) => screen(rawToWorld(p, cfg.topZ, cfg)),
          deps.state.zoom,
        );
      else
        for (const c of deps.state.planContours)
          strokeSegments(c.segs, "#405870", 2.2, [], (p) => rawToWorld(p, cfg.topZ, cfg));
    }
    const motions = deps.currentMotions(),
      comp = motions.some((m) => m.comp && m.comp !== 40);
    deps.$("pathLegend").textContent = comp
      ? "Программный контур"
      : deps.state.mode === "nc"
        ? "Траектория"
        : cfg.toolKind === "drill"
          ? "Цикл сверления"
          : cfg.toolKind === "scribe"
            ? "Остриё"
            : "Центр фрезы";
    for (const m of motions)
      strokeSegments(
        [m],
        m.type === "rapid" || m.stage === "compensation-air"
          ? "#ef8b2b"
          : m.cycle && deps.state.mode === "dxf"
            ? deps.activeOperation().color
            : "rgba(45,126,224,0.72)",
        m.type === "rapid" || m.stage === "compensation-air" ? 1.8 : 2.8,
        m.type === "rapid" || m.stage === "compensation-air" ? [4, 6] : [],
      );
    const active =
      deps.state.mode === "dxf"
        ? deps.state.contours.find((c) => c.id === deps.state.active)
        : null;
    deps.$("activeContourBadge").hidden = !active;
    deps.$("selectionLegend").hidden = deps.state.mode !== "dxf";
    if (active) {
      const badge = deps.$("activeContourBadge");
      badge.textContent =
        active.id.toUpperCase() +
        " · " +
        (active.enabled ? "В обработке" : "Исключён из обработки");
      badge.classList.toggle("excluded", !active.enabled);
      badge.title = active.layer;
      const convert = (p) => rawToWorld(p, cfg.topZ, cfg);
      deps.ctx.save();
      deps.ctx.lineJoin = "round";
      deps.ctx.lineCap = "round";
      if (active.closed) {
        deps.ctx.beginPath();
        deps.SKETCH.traceSegments(deps.ctx, active.segs, (p) => screen(convert(p)));
        deps.ctx.closePath();
        deps.ctx.fillStyle = active.enabled ? "rgba(239,139,43,0.055)" : "rgba(122,136,148,0.045)";
        deps.ctx.fill();
      }
      strokeSegments(active.segs, "rgba(255,255,255,0.94)", 7, [], convert);
      strokeSegments(active.segs, "#e4771d", 4, active.enabled ? [] : [7, 5], convert);
      for (const m of motions)
        if (m.contour === active.id) {
          if (m.type !== "rapid") strokeSegments([m], "rgba(255,255,255,0.96)", 4.6);
          strokeSegments(
            [m],
            m.type === "rapid" ? "#ef8b2b" : "rgba(45,126,224,0.78)",
            3.3,
            m.type === "rapid" ? [4, 6] : [],
          );
        }
      deps.ctx.restore();
    }
    const origin = screen({
      x: 0,
      y: 0,
      z: deps.state.mode === "dxf" ? cfg.topZ : 0,
    });
    deps.ctx.strokeStyle = "#f07888";
    deps.ctx.lineWidth = 1.5;
    deps.ctx.beginPath();
    deps.ctx.moveTo(origin.x - 9, origin.y);
    deps.ctx.lineTo(origin.x + 9, origin.y);
    deps.ctx.moveTo(origin.x, origin.y - 9);
    deps.ctx.lineTo(origin.x, origin.y + 9);
    deps.ctx.stroke();
    deps.ctx.fillStyle = "#f293a1";
    deps.ctx.font = "10px Arial";
    deps.ctx.fillText("0", origin.x + 8, origin.y - 7);
    const base = screen({ x: 0, y: 0, z: 0 }),
      ex = screen({ x: 15 / deps.state.zoom, y: 0, z: 0 }),
      ey = screen({ x: 0, y: 15 / deps.state.zoom, z: 0 });
    strokePoints(
      [
        { x: 0, y: 0, z: 0 },
        { x: 20 / deps.state.zoom, y: 0, z: 0 },
      ],
      "#e1828a",
      1,
    );
    strokePoints(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 20 / deps.state.zoom, z: 0 },
      ],
      "#7cbf9c",
      1,
    );
    if (deps.state.mode === "dxf") {
      var _state$entryStart, _state$entryStart2;
      const selected = deps.entryPresentation,
        contact =
          (selected && selected.circularCycle ? null : deps.state.startPoint) ||
          (selected === null || selected === void 0 ? void 0 : selected.attachment),
        plunge =
          (selected === null || selected === void 0 ? void 0 : selected.entry) ||
          (((_state$entryStart = deps.state.entryStart) === null || _state$entryStart === void 0
            ? void 0
            : _state$entryStart.space) === "program"
            ? null
            : deps.state.entryStart),
        exitPoint =
          (selected && selected.circularCycle ? null : deps.state.exitPoint) ||
          (selected === null || selected === void 0 ? void 0 : selected.exit);
      if (!(selected && selected.circularCycle)) drawPlungeZones(cfg);
      deps.ctx.save();
      if (selected !== null && selected !== void 0 && selected.entryCircle) {
        const circle = selected.entryCircle,
          a = deps.C.P(circle.c.x + circle.r, circle.c.y);
        strokeSegments(
          [deps.C.arc(a, a, circle.c, 2 * Math.PI)],
          "rgba(30,126,170,.35)",
          1,
          [3, 4],
          (p) => rawToWorld(p, cfg.topZ, cfg),
        );
      }
      const marker = (point, color, label) => {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        const p = screen(rawToWorld(point, cfg.topZ, cfg));
        deps.ctx.beginPath();
        deps.ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        deps.ctx.fillStyle = "#fff";
        deps.ctx.fill();
        deps.ctx.strokeStyle = color;
        deps.ctx.lineWidth = 2.5;
        deps.ctx.stroke();
        deps.ctx.font = 'bold 13px Consolas, "Courier New", monospace';
        const mtw = deps.ctx.measureText(label).width,
          mbw = Math.round(mtw + 16),
          mbh = 22,
          mbx = Math.round(p.x + 8),
          mby = Math.round(p.y - 24),
          mcx = Math.round(mbx + mbw / 2),
          mcy = Math.round(mby + mbh / 2);
        deps.ctx.fillStyle = "#ffffff";
        deps.ctx.strokeStyle = color;
        deps.ctx.lineWidth = 1.5;
        if (deps.ctx.roundRect) {
          deps.ctx.beginPath();
          deps.ctx.roundRect(mbx, mby, mbw, mbh, 4);
          deps.ctx.fill();
          deps.ctx.stroke();
        } else {
          deps.ctx.fillRect(mbx, mby, mbw, mbh);
          if (deps.ctx.strokeRect) deps.ctx.strokeRect(mbx, mby, mbw, mbh);
        }
        deps.ctx.fillStyle = color;
        deps.ctx.textAlign = "center";
        deps.ctx.textBaseline = "middle";
        deps.ctx.fillText(label, mcx, mcy);
      };
      marker(contact, "#087e68", "Касание");
      marker(plunge, "#d47112", selected && selected.circularCycle ? "Центр цикла" : "Погружение");
      if (
        ((_state$entryStart2 = deps.state.entryStart) === null || _state$entryStart2 === void 0
          ? void 0
          : _state$entryStart2.space) === "program"
      )
        marker(deps.state.entryStart, "#7556b5", "Начало в программе");
      if (!(selected && selected.circularCycle)) marker(exitPoint, "#2b7bb9", "Выход");
      if (deps.state.contours && deps.state.contours.length) {
        const enabledContours = deps.state.contours.filter(
          (c) => c.enabled && c.segs && c.segs.length > 0,
        );
        if (enabledContours.length) {
          deps.ctx.save();
          deps.ctx.font = 'bold 12px Consolas, "Courier New", monospace';
          deps.ctx.textAlign = "center";
          deps.ctx.textBaseline = "middle";
          enabledContours.forEach((c, i) => {
            const start = c.segs[0].a;
            const p = screen(rawToWorld(start, cfg.topZ, cfg));
            if (p.x < -20 || p.y < -20 || p.x > deps.cw + 20 || p.y > deps.ch + 20) return;
            const r = 9;
            deps.ctx.beginPath();
            deps.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            deps.ctx.fillStyle = "#ffffff";
            deps.ctx.fill();
            deps.ctx.strokeStyle = deps.state.active === c.id ? "#e4771d" : "#145ae0";
            deps.ctx.lineWidth = 2;
            deps.ctx.stroke();
            deps.ctx.fillStyle = deps.state.active === c.id ? "#b34700" : "#072b54";
            deps.ctx.fillText(String(i + 1), Math.round(p.x), Math.round(p.y + 0.5));
          });
          deps.ctx.restore();
        }
      }
      deps.ctx.restore();
    }
    if (comp) {
      deps.ctx.fillStyle = "#d7b987";
      deps.ctx.font = "10px Arial";
      deps.ctx.fillText("G41/G42 · показан контур, не центр фрезы", 18, 33);
    }
    if (deps.state.mode === "dxf")
      deps.editor.drawPlan(
        deps.ctx,
        (p) => screen(rawToWorld(p, cfg.topZ, cfg)),
        deps.state.zoom,
        true,
      );
    if (deps.state.mode === "dxf")
      deps.editor.draw(
        deps.ctx,
        (p) => screen(rawToWorld(p, cfg.topZ, cfg)),
        deps.state.zoom,
        true,
      );
    if (deps.state.mode === "dxf" && deps.failedDiagnostic) {
      const convert = (p) => rawToWorld(p, cfg.topZ, cfg);
      strokeSegments([deps.failedDiagnostic.segment], "#fff", 8, [], convert);
      strokeSegments([deps.failedDiagnostic.segment], "#c72a42", 4, [], convert);
    }
    drawGeometryIssues(cfg);
    if (deps.state.pick === "origin" && deps.state.originHover) {
      const hp = screen(rawToWorld(deps.state.originHover, cfg.topZ, cfg));
      deps.ctx.save();
      deps.ctx.beginPath();
      deps.ctx.arc(hp.x, hp.y, 6, 0, Math.PI * 2);
      deps.ctx.fillStyle = "rgba(235, 75, 95, 0.25)";
      deps.ctx.fill();
      deps.ctx.strokeStyle = "#e83e58";
      deps.ctx.lineWidth = 1.8;
      deps.ctx.stroke();
      deps.ctx.beginPath();
      deps.ctx.moveTo(hp.x - 10, hp.y);
      deps.ctx.lineTo(hp.x + 10, hp.y);
      deps.ctx.moveTo(hp.x, hp.y - 10);
      deps.ctx.lineTo(hp.x, hp.y + 10);
      deps.ctx.strokeStyle = "#e83e58";
      deps.ctx.lineWidth = 1.2;
      deps.ctx.stroke();
      if (deps.state.originSnapKind) {
        const text = "Ноль · " + deps.state.originSnapKind;
        deps.ctx.font = 'bold 14px Consolas, "Courier New", monospace';
        const tw = deps.ctx.measureText(text).width,
          bw = Math.round(tw + 20),
          bh = 24,
          bx = Math.round(hp.x + 10),
          by = Math.round(hp.y - 28),
          cx = Math.round(bx + bw / 2),
          cy = Math.round(by + bh / 2);
        deps.ctx.fillStyle = "#ffffff";
        deps.ctx.strokeStyle = "#b32038";
        deps.ctx.lineWidth = 1.5;
        if (deps.ctx.roundRect) {
          deps.ctx.beginPath();
          deps.ctx.roundRect(bx, by, bw, bh, 5);
          deps.ctx.fill();
          deps.ctx.stroke();
        } else {
          deps.ctx.fillRect(bx, by, bw, bh);
          if (deps.ctx.strokeRect) deps.ctx.strokeRect(bx, by, bw, bh);
        }
        deps.ctx.fillStyle = "#8a0010";
        deps.ctx.textAlign = "center";
        deps.ctx.textBaseline = "middle";
        deps.ctx.fillText(text, cx, cy);
      }
      deps.ctx.restore();
    }
    function drawPickHover(p, text, col, bgCol, snapKind) {
      const hp = screen(rawToWorld(p, cfg.topZ, cfg));
      deps.ctx.save();
      deps.ctx.beginPath();
      deps.ctx.arc(hp.x, hp.y, 8, 0, Math.PI * 2);
      deps.ctx.fillStyle = bgCol;
      deps.ctx.fill();
      deps.ctx.strokeStyle = col;
      deps.ctx.lineWidth = 2;
      deps.ctx.stroke();
      deps.ctx.beginPath();
      deps.ctx.arc(hp.x, hp.y, 2.5, 0, Math.PI * 2);
      deps.ctx.fillStyle = col;
      deps.ctx.fill();
      if (snapKind) {
        deps.ctx.beginPath();
        deps.ctx.moveTo(hp.x - 10, hp.y);
        deps.ctx.lineTo(hp.x + 10, hp.y);
        deps.ctx.moveTo(hp.x, hp.y - 10);
        deps.ctx.lineTo(hp.x, hp.y + 10);
        deps.ctx.strokeStyle = col;
        deps.ctx.lineWidth = 1.2;
        deps.ctx.stroke();
      }
      deps.ctx.font = 'bold 13px Consolas, "Courier New", monospace';
      const tw = deps.ctx.measureText(text).width,
        bw = Math.round(tw + 18),
        bh = 22;
      const bx = Math.round(hp.x + 10),
        by = Math.round(hp.y - 26);
      deps.ctx.fillStyle = "#ffffff";
      deps.ctx.strokeStyle = col;
      deps.ctx.lineWidth = 1.5;
      if (deps.ctx.roundRect) {
        deps.ctx.beginPath();
        deps.ctx.roundRect(bx, by, bw, bh, 4);
        deps.ctx.fill();
        deps.ctx.stroke();
      } else {
        deps.ctx.fillRect(bx, by, bw, bh);
        if (deps.ctx.strokeRect) deps.ctx.strokeRect(bx, by, bw, bh);
      }
      deps.ctx.fillStyle = col;
      deps.ctx.textAlign = "center";
      deps.ctx.textBaseline = "middle";
      deps.ctx.fillText(text, Math.round(bx + bw / 2), Math.round(by + bh / 2));
      deps.ctx.restore();
    }
    if (deps.state.pick === "start" && deps.state.touchHover) {
      const snapText =
        deps.state.touchHover.kind === "startPoint"
          ? "Начало обработки " + (deps.state.touchHover.index || "")
          : deps.state.touchHover.kind === "endPoint"
            ? "Конец обработки"
            : deps.state.touchHover.kind === "vertex"
              ? "Узел"
              : "Касание";
      drawPickHover(deps.state.touchHover.p, snapText, "#087e68", "rgba(8, 126, 104, 0.22)", null);
    }
    if (deps.state.pick === "entryStart" && deps.state.plungeHover && deps.state.plungeHover.p) {
      const allowed = deps.state.plungeHover.allowed;
      const col = allowed ? "#087e68" : "#d02a3a";
      const bgCol = allowed ? "rgba(8, 126, 104, 0.22)" : "rgba(208, 42, 58, 0.22)";
      const snapText =
        (allowed ? "Погружение" : "Запрещено (задевает деталь)") +
        (deps.state.plungeHover.snapKind
          ? " · " + deps.state.plungeHover.snapKind
          : allowed
            ? " · Разрешено"
            : "");
      drawPickHover(
        deps.state.plungeHover.p,
        snapText,
        col,
        bgCol,
        deps.state.plungeHover.snapKind,
      );
    }
    if (deps.state.pick === "exit" && deps.state.exitHover && deps.state.exitHover.p) {
      const snapText =
        "Выход" + (deps.state.exitHover.snapKind ? " · " + deps.state.exitHover.snapKind : "");
      drawPickHover(
        deps.state.exitHover.p,
        snapText,
        "#2b7bb9",
        "rgba(43, 123, 185, 0.22)",
        deps.state.exitHover.snapKind,
      );
    }
    return comp;
  }

  function draw() {
    if (!deps.cw || !deps.ch) return;
    if (deps.state.fit) {
      fitView(deps.state.fit === "firstShape");
      deps.sceneDirty = true;
    }
    const cfg = deps.config(),
      part = deps.playback.currentPart();
    if (!part) {
      drawScene(cfg);
      deps.sceneSnapshot = null;
      deps.sceneDirty = true;
      return;
    }
    if (deps.sceneDirty || !deps.sceneSnapshot) {
      deps.sceneComp = drawScene(cfg);
      if (!deps.sceneSnapshot) deps.sceneSnapshot = document.createElement("canvas");
      if (
        deps.sceneSnapshot.width !== deps.canvas.width ||
        deps.sceneSnapshot.height !== deps.canvas.height
      ) {
        deps.sceneSnapshot.width = deps.canvas.width;
        deps.sceneSnapshot.height = deps.canvas.height;
      }
      deps.sceneSnapshot.getContext("2d").drawImage(deps.canvas, 0, 0);
      deps.sceneDirty = false;
    } else {
      deps.ctx.drawImage(
        deps.sceneSnapshot,
        0,
        0,
        deps.sceneSnapshot.width,
        deps.sceneSnapshot.height,
        0,
        0,
        deps.cw,
        deps.ch,
      );
    }
    const comp = deps.sceneComp;
    const t = deps.state.progress * deps.state.simTotal,
      frac = Math.max(0, Math.min(1, (t - part.start) / (part.end - part.start))),
      p = deps.motionPoint(part.m, frac),
      s = screen(p);
    deps.ctx.beginPath();
    deps.ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
    deps.ctx.fillStyle = "#145ae0";
    deps.ctx.fill();
    if (!comp && cfg.toolKind === "scribe" && deps.state.mode === "dxf") {
      deps.ctx.beginPath();
      deps.ctx.moveTo(s.x - 7, s.y - 23);
      deps.ctx.lineTo(s.x + 7, s.y - 23);
      deps.ctx.lineTo(s.x, s.y);
      deps.ctx.closePath();
      deps.ctx.fillStyle = "#80adff";
      deps.ctx.strokeStyle = "#fff";
      deps.ctx.lineWidth = 4;
      deps.ctx.fill();
      deps.ctx.stroke();
      deps.ctx.strokeStyle = "#165bdb";
      deps.ctx.lineWidth = 1.8;
      deps.ctx.stroke();
    } else if (
      deps.state.mode === "dxf" &&
      (cfg.toolKind === "mill" || (cfg.toolKind === "drill" && deps.activeOperation().toolNumber))
    )
      drawCutter(s, cfg, !comp, p);
    const actual = deps.C.planeToWorld(p, deps.activeViewPlane);
    deps.$("simPosition").textContent =
      deps.C.planeInfo(deps.activeViewPlane).axes[2] + " " + p.z.toFixed(3);
    deps.$("droX").textContent = deps.C.fmt(actual.x, 1000, false);
    deps.$("droY").textContent = deps.C.fmt(actual.y, 1000, false);
    deps.$("droZ").textContent = deps.C.fmt(actual.z, 1000, false);
    deps.showCodeFrame(part.m);
  }

  function drawGeometryIssues(cfg) {
    if (deps.editor.isOpen) return;
    const issues = deps.geometryIssues().slice(0, 64);
    if (!issues.length) return;
    deps.ctx.save();
    deps.ctx.font = "bold 12px Arial";
    deps.ctx.textAlign = "center";
    deps.ctx.textBaseline = "middle";
    for (const issue of issues) {
      const p = screen(rawToWorld(issue.point, cfg.topZ, cfg));
      if (p.x < -20 || p.y < -20 || p.x > deps.cw + 20 || p.y > deps.ch + 20) continue;
      const error = ["entry", "correction"].includes(issue.kind);
      const isFocused = issue.id === deps.focusedIssueId;
      if (isFocused) {
        deps.ctx.beginPath();
        deps.ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
        deps.ctx.strokeStyle = "#c72a42";
        deps.ctx.lineWidth = 2.5;
        deps.ctx.stroke();
        deps.ctx.beginPath();
        deps.ctx.arc(p.x, p.y, 25, 0, Math.PI * 2);
        deps.ctx.strokeStyle = "rgba(199, 42, 66, 0.40)";
        deps.ctx.lineWidth = 1.5;
        deps.ctx.stroke();
      }
      deps.ctx.beginPath();
      deps.ctx.arc(p.x, p.y, isFocused ? 13 : 11, 0, Math.PI * 2);
      deps.ctx.fillStyle = error ? (isFocused ? "#ffd2dc" : "#ffe8ed") : "#fff5d5";
      deps.ctx.fill();
      deps.ctx.strokeStyle = error ? "#c72a42" : "#ad6600";
      deps.ctx.lineWidth = isFocused ? 2.5 : 2;
      deps.ctx.stroke();
      deps.ctx.fillStyle = error ? "#991b32" : "#754000";
      deps.ctx.fillText(String(issue.id), p.x, p.y + 0.5);
      if (isFocused && issue.text) {
        deps.ctx.save();
        deps.ctx.font = 'bold 12px Consolas, "Courier New", monospace';
        const tw = deps.ctx.measureText(issue.text).width,
          bw = Math.round(tw + 18),
          bh = 22,
          bx = Math.round(p.x - bw / 2),
          by = Math.round(p.y - 38),
          cx = Math.round(bx + bw / 2),
          cy = Math.round(by + bh / 2);
        deps.ctx.fillStyle = "#ffffff";
        deps.ctx.strokeStyle = "#c72a42";
        deps.ctx.lineWidth = 1.5;
        if (deps.ctx.roundRect) {
          deps.ctx.beginPath();
          deps.ctx.roundRect(bx, by, bw, bh, 4);
          deps.ctx.fill();
          deps.ctx.stroke();
        } else {
          deps.ctx.fillRect(bx, by, bw, bh);
          if (deps.ctx.strokeRect) deps.ctx.strokeRect(bx, by, bw, bh);
        }
        deps.ctx.fillStyle = "#991b32";
        deps.ctx.fillText(issue.text, cx, cy);
        deps.ctx.restore();
      }
    }
    deps.ctx.restore();
  }

  function resize() {
    const r = deps.$("canvasWrap").getBoundingClientRect();
    deps.cw = r.width;
    deps.ch = r.height;
    const pixelBudget = 1000000,
      dpr = Math.min(1, Math.sqrt(pixelBudget / Math.max(1, deps.cw * deps.ch)));
    deps.pixelScale = dpr;
    deps.canvas.width = Math.max(1, Math.round(deps.cw * dpr));
    deps.canvas.height = Math.max(1, Math.round(deps.ch * dpr));
    deps.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    deps.codeFrameLayout = null;
    deps.placeCodeFrame(true);
    deps.state.fit = true;
    requestDraw();
  }
  return {
    rawToWorld,
    project,
    screen,
    fromScreen,
    fitView,
    queueDraw,
    requestDraw,
    strokePoints,
    strokeSegments,
    drawGrid,
    drawMaterial,
    drawCutter,
    getPlungeGeometry,
    isPlungeAllowed,
    drawPlungeZones,
    drawScene,
    draw,
    drawGeometryIssues,
    resize,
  };
}
