import {
  line as camLine,
  point as camPoint,
  arc as camArc,
  tangent as camTangent,
  bounds as camBounds,
  slen as camSlen,
  area as camArea,
} from "../core/segments.js";
import {
  sub as camSub,
  dot as camDot,
  dist as camDist,
  SKETCH_ITEM_LIMIT as camSKETCH_ITEM_LIMIT,
  add as camAdd,
  mul as camMul,
  left as camLeft,
  cross as camCross,
} from "../core/math.js";
import { isFullArc as camIsFullArc } from "../nc/format.js";
import {
  flattenBounded as camFlattenBounded,
  polygonIndex as camPolygonIndex,
  segmentDistanceIndex as camSegmentDistanceIndex,
  selfIntersects as camSelfIntersects,
} from "../core/spatial.js";
import {
  connect as camConnect,
  offsetContour as camOffsetContour,
  oriented as camOriented,
} from "../core/contours.js";

import SKETCH from "../geometry/sketch.js";
import CONSTRUCTION from "../geometry/construction.js";
const S = SKETCH,
  B = CONSTRUCTION,
  EPS = 1e-7;
const sideOf = (contour, side) => (side === "auto" ? contour.autoSide : side);
function part(s, t0, t1) {
  return s.type === "L"
    ? camLine(camPoint(s, t0), camPoint(s, t1))
    : camArc(camPoint(s, t0), camPoint(s, t1), s.c, s.sw * (t1 - t0));
}
function parameter(s, p) {
  if (s.type === "L") {
    const v = camSub(s.b, s.a);
    return camDot(camSub(p, s.a), v) / camDot(v, v);
  }
  let a = Math.atan2(p.y - s.c.y, p.x - s.c.x) - Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x);
  if (s.sw > 0) while (a < 0) a += 2 * Math.PI;
  else while (a > 0) a -= 2 * Math.PI;
  return a / s.sw;
}
function primitive(s, id) {
  return s.type === "L"
    ? { id, type: "line", a: s.a, b: s.b }
    : camIsFullArc(s)
      ? { id, type: "circle", c: s.c, r: camDist(s.a, s.c) }
      : { id, type: "arc", a: s.a, m: camPoint(s, 0.5), b: s.b };
}
function overlapping(a, b) {
  return (
    a.minX <= b.maxX + EPS &&
    a.maxX + EPS >= b.minX &&
    a.minY <= b.maxY + EPS &&
    a.maxY + EPS >= b.minY
  );
}
function spatialTree(entries) {
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
  if (entries.length <= 12) return { box, entries };
  const key = box.maxX - box.minX >= box.maxY - box.minY ? "minX" : "minY";
  entries.sort((a, b) => a.box[key] - b.box[key]);
  const middle = entries.length >> 1;
  return {
    box,
    left: spatialTree(entries.slice(0, middle)),
    right: spatialTree(entries.slice(middle)),
  };
}
function visitTree(tree, box, visit) {
  if (!tree || !overlapping(tree.box, box)) return true;
  if (tree.entries) {
    for (const entry of tree.entries)
      if (overlapping(entry.box, box) && visit(entry) === false) return false;
    return true;
  }
  return visitTree(tree.left, box, visit) && visitTree(tree.right, box, visit);
}
function assembleEulerian(raw, tol = 5e-4) {
  if (!raw.length) return [];
  const key = (p) => Math.round(p.x / tol) + "," + Math.round(p.y / tol);
  const edges = raw.map((s, i) => ({
    i,
    s,
    u: key(s.a),
    v: key(s.b),
    used: false,
    inCircuit: false,
  }));
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.u)) adj.set(e.u, []);
    adj.get(e.u).push(e);
  }
  const circuits = [],
    unusedEdges = new Set(edges);
  while (unusedEdges.size > 0) {
    const startEdge = unusedEdges.values().next().value,
      currPath = [startEdge.u],
      circuit = [];
    while (currPath.length > 0) {
      const u = currPath[currPath.length - 1],
        out = adj.get(u) || [],
        nextEdge = out.find((e) => !e.used);
      if (nextEdge) {
        nextEdge.used = true;
        unusedEdges.delete(nextEdge);
        currPath.push(nextEdge.v);
      } else circuit.push(currPath.pop());
    }
    circuit.reverse();
    const segs = [];
    for (let k = 0; k < circuit.length - 1; k++) {
      const u = circuit[k],
        v = circuit[k + 1];
      const e = (adj.get(u) || []).find((e) => e.used && e.v === v && !e.inCircuit);
      if (e) {
        e.inCircuit = true;
        if (segs.length > 0 && camDist(segs[segs.length - 1].b, e.s.a) > 1e-7)
          segs.push(camLine(segs[segs.length - 1].b, e.s.a));
        segs.push(e.s);
      }
    }
    if (segs.length > 0) {
      const closed = camDist(segs[segs.length - 1].b, segs[0].a) <= tol * 2;
      if (closed && camDist(segs[segs.length - 1].b, segs[0].a) > 1e-7)
        segs.push(camLine(segs[segs.length - 1].b, segs[0].a));
      circuits.push({ segs, closed });
    }
  }
  return circuits;
}
function offsetAvailable(base, d, options = {}) {
  const rings = options.rings || [base];
  if (
    rings.reduce((sum, ring) => sum + ring.length, 0) >
    camSKETCH_ITEM_LIMIT * (options.network ? 2 : 1)
  )
    throw Error("Доступный обход допускает до " + camSKETCH_ITEM_LIMIT + " исходных элементов.");
  const radius = Math.abs(d),
    candidate = [];
  const shifted = (s, end) => camAdd(end ? s.b : s.a, camMul(camLeft(camTangent(s, end)), d));
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const s = ring[i],
        next = ring[(i + 1) % ring.length];
      if (s.type === "L") candidate.push(camLine(shifted(s, false), shifted(s, true)));
      else {
        const r = camDist(s.a, s.c),
          nr = r - Math.sign(s.sw) * d;
        if (nr > EPS)
          candidate.push(
            camArc(
              camAdd(s.c, camMul(camSub(s.a, s.c), nr / r)),
              camAdd(s.c, camMul(camSub(s.b, s.c), nr / r)),
              s.c,
              s.sw,
            ),
          );
      }
      const ta = camTangent(s, true),
        tb = camTangent(next);
      let turn = Math.atan2(camCross(ta, tb), camDot(ta, tb));
      if (options.network && d > 0 && Math.abs(Math.abs(turn) - Math.PI) < 1e-8) turn = -Math.PI;
      if (turn * d < -EPS)
        candidate.push(camArc(shifted(s, true), shifted(next, false), s.b, turn));
    }
  const nodes = candidate.map((s, i) => ({
      s,
      index: i,
      p: primitive(s, "e" + i),
      box: camBounds([s]),
      cuts: [0, 1],
    })),
    tree = spatialTree(nodes.slice());
  let work = 0,
    fragments = nodes.length;
  function spend() {
    if (++work > 10000000)
      throw Error(
        "Доступный обход: слишком много пересечений и проверок для одной операции. Раздели обработку на участки.",
      );
  }
  for (const a of nodes)
    visitTree(tree, a.box, (b) => {
      if (b.index <= a.index) return;
      spend();
      for (const p of B.intersections(a.p, b.p))
        for (const node of [a, b]) {
          const t = parameter(node.s, p);
          if (
            t > EPS &&
            t < 1 - EPS &&
            !node.cuts.some((v) => Math.abs(v - t) * camSlen(node.s) < 1e-6)
          ) {
            if (++fragments > 100000)
              throw Error(
                "Доступный обход: больше 100 000 фрагментов после пересечений. Раздели обработку на участки.",
              );
            node.cuts.push(t);
          }
        }
    });
  const budget = { remaining: 20000000 },
    polygons = [];
  let remainingPoints = 100001;
  for (const ring of rings) {
    const points = camFlattenBounded(ring, 0.003, remainingPoints);
    remainingPoints -= points.length;
    polygons.push(camPolygonIndex(points, budget));
  }
  const inside = (p) => {
      let odd = false;
      for (const contains of polygons) {
        spend();
        odd = contains(p) !== odd;
      }
      return options.exterior ? !odd : odd;
    },
    nearestWall = camSegmentDistanceIndex(options.walls || base, budget),
    kept = [];
  for (const node of nodes) {
    node.cuts.sort((a, b) => a - b);
    for (let i = 1; i < node.cuts.length; i++) {
      const s = part(node.s, node.cuts[i - 1], node.cuts[i]);
      if (camSlen(s) < 0.001) continue;
      const valid = [0.2, 0.5, 0.8].every((t) => {
        const p = camPoint(s, t);
        if (d > 0 !== inside(p)) return false;
        spend();
        return nearestWall(p) >= radius - 2e-6;
      });
      if (valid) {
        s.layer = "REACHABLE";
        kept.push(s);
      }
    }
  }
  if (!kept.length) return [];
  let result = null;
  try {
    const conn = camConnect(kept, 0.00005).contours;
    if (!conn.some((c) => !c.closed || c.ambiguous))
      result = conn.filter((c) => Math.abs(camArea(c.segs)) > 0.00001).map((c) => c.segs);
  } catch (e) {}
  if (!result || !result.length) {
    const conn = assembleEulerian(kept, 0.001);
    if (conn.some((c) => !c.closed))
      throw Error(
        "Доступный обход образует неоднозначные участки. Для этой геометрии нужна меньшая фреза или упрощение контура.",
      );
    result = conn
      .filter(
        (c) =>
          c.segs.length > 0 &&
          (Math.abs(camArea(c.segs)) > 0.00001 ||
            c.segs.reduce((sum, s) => sum + camSlen(s), 0) > 0.001),
      )
      .map((c) => c.segs);
  }
  return result;
}
function exactLimit(base, sign, requested, tol) {
  let lo = 0,
    hi = requested;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    try {
      camOffsetContour(base, sign * mid, tol);
      lo = mid;
    } catch (e) {
      if (e.geometryComplexity) throw e;
      hi = mid;
    }
  }
  return Math.max(0, Math.floor(lo * 1000) / 1000);
}
function plan(contour, c) {
  const side = sideOf(contour, contour.side),
    base = camOriented(contour, side, "ccw"),
    actual = c.diameter / 2,
    sign = side === "outside" ? -1 : 1,
    requested = actual + c.allowance;
  if (!contour.closed || !["outside", "inside"].includes(side))
    throw Error("Доступный обход требует замкнутый контур и сторону снаружи/внутри.");
  if (camSelfIntersects(base, Math.max(0.02, c.tolerance)))
    throw Error("Самопересекающийся контур нельзя обработать автоматически.");
  try {
    return {
      paths: [camOffsetContour(base, sign * requested, c.tolerance)],
      partial: false,
      allowance: c.allowance,
      maxExactRadius: null,
      base,
      side,
    };
  } catch (original) {
    if (original.geometryComplexity || !c.autoFit) throw original;
    const limit = exactLimit(base, sign, requested, c.tolerance);
    if (limit >= actual + 0.001) {
      const allowance = Math.max(0, limit - actual);
      return {
        paths: [camOffsetContour(base, sign * (actual + allowance), c.tolerance)],
        partial: false,
        allowance,
        maxExactRadius: limit,
        base,
        side,
        reason: original.message,
      };
    }
    const paths = offsetAvailable(base, sign * actual);
    if (!paths.length)
      throw Error(
        "Фреза Ø" +
          c.diameter +
          " не может войти в этот контур. Предел точного обхода: радиус " +
          limit.toFixed(3) +
          " мм; нужна фреза меньшего диаметра.",
      );
    return {
      paths,
      partial: true,
      allowance: 0,
      maxExactRadius: limit,
      base,
      side,
      reason: original.message,
    };
  }
}
function restSegments(plan, toolRadius) {
  const pathSegments = plan.paths.flat(),
    pieces = [],
    nearest = camSegmentDistanceIndex(pathSegments),
    totalLength = plan.base.reduce((sum, s) => sum + camSlen(s), 0),
    step = Math.max(0.2, totalLength / Math.max(1, 60000 - 2 * plan.base.length));
  for (const s of plan.base) {
    const count = Math.max(1, Math.min(500, Math.ceil(camSlen(s) / step)));
    let start = null;
    for (let i = 0; i <= count; i++) {
      const t = (i + 0.5) / (count + 1),
        p = camPoint(s, Math.min(1, t)),
        distance = nearest(p),
        rest = distance > toolRadius + 0.02;
      if (rest && start === null) start = i / count;
      if ((!rest || i === count) && start !== null) {
        const end = Math.min(1, (rest ? i + 1 : i) / count);
        if (end > start) pieces.push(part(s, start, end));
        start = null;
      }
    }
  }
  return pieces;
}

const api = { plan, offsetAvailable, exactLimit, restSegments };
export default api;
