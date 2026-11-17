import KONTUR_GEOMETRY from "../geometry/kontur/primitives.js";
import ENTRY from "./entry.js";

const { arcGeometry, contourPoints, distance, toThousandths } = KONTUR_GEOMETRY;
const TAU = Math.PI * 2,
  EPS = 1e-7;
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const right = (t) => ({ x: t.y, y: -t.x });
const rotate = (p, a) => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});
function at(s, t) {
  if (s.type === "line")
    return {
      x: s.a.x + (s.b.x - s.a.x) * t,
      y: s.a.y + (s.b.y - s.a.y) * t,
    };
  const a = Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x) + s.sweep * t;
  return { x: s.c.x + s.r * Math.cos(a), y: s.c.y + s.r * Math.sin(a) };
}
function tangent(s, t) {
  if (s.type === "line") {
    const d = distance(s.a, s.b);
    return { x: (s.b.x - s.a.x) / d, y: (s.b.y - s.a.y) / d };
  }
  const p = at(s, t),
    sign = Math.sign(s.sweep);
  return {
    x: (-(p.y - s.c.y) / s.r) * sign,
    y: ((p.x - s.c.x) / s.r) * sign,
  };
}
function slice(s, from, to) {
  return {
    ...s,
    a: at(s, from),
    b: at(s, to),
    ...(s.type === "arc" ? { sweep: s.sweep * (to - from) } : {}),
  };
}
function reverseSegment(s) {
  return {
    ...s,
    a: s.b,
    b: s.a,
    ...(s.type === "arc" ? { sweep: -s.sweep } : {}),
  };
}
function pointInside(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function boundaryDistance(point, polygon) {
  let best = Infinity;
  for (let i = 1; i < polygon.length; i++) {
    const a = polygon[i - 1],
      b = polygon[i],
      dx = b.x - a.x,
      dy = b.y - a.y,
      t = Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
      );
    best = Math.min(best, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
  }
  return best;
}
function contourKind(contour, all) {
  const point = contourPoints(contour, 0.05)[0];
  let depth = 0;
  for (const other of all)
    if (other.closed && other.id !== contour.id && pointInside(point, contourPoints(other, 0.05)))
      depth++;
  return depth % 2 ? "inner" : "outer";
}
function oriented(contour, origin, kind) {
  const shift = (p) => ({ x: p.x - origin.x, y: p.y - origin.y });
  let segments = contour.parts.map(({ p, reverse }) => {
    if (p.type === "line") {
      const s = { type: "line", a: shift(p.a), b: shift(p.b) };
      return reverse ? reverseSegment(s) : s;
    }
    const g = p.type === "circle" ? { c: p.c, r: p.r, sweep: TAU } : arcGeometry(p);
    if (!g) throw Error("Некорректная дуга: три точки лежат на одной прямой или совпадают.");
    const a = p.type === "circle" ? { x: p.c.x + p.r, y: p.c.y } : p.a,
      b = p.type === "circle" ? a : p.b;
    const s = {
      type: "arc",
      a: shift(a),
      b: shift(b),
      c: shift(g.c),
      r: g.r,
      sweep: g.sweep,
    };
    return reverse ? reverseSegment(s) : s;
  });
  const area = segments.reduce(
    (sum, s) =>
      sum +
      (s.type === "line"
        ? s.a.x * s.b.y - s.b.x * s.a.y
        : s.c.x * (s.b.y - s.a.y) - s.c.y * (s.b.x - s.a.x) + s.r * s.r * s.sweep) /
        2,
    0,
  );
  if (Math.abs(area) < 1e-8) throw Error("Контур имеет нулевую площадь. Проверьте геометрию.");
  if (area > 0 !== (kind === "outer")) segments = segments.reverse().map(reverseSegment);
  return segments;
}
function selfCrosses(polygon) {
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 1; i < polygon.length; i++)
    for (let j = i + 2; j < polygon.length; j++) {
      if (i === 1 && j === polygon.length - 1) continue;
      const a = polygon[i - 1],
        b = polygon[i],
        c = polygon[j - 1],
        d = polygon[j];
      if (cross(a, b, c) * cross(a, b, d) < -EPS && cross(c, d, a) * cross(c, d, b) < -EPS)
        return true;
    }
  return false;
}
function pathPoints(segment, step = 0.15) {
  const count =
    segment.type === "line"
      ? Math.max(1, Math.ceil(distance(segment.a, segment.b) / 2))
      : Math.max(2, Math.ceil((Math.abs(segment.sweep) * segment.r) / step));
  return Array.from({ length: Math.min(count, 3000) + 1 }, (_, i) =>
    at(segment, i / Math.min(count, 3000)),
  );
}
function projectEntry(segments, p) {
  const candidates = segments.map((s, index) => {
    let fraction;
    if (s.type === "line") {
      const dx = s.b.x - s.a.x,
        dy = s.b.y - s.a.y;
      fraction = Math.max(
        0,
        Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / (dx * dx + dy * dy)),
      );
    } else {
      const start = Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x),
        angle = Math.atan2(p.y - s.c.y, p.x - s.c.x),
        travel = ((((angle - start) * Math.sign(s.sweep)) % TAU) + TAU) % TAU;
      fraction =
        travel <= Math.abs(s.sweep)
          ? travel / Math.abs(s.sweep)
          : distance(p, s.a) <= distance(p, s.b)
            ? 0
            : 1;
    }
    const point = at(s, fraction);
    return { index, fraction, point, distance: distance(p, point) };
  });
  return candidates.sort((a, b) => a.distance - b.distance)[0];
}
function projectContourEntry(contour, point) {
  return projectEntry(oriented(contour, { x: 0, y: 0 }, "outer"), point).point;
}
function safeLead(lead, polygon, kind, toolRadius, islands, budget = null) {
  const cost = 2 * (polygon.length + islands.reduce((sum, ring) => sum + ring.length, 0));
  const free = (p) => {
    if (budget && (budget.remaining -= cost) < 0) {
      const error = Error(
        "Проверка захода слишком сложна. Укажи касание вручную или раздели контур.",
      );
      error.geometryComplexity = true;
      throw error;
    }
    const inside = pointInside(p, polygon),
      clearance = boundaryDistance(p, polygon);
    if (((kind === "outer" && inside) || (kind === "inner" && !inside)) && clearance > 0.025)
      return false;
    if (clearance < toolRadius - 0.025) return false;
    for (const island of islands)
      if (pointInside(p, island) || boundaryDistance(p, island) < toolRadius - 0.025) return false;
    return true;
  };
  const ratio = (lead.radius - toolRadius) / lead.radius;
  const centerArc = {
    ...lead.arcIn,
    a: {
      x: lead.arcIn.c.x + (lead.arcIn.a.x - lead.arcIn.c.x) * ratio,
      y: lead.arcIn.c.y + (lead.arcIn.a.y - lead.arcIn.c.y) * ratio,
    },
    b: add(lead.entry, lead.n, toolRadius),
    r: lead.radius - toolRadius,
  };
  const exitArc = {
    ...lead.arcOut,
    a: centerArc.b,
    b: lead.transparent
      ? add(
          lead.arcOut.c,
          {
            x: (lead.arcOut.b.x - lead.arcOut.c.x) / lead.radius,
            y: (lead.arcOut.b.y - lead.arcOut.c.y) / lead.radius,
          },
          lead.radius - toolRadius,
        )
      : add(lead.arcOut.c, lead.t, lead.radius - toolRadius),
    r: lead.radius - toolRadius,
  };
  const motions = lead.transparent
    ? [centerArc, exitArc]
    : [
        { type: "line", a: lead.pre, b: centerArc.a },
        centerArc,
        exitArc,
        { type: "line", a: exitArc.b, b: lead.post },
      ];
  return motions.every((s) => pathPoints(s, 0.3).every(free));
}
function buildMillingProgram(contour, options = {}, allContours = [contour]) {
  if (!(contour !== null && contour !== void 0 && contour.closed))
    throw Error("Выберите замкнутый контур.");
  if (contour.parts.some((p) => p.p.unconfirmed))
    throw Error("Подтвердите все размеры выбранного контура.");
  const opts = {
    origin: { x: 0, y: 0 },
    kind: "auto",
    toolDiameter: 10,
    safeY: -35,
    cutZ: -10,
    leadRadius: null,
    corrector: 1,
    ...options,
  };
  if (!Number.isInteger(opts.corrector) || opts.corrector < 1 || opts.corrector > 99)
    throw Error("Номер корректора D должен быть от 1 до 99.");
  if (!Number.isFinite(opts.toolDiameter) || opts.toolDiameter <= 0)
    throw Error("Диаметр фрезы должен быть больше нуля.");
  const compensationRadius =
    opts.compensationRadius === undefined ? opts.toolDiameter / 2 : opts.compensationRadius;
  if (!Number.isFinite(compensationRadius) || compensationRadius < 0 || compensationRadius >= 1e6)
    throw Error("Введите неотрицательный радиус корректора в миллиметрах.");
  const planningDiameter = 2 * compensationRadius;
  if (!Number.isFinite(opts.cutZ) || Math.abs(opts.cutZ) > 10000)
    throw Error("Введите рабочий Z в диапазоне ±10000 мм.");
  if (!Number.isFinite(opts.safeY)) throw Error("Введите Y безопасной точки.");
  const kind = opts.kind === "auto" ? contourKind(contour, allContours) : opts.kind;
  if (!["outer", "inner"].includes(kind))
    throw Error("Выберите наружную или внутреннюю обработку.");
  const shift = (p) => ({ x: p.x - opts.origin.x, y: p.y - opts.origin.y }),
    polygon = contourPoints(contour, 0.025).map(shift);
  if (polygon.length > 2500) throw Error("Слишком сложный контур. Упростите геометрию.");
  if (selfCrosses(polygon)) throw Error("Контур пересекает сам себя. Исправьте эскиз.");
  const minX = Math.min(...polygon.map((p) => p.x)),
    maxX = Math.max(...polygon.map((p) => p.x)),
    minY = Math.min(...polygon.map((p) => p.y)),
    maxY = Math.max(...polygon.map((p) => p.y)),
    toolRadius = opts.toolDiameter / 2;
  if (kind === "inner" && Math.min(maxX - minX, maxY - minY) <= planningDiameter + 0.001)
    throw Error(
      "Траектория с коррекцией R" + compensationRadius + " не помещается во внутренний контур.",
    );
  const segments = oriented(contour, opts.origin, kind);
  if (segments.some((s) => s.type === "arc" && s.sweep < 0 && s.r <= compensationRadius + 0.001))
    throw Error("Радиус внутренней дуги меньше или равен значению радиусной коррекции.");
  const islands =
    kind === "inner"
      ? allContours
          .filter(
            (c) =>
              c.closed &&
              c.id !== contour.id &&
              pointInside(shift(contourPoints(c, 0.05)[0]), polygon),
          )
          .map((c) => contourPoints(c, 0.05).map(shift))
      : [];
  const candidates = [];
  segments.forEach((s, index) => {
    const ts = [0.5];
    if (s.type === "arc") {
      const start = Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x);
      for (let k = -8; k <= 8; k++) {
        const t = ((k * Math.PI) / 2 - start) / s.sweep;
        if (t > 0.001 && t < 0.999) ts.push(t);
      }
    }
    for (const fraction of ts) candidates.push({ index, fraction, point: at(s, fraction) });
  });
  candidates.sort((a, b) => a.point.y - b.point.y || a.index - b.index);
  if (opts.entryPoint) {
    if (!Number.isFinite(opts.entryPoint.x) || !Number.isFinite(opts.entryPoint.y))
      throw Error("Введите X/Y точки входа.");
    const entry = projectEntry(segments, opts.entryPoint);
    if (entry.distance > 0.002)
      throw Error("Точка входа должна лежать на контуре. Используйте «Указать на эскизе».");
    const i = entry.index,
      f = entry.fraction;
    if (f < 1e-7 || f > 1 - 1e-7) {
      const previous =
          f < 0.5 ? segments[(i + segments.length - 1) % segments.length] : segments[i],
        next = f < 0.5 ? segments[i] : segments[(i + 1) % segments.length],
        a = tangent(previous, 1),
        b = tangent(next, 0);
      if (distance(a, b) > 1e-5)
        throw Error("Укажите вход внутри линии или дуги, а не на остром углу.");
    }
    candidates.splice(0, candidates.length, entry);
  }
  const manualAngle =
    opts.approachAngle !== undefined && opts.approachAngle !== null && opts.approachAngle !== "";
  if (manualAngle && !Number.isFinite(Number(opts.approachAngle)))
    throw Error("Введите угол первоначального подхода.");
  const autoR =
    kind === "outer"
      ? Math.max(planningDiameter, 5)
      : Math.min(Math.max(planningDiameter, 1), Math.min(maxX - minX, maxY - minY) / 4);
  const radii =
    opts.leadRadius === null || opts.leadRadius === ""
      ? [autoR, compensationRadius * 1.5, compensationRadius * 1.2]
      : [Number(opts.leadRadius)];
  if (radii.every((r) => !Number.isFinite(r) || r <= compensationRadius + 0.002))
    throw Error("Радиус захода должен быть больше значения радиусной коррекции.");
  let lead = null,
    ordered = null,
    compatibleDirection = false;
  if (opts.transparentEntry) {
    const budget = { remaining: 20000000 };
    const entryModule = ENTRY;
    const chosenStart =
        opts.entryStart ||
        (opts.autoRadius ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : null),
      proposals = [];
    let reason = null;
    for (const candidate of candidates.slice(0, 60)) {
      if (opts.acceptEntry && !opts.acceptEntry(candidate.point)) continue;
      const segment = segments[candidate.index],
        entry = candidate.point,
        t = tangent(segment, candidate.fraction),
        n = right(t);
      try {
        const trial = entryModule.circleLead({
          point: entry,
          tangent: t,
          normal: n,
          radius: radii[0],
          start: chosenStart,
          offset: compensationRadius,
          physical: opts.entryStartPhysical !== false,
          autoRadius: opts.autoRadius === true,
          sign: -1,
        });
        proposals.push({ trial, candidate, score: trial.radius });
      } catch (error) {
        reason = error;
        if (opts.entryPoint && opts.entryStart) throw error;
      }
    }
    proposals.sort(
      (a, b) =>
        a.score - b.score ||
        a.candidate.point.y - b.candidate.point.y ||
        a.candidate.point.x - b.candidate.point.x,
    );
    for (const { trial, candidate } of proposals) {
      if (!safeLead(trial, polygon, kind, compensationRadius, islands, budget)) continue;
      lead = trial;
      compatibleDirection = true;
      const i = candidate.index,
        f = candidate.fraction;
      ordered = [
        slice(segments[i], f, 1),
        ...segments.slice(i + 1),
        ...segments.slice(0, i),
        slice(segments[i], 0, f),
      ].filter((s) =>
        s.type === "arc" ? Math.abs(s.sweep) * s.r > 0.0005 : distance(s.a, s.b) > 0.0005,
      );
      break;
    }
    if (!lead && !opts.entryStart) {
      fallback: for (const candidate of candidates.slice(0, 24))
        for (const radius of [...new Set(radii)]) {
          if (opts.acceptEntry && !opts.acceptEntry(candidate.point)) continue;
          try {
            const segment = segments[candidate.index],
              t = tangent(segment, candidate.fraction),
              trial = entryModule.circleLead({
                point: candidate.point,
                tangent: t,
                normal: right(t),
                radius,
                offset: compensationRadius,
                sign: -1,
              });
            if (!safeLead(trial, polygon, kind, compensationRadius, islands, budget)) continue;
            lead = trial;
            compatibleDirection = true;
            const i = candidate.index,
              f = candidate.fraction;
            ordered = [
              slice(segments[i], f, 1),
              ...segments.slice(i + 1),
              ...segments.slice(0, i),
              slice(segments[i], 0, f),
            ].filter((s) =>
              s.type === "arc" ? Math.abs(s.sweep) * s.r > 0.0005 : distance(s.a, s.b) > 0.0005,
            );
            break fallback;
          } catch (error) {
            if (error.geometryComplexity) throw error;
            reason = error;
          }
        }
    }
    if (!lead && reason && opts.entryStart) throw reason;
    if (!lead) {
      const error = Error(
        "Круговой касательный заход не помещается. Измени начало, касание или R. Выбранные точки сохранены.",
      );
      error.entryPoint = opts.entryStart || opts.entryPoint;
      throw error;
    }
  }
  outer: for (const candidate of opts.transparentEntry ? [] : candidates.slice(0, 60))
    for (const radius of [...new Set(radii)]) {
      if (!Number.isFinite(radius) || radius <= compensationRadius + 0.002) continue;
      const segment = segments[candidate.index],
        entry = candidate.point,
        t = tangent(segment, candidate.fraction),
        n = right(t),
        beta = manualAngle
          ? (((((((Number(opts.approachAngle) % 360) + 360) % 360) * Math.PI) / 180 -
              Math.atan2(t.y, t.x)) %
              TAU) +
              TAU) %
            TAU
          : Math.PI / 2;
      if (beta < Math.PI / 180 || beta > Math.PI - Math.PI / 180) continue;
      compatibleDirection = true;
      const center = add(entry, n, radius),
        radial = rotate({ x: -n.x, y: -n.y }, beta),
        a = add(center, radial, radius),
        b = add(center, t, radius),
        initial = rotate(t, beta);
      for (const run of [
        Math.max(planningDiameter, 1),
        Math.max(compensationRadius * 1.5, 1),
        compensationRadius + 0.1,
      ]) {
        const trial = {
          radius,
          entry,
          t,
          n,
          initial,
          pre: add(a, initial, -run),
          post: add(b, n, run),
          arcIn: {
            type: "arc",
            a,
            b: entry,
            c: center,
            r: radius,
            sweep: -beta,
          },
          arcOut: {
            type: "arc",
            a: entry,
            b,
            c: center,
            r: radius,
            sweep: -Math.PI / 2,
          },
        };
        if (safeLead(trial, polygon, kind, compensationRadius, islands)) {
          lead = trial;
          const i = candidate.index,
            f = candidate.fraction;
          ordered = [
            slice(segments[i], f, 1),
            ...segments.slice(i + 1),
            ...segments.slice(0, i),
            slice(segments[i], 0, f),
          ].filter((s) =>
            s.type === "arc" ? Math.abs(s.sweep) * s.r > 0.0005 : distance(s.a, s.b) > 0.0005,
          );
          break outer;
        }
      }
    }
  if (!lead)
    throw Error(
      !compatibleDirection
        ? "Угол подхода несовместим с направлением обхода. Выберите «Авто» или подход с обрабатываемой стороны контура."
        : "Не найден заход для заданной точки и радиусной коррекции. Измените точку, угол или радиус захода. Для внутреннего контура нужен подготовленный вход.",
    );
  const allPoints = allContours
      .filter((c) => c.closed)
      .flatMap((c) => contourPoints(c, 0.2).map(shift)),
    left = Math.min(minX, ...allPoints.map((p) => p.x));
  const safe = {
    x:
      opts.safeX === null || opts.safeX === "" || opts.safeX === undefined
        ? left - opts.toolDiameter - 5
        : Number(opts.safeX),
    y: opts.safeY,
  };
  if (!Number.isFinite(safe.x)) throw Error("Введите X безопасной точки.");
  const quant = (p) => ({ x: toThousandths(p.x), y: toThousandths(p.y) }),
    xy = (p) => {
      const q = quant(p);
      return "X" + q.x + " Y" + q.y;
    },
    frames = [];
  const push = (command, stage, segment = null) => frames.push({ command, stage, segment });
  push("G92 X0 Y0 Z30000", "Начальная система координат");
  push("S400 F150 M03", "Шпиндель и подача");
  push("G90 G17", "Абсолютные X/Y, плоскость XY");
  push("G00 " + xy(safe), "Безопасная точка на Z30");
  push("G00 " + xy(lead.pre), "Подход на Z30", {
    type: "line",
    a: safe,
    b: lead.pre,
  });
  push("G01 Z" + toThousandths(opts.cutZ), "Рабочий уровень Z");
  const activation = { type: "line", a: lead.pre, b: lead.arcIn.a };
  push(
    "G01 G42 " + xy(activation.b) + " D" + String(opts.corrector).padStart(2, "0"),
    "Включение G42 на прямой",
    activation,
  );
  function emitArc(s, stage) {
    const start = Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x),
      cuts = [0, 1];
    if (!opts.compactArcs)
      for (let k = -12; k <= 12; k++) {
        const t = ((k * Math.PI) / 2 - start) / s.sweep;
        if (t > 1e-7 && t < 1 - 1e-7) cuts.push(t);
      }
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      var _opts$roundArcCentre;
      const part = slice(s, cuts[i - 1], cuts[i]),
        a = quant(part.a),
        b = quant(part.b);
      const full =
        Math.abs(Math.abs(part.sweep) - 2 * Math.PI) < 1e-8 && distance(part.a, part.b) < 1e-7;
      if (a.x === b.x && a.y === b.y && !full)
        throw Error("Дуга слишком мала для формата 0,001 мм.");
      const inMM = (p) => ({ x: p.x / 1000, y: p.y / 1000 });
      const fit =
        (_opts$roundArcCentre = opts.roundArcCentre) === null || _opts$roundArcCentre === void 0
          ? void 0
          : _opts$roundArcCentre.call(opts, inMM(a), inMM(b), part.c, part.sweep, 1000);
      if (opts.roundArcCentre && !fit)
        throw Error("Округление меняет направление дуги. Уточните геометрию.");
      const c = quant((fit === null || fit === void 0 ? void 0 : fit.centre) || part.c);
      const radiusMismatch = Math.abs(
        Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y),
      );
      if (radiusMismatch > 2.1)
        throw Error("Округление дуги превышает 0,002 мм. Уточните геометрию.");
      push(
        (s.sweep > 0 ? "G03 " : "G02 ") + xy(part.b) + " I" + (c.x - a.x) + " J" + (c.y - a.y),
        stage,
        part,
      );
    }
  }
  emitArc(lead.arcIn, "Радиусный заход");
  if (opts.compactArcs) ordered = opts.compactArcs(ordered);
  for (const s of ordered) {
    if (s.type === "arc") emitArc(s, "Обход контура");
    else if (distance(s.a, s.b) > 0.0005) push("G01 " + xy(s.b), "Обход контура", s);
  }
  emitArc(lead.arcOut, "Радиусный выход");
  const withdrawal = { type: "line", a: lead.arcOut.b, b: lead.post };
  push("G01 G40 " + xy(lead.post) + " D00", "Отключение коррекции на прямой", withdrawal);
  push("G00 Z30000", "Подъём до Z30");
  push("G00 X0 Y0", "Возврат в X0 Y0 на Z30");
  push("M05", "Остановка шпинделя");
  push("M30", "Конец программы");
  if (frames.length > 999) throw Error("Больше 999 кадров: сократите число элементов контура.");
  for (const [index, frame] of frames.entries())
    frame.text = "N" + String((index + 1) * 10).padStart(4, "0") + " " + frame.command + " *";
  return {
    text: frames.map((f) => f.text).join("\r\n"),
    frames,
    kind,
    contourId: contour.id,
    corrector: opts.corrector,
    direction: kind === "outer" ? "ПЧС" : "ЧС",
    safe,
    entry: lead.entry,
    approachAngle: (Math.atan2(lead.initial.y, lead.initial.x) * 180) / Math.PI,
    leadIn: lead.arcIn,
    leadOut: lead.arcOut,
    activation,
    withdrawal,
    outline: ordered,
    keepIslands: islands,
    toolRadius,
    compensationRadius,
    leadRadius: lead.radius,
    cutter: add(lead.entry, lead.n, compensationRadius),
    cutZ: opts.cutZ,
  };
}

export default {
  pointInside,
  contourKind,
  pathPoints,
  projectContourEntry,
  buildMillingProgram,
};
