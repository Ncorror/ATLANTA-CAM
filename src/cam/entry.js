import {
  sub as camSub,
  dot as camDot,
  dist as camDist,
  add as camAdd,
  mul as camMul,
  left as camLeft,
  unit as camUnit,
  len as camLen,
  cross as camCross,
  P as camP,
} from "../core/math.js";
import {
  point as camPoint,
  tangent as camTangent,
  line as camLine,
  arc as camArc,
  area as camArea,
  rev as camRev,
  slen as camSlen,
  bounds as camBounds,
} from "../core/segments.js";
import {
  roundXYSegment as camRoundXYSegment,
  compactArcs as camCompactArcs,
  isFullArc as camIsFullArc,
} from "../nc/format.js";
import { offsetContour as camOffsetContour } from "../core/contours.js";

import CONSTRUCTION from "../geometry/construction.js";
import { distance as wallDistance } from "../geometry/wall-distance.js";
const B = CONSTRUCTION,
  EPS = 1e-8;
function closest(p, s) {
  if (s.type === "L") {
    const v = camSub(s.b, s.a),
      t = Math.max(0, Math.min(1, camDot(camSub(p, s.a), v) / (camDot(v, v) || 1)));
    return { p: camPoint(s, t), t };
  }
  const angle = Math.atan2(p.y - s.c.y, p.x - s.c.x),
    start = Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x),
    sign = Math.sign(s.sw),
    travel = ((((angle - start) * sign) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (travel <= Math.abs(s.sw) + EPS) {
    const t = Math.max(0, Math.min(1, travel / Math.abs(s.sw)));
    return { p: camPoint(s, t), t };
  }
  return camDist(p, s.a) <= camDist(p, s.b) ? { p: { ...s.a }, t: 0 } : { p: { ...s.b }, t: 1 };
}
function nearest(path, p) {
  let hit = null;
  for (let i = 0; i < path.length; i++) {
    const q = closest(p, path[i]),
      d = camDist(q.p, p);
    if (!hit || d < hit.distance) hit = { ...q, index: i, distance: d };
  }
  return hit;
}
function tangentFromPoint(start, centre, radius, sign = -1, incoming = true) {
  const delta = camSub(start, centre),
    squared = camDot(delta, delta),
    r2 = radius * radius;
  if (!(radius > 0 && squared > r2 + 1e-10))
    fail("Начало должно находиться вне окружности захода. Измени начало или R.", start);
  const base = camAdd(centre, camMul(delta, r2 / squared)),
    height = (radius * Math.sqrt(squared - r2)) / squared;
  for (const branch of [-1, 1]) {
    const point = camAdd(base, camMul(camLeft(delta), branch * height));
    const tangent = camMul(camLeft(camUnit(camSub(point, centre))), sign);
    const travel = incoming ? camSub(point, start) : camSub(start, point);
    if (camDot(travel, tangent) > 0) return point;
  }
  fail("Не удалось построить касательную из выбранного начала.", start);
}
function lineApproach(start, direction, wall, radius, sign = -1) {
  const u = camUnit(direction),
    t = camTangent(wall),
    normal = camMul(camLeft(t), sign);
  if (wall.type !== "L" || camLen(u) < 0.9 || !(radius > 0.001))
    fail("Для захода нужны прямая стенка, направление и положительный R.", start);
  const rayCentre = camAdd(start, camMul(camLeft(u), sign * radius)),
    wallCentre = camAdd(wall.a, camMul(normal, radius)),
    den = camCross(u, t);
  if (Math.abs(den) < 1e-8) {
    const required = camDot(camSub(start, wall.a), normal) / 2;
    if (camDot(u, t) > -0.999999 || required <= 0)
      fail("Направления захода и стенки параллельны. Измени угол захода.", start);
    if (Math.abs(required - radius) > 0.001)
      fail(
        "Для этого угла открытой стенки нужен R" +
          required.toFixed(3) +
          " мм. Включи автоматический R или задай этот радиус. Точки сохранены.",
        start,
      );
    const advance = Math.max(0.01, camDot(camSub(start, wall.a), t) + 0.01),
      a = camAdd(start, camMul(u, advance)),
      centre = camAdd(a, camMul(camLeft(u), sign * radius)),
      b = camSub(centre, camMul(normal, radius));
    return {
      start: { ...start },
      contact: b,
      line: camLine(start, a),
      arc: camArc(a, b, centre, sign * Math.PI),
    };
  }
  const advance = camCross(camSub(wallCentre, rayCentre), t) / den;
  if (advance <= 0.0005)
    fail("Касательная точка находится позади начала захода. Измени начало или угол.", start);
  const a = camAdd(start, camMul(u, advance)),
    centre = camAdd(a, camMul(camLeft(u), sign * radius)),
    b = camSub(centre, camMul(normal, radius));
  let sweep =
    (Math.atan2(b.y - centre.y, b.x - centre.x) - Math.atan2(a.y - centre.y, a.x - centre.x)) *
    sign;
  sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (sweep < 1e-8 || sweep > Math.PI + 1e-8)
    fail("Заход требует разворота больше 180°. Измени угол захода.", start);
  return {
    start: { ...start },
    contact: b,
    line: camLine(start, a),
    arc: camArc(a, b, centre, sign * sweep),
  };
}
function openLead(path, start, radius, angle, sign = -1) {
  const first = path[0],
    point = first.a,
    t = camTangent(first);
  let lead;
  if (Number.isFinite(angle)) {
    const radians = (angle * Math.PI) / 180;
    lead = lineApproach(start, camP(Math.cos(radians), Math.sin(radians)), first, radius, sign);
    if (camDot(camSub(lead.contact, point), t) > 0.002)
      fail("Заход пропускает начало открытой стенки. Измени начало или угол.", start);
    path = [camLine(lead.contact, first.b), ...path.slice(1)];
  } else {
    const centre = camAdd(point, camMul(camLeft(t), sign * radius)),
      a = tangentFromPoint(start, centre, radius, sign);
    let sweep =
      Math.atan2(point.y - centre.y, point.x - centre.x) -
      Math.atan2(a.y - centre.y, a.x - centre.x);
    if (sign < 0) {
      while (sweep >= 0) sweep -= 2 * Math.PI;
    } else while (sweep <= 0) sweep += 2 * Math.PI;
    lead = {
      start: { ...start },
      contact: point,
      line: camLine(start, a),
      arc: camArc(a, point, centre, sweep),
    };
  }
  return {
    path,
    leadIn: [lead.line, lead.arc],
    entry: { ...start },
    attachment: lead.contact,
    radius,
  };
}
function contactLead(point, tangent, start, radius, sign, angle, autoRadius = false) {
  const t = camUnit(tangent);
  let r = radius,
    a,
    centre;
  if (Number.isFinite(angle)) {
    const radians = (angle * Math.PI) / 180,
      u = camP(Math.cos(radians), Math.sin(radians));
    const v = camMul(camSub(camLeft(u), camLeft(t)), sign),
      delta = camSub(point, start),
      den = camCross(u, v);
    if (Math.abs(den) < 1e-9)
      fail("Угол подхода совпадает с касательной. Для радиусного входа измени угол.", start);
    const required = camCross(u, delta) / den,
      advance = camCross(delta, v) / den;
    if (!(required >= 0.01 && advance > 0.0005))
      fail(
        "Заданный угол направляет заход от касания. Измени угол или начало; точки сохранены.",
        start,
      );
    if (autoRadius) r = required;
    else if (Math.abs(required - r) > 0.002)
      fail(
        "Для выбранных начала, касания и угла нужен R" +
          required.toFixed(3) +
          " мм. Включи автоматический R или введи этот радиус. Точки сохранены.",
        start,
      );
    a = camAdd(start, camMul(u, advance));
    centre = camAdd(point, camMul(camLeft(t), sign * r));
  } else {
    centre = camAdd(point, camMul(camLeft(t), sign * r));
    a = tangentFromPoint(start, centre, r, sign);
  }
  let sw =
    (Math.atan2(point.y - centre.y, point.x - centre.x) -
      Math.atan2(a.y - centre.y, a.x - centre.x)) *
    sign;
  sw = ((sw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (sw < 0.00001 || sw > Math.PI + 0.00001)
    fail(
      "Из этого начала заход требует разворота больше 180°. Измени начало или R; точки сохранены.",
      start,
    );
  return {
    radius: r,
    segments: [camLine(start, a), camArc(a, point, centre, sign * sw)],
  };
}
function boundaryPlan(path, c, clear, cuttingRadius, preferredSign = 1) {
  const first = path[0],
    last = path.at(-1),
    point = first.a,
    end = last.b,
    t = camTangent(first),
    out = camTangent(last, true);
  const requested = c.autoLead ? Math.max(10, c.lead) : c.lead;
  if (!(requested >= 0.01))
    fail(
      "Для касательного захода задай R не меньше 0,01 мм или включи автоматический R.",
      c.entryStart || point,
    );
  const radii = c.autoLead
    ? [
        requested,
        requested / 2,
        requested / 4,
        requested / 8,
        requested / 16,
        requested / 32,
        0.01,
        requested * 2,
        requested * 4,
      ]
    : [requested];
  const run = c.entryRun === undefined ? Math.max(1, c.diameter / 2 + 0.01) : c.entryRun;
  if (!(run > 0.0005))
    fail("Длина прямого подвода должна быть положительной.", c.entryStart || point);
  const runs = c.autoLead && c.entryRun === undefined ? [run, run * 2, run * 4] : [run];
  if (c.autoLead && c.stockShape === "circle" && !c.allowPlunge)
    runs.push(Math.max(run, c.stockDia + c.diameter));
  const angles =
    c.autoLead && !c.entryStart
      ? [Math.PI / 2, Math.PI / 3, Math.PI / 4, (Math.PI * 3) / 4]
      : [Math.PI / 2];
  const rotate = (v, a) =>
    camP(v.x * Math.cos(a) - v.y * Math.sin(a), v.x * Math.sin(a) + v.y * Math.cos(a));
  const lead = (p, t, r, sign, angle, length, incoming) => {
    const n = camMul(camLeft(t), sign),
      centre = camAdd(p, camMul(n, r)),
      radial = rotate(camMul(n, -1), sign * angle * (incoming ? -1 : 1)),
      q = camAdd(centre, camMul(radial, r)),
      u = camMul(camLeft(radial), sign);
    const free = camAdd(q, camMul(u, length * (incoming ? -1 : 1)));
    return incoming
      ? [camLine(free, q), camArc(q, p, centre, sign * angle)]
      : [camArc(p, q, centre, sign * angle), camLine(q, free)];
  };
  const safe = (s) => {
    const rounded = camRoundXYSegment(s, c);
    return (
      rounded &&
      clear(s, cuttingRadius) &&
      clear(rounded.segment, cuttingRadius + rounded.radiusError - 0.002)
    );
  };
  let reason = null;
  for (const r of radii)
    for (const sign of [preferredSign, -preferredSign])
      for (const angle of angles)
        for (const length of runs)
          try {
            const automatic = lead(point, t, r, sign, angle, length, true),
              start = c.entryStart ? camP(c.entryStart.x, c.entryStart.y) : automatic[0].a;
            const incoming = c.entryStart
              ? contactLead(
                  point,
                  t,
                  start,
                  r,
                  sign,
                  c.directedEntry ? c.entryAngle : undefined,
                  c.autoLead,
                )
              : { radius: r, segments: automatic };
            if (
              !incoming.segments.every(safe) ||
              !clear(camLine(start, start), c.diameter / 2 - 0.003)
            )
              continue;
            if (
              c.stockShape === "circle" &&
              !c.allowPlunge &&
              camDist(
                { x: start.x - c.originX, y: start.y - c.originY },
                { x: c.stockX, y: c.stockY },
              ) <
                c.stockDia / 2 + c.diameter / 2 + 0.001
            )
              continue;
            for (const exitSign of [preferredSign, -preferredSign]) {
              const leadOut = lead(end, out, incoming.radius, exitSign, angle, length, false),
                post = leadOut.at(-1).b;
              if (!leadOut.every(safe) || !clear(camLine(post, post), c.diameter / 2 - 0.003))
                continue;
              return {
                path,
                entry: start,
                exit: post,
                attachment: point,
                leadIn: incoming.segments,
                leadOut,
                radius: incoming.radius,
                manualEntry: !!c.entryStart,
                tangentEntry: true,
              };
            }
          } catch (error) {
            reason = reason || error;
          }
  if (reason) throw reason;
  fail(
    "Касательный заход или выход задевает стенку. Измени начало, R или сторону обработки; точки, фреза и D сохранены.",
    c.entryStart || point,
  );
}
function compensatedSegment(segment, offset) {
  if (segment.type === "L") {
    const shift = camMul(camLeft(camTangent(segment)), -offset);
    return camLine(camAdd(segment.a, shift), camAdd(segment.b, shift));
  }
  const r = camDist(segment.a, segment.c),
    nominal = r + Math.sign(segment.sw) * offset;
  if (!(nominal > 0.002))
    fail("Радиус этой дуги не допускает выбранное значение D. Измени R; D сохранён.", segment.a);
  const at = (p) => camAdd(segment.c, camMul(camSub(p, segment.c), nominal / r));
  return camArc(at(segment.a), at(segment.b), segment.c, segment.sw);
}
function boundaryBasis(contour, c) {
  if (!contour || contour.closed || !contour.segs.length) return null;
  const material = contour.materialLeft,
    explicit = c.openOffsetSide === "left" ? 1 : c.openOffsetSide === "right" ? -1 : 0;
  const first = contour.segs[0],
    last = contour.segs.at(-1);
  const area = camArea([...contour.segs, camLine(last.b, first.a)]);
  const basis = material || Math.sign(area);
  let inferred = false;
  if (![-1, 1].includes(material) && !explicit) {
    if (Math.abs(area) < 0.001) return null;
    const outward = camMul(camLeft(camUnit(camSub(last.b, first.a))), basis);
    if (
      camDot(camMul(camTangent(first), -1), outward) > EPS &&
      camDot(camTangent(last, true), outward) > EPS
    )
      return null;
    inferred = true;
  }
  return { basis: basis || 1, inferred };
}
function boundaryRoute(contour, c, side) {
  const profile = boundaryBasis(contour, c);
  if (!profile) return null;
  const { basis, inferred } = profile,
    explicit = c.openOffsetSide === "left" ? 1 : c.openOffsetSide === "right" ? -1 : 0;
  let wanted;
  if (c.direction === "cw") wanted = -1;
  else if (c.direction === "ccw") wanted = 1;
  else if (!c.direction || c.direction === "climb" || c.direction === "conventional")
    wanted = (side === "outside" ? 1 : -1) * (c.direction === "conventional" ? -1 : 1);
  else throw Error("Неизвестное направление обработки открытой стенки.");
  const path = (basis || 1) === wanted ? contour.segs : contour.segs.slice().reverse().map(camRev),
    offsetSign = explicit || (side === "outside" ? -wanted : wanted);
  return {
    path: camCompactArcs(camOffsetContour(path, 0, c.tolerance, false)),
    comp: offsetSign > 0 ? 41 : 42,
    offsetSign,
    inferred,
  };
}
function piece(s, a, b) {
  const from = a === 0 ? s.a : camPoint(s, a),
    to = b === 1 ? s.b : camPoint(s, b);
  return s.type === "L" ? camLine(from, to) : camArc(from, to, s.c, s.sw * (b - a));
}
function rotate(path, p) {
  const hit = nearest(path, p);
  if (!hit) throw Error("Нет геометрии для выбора захода.");
  const s = path[hit.index],
    length = camSlen(s),
    tol = 0.000001;
  let result;
  if (hit.t * length < tol) result = [...path.slice(hit.index), ...path.slice(0, hit.index)];
  else if ((1 - hit.t) * length < tol) {
    const n = (hit.index + 1) % path.length;
    result = [...path.slice(n), ...path.slice(0, n)];
  } else
    result = [
      piece(s, hit.t, 1),
      ...path.slice(hit.index + 1),
      ...path.slice(0, hit.index),
      piece(s, 0, hit.t),
    ];
  return result;
}
function shape(s, id) {
  return s.type === "L"
    ? { id, type: "line", a: s.a, b: s.b }
    : camIsFullArc(s)
      ? { id, type: "circle", c: s.c, r: camDist(s.a, s.c) }
      : { id, type: "arc", a: s.a, m: camPoint(s, 0.5), b: s.b };
}
function clearance(walls, strict = true) {
  const index = B.makeIndex(walls.map((s, i) => shape(s, "entry-wall-" + i))),
    limit = strict ? 20000000 : 2000000;
  let work = 0;
  return (segment, radius) => {
    if (!strict && work >= limit) return false;
    const box = camBounds([segment]),
      point = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 },
      span = Math.max(box.w, box.h) / 2 + radius,
      primitive = shape(segment, "entry-cut");
    return index.near(point, span).every((item) => {
      if (++work > limit) {
        if (!strict) return false;
        throw Error("Слишком много проверок радиусного захода. Раздели обработку.");
      }
      return wallDistance(segment, walls[item.index], primitive, item.item) >= radius - 0.000002;
    });
  };
}
function fail(text, point) {
  const error = Error(text);
  error.entryPoint = { x: point.x, y: point.y };
  throw error;
}
function circleLead({
  point,
  tangent,
  normal,
  radius,
  start,
  offset = 0,
  physical = false,
  autoRadius = false,
  sign = -1,
}) {
  const p = { ...point },
    t = camUnit(tangent),
    n = camUnit(normal),
    supplied = start && { x: start.x, y: start.y };
  let r = radius;
  if (supplied) {
    const delta = camSub(supplied, p),
      d = physical ? offset : 0,
      denominator = 2 * (camDot(delta, n) - d);
    const required = (camDot(delta, delta) - d * d) / denominator;
    if (!(denominator > 0.000001 && required > offset + 0.002 && Number.isFinite(required)))
      fail(
        "Из этого начала нельзя построить касательную дугу к выбранному касанию. Поставь начало с обрабатываемой стороны контура.",
        supplied,
      );
    if (autoRadius) r = required;
    else if (
      !Number.isFinite(r) ||
      Math.abs(camDist(supplied, camAdd(p, camMul(n, r))) - (r - d)) > 0.002
    )
      fail(
        "Выбранные начало и касание требуют R" +
          required.toFixed(3) +
          " мм. Включи автоматический R или введи этот радиус. Точки сохранены.",
        supplied,
      );
  }
  if (!(Number.isFinite(r) && r >= 0.01 && r > offset + 0.002))
    fail(
      "R захода должен быть не меньше 0,01 мм и больше D. Увеличь R; начало и касание сохранены.",
      supplied || p,
    );
  const centre = camAdd(p, camMul(n, r));
  const nominal = supplied
    ? physical
      ? camAdd(centre, camMul(camUnit(camSub(supplied, centre)), r))
      : supplied
    : camAdd(p, camMul(n, 2 * r));
  const physicalStart = camAdd(centre, camMul(camSub(nominal, centre), (r - offset) / r));
  let sweep =
    (Math.atan2(p.y - centre.y, p.x - centre.x) -
      Math.atan2(nominal.y - centre.y, nominal.x - centre.x)) *
    sign;
  sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (sweep < 0.00001 || sweep > 2 * Math.PI - 0.00001)
    fail("Начало совпадает с касанием. Выбери отдельную точку начала захода.", supplied || p);
  const arcIn = {
    type: "arc",
    a: nominal,
    b: p,
    c: centre,
    r,
    sweep: sign * sweep,
  };
  const arcOut = {
    type: "arc",
    a: p,
    b: nominal,
    c: centre,
    r,
    sweep: sign * (2 * Math.PI - sweep),
  };
  const initial = camMul(camLeft(camUnit(camSub(nominal, centre))), sign);
  return {
    radius: r,
    entry: p,
    t,
    n,
    initial,
    pre: nominal,
    post: nominal,
    arcIn,
    arcOut,
    physicalStart,
    transparent: true,
  };
}
function plan(path, point, c, clear, radius) {
  if (camDist(path[0].a, path.at(-1).b) > 0.0005)
    fail("Выбери заход на замкнутом контуре или открытой стенке с автозаходом.", point);
  const rotated = rotate(path, point),
    p = rotated[0].a,
    t = camTangent(rotated[0]),
    last = camTangent(rotated.at(-1), true);
  if (camLen(t) < 0.5 || camLen(last) < 0.5)
    fail("Недостаточно длины контура для касательного захода. Выбери другой участок.", p);
  const requested = c.autoLead ? Math.max(c.diameter / 2, c.lead) : c.lead;
  if (!Number.isFinite(requested) || requested < 0.01)
    fail("Для дуги захода задай R не меньше 0,01 мм или включи автоподбор R.", p);
  if (c.entryStart) {
    let reason = null;
    for (const sign of [-1, 1])
      try {
        const lead = circleLead({
          point: p,
          tangent: t,
          normal: camMul(camLeft(t), sign),
          radius: requested,
          start: c.entryStart,
          autoRadius: c.autoLead,
          physical: true,
          sign,
        });
        const arcIn = camArc(lead.arcIn.a, lead.arcIn.b, lead.arcIn.c, lead.arcIn.sweep),
          arcOut = camArc(lead.arcOut.a, lead.arcOut.b, lead.arcOut.c, lead.arcOut.sweep);
        if (!clear(arcIn, radius) || !clear(arcOut, radius)) continue;
        if (
          c.stockShape === "circle" &&
          !c.allowPlunge &&
          camDist(
            { x: lead.pre.x - c.originX, y: lead.pre.y - c.originY },
            { x: c.stockX, y: c.stockY },
          ) <
            c.stockDia / 2 + c.diameter / 2 + 0.001
        )
          continue;
        return {
          path: rotated,
          entry: lead.pre,
          exit: lead.post,
          leadIn: [arcIn],
          leadOut: [arcOut],
          radius: lead.radius,
          attachment: { ...p },
          entryCircle: { c: lead.arcIn.c, r: lead.radius },
        };
      } catch (error) {
        reason = error;
      }
    if (reason) throw reason;
    fail(
      "Из выбранного начала круговой заход задевает стенку. Измени начало, касание или R. Точки сохранены.",
      c.entryStart,
    );
  }
  const radii = [requested];
  if (c.autoLead) {
    for (let r = requested / 2, i = 0; r >= 0.01 && i < 20; r /= 2, i++) radii.push(r);
    if (radii.at(-1) > 0.01) radii.push(0.01);
    radii.push(requested * 2, requested * 4);
  }
  for (const r of radii) {
    if (r < 0.01) continue;
    for (const sign of [-1, 1]) {
      const n = camMul(camLeft(t), sign),
        out = camMul(camLeft(last), sign),
        center = camAdd(p, camMul(n, r)),
        exitCenter = camAdd(p, camMul(out, r)),
        entry = camAdd(p, camMul(n, 2 * r)),
        exit = camAdd(p, camMul(out, 2 * r));
      const leadIn = camArc(entry, p, center, sign * Math.PI),
        leadOut = camArc(p, exit, exitCenter, sign * Math.PI);
      if (!clear(leadIn, radius) || !clear(leadOut, radius)) continue;
      if (
        c.stockShape === "circle" &&
        !c.allowPlunge &&
        camDist({ x: entry.x - c.originX, y: entry.y - c.originY }, { x: c.stockX, y: c.stockY }) <
          c.stockDia / 2 + c.diameter / 2 + 0.001
      )
        continue;
      return {
        path: rotated,
        entry,
        exit,
        leadIn: [leadIn],
        leadOut: [leadOut],
        radius: r,
        attachment: { ...p },
      };
    }
  }
  fail(
    "В выбранном месте радиусный заход задевает выбранную стенку или вход находится в заготовке. Выбери другое место, меньший R или автоподбор R.",
    p,
  );
}
function automaticCandidates(path) {
  const count = Math.min(path.length, 12),
    best = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i * path.length) / count),
      to = Math.floor(((i + 1) * path.length) / count);
    let index = from,
      length = 0;
    for (let j = from; j < to; j++) {
      const candidate = camSlen(path[j]);
      if (candidate > length) {
        index = j;
        length = candidate;
      }
    }
    if (length > 0.01) best.push({ index, length });
  }
  return best.sort((a, b) => b.length - a.length);
}
function automaticPlan(path, c, clear, radius, side) {
  const sign = Math.sign(camArea(path)) * (side === "outside" ? -1 : 1);
  if (!sign) return null;
  const preferred = Math.max(c.lead, c.diameter / 2);
  const radii = [preferred, preferred / 2, preferred / 4, preferred / 8];
  if (c.stockShape === "circle" && !c.allowPlunge) radii.push(preferred * 2, preferred * 4);
  const candidates = automaticCandidates(path),
    rounding = 2 / (c.decimal ? 1000 : c.coordScale);
  for (const r of radii) {
    if (r < 0.01) continue;
    for (const { index } of candidates) {
      const segment = path[index],
        first = piece(segment, 0.5, 1),
        last = piece(segment, 0, 0.5);
      const p = first.a,
        t = camTangent(first),
        n = camMul(camLeft(t), sign),
        centre = camAdd(p, camMul(n, r));
      const a = camSub(centre, camMul(t, r)),
        b = camAdd(centre, camMul(t, r)),
        run = Math.max(0.01, Math.min(r, c.diameter / 2));
      const entry = camAdd(a, camMul(n, run)),
        exit = camAdd(b, camMul(n, run)),
        turn = (sign * Math.PI) / 2;
      if (
        c.stockShape === "circle" &&
        !c.allowPlunge &&
        camDist({ x: entry.x - c.originX, y: entry.y - c.originY }, { x: c.stockX, y: c.stockY }) <
          c.stockDia / 2 + c.diameter / 2 + 0.001 + rounding
      )
        continue;
      const leadIn = [camLine(entry, a), camArc(a, p, centre, turn)],
        leadOut = [camArc(p, b, centre, turn), camLine(b, exit)];
      const safe = [...leadIn, ...leadOut].every((s) => {
        const rounded = camRoundXYSegment(s, c);
        return (
          rounded &&
          clear(s, radius) &&
          clear(rounded.segment, radius + rounded.radiusError - rounding)
        );
      });
      if (safe)
        return {
          path: [first, ...path.slice(index + 1), ...path.slice(0, index), last],
          entry,
          exit,
          leadIn,
          leadOut,
          radius: r,
          attachment: { ...p },
        };
    }
  }
  return null;
}
function automaticPlanner(c, sourceWalls) {
  if (c.machine !== "fanuc3000c" || !c.autoLead || !(c.lead > 0)) return null;
  const cache = new Map();
  let clear = null;
  return ({ contour, path, side, allowance, radialExtra }) => {
    if (!contour.closed || contour.preparedPath || side === "on") return null;
    let plans = cache.get(contour);
    if (!plans) {
      plans = new Map();
      cache.set(contour, plans);
    }
    if (!plans.has(radialExtra)) {
      clear = clear || clearance(sourceWalls, false);
      plans.set(
        radialExtra,
        automaticPlan(path, c, clear, c.diameter / 2 + allowance + radialExtra, side),
      );
    }
    return plans.get(radialExtra);
  };
}
function openPlan(path, c) {
  const point = path[0].a,
    choice = c.startPoint || point;
  if (camDist(choice, point) > 0.003)
    fail(
      "Для открытой цепочки выбери касание на начальном конце обхода или смени направление. Вся цепочка должна остаться в обработке.",
      choice,
    );
  const requested = c.lead || c.diameter / 2;
  if (!(requested >= 0.01)) fail("Для открытого контура нужен положительный R захода.", choice);
  if (!c.entryStart)
    fail("Для ручного захода открытого контура задай отдельное начало в свободном месте.", choice);
  const radii = c.autoLead
    ? [requested, requested / 2, requested / 4, requested / 8, requested / 16]
    : [requested];
  let reason = null;
  for (const nominal of radii)
    for (const sign of [-1, 1])
      try {
        const radians = c.directedEntry ? (c.entryAngle * Math.PI) / 180 : null,
          t = camTangent(path[0]);
        let radius = nominal;
        if (radians !== null && c.autoLead) {
          const u = camP(Math.cos(radians), Math.sin(radians));
          if (camDot(u, t) < -0.999999) {
            const required = camDot(camSub(c.entryStart, point), camMul(camLeft(t), sign)) / 2;
            if (required > 0.01) radius = required;
          }
        }
        const lead = openLead(
          path,
          c.entryStart,
          radius,
          c.directedEntry ? c.entryAngle : undefined,
          sign,
        );
        if (Math.abs(lead.leadIn.at(-1).sw) > Math.PI + 0.00001) continue;
        const end = lead.path.at(-1).b,
          tangent = camTangent(lead.path.at(-1), true),
          normal = camMul(camLeft(tangent), sign),
          centre = camAdd(end, camMul(normal, radius)),
          exit = camAdd(centre, camMul(tangent, radius));
        const radial = camSub(exit, centre),
          exitTangent = camMul(camLeft(camUnit(radial)), sign),
          post = camAdd(exit, camMul(exitTangent, Math.min(radius, c.diameter / 2)));
        return {
          ...lead,
          exit: post,
          leadOut: [camArc(end, exit, centre, (sign * Math.PI) / 2), camLine(exit, post)],
          attachment: { ...choice },
        };
      } catch (error) {
        reason = error;
      }
  if (reason) throw reason;
  fail(
    "Из выбранного начала нельзя построить короткий касательный заход с этим R. Включи автоматический R или измени начало.",
    c.entryStart,
  );
}
function create(contours, c, preparedPaths, sourceWalls, networkInfo) {
  if (c.toolKind !== "mill") return null;
  if (contours.filter((item) => item.enabled).every((item) => item.entryHandled)) return null;
  if (!c.startPoint && !c.entryStart) return automaticPlanner(c, sourceWalls);
  const choice = c.startPoint || c.entryStart;
  if (!Number.isFinite(choice.x) || !Number.isFinite(choice.y))
    throw Error("Точка захода должна содержать правильные координаты X/Y.");
  const all = [];
  for (const contour of contours.filter((item) => item.enabled)) {
    var _preparedPaths$contou;
    const paths = ((_preparedPaths$contou = preparedPaths[contour.id]) === null ||
    _preparedPaths$contou === void 0
      ? void 0
      : _preparedPaths$contou.paths) || [contour.segs];
    for (const path of paths)
      if (
        path.length &&
        (camDist(path[0].a, path.at(-1).b) <= 0.0005 || (!contour.closed && contour.side === "on"))
      )
        all.push({
          contour,
          path,
          open: !contour.closed && !contour.openWall && !contour.wallNetwork,
          prepared: !!preparedPaths[contour.id],
          distance: nearest(path, choice).distance,
        });
  }
  let eligible = all.filter(
    (item) =>
      !choice.contourId ||
      item.contour.id === choice.contourId ||
      item.contour.sourceId === choice.contourId,
  );
  const selected = eligible.sort((a, b) => a.distance - b.distance)[0];
  if (!selected)
    fail(
      "Контур выбранного захода изменился или не замкнут. Укажи касание заново. Точка не перенесена.",
      choice,
    );
  const clear = clearance(sourceWalls),
    cache = new Map();
  return (context) => {
    if (
      selected.prepared
        ? context.contour.preparedPath !== selected.path
        : context.contour.id !== selected.contour.id
    )
      return null;
    const key = context.radialExtra;
    if (cache.has(key)) return cache.get(key);
    const radius = context.contour.openWall
      ? context.contour.openWallInfo.radius
      : context.contour.wallNetwork
        ? c.diameter / 2 +
          ((networkInfo === null || networkInfo === void 0 ? void 0 : networkInfo.allowance) || 0)
        : c.diameter / 2 + context.allowance + context.radialExtra;
    const result = selected.open
      ? openPlan(context.path, c)
      : plan(context.path, c.startPoint || nearest(context.path, c.entryStart).p, c, clear, radius);
    cache.set(key, result);
    return result;
  };
}

const api = {
  closest,
  nearest,
  tangentFromPoint,
  lineApproach,
  openLead,
  contactLead,
  boundaryPlan,
  compensatedSegment,
  boundaryBasis,
  boundaryRoute,
  rotate,
  clearance,
  circleLead,
  plan,
  create,
};
export default api;
