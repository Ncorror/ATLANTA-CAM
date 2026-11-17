import {
  EPS,
  P,
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
import { motionPoint, motionToLocal, planeToWorld } from "./planes.js";
function sweep(a, b, sign, full = false) {
  let d = b - a;
  if (full) return sign * TAU;
  if (sign > 0) {
    while (d <= EPS) d += TAU;
  } else {
    while (d >= -EPS) d -= TAU;
  }
  return d;
}

function line(a, b) {
  return { type: "L", a: copy(a), b: copy(b) };
}

function arc(a, b, c, sw) {
  return { type: "A", a: copy(a), b: copy(b), c: copy(c), sw };
}

function arcThroughPoints(a, m, b) {
  if (![a, m, b].every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  const scale = Math.max(
    Math.abs(m.x - a.x),
    Math.abs(m.y - a.y),
    Math.abs(b.x - a.x),
    Math.abs(b.y - a.y),
  );
  if (!scale) return null;
  const u = P((m.x - a.x) / scale, (m.y - a.y) / scale),
    v = P((b.x - a.x) / scale, (b.y - a.y) / scale),
    uu = dot(u, u),
    vv = dot(v, v),
    det = 2 * cross(u, v);
  if (!uu || !vv || dist(u, v) === 0 || Math.abs(det) <= Number.EPSILON * 32 * Math.sqrt(uu * vv))
    return null;
  const center = P((uu * v.y - vv * u.y) / det, (u.x * vv - v.x * uu) / det),
    c = add(a, mul(center, scale)),
    r = len(center) * scale;
  if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(r) || !r) return null;
  const start = Math.atan2(-center.y, -center.x),
    end = Math.atan2(v.y - center.y, v.x - center.x),
    mid = Math.atan2(u.y - center.y, u.x - center.x),
    mod = (x) => ((x % TAU) + TAU) % TAU;
  let sw = mod(end - start);
  if (mod(mid - start) > sw + 1e-12) sw -= TAU;
  if (!sw) return null;
  return { c, r, start, sweep: sw };
}

function rev(s) {
  return s.type === "L" ? line(s.b, s.a) : arc(s.b, s.a, s.c, -s.sw);
}

function point(s, t) {
  if (s.type === "arc" && s.plane && s.plane !== 17) return motionPoint(s, t);
  if (s.type === "L") return add(s.a, mul(sub(s.b, s.a), t));
  const r = dist(s.a, s.c),
    a = angle(s.c, s.a) + s.sw * t;
  return add(s.c, P(r * Math.cos(a), r * Math.sin(a)));
}

function tangent(s, end = false) {
  if (s.type === "L") return unit(sub(s.b, s.a));
  const u = unit(sub(end ? s.b : s.a, s.c));
  return mul(left(u), Math.sign(s.sw));
}

function slen(s) {
  return s.type === "L" ? dist(s.a, s.b) : dist(s.a, s.c) * Math.abs(s.sw);
}

function sample(s, tol = 0.03) {
  if (s.type === "L") return [copy(s.a), copy(s.b)];
  const r = dist(s.a, s.c),
    delta = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / (r || 1))));
  const n = Math.min(
    10000,
    Math.max(2, Math.ceil(Math.abs(s.sw) / Math.max(0.002, Math.min(PI / 12, delta)))),
  );
  return Array.from({ length: n + 1 }, (_, i) => point(s, i / n));
}

function flatten(segs, tol = 0.03) {
  const out = [];
  for (const s of segs) {
    const pts = sample(s, tol);
    if (out.length && dist(out[out.length - 1], pts[0]) < EPS) pts.shift();
    out.push(...pts);
  }
  return out;
}

function area(segs) {
  let a = 0;
  for (const s of segs) {
    a += cross(s.a, s.b);
    if (s.type === "A") {
      const r = dist(s.a, s.c);
      a += r * r * (s.sw - Math.sin(s.sw));
    }
  }
  return a / 2;
}

function bounds(items) {
  const pts = [];
  function collect(i) {
    if (i.type === "arc" && i.c && i.plane && i.plane !== 17) {
      const local = motionToLocal(i, i.plane),
        b = bounds([local]);
      for (const x of [b.minX, b.maxX])
        for (const y of [b.minY, b.maxY])
          for (const z of [local.a.z, local.b.z]) pts.push(planeToWorld({ x, y, z }, i.plane));
      return;
    }
    if (i.segs) {
      for (const s of i.segs) collect(s);
    } else if (i.a) {
      pts.push(i.a, i.b);
      if ((i.type === "A" || i.type === "arc") && i.c) {
        const r = dist(i.a, i.c),
          start = angle(i.c, i.a);
        for (let k = 0; k < 4; k++) {
          const a = (k * PI) / 2,
            sw = sweep(start, a, Math.sign(i.sw));
          if (
            Math.abs(i.sw) >= TAU - EPS ||
            Math.abs(sw) <= Math.abs(i.sw) + EPS ||
            Math.abs(a - start) < EPS
          )
            pts.push(add(i.c, P(r * Math.cos(a), r * Math.sin(a))));
        }
      }
    } else if (Number.isFinite(i.x)) pts.push(i);
  }
  for (const i of items) collect(i);
  if (!pts.length)
    return {
      minX: -20,
      minY: -20,
      maxX: 20,
      maxY: 20,
      w: 40,
      h: 40,
      cx: 0,
      cy: 0,
    };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    w: maxX - minX,
    h: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function inside(p, pts) {
  let yes = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i],
      b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      yes = !yes;
  }
  return yes;
}

function pLineDist(p, a, b) {
  const v = sub(b, a),
    t = Math.max(0, Math.min(1, dot(sub(p, a), v) / (dot(v, v) || 1)));
  return dist(p, add(a, mul(v, t)));
}

function pSegDist(p, s) {
  if (s.type === "L") return pLineDist(p, s.a, s.b);
  const a = angle(s.c, s.a),
    b = angle(s.c, p),
    sw = sweep(a, b, Math.sign(s.sw));
  if (Math.abs(s.sw) > TAU - EPS || Math.abs(sw) <= Math.abs(s.sw) + EPS)
    return Math.abs(dist(p, s.c) - dist(s.a, s.c));
  return Math.min(dist(p, s.a), dist(p, s.b));
}

function crossing(a, b, c, d) {
  const r = sub(b, a),
    s = sub(d, c),
    den = cross(r, s);
  if (Math.abs(den) < EPS) return false;
  const t = cross(sub(c, a), s) / den,
    u = cross(sub(c, a), r) / den;
  return t > 1e-7 && t < 1 - 1e-7 && u > 1e-7 && u < 1 - 1e-7;
}

function bulge(a, b, v) {
  if (Math.abs(v) < 1e-10) return line(a, b);
  const chord = sub(b, a);
  if (len(chord) < EPS) throw Error("Дуга bulge с совпадающими вершинами.");
  const c = add(mul(add(a, b), 0.5), mul(left(chord), (1 - v * v) / (4 * v)));
  return arc(a, b, c, 4 * Math.atan(v));
}
export {
  sweep,
  line,
  arc,
  arcThroughPoints,
  rev,
  point,
  tangent,
  slen,
  sample,
  flatten,
  area,
  bounds,
  inside,
  pLineDist,
  pSegDist,
  crossing,
  bulge,
};
