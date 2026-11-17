import KONTUR_GEOMETRY from "./primitives.js";

const { arcGeometry, distance, validPrimitive } = KONTUR_GEOMETRY;
const TAU = 2 * Math.PI,
  TOL = 0.0005,
  mod = (n) => ((n % TAU) + TAU) % TAU;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  cross = (a, b) => a.x * b.y - a.y * b.x;
function circular(p) {
  const g = p.type === "circle" ? { c: p.c, r: p.r, start: 0, sweep: TAU } : arcGeometry(p);
  if (!g) throw Error("Некорректная дуга: три точки лежат на одной прямой или совпадают.");
  return g;
}
function extent(p) {
  return p.type === "line" ? distance(p.a, p.b) : Math.abs(circular(p).sweep) * circular(p).r;
}
function parameter(p, point) {
  if (p.type === "line") {
    const d = sub(p.b, p.a);
    return ((point.x - p.a.x) * d.x + (point.y - p.a.y) * d.y) / (d.x * d.x + d.y * d.y);
  }
  const g = circular(p);
  if (p.type === "arc" && distance(point, p.a) < TOL) return 0;
  if (p.type === "arc" && distance(point, p.b) < TOL) return 1;
  const angle = Math.atan2(point.y - g.c.y, point.x - g.c.x);
  return (g.sweep > 0 ? mod(angle - g.start) : mod(g.start - angle)) / Math.abs(g.sweep);
}
function onPrimitive(p, point) {
  const t = parameter(p, point),
    eps = TOL / Math.max(TOL, extent(p));
  if (p.type === "line") {
    const q = {
      x: p.a.x + (p.b.x - p.a.x) * t,
      y: p.a.y + (p.b.y - p.a.y) * t,
    };
    return distance(q, point) <= TOL && t >= -eps && t <= 1 + eps;
  }
  const g = circular(p);
  return (
    Math.abs(distance(point, g.c) - g.r) <= TOL &&
    (p.type === "circle" || (t >= -eps && t <= 1 + eps))
  );
}
function primitiveIntersections(first, second) {
  let candidates = [];
  if (first.type === "line" && second.type === "line") {
    const u = sub(first.b, first.a),
      v = sub(second.b, second.a),
      det = cross(u, v);
    if (Math.abs(det) > 1e-12 * distance(first.a, first.b) * distance(second.a, second.b)) {
      const t = cross(sub(second.a, first.a), v) / det;
      candidates = [{ x: first.a.x + t * u.x, y: first.a.y + t * u.y }];
    }
  } else if (first.type === "line" || second.type === "line") {
    const line = first.type === "line" ? first : second,
      g = circular(first.type === "line" ? second : first),
      d = sub(line.b, line.a),
      f = sub(line.a, g.c),
      aa = d.x * d.x + d.y * d.y,
      bb = 2 * (f.x * d.x + f.y * d.y),
      cc = f.x * f.x + f.y * f.y - g.r * g.r,
      disc = bb * bb - 4 * aa * cc;
    if (disc >= -1e-10 * Math.max(1, bb * bb, Math.abs(4 * aa * cc))) {
      const root = Math.sqrt(Math.max(0, disc));
      for (const t of [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)])
        candidates.push({ x: line.a.x + t * d.x, y: line.a.y + t * d.y });
    }
  } else {
    const a = circular(first),
      b = circular(second),
      d = distance(a.c, b.c);
    if (d > 1e-10 && d <= a.r + b.r + 1e-8 && d >= Math.abs(a.r - b.r) - 1e-8) {
      const along = (a.r * a.r - b.r * b.r + d * d) / (2 * d),
        h = Math.sqrt(Math.max(0, a.r * a.r - along * along)),
        ux = (b.c.x - a.c.x) / d,
        uy = (b.c.y - a.c.y) / d,
        mid = { x: a.c.x + along * ux, y: a.c.y + along * uy };
      candidates = [
        { x: mid.x - h * uy, y: mid.y + h * ux },
        { x: mid.x + h * uy, y: mid.y - h * ux },
      ];
    }
  }
  const result = [];
  for (const point of candidates)
    if (
      onPrimitive(first, point) &&
      onPrimitive(second, point) &&
      !result.some((p) => distance(p, point) < TOL)
    )
      result.push(point);
  return result;
}
function pointAt(p, t) {
  if (p.type === "line")
    return {
      x: p.a.x + (p.b.x - p.a.x) * t,
      y: p.a.y + (p.b.y - p.a.y) * t,
    };
  const g = circular(p),
    angle = g.start + g.sweep * t;
  return {
    x: g.c.x + g.r * Math.cos(angle),
    y: g.c.y + g.r * Math.sin(angle),
  };
}
function piece(p, from, to) {
  if (p.type === "line") return { ...p, a: pointAt(p, from), b: pointAt(p, to) };
  return {
    id: p.id,
    type: "arc",
    a: pointAt(p, from),
    m: pointAt(p, (from + to) / 2),
    b: pointAt(p, to),
  };
}
function trimPrimitive(target, others, click) {
  if (!validPrimitive(target) || !click || !Number.isFinite(click.x) || !Number.isFinite(click.y))
    throw Error("Выберите линию, дугу или окружность.");
  if (target.unconfirmed) throw Error("Сначала подтвердите размеры выбранного элемента.");
  const points = [];
  for (const other of others)
    if (other.id !== target.id)
      for (const point of primitiveIntersections(target, other))
        if (!points.some((q) => distance(q, point) < TOL)) points.push(point);
  if (!points.length) throw Error("Нет пересечений с другими примитивами.");
  const cuts = points
      .map((point) => ({
        t: Math.max(0, Math.min(1, parameter(target, point))),
        point,
      }))
      .sort((a, b) => a.t - b.t),
    length = extent(target),
    eps = TOL / length,
    t = Math.max(0, Math.min(1, parameter(target, click)));
  if (cuts.some((c) => Math.abs(c.t - t) * length < TOL))
    throw Error("Нажмите на участок между пересечениями, а не на точку пересечения.");
  let from,
    to,
    pieces = [];
  if (target.type === "circle") {
    if (cuts.length < 2)
      throw Error("Для отсечения окружности нужны хотя бы две точки пересечения.");
    let upper = cuts.findIndex((c) => c.t > t);
    if (upper < 0) upper = 0;
    const lower = (upper + cuts.length - 1) % cuts.length;
    from = cuts[lower].t;
    to = cuts[upper].t;
    if (to <= from) to += 1;
    pieces = [piece(target, to, from + 1)];
  } else {
    const boundaries = [0, ...cuts.filter((c) => c.t > eps && c.t < 1 - eps).map((c) => c.t), 1];
    let index = boundaries.findIndex((b, i) => i > 0 && t < b);
    if (index < 1) index = boundaries.length - 1;
    from = boundaries[index - 1];
    to = boundaries[index];
    if (from > eps) pieces.push(piece(target, 0, from));
    if (to < 1 - eps) pieces.push(piece(target, to, 1));
  }
  if (pieces.some((p) => !validPrimitive(p)))
    throw Error("После отсечения остаётся участок короче 0,001 мм. Уточните геометрию.");
  return { pieces, removed: piece(target, from, to), cuts: points };
}

export default {
  primitiveIntersections,
  trimPrimitive,
  parameter,
  piece,
  extent,
  pointAt,
};
