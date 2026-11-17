import { isGuide as camIsGuide, isConstruction as camIsConstruction } from "./marks.js";
import {
  dist as camDist,
  unit as camUnit,
  sub as camSub,
  left as camLeft,
  add as camAdd,
  mul as camMul,
  dot as camDot,
  len as camLen,
  cross as camCross,
  P as camP,
} from "../core/math.js";
import {
  arcThroughPoints as camArcThroughPoints,
  pSegDist as camPSegDist,
  line as camLine,
  arc as camArc,
} from "../core/segments.js";

const EPS = 0.0005,
  TAU = 2 * Math.PI;
const pt = (p) => ({ x: p.x, y: p.y }),
  finite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y),
  mod = (n) => ((n % TAU) + TAU) % TAU;
function basis(item) {
  camIsGuide(item);
  if (
    !item ||
    item.type !== "line" ||
    !finite(item.a) ||
    !finite(item.b) ||
    camDist(item.a, item.b) <= 0.001
  )
    throw Error("Для направляющей нужна прямая с двумя разными опорными точками.");
  const d = camUnit(camSub(item.b, item.a));
  return { a: item.a, d, n: camLeft(d) };
}
function projection(item, p) {
  const b = basis(item);
  return camAdd(b.a, camMul(b.d, camDot(camSub(p, b.a), b.d)));
}
function signedDistance(item, p) {
  const b = basis(item);
  return camDot(camSub(p, b.a), b.n);
}
function number(value) {
  const text = String(value).trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))
    throw Error("Введи смещение в миллиметрах. Можно использовать точку или запятую.");
  const n = Number(text);
  if (!Number.isFinite(n) || Math.abs(n) > 1e6) throw Error("Проверь смещение направляющей.");
  return n;
}
function offset(reference, pointer, distanceText = "") {
  if (!finite(pointer)) throw Error("Укажи сторону смещения мышью.");
  const b = basis(reference),
    mouse = camDot(camSub(pointer, b.a), b.n),
    explicit = String(distanceText).trim() !== "",
    value = explicit ? number(distanceText) : mouse;
  const shift = explicit ? value * (mouse < 0 ? -1 : 1) : value,
    delta = camMul(b.n, shift),
    a = camAdd(b.a, delta),
    end = camAdd(a, b.d);
  if (![a, end].every((p) => finite(p) && Math.abs(p.x) < 1e6 && Math.abs(p.y) < 1e6))
    throw Error("Направляющая выходит за допустимые координаты эскиза.");
  return {
    item: { type: "line", construction: true, guide: true, a, b: end },
    offset: shift,
    distance: Math.abs(shift),
    dx: delta.x,
    dy: delta.y,
    angle: (Math.atan2(b.d.y, b.d.x) * 180) / Math.PI,
  };
}
const diameterLabels = ["¼", "½", "¾", "1Ø"];
function validDiameter(diameter) {
  return Number.isFinite(diameter) && diameter > 0 && diameter <= 1e6;
}
function diameterMarks(reference, anchor, pointer, diameter) {
  if (!validDiameter(diameter) || !finite(anchor) || !finite(pointer)) return [];
  const b = basis(reference),
    side = camDot(camSub(pointer, b.a), b.n) < 0 ? -1 : 1,
    base = camAdd(b.a, camMul(b.d, camDot(camSub(anchor, b.a), b.d))),
    marks = [];
  for (let n = 1; n <= 4; n++) {
    const distance = (diameter * n) / 4,
      shift = side * distance;
    marks.push({
      numerator: n,
      denominator: 4,
      distance,
      offset: shift,
      p: camAdd(base, camMul(b.n, shift)),
      label: diameterLabels[n - 1],
    });
  }
  return marks;
}
function snapDiameter(reference, pointer, diameter, toleranceMm) {
  if (!finite(pointer)) throw Error("Укажи сторону смещения мышью.");
  const raw = signedDistance(reference, pointer),
    unchanged = { offset: raw, distance: Math.abs(raw), mark: null };
  if (!validDiameter(diameter) || !Number.isFinite(toleranceMm) || toleranceMm < 0)
    return unchanged;
  const tolerance = Math.min(toleranceMm, diameter / 12),
    side = raw < 0 ? -1 : 1;
  let nearest = 0,
    error = Infinity;
  for (let n = 1; n <= 4; n++) {
    const candidate = (diameter * n) / 4,
      d = Math.abs(Math.abs(raw) - candidate);
    if (d < error) {
      error = d;
      nearest = n;
    }
  }
  if (error > tolerance + 1e-12 * Math.max(1, diameter, Math.abs(raw))) return unchanged;
  const distance = (diameter * nearest) / 4,
    shift = side * distance,
    mark = {
      numerator: nearest,
      denominator: 4,
      distance,
      offset: shift,
      label: diameterLabels[nearest - 1],
    };
  return { offset: shift, distance, mark };
}
function snapGeometry(reference, pointer, candidatePoints, toleranceMm) {
  if (
    !finite(pointer) ||
    !Number.isFinite(toleranceMm) ||
    toleranceMm <= 0 ||
    !candidatePoints ||
    !candidatePoints.length
  )
    return null;
  const b = basis(reference),
    raw = camDot(camSub(pointer, b.a), b.n);
  let best = null,
    bestError = toleranceMm * 1.2;
  for (const item of candidatePoints) {
    const pt = item.p || item,
      kind = item.kind || "Точка";
    if (!finite(pt)) continue;
    const d2d = camDist(pointer, pt);
    if (d2d <= toleranceMm * 1.2 && d2d < bestError) {
      bestError = d2d;
      best = { point: pt, kind, offset: camDot(camSub(pt, b.a), b.n) };
    }
  }
  if (best)
    return {
      offset: best.offset,
      distance: Math.abs(best.offset),
      point: best.point,
      kind: best.kind,
    };
  bestError = toleranceMm;
  for (const item of candidatePoints) {
    const pt = item.p || item,
      kind = item.kind || "Точка";
    if (!finite(pt)) continue;
    const off = camDot(camSub(pt, b.a), b.n),
      diff = Math.abs(raw - off);
    if (diff <= toleranceMm && diff < bestError) {
      bestError = diff;
      best = { point: pt, kind, offset: off };
    }
  }
  return best
    ? {
        offset: best.offset,
        distance: Math.abs(best.offset),
        point: best.point,
        kind: best.kind,
      }
    : null;
}
function clip(a, b, box, infinite) {
  if (
    !finite(a) ||
    !finite(b) ||
    !box ||
    ![box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite) ||
    box.maxX < box.minX ||
    box.maxY < box.minY
  )
    return [];
  const d = camSub(b, a);
  if (camLen(d) < 1e-12) return [];
  let low = infinite ? -Infinity : 0,
    high = infinite ? Infinity : 1;
  for (const [key, min, max] of [
    ["x", box.minX, box.maxX],
    ["y", box.minY, box.maxY],
  ]) {
    if (d[key] === 0) {
      if (a[key] < min || a[key] > max) return [];
      continue;
    }
    let first = (min - a[key]) / d[key],
      last = (max - a[key]) / d[key];
    if (first > last) {
      const hold = first;
      first = last;
      last = hold;
    }
    low = Math.max(low, first);
    high = Math.min(high, last);
    if (low > high + 1e-12) return [];
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) return [];
  return [camAdd(a, camMul(d, low)), camAdd(a, camMul(d, high))];
}
function clipScreen(a, b, width, height) {
  return clip(a, b, { minX: 0, minY: 0, maxX: width, maxY: height }, true);
}
function circular(item) {
  if (item.type === "circle") return { c: item.c, r: item.r, start: 0, sweep: TAU };
  if (item.type !== "arc") throw Error("Для пересечения нужна линия, дуга или окружность.");
  const g = camArcThroughPoints(item.a, item.m, item.b);
  if (!g) throw Error("Три точки дуги лежат на одной прямой или совпадают.");
  return g;
}
function contains(item, p, tolerance = EPS) {
  if (item.type === "line") {
    const b = basis(item),
      v = camSub(p, item.a),
      along = camDot(v, b.d);
    return (
      Math.abs(camDot(v, b.n)) <= tolerance &&
      (camIsGuide(item) || (along >= -tolerance && along <= camDist(item.a, item.b) + tolerance))
    );
  }
  const g = circular(item);
  if (Math.abs(camDist(p, g.c) - g.r) > tolerance) return false;
  if (item.type === "circle") return true;
  if (camDist(p, item.a) <= tolerance || camDist(p, item.b) <= tolerance) return true;
  const angle = Math.atan2(p.y - g.c.y, p.x - g.c.x),
    turn = g.sweep > 0 ? mod(angle - g.start) : mod(g.start - angle);
  return turn <= Math.abs(g.sweep) + tolerance / Math.max(tolerance, g.r);
}
function intersections(first, second) {
  camIsGuide(first);
  camIsGuide(second);
  let candidates = [];
  if (first.type === "line" && second.type === "line") {
    const u = basis(first).d,
      v = basis(second).d,
      det = camCross(u, v);
    if (Math.abs(det) > 1e-12)
      candidates = [camAdd(first.a, camMul(u, camCross(camSub(second.a, first.a), v) / det))];
  } else if (first.type === "line" || second.type === "line") {
    const line = first.type === "line" ? first : second,
      g = circular(first.type === "line" ? second : first),
      d = basis(line).d,
      f = camSub(line.a, g.c),
      along = camDot(f, d),
      closest = camSub(f, camMul(d, along)),
      disc = g.r * g.r - camDot(closest, closest),
      slack = 1e-10 * Math.max(1, g.r * g.r);
    if (disc >= -slack) {
      const delta = Math.sqrt(Math.max(0, disc));
      candidates = [
        camAdd(line.a, camMul(d, -along - delta)),
        camAdd(line.a, camMul(d, -along + delta)),
      ];
    }
  } else {
    const a = circular(first),
      b = circular(second),
      d = camDist(a.c, b.c);
    if (d > 1e-10 && d <= a.r + b.r + 1e-8 && d >= Math.abs(a.r - b.r) - 1e-8) {
      const along = (a.r * a.r - b.r * b.r + d * d) / (2 * d),
        height = Math.sqrt(Math.max(0, a.r * a.r - along * along)),
        u = camMul(camSub(b.c, a.c), 1 / d),
        middle = camAdd(a.c, camMul(u, along)),
        delta = camMul(camLeft(u), height);
      candidates = [camAdd(middle, delta), camSub(middle, delta)];
    }
  }
  const out = [];
  for (const p of candidates)
    if (
      finite(p) &&
      contains(first, p) &&
      contains(second, p) &&
      !out.some((q) => camDist(p, q) < EPS)
    )
      out.push(p);
  return out;
}
function intersectsRect(item, box) {
  camIsGuide(item);
  if (!box || box.maxX < box.minX || box.maxY < box.minY) return false;
  if (item.type === "line") return clip(item.a, item.b, box, camIsGuide(item)).length > 0;
  const g = circular(item),
    inside = (p) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
  if (item.type === "circle" ? inside(camP(g.c.x + g.r, g.c.y)) : inside(item.a) || inside(item.b))
    return true;
  const corners = [
    camP(box.minX, box.minY),
    camP(box.maxX, box.minY),
    camP(box.maxX, box.maxY),
    camP(box.minX, box.maxY),
  ];
  for (let i = 0; i < 4; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 4];
    if (camDist(a, b) > 0.001 && intersections(item, { type: "line", a, b }).length) return true;
  }
  return false;
}
function covered(item, p, ordinaryItems, tolerance = EPS) {
  if (item.type !== "line") return false;
  const b = basis(item);
  for (const other of ordinaryItems) {
    if (camIsConstruction(other) || other.type !== "line") continue;
    const o = basis(other);
    if (Math.abs(camCross(b.d, o.d)) > 1e-9) continue;
    if (
      Math.abs(camDot(camSub(other.a, b.a), b.n)) > tolerance ||
      Math.abs(camDot(camSub(other.b, b.a), b.n)) > tolerance
    )
      continue;
    if (contains(other, p, tolerance)) return true;
  }
  return false;
}
function distance(item, p) {
  if (camIsGuide(item)) return Math.abs(signedDistance(item, p));
  if (item.type === "line") return camPSegDist(p, camLine(item.a, item.b));
  const g = circular(item),
    a = item.type === "circle" ? camP(g.c.x + g.r, g.c.y) : item.a,
    b = item.type === "circle" ? a : item.b;
  return camPSegDist(p, camArc(a, b, g.c, g.sweep));
}

const api = {
  projection,
  signedDistance,
  offset,
  diameterMarks,
  snapDiameter,
  snapGeometry,
  clipScreen,
  intersectsRect,
  intersections,
  covered,
  distance,
  contains,
};
export default api;
