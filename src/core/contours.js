import {
  EPS,
  PI,
  TAU,
  add,
  angle,
  copy,
  cross,
  dist,
  dot,
  left,
  len,
  mul,
  sub,
  unit,
} from "./math.js";
import {
  arc,
  area,
  bounds,
  crossing,
  flatten,
  inside,
  line,
  pLineDist,
  pSegDist,
  point,
  rev,
  slen,
  sweep,
  tangent,
} from "./segments.js";
import { flattenBounded, polygonIndex, segmentDistanceIndex, selfIntersects } from "./spatial.js";
function connect(raw, tol = 0.01) {
  const warnings = [],
    unique = [],
    keys = new Set();
  let dup = 0;
  for (const s of raw) {
    const q = (p) => Math.round(p.x * 1e6) + "," + Math.round(p.y * 1e6),
      ends = [q(s.a), q(s.b)].sort().join(":"),
      key =
        s.layer +
        ":" +
        s.type +
        ":" +
        ends +
        (s.c ? ":" + q(s.c) + ":" + q(point(s, 0.5)) + ":" + Math.round(Math.abs(s.sw) * 1e6) : "");
    if (keys.has(key)) {
      dup++;
      continue;
    }
    keys.add(key);
    unique.push(s);
  }
  if (dup) warnings.push("Удалены совпадающие элементы: " + dup + ".");
  const unused = new Set(unique.map((_, i) => i)),
    out = [];
  const grid = new Map(),
    cell = (p) => [Math.floor(p.x / tol), Math.floor(p.y / tol)];
  for (let i = 0; i < unique.length; i++)
    for (const endpoint of ["a", "b"]) {
      const [x, y] = cell(unique[i][endpoint]),
        key = x + "," + y;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push({ i, endpoint });
    }
  function nearby(p, layer) {
    const [x, y] = cell(p),
      near = [],
      exact = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const candidate of grid.get(x + dx + "," + (y + dy)) || []) {
          if (!unused.has(candidate.i) || unique[candidate.i].layer !== layer) continue;
          const gap = dist(p, unique[candidate.i][candidate.endpoint]);
          if (gap <= EPS) exact.push(candidate);
          else if (gap <= tol) near.push(candidate);
        }
    return exact.length ? exact : near;
  }
  while (unused.size) {
    const idx = unused.values().next().value,
      s = unique[idx],
      ss = [s];
    unused.delete(idx);
    let ambiguous = false;
    for (const end of [true, false]) {
      let count = 0;
      while (count++ < unique.length) {
        const p = end ? ss.at(-1).b : ss[0].a,
          c = nearby(p, s.layer);
        if (!c.length) break;
        if (c.length > 1) {
          ambiguous = true;
          break;
        }
        const v = c[0];
        let next = unique[v.i];
        unused.delete(v.i);
        if (end) {
          if (v.endpoint === "b") next = rev(next);
          if (dist(p, next.a) > EPS) ss.push(line(p, next.a));
          ss.push(next);
        } else {
          if (v.endpoint === "a") next = rev(next);
          if (dist(next.b, p) > EPS) ss.unshift(line(next.b, p));
          ss.unshift(next);
        }
        const gap = dist(ss[0].a, ss.at(-1).b);
        if (gap <= EPS) break;
        if (gap <= tol) {
          const endpoint = end ? ss.at(-1).b : ss[0].a;
          if (
            !nearby(endpoint, s.layer).some(
              (candidate) => dist(endpoint, unique[candidate.i][candidate.endpoint]) <= EPS,
            )
          )
            break;
        }
      }
    }
    const closed = dist(ss[0].a, ss.at(-1).b) <= tol;
    if (closed && dist(ss[0].a, ss.at(-1).b) > EPS) ss.push(line(ss.at(-1).b, ss[0].a));
    out.push({
      id: "c" + (out.length + 1),
      segs: ss,
      closed,
      layer: s.layer,
      enabled: true,
      side: "auto",
      ambiguous,
    });
  }
  const closed = out
    .filter((c) => c.closed)
    .map((contour) => ({
      contour,
      box: bounds(contour.segs),
      polygon: null,
    }));
  function nestingIndex(entries) {
    if (!entries.length) return null;
    const box = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    for (const entry of entries) {
      box.minX = Math.min(box.minX, entry.box.minX);
      box.minY = Math.min(box.minY, entry.box.minY);
      box.maxX = Math.max(box.maxX, entry.box.maxX);
      box.maxY = Math.max(box.maxY, entry.box.maxY);
    }
    if (entries.length <= 8) return { box, entries };
    const key = box.maxX - box.minX >= box.maxY - box.minY ? "minX" : "minY";
    entries.sort((a, b) => a.box[key] - b.box[key]);
    const mid = entries.length >> 1;
    return {
      box,
      left: nestingIndex(entries.slice(0, mid)),
      right: nestingIndex(entries.slice(mid)),
    };
  }
  const nestingTree = nestingIndex(closed);
  let cachedPoints = 0;
  const contains = (box, p) =>
    p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
  function countContainers(node, p, contour) {
    if (!node || !contains(node.box, p)) return 0;
    if (!node.entries)
      return countContainers(node.left, p, contour) + countContainers(node.right, p, contour);
    let count = 0;
    for (const entry of node.entries)
      if (entry.contour !== contour && contains(entry.box, p)) {
        const polygon = entry.polygon || flatten(entry.contour.segs, 0.03);
        if (!entry.polygon && cachedPoints + polygon.length <= 200000) {
          entry.polygon = polygon;
          cachedPoints += polygon.length;
        }
        if (inside(p, polygon)) count++;
      }
    return count;
  }
  for (const c of out) {
    c.nesting = c.closed ? countContainers(nestingTree, point(c.segs[0], 0.37), c) : 0;
    c.autoSide = c.closed ? (c.nesting % 2 ? "inside" : "outside") : "on";
  }
  if (out.some((c) => c.ambiguous))
    warnings.push(
      "Есть разветвления/касания. Неоднозначные контуры нельзя экспортировать; разделите элементы по слоям.",
    );
  return { contours: out, warnings };
}

function intersections(a, b) {
  if (a.type === "L" && b.type === "L") {
    const v = sub(a.b, a.a),
      w = sub(b.b, b.a),
      den = cross(v, w);
    if (Math.abs(den) < EPS) return [];
    return [add(a.a, mul(v, cross(sub(b.a, a.a), w) / den))];
  }
  if (a.type === "A" && b.type === "L") return intersections(b, a);
  if (a.type === "L" && b.type === "A") {
    const v = sub(a.b, a.a),
      w = sub(a.a, b.c),
      r = dist(b.a, b.c),
      aa = dot(v, v),
      bb = 2 * dot(w, v),
      cc = dot(w, w) - r * r,
      D = bb * bb - 4 * aa * cc;
    if (D < -EPS) return [];
    return [
      (-bb + Math.sqrt(Math.max(0, D))) / (2 * aa),
      (-bb - Math.sqrt(Math.max(0, D))) / (2 * aa),
    ].map((t) => add(a.a, mul(v, t)));
  }
  const r = dist(a.a, a.c),
    R = dist(b.a, b.c),
    v = sub(b.c, a.c),
    d = len(v);
  if (d < EPS || d > r + R + EPS || d < Math.abs(r - R) - EPS) return [];
  const x = (r * r - R * R + d * d) / (2 * d),
    h = Math.sqrt(Math.max(0, r * r - x * x)),
    base = add(a.c, mul(v, x / d)),
    off = mul(left(v), h / d);
  return [add(base, off), sub(base, off)];
}

function lineSegmentDistance(l, s) {
  if (dist(l.a, l.b) < EPS) return pSegDist(l.a, s);
  let d = Math.min(
    pSegDist(l.a, s),
    pSegDist(l.b, s),
    pLineDist(s.a, l.a, l.b),
    pLineDist(s.b, l.a, l.b),
  );
  if (s.type === "L") {
    if (crossing(l.a, l.b, s.a, s.b)) return 0;
    return d;
  }
  for (const p of intersections(l, s))
    if (pLineDist(p, l.a, l.b) < 1e-7 && pSegDist(p, s) < 1e-7) return 0;
  const v = sub(l.b, l.a),
    vv = dot(v, v);
  if (vv > EPS) {
    const t = dot(sub(s.c, l.a), v) / vv;
    if (t >= 0 && t <= 1) {
      const normal = left(unit(v)),
        r = dist(s.a, s.c);
      for (const sign of [-1, 1]) {
        const p = add(s.c, mul(normal, r * sign));
        if (pSegDist(p, s) < 1e-7) d = Math.min(d, pLineDist(p, l.a, l.b));
      }
    }
  }
  return d;
}

function setEnds(s, a, b) {
  if (s.type === "L") return line(a, b);
  const sw = sweep(
    angle(s.c, a),
    angle(s.c, b),
    Math.sign(s.sw),
    dist(a, b) < EPS && Math.abs(s.sw) > TAU - EPS,
  );
  if (Math.abs(sw - s.sw) > PI * 0.8)
    throw Error("Смещение дуги меняет топологию контура. Уменьшите диаметр фрезы/припуск.");
  return arc(a, b, s.c, sw);
}

function offsetContour(input, d, tol = 0.03, closed = true) {
  if (input.length > 1) {
    const joined = [];
    for (const s of input) {
      const previous = joined.at(-1);
      if (previous && previous.type === "L" && s.type === "L" && dist(previous.b, s.a) < 1e-9) {
        const a = sub(previous.b, previous.a),
          b = sub(s.b, s.a),
          la = len(a),
          lb = len(b);
        if (
          la > EPS &&
          lb > EPS &&
          dot(a, b) > 0 &&
          Math.abs(cross(a, b)) <= 1e-10 * la * lb &&
          pSegDist(previous.b, line(previous.a, s.b)) < 1e-8
        ) {
          previous.b = copy(s.b);
          continue;
        }
      }
      joined.push(s.type === "L" ? line(s.a, s.b) : arc(s.a, s.b, s.c, s.sw));
    }
    input = joined;
  }
  if (Math.abs(d) < EPS)
    return input.map((s) => (s.type === "L" ? line(s.a, s.b) : arc(s.a, s.b, s.c, s.sw)));
  const collapsed = new Set(),
    n = input.length,
    off = input.map((s, i) => {
      if (s.type === "L") {
        const v = mul(left(tangent(s)), d);
        return line(add(s.a, v), add(s.b, v));
      }
      const r = dist(s.a, s.c),
        nr = r - Math.sign(s.sw) * d;
      if (!closed && Math.abs(nr) <= EPS) {
        collapsed.add(i);
        return line(s.c, s.c);
      }
      if (nr <= tol)
        throw Error("Фреза/припуск не помещается во внутреннюю дугу R" + r.toFixed(3) + " мм.");
      return arc(
        add(s.c, mul(sub(s.a, s.c), nr / r)),
        add(s.c, mul(sub(s.b, s.c), nr / r)),
        s.c,
        s.sw,
      );
    });
  const starts = off.map((s) => copy(s.a)),
    ends = off.map((s) => copy(s.b)),
    joins = new Array(n).fill(null);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = (i + 1) % n,
      a = off[i],
      b = off[j],
      v = input[i].b,
      turn = cross(tangent(input[i], true), tangent(input[j]));
    if (dist(a.b, b.a) < 1e-6) {
      if (collapsed.has(j)) ends[i] = copy(b.a);
      else starts[j] = copy(a.b);
      continue;
    }
    if (turn * d < -1e-7) {
      joins[i] = arc(a.b, b.a, v, sweep(angle(v, a.b), angle(v, b.a), Math.sign(turn)));
    } else {
      if (collapsed.has(i) || collapsed.has(j))
        throw Error("Соседние смещённые элементы не сходятся в центре внутренней дуги.");
      const candidates = intersections(a, b).sort((p, q) => dist(p, v) - dist(q, v));
      if (!candidates.length || dist(candidates[0], v) > Math.max(Math.abs(d) * 20, 1))
        throw Error(
          "Невозможно соединить смещённые элементы. Проверьте изломы DXF или уменьшите фрезу.",
        );
      ends[i] = copy(candidates[0]);
      starts[j] = copy(candidates[0]);
    }
  }
  const result = [];
  for (let i = 0; i < n; i++) {
    const seg = collapsed.has(i) ? off[i] : setEnds(off[i], starts[i], ends[i]);
    if (collapsed.has(i) || slen(seg) > EPS) result.push(seg);
    if (joins[i]) result.push(joins[i]);
  }
  if (!result.length || (closed && Math.abs(area(result)) < tol * tol))
    throw Error("После смещения контур исчез. Инструмент не помещается.");
  if (
    (closed && Math.sign(area(result)) !== Math.sign(area(input))) ||
    selfIntersects(result, Math.max(tol, 0.02))
  )
    throw Error(
      "Смещённая траектория пересекает себя. Этот контур требует более мелкого инструмента или полноценной CAM.",
    );
  const pts = flattenBounded(result, Math.max(tol, 0.03)),
    poly = closed ? flattenBounded(input, Math.max(tol, 0.03)) : null,
    budget = { remaining: 20000000 };
  const nearest = segmentDistanceIndex(input, budget),
    contains = closed ? polygonIndex(poly, budget) : null;
  for (const p of pts) {
    const near = nearest(p);
    if (near < Math.abs(d) - Math.max(0.004, tol * 2))
      throw Error("Смещение привело к подрезу контура. Уменьшите инструмент/припуск.");
    if (closed && d > 0 && !contains(p) && near > tol * 2)
      throw Error("Внутренняя траектория вышла за деталь.");
    if (closed && d < 0 && contains(p) && near > tol * 2)
      throw Error("Наружная траектория вошла в деталь.");
  }
  return result;
}

function oriented(contour, side, direction) {
  let ss = contour.segs.map((s) => (s.type === "L" ? line(s.a, s.b) : arc(s.a, s.b, s.c, s.sw)));
  if (!contour.closed) {
    if (direction === "cw") ss = ss.reverse().map(rev);
    return ss;
  }
  let want = direction === "cw" ? -1 : 1;
  if (direction === "climb") want = side === "inside" ? -1 : 1;
  if (direction === "conventional") want = side === "inside" ? 1 : -1;
  if (Math.sign(area(ss)) !== want) ss = ss.reverse().map(rev);
  return ss;
}
export { connect, intersections, lineSegmentDistance, setEnds, offsetContour, oriented };
