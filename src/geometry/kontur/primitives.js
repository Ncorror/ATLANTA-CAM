import { arcThroughPoints as camArcThroughPoints } from "../../core/segments.js";

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const same = (a, b) => distance(a, b) < 0.0005;
function holesOnCircle(center, pitchDiameter, count, holeDiameter, angle = 0, clockwise = false) {
  if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y))
    throw Error("Задайте координаты центра.");
  if (!Number.isFinite(pitchDiameter) || pitchDiameter <= 0)
    throw Error("Диаметр расположения должен быть больше нуля.");
  if (!Number.isInteger(count) || count < 1 || count > 360)
    throw Error("Количество отверстий — целое число от 1 до 360.");
  if (!Number.isFinite(holeDiameter) || holeDiameter <= 0)
    throw Error("Диаметр отверстия должен быть больше нуля.");
  if (!Number.isFinite(angle)) throw Error("Задайте угол первого отверстия.");
  const radius = pitchDiameter / 2;
  if (count > 1 && holeDiameter > pitchDiameter * Math.sin(Math.PI / count) + 1e-9)
    throw Error(
      "Отверстия пересекаются. Уменьшите их диаметр, количество или увеличьте диаметр расположения.",
    );
  return Array.from({ length: count }, (_, i) => {
    const a = (((angle % 360) + ((clockwise ? -1 : 1) * 360 * i) / count) * Math.PI) / 180,
      dx = radius * Math.cos(a),
      dy = radius * Math.sin(a);
    return {
      type: "circle",
      c: {
        x: center.x + (Math.abs(dx) < 1e-12 ? 0 : dx),
        y: center.y + (Math.abs(dy) < 1e-12 ? 0 : dy),
      },
      r: holeDiameter / 2,
    };
  });
}
function lineWithLengthAngle(a, len, angle) {
  if (!Number.isFinite(len) || len <= 0.001)
    throw Error("Длина отрезка должна быть больше 0,001 мм.");
  if (!Number.isFinite(angle)) throw Error("Введите числовой угол.");
  const radians = ((angle % 360) * Math.PI) / 180,
    dx = len * Math.cos(radians),
    dy = len * Math.sin(radians);
  return {
    type: "line",
    a: { ...a },
    b: {
      x: a.x + (Math.abs(dx) < 1e-12 ? 0 : dx),
      y: a.y + (Math.abs(dy) < 1e-12 ? 0 : dy),
    },
  };
}
function toThousandths(mm) {
  const value = Math.sign(mm) * Math.round((Math.abs(mm) + Number.EPSILON) * 1000);
  return Object.is(value, -0) ? 0 : value;
}
function arcGeometry(p) {
  return camArcThroughPoints(p && p.a, p && p.m, p && p.b);
}
function sample(p, tolerance = 0.05) {
  if (p.type === "line") return [p.a, p.b];
  const g = p.type === "circle" ? { c: p.c, r: p.r, start: 0, sweep: 2 * Math.PI } : arcGeometry(p);
  if (!g) return [p.a, p.b];
  const angle = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / g.r)));
  const n = Math.max(
    p.type === "circle" ? 12 : 2,
    Math.ceil(Math.abs(g.sweep) / Math.max(0.001, angle)),
  );
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: g.c.x + g.r * Math.cos(g.start + (g.sweep * i) / n),
    y: g.c.y + g.r * Math.sin(g.start + (g.sweep * i) / n),
  }));
}
function contours(items) {
  const result = items
    .filter((p) => p.type === "circle")
    .map((p) => ({
      id: p.id,
      parts: [{ p, reverse: false }],
      closed: true,
    }));
  const edges = items.filter((p) => p.type !== "circle"),
    nodes = [];
  function node(a) {
    let i = nodes.findIndex((n) => same(n.p, a));
    if (i < 0) {
      i = nodes.length;
      nodes.push({ p: a, edges: [] });
    }
    return i;
  }
  const indexed = edges.map((p) => {
    const a = node(p.a),
      b = node(p.b),
      i = { p, a, b };
    nodes[a].edges.push(i);
    nodes[b].edges.push(i);
    return i;
  });
  const visited = new Set();
  for (const start of indexed) {
    if (visited.has(start)) continue;
    const component = [],
      pending = [start];
    while (pending.length) {
      const e = pending.pop();
      if (visited.has(e)) continue;
      visited.add(e);
      component.push(e);
      for (const n of [e.a, e.b])
        for (const next of nodes[n].edges) if (!visited.has(next)) pending.push(next);
    }
    const closed = component.every(
      (e) => nodes[e.a].edges.length === 2 && nodes[e.b].edges.length === 2,
    );
    let current = start.a,
      remaining = new Set(component),
      parts = [];
    while (remaining.size) {
      let e = [...remaining].find((e) => e.a === current || e.b === current) || [...remaining][0];
      const reverse = e.b === current;
      parts.push({ p: e.p, reverse });
      current = reverse ? e.a : e.b;
      remaining.delete(e);
    }
    result.push({
      id: component
        .map((e) => e.p.id)
        .sort()
        .join("-"),
      parts,
      closed,
    });
  }
  return result.sort(
    (a, b) => Number(a.parts[0].p.type === "circle") - Number(b.parts[0].p.type === "circle"),
  );
}
function contourPoints(c, tolerance = 0.05) {
  let points = [];
  for (const { p, reverse } of c.parts) {
    let ps = sample(p, tolerance);
    if (reverse) ps.reverse();
    if (points.length && same(points.at(-1), ps[0])) ps.shift();
    points.push(...ps);
  }
  return points;
}
function length(c) {
  return c.parts.reduce((v, { p }) => {
    if (p.type === "line") return v + distance(p.a, p.b);
    if (p.type === "circle") return v + Math.PI * 2 * p.r;
    const g = arcGeometry(p);
    return v + (g ? g.r * Math.abs(g.sweep) : 0);
  }, 0);
}
function circumArc(a, m, b) {
  const p = { type: "arc", a, m, b };
  return arcGeometry(p) ? p : null;
}
function arcFromTwoPoints(a, b, r, side = 1) {
  const chord = distance(a, b);
  if (!Number.isFinite(r) || r <= 0) throw Error("Введите положительный радиус.");
  if (chord <= 0.001) throw Error("Начало и конец дуги должны быть разными точками.");
  if (r < chord / 2 - 1e-9)
    throw Error("Радиус должен быть не меньше половины расстояния между точками.");
  const half = chord / 2,
    actualR = Math.max(r, half),
    height = (half * half) / (actualR + Math.sqrt(Math.max(0, actualR * actualR - half * half))),
    s = side < 0 ? -1 : 1;
  const m = {
    x: (a.x + b.x) / 2 - ((b.y - a.y) / chord) * height * s,
    y: (a.y + b.y) / 2 + ((b.x - a.x) / chord) * height * s,
  };
  const arc = circumArc({ ...a }, m, { ...b });
  if (!arc)
    throw Error("Слишком пологая дуга: уменьшите радиус или увеличьте расстояние между точками.");
  return arc;
}
function filletLines(first, second, r, keepFirst = null, keepSecond = null, allowConsumed = false) {
  if (first.type !== "line" || second.type !== "line" || first.id === second.id)
    throw Error("Выберите две разные линии.");
  if (!Number.isFinite(r) || r <= 0) throw Error("Введите положительный радиус.");
  const u = { x: first.b.x - first.a.x, y: first.b.y - first.a.y },
    v = { x: second.b.x - second.a.x, y: second.b.y - second.a.y },
    cross = u.x * v.y - u.y * v.x;
  if (
    Math.abs(cross) <
    1e-9 * Math.max(1, distance(first.a, first.b) * distance(second.a, second.b))
  )
    throw Error("Параллельные линии скруглить нельзя.");
  const delta = { x: second.a.x - first.a.x, y: second.a.y - first.a.y },
    t = (delta.x * v.y - delta.y * v.x) / cross,
    corner = { x: first.a.x + t * u.x, y: first.a.y + t * u.y };
  function ray(line, click) {
    const da = distance(line.a, corner),
      db = distance(line.b, corner);
    let key = da > db ? "a" : "b";
    if (click && Math.min(da, db) > 0.0005) {
      const dotA =
          (click.x - corner.x) * (line.a.x - corner.x) +
          (click.y - corner.y) * (line.a.y - corner.y),
        dotB =
          (click.x - corner.x) * (line.b.x - corner.x) +
          (click.y - corner.y) * (line.b.y - corner.y);
      key = dotA > dotB ? "a" : "b";
    }
    const end = line[key],
      len = distance(end, corner);
    return {
      key,
      len,
      x: (end.x - corner.x) / len,
      y: (end.y - corner.y) / len,
    };
  }
  const one = ray(first, keepFirst),
    two = ray(second, keepSecond),
    theta = Math.acos(Math.max(-1, Math.min(1, one.x * two.x + one.y * two.y))),
    tan = Math.tan(theta / 2),
    trim = r / tan;
  if (!Number.isFinite(trim) || trim <= 0) throw Error("Выбранные направления не образуют угол.");
  const available = Math.min(one.len, two.len);
  if (
    trim > available + 1e-7 ||
    (trim >= available - 0.001 && (!allowConsumed || Math.abs(trim - available) > 1e-7))
  )
    throw Error("Радиус слишком большой для длины выбранных линий.");
  const a = { x: corner.x + one.x * trim, y: corner.y + one.y * trim },
    b = { x: corner.x + two.x * trim, y: corner.y + two.y * trim },
    sx = one.x + two.x,
    sy = one.y + two.y,
    sl = Math.hypot(sx, sy),
    centerDistance = r / Math.sin(theta / 2),
    center = {
      x: corner.x + (sx / sl) * centerDistance,
      y: corner.y + (sy / sl) * centerDistance,
    },
    mx = a.x + b.x - 2 * center.x,
    my = a.y + b.y - 2 * center.y,
    ml = Math.hypot(mx, my),
    m = { x: center.x + (mx / ml) * r, y: center.y + (my / ml) * r };
  const arc = circumArc(a, m, b);
  if (!arc) throw Error("Не удалось построить скругление.");
  const replace = (line, ray, tangent) => ({
    ...line,
    [ray.key === "a" ? "b" : "a"]: { ...tangent },
  });
  return {
    first: replace(first, one, a),
    second: replace(second, two, b),
    arc,
    corner,
  };
}
function chamferLines(first, second, offset, keepFirst = null, keepSecond = null) {
  if (first.type !== "line" || second.type !== "line" || first.id === second.id)
    throw Error("Выберите две разные линии.");
  if (!Number.isFinite(offset) || offset <= 0) throw Error("Введите положительный размер фаски.");
  const u = { x: first.b.x - first.a.x, y: first.b.y - first.a.y },
    v = { x: second.b.x - second.a.x, y: second.b.y - second.a.y },
    cross = u.x * v.y - u.y * v.x;
  if (
    Math.abs(cross) <
    1e-9 * Math.max(1, distance(first.a, first.b) * distance(second.a, second.b))
  )
    throw Error("Параллельные линии соединить фаской нельзя.");
  const delta = { x: second.a.x - first.a.x, y: second.a.y - first.a.y },
    t = (delta.x * v.y - delta.y * v.x) / cross,
    corner = { x: first.a.x + t * u.x, y: first.a.y + t * u.y };
  function ray(line, click) {
    const da = distance(line.a, corner),
      db = distance(line.b, corner);
    let key = da > db ? "a" : "b";
    if (click && Math.min(da, db) > 0.0005) {
      const dotA =
          (click.x - corner.x) * (line.a.x - corner.x) +
          (click.y - corner.y) * (line.a.y - corner.y),
        dotB =
          (click.x - corner.x) * (line.b.x - corner.x) +
          (click.y - corner.y) * (line.b.y - corner.y);
      key = dotA > dotB ? "a" : "b";
    }
    const end = line[key],
      length = distance(end, corner);
    return {
      key,
      length,
      x: (end.x - corner.x) / length,
      y: (end.y - corner.y) / length,
    };
  }
  const one = ray(first, keepFirst),
    two = ray(second, keepSecond);
  if (offset >= Math.min(one.length, two.length) - 0.001)
    throw Error("Фаска слишком большая для длины выбранных линий.");
  const a = { x: corner.x + one.x * offset, y: corner.y + one.y * offset },
    b = { x: corner.x + two.x * offset, y: corner.y + two.y * offset };
  if (distance(a, b) <= 0.001) throw Error("Фаска слишком короткая для формата 0,001 мм.");
  const replace = (line, ray, p) => ({
    ...line,
    [ray.key === "a" ? "b" : "a"]: { ...p },
  });
  return {
    first: replace(first, one, a),
    second: replace(second, two, b),
    chamfer: { type: "line", a, b },
    corner,
  };
}
function sampleDrawing() {
  return [
    { id: "s1", type: "line", a: { x: 0, y: 0 }, b: { x: 60, y: 0 } },
    { id: "s2", type: "line", a: { x: 60, y: 0 }, b: { x: 60, y: 50 } },
    { id: "s3", type: "line", a: { x: 60, y: 50 }, b: { x: 50, y: 60 } },
    { id: "s4", type: "line", a: { x: 50, y: 60 }, b: { x: 15, y: 60 } },
    {
      id: "s5",
      type: "arc",
      a: { x: 15, y: 60 },
      m: { x: 15 - 15 / Math.sqrt(2), y: 45 + 15 / Math.sqrt(2) },
      b: { x: 0, y: 45 },
    },
    { id: "s6", type: "line", a: { x: 0, y: 45 }, b: { x: 0, y: 0 } },
    {
      id: "hole",
      type: "circle",
      c: { x: 15, y: 45 },
      r: 3,
      unconfirmed: true,
    },
  ];
}
function validPrimitive(p) {
  if (!p || !["line", "arc", "circle"].includes(p.type) || typeof p.id !== "string") return false;
  const pt = (a) =>
    a && Number.isFinite(a.x) && Number.isFinite(a.y) && Math.abs(a.x) < 1e6 && Math.abs(a.y) < 1e6;
  if (p.type === "circle") return pt(p.c) && Number.isFinite(p.r) && p.r > 0 && p.r < 1e6;
  return (
    pt(p.a) &&
    pt(p.b) &&
    distance(p.a, p.b) > 0.001 &&
    (p.type !== "arc" || (pt(p.m) && !!arcGeometry(p)))
  );
}

export default {
  distance,
  same,
  holesOnCircle,
  lineWithLengthAngle,
  toThousandths,
  arcGeometry,
  sample,
  contours,
  contourPoints,
  length,
  circumArc,
  arcFromTwoPoints,
  filletLines,
  chamferLines,
  sampleDrawing,
  validPrimitive,
};
