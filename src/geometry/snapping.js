import {
  dist as camDist,
  unit as camUnit,
  sub as camSub,
  left as camLeft,
  SKETCH_ITEM_LIMIT as camSKETCH_ITEM_LIMIT,
  P as camP,
  add as camAdd,
  mul as camMul,
  dot as camDot,
  len as camLen,
} from "../core/math.js";
import { bounds as camBounds, point as camPoint } from "../core/segments.js";

import GUIDES from "./guides.js";
import SKETCH from "./sketch.js";
import CONSTRUCTION from "./construction.js";
const S = SKETCH,
  B = CONSTRUCTION,
  G = GUIDES;
const EPS = 0.0005,
  TAU = 2 * Math.PI,
  MAX_REFERENCE_CACHE = 8;
const pt = (p) => ({ x: p.x, y: p.y }),
  finite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y),
  mod = (a) => ((a % TAU) + TAU) % TAU;
function lower(values, value, key) {
  let lo = 0,
    hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (key(values[mid]) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function basis(reference) {
  if (
    !reference ||
    reference.type !== "line" ||
    !finite(reference.a) ||
    !finite(reference.b) ||
    camDist(reference.a, reference.b) <= 0.001
  )
    return null;
  const d = camUnit(camSub(reference.b, reference.a));
  return { a: reference.a, d, n: camLeft(d) };
}
function signature(a, b) {
  const key = (p) => Math.round(p.x / EPS) + "," + Math.round(p.y / EPS),
    aa = key(a),
    bb = key(b);
  return aa < bb ? aa + "|" + bb : bb + "|" + aa;
}
function makeGroup(id, entries, closed) {
  const segs = [];
  for (const entry of entries) for (const segment of entry.segs) segs.push(segment);
  return {
    id,
    entries,
    segs,
    closed,
    sourceIds: entries.map((e) => e.item.id),
    bounds: camBounds([{ segs }]),
  };
}
function build(items, selectionIds = []) {
  if (!Array.isArray(items) || items.length > camSKETCH_ITEM_LIMIT)
    throw Error("В эскизе допускается до " + camSKETCH_ITEM_LIMIT + " элементов.");
  const entries = [],
    byId = new Map(),
    byLine = new Map();
  for (const item of items) {
    if (S.isGuide(item)) continue;
    const entry = {
      item,
      segs: S.segments(item),
      position: entries.length,
      nodes: [],
    };
    entries.push(entry);
    byId.set(item.id, entry);
    if (item.type === "line") {
      const key = signature(item.a, item.b),
        old = byLine.get(key);
      if (!old || (S.isConstruction(old.item) && !S.isConstruction(item))) byLine.set(key, entry);
    }
  }
  const parent = entries.map((_, i) => i),
    rank = entries.map(() => 0),
    buckets = new Map();
  function find(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function join(a, b) {
    a = find(a);
    b = find(b);
    if (a === b) return;
    if (rank[a] < rank[b]) {
      const hold = a;
      a = b;
      b = hold;
    }
    parent[b] = a;
    if (rank[a] === rank[b]) rank[a]++;
  }
  for (const entry of entries) {
    if (entry.item.type === "circle") continue;
    const status = S.isConstruction(entry.item) ? "a:" : "n:";
    for (const p of [entry.item.a, entry.item.b]) {
      const x = Math.floor(p.x / EPS),
        y = Math.floor(p.y / EPS);
      let node = null;
      for (let dx = -1; dx <= 1 && !node; dx++)
        for (let dy = -1; dy <= 1 && !node; dy++) {
          const bucket = buckets.get(status + (x + dx) + "," + (y + dy));
          if (bucket)
            for (const candidate of bucket)
              if (camDist(candidate.p, p) <= EPS) {
                node = candidate;
                break;
              }
        }
      if (node) {
        join(entry.position, node.owner);
        node.degree++;
      } else {
        node = { p, owner: entry.position, degree: 1 };
        const key = status + x + "," + y,
          bucket = buckets.get(key) || [];
        bucket.push(node);
        buckets.set(key, bucket);
      }
      entry.nodes.push(node);
    }
  }
  const sets = new Map();
  for (const entry of entries) {
    const key = find(entry.position),
      set = sets.get(key) || [];
    set.push(entry);
    sets.set(key, set);
  }
  const groups = [];
  for (const set of sets.values()) {
    const closed = set.every(
        (e) => e.item.type === "circle" || e.nodes.every((n) => n.degree === 2),
      ),
      group = makeGroup("group-" + groups.length, set, closed);
    groups.push(group);
    for (const e of set) e.group = group;
  }
  const points = [],
    pointMap = new Map();
  function add(p, kind, code, sourceIds, priority = 1) {
    if (!finite(p)) return;
    const key = Math.round(p.x * 1e7) + "," + Math.round(p.y * 1e7),
      old = pointMap.get(key);
    if (old) {
      if (!old.sources) old.sources = new Set(old.sourceIds);
      for (const id of sourceIds) old.sources.add(id);
      if (priority < old.priority) {
        old.kind = kind;
        old.code = code;
        old.priority = priority;
      }
      return;
    }
    const point = {
      p: pt(p),
      kind,
      code,
      sourceIds: sourceIds.slice(),
      priority,
    };
    points.push(point);
    pointMap.set(key, point);
  }
  for (const { item, segs } of entries) {
    const ids = [item.id];
    if (item.type === "circle") {
      add(item.c, "Центр окружности", "circleCenter", ids);
      for (const d of [camP(1, 0), camP(0, 1), camP(-1, 0), camP(0, -1)])
        add(camAdd(item.c, camMul(d, item.r)), "Квадрант окружности", "quadrant", ids);
    } else {
      add(item.a, "Конец", "endpoint", ids, 0);
      add(item.b, "Конец", "endpoint", ids, 0);
      add(
        camPoint(segs[0], 0.5),
        item.type === "arc" ? "Середина дуги" : "Середина",
        "midpoint",
        ids,
      );
      if (item.type === "arc") add(segs[0].c, "Центр дуги", "arcCenter", ids);
    }
  }
  for (const group of groups) if (group.closed) groupPoints(group, add);
  for (const point of points)
    if (point.sources) {
      point.sourceIds = Array.from(point.sources);
      delete point.sources;
    }
  const base = {
    points,
    index: B.makeIndex(items),
    groups,
    _byX: points.slice().sort((a, b) => a.p.x - b.p.x),
    _byId: byId,
    _byLine: byLine,
  };
  return withSelection(base, selectionIds);
}
function groupPoints(group, add) {
  const b = group.bounds,
    ids = group.sourceIds;
  add(camP(b.cx, b.cy), "Центр области", "zoneCenter", ids);
  for (const p of [camP(b.cx, b.minY), camP(b.maxX, b.cy), camP(b.cx, b.maxY), camP(b.minX, b.cy)])
    add(p, "Середина границы", "zoneEdge", ids);
  for (const k of [0.25, 0.75]) {
    add(camP(b.minX + b.w * k, b.cy), "Четверть ширины", "zoneQuarter", ids);
    add(camP(b.cx, b.minY + b.h * k), "Четверть высоты", "zoneQuarter", ids);
  }
}
function withSelection(context, selectionIds = []) {
  const base = context._base || context,
    selected = [];
  for (const id of new Set(selectionIds || [])) {
    const entry = base._byId.get(id);
    if (entry) selected.push(entry);
  }
  const selection = selected.length ? makeGroup("selection", selected, false) : null;
  let points = base.points,
    byX = base._byX;
  if (selected.length > 1) {
    points = base.points.slice();
    const derived = new Map(),
      replacements = new Map(),
      added = [];
    function add(p, kind, code, sourceIds, priority = 1) {
      if (!finite(p)) return;
      const x = Math.round(p.x * 1e7),
        y = Math.round(p.y * 1e7),
        key = x + "," + y;
      let old = derived.get(key);
      if (!old) {
        for (
          let i = lower(base._byX, p.x - 1e-7, (value) => value.p.x);
          i < base._byX.length && base._byX[i].p.x <= p.x + 1e-7;
          i++
        ) {
          const candidate = base._byX[i];
          if (Math.round(candidate.p.x * 1e7) === x && Math.round(candidate.p.y * 1e7) === y) {
            old = { ...candidate, sourceIds: candidate.sourceIds.slice() };
            replacements.set(candidate, old);
            points[base.points.indexOf(candidate)] = old;
            break;
          }
        }
      }
      if (old) {
        old.sourceIds = Array.from(new Set([...old.sourceIds, ...sourceIds]));
        if (priority < old.priority) {
          old.kind = kind;
          old.code = code;
          old.priority = priority;
        }
      } else {
        old = {
          p: pt(p),
          kind,
          code,
          sourceIds: sourceIds.slice(),
          priority,
        };
        points.push(old);
        added.push(old);
      }
      derived.set(key, old);
    }
    groupPoints(selection, add);
    byX = base._byX.map((point) => replacements.get(point) || point);
    for (const point of added) {
      let at = lower(byX, point.p.x, (value) => value.p.x);
      while (at < byX.length && byX[at].p.x === point.p.x) at++;
      byX.splice(at, 0, point);
    }
  }
  return {
    ...base,
    points,
    _byX: byX,
    _base: base,
    _selection: selection,
    selectionIds: selected.map((e) => e.item.id),
    referenceCache: [],
    maxReferenceCache: MAX_REFERENCE_CACHE,
  };
}
function orthogonal(p, pending, shift) {
  const q = pt(p),
    a = pending && pending.length ? pending[pending.length - 1] : null;
  if (shift && a) {
    if (Math.abs(q.x - a.x) > Math.abs(q.y - a.y)) q.y = a.y;
    else q.x = a.x;
  }
  return { q, a };
}
function compatible(p, a, shift) {
  return !shift || !a || Math.abs(p.x - a.x) < 1e-8 || Math.abs(p.y - a.y) < 1e-8;
}
function nearPoint(context, q, tolerance, a, shift, priority) {
  const sorted = context._byX;
  let best = null,
    d = tolerance;
  for (
    let i = lower(sorted, q.x - tolerance, (p) => p.p.x);
    i < sorted.length && sorted[i].p.x <= q.x + tolerance;
    i++
  ) {
    const candidate = sorted[i];
    if (
      candidate.priority !== priority ||
      Math.abs(candidate.p.y - q.y) > d ||
      !compatible(candidate.p, a, shift)
    )
      continue;
    const distance = camDist(candidate.p, q);
    if (distance < d) {
      best = candidate;
      d = distance;
    }
  }
  return best ? { candidate: best, d } : null;
}
function onSweep(segment, p) {
  if (segment.type === "L") return true;
  const start = Math.atan2(segment.a.y - segment.c.y, segment.a.x - segment.c.x),
    target = Math.atan2(p.y - segment.c.y, p.x - segment.c.x),
    delta = segment.sw < 0 ? mod(start - target) : mod(target - start);
  return delta <= Math.abs(segment.sw) + 1e-8 || Math.abs(segment.sw) >= TAU - 1e-8;
}
function closestFinite(entry, q, axis, locked) {
  const item = entry.item,
    s = entry.segs[0];
  if (item.type === "line") {
    const v = camSub(s.b, s.a),
      length = camDot(v, v);
    let t;
    if (axis) {
      if (Math.abs(v[axis]) < 1e-12) {
        if (Math.abs(s.a[axis] - locked) > 1e-8) return null;
        t = Math.max(0, Math.min(1, camDot(camSub(q, s.a), v) / length));
      } else {
        t = (locked - s.a[axis]) / v[axis];
        if (t < 0 || t > 1) return null;
      }
    } else t = Math.max(0, Math.min(1, camDot(camSub(q, s.a), v) / length));
    const point = camAdd(s.a, camMul(v, t));
    if (axis) point[axis] = locked;
    return point;
  }
  const center = item.type === "circle" ? item.c : s.c,
    radius = item.type === "circle" ? item.r : camDist(s.a, s.c),
    candidates = [];
  if (axis) {
    const other = axis === "x" ? "y" : "x",
      discriminant = radius * radius - (locked - center[axis]) * (locked - center[axis]);
    if (discriminant < 0) return null;
    const delta = Math.sqrt(discriminant);
    for (const sign of [-1, 1]) {
      const point = pt(center);
      point[axis] = locked;
      point[other] += sign * delta;
      if (item.type === "circle" || onSweep(s, point)) candidates.push(point);
    }
  } else {
    const v = camSub(q, center),
      distance = camLen(v);
    if (distance > 1e-12) {
      const point = camAdd(center, camMul(v, radius / distance));
      if (item.type === "circle" || onSweep(s, point)) candidates.push(point);
    }
    if (item.type === "arc") candidates.push(s.a, s.b);
  }
  let best = null,
    d = Infinity;
  for (const point of candidates) {
    const distance = camDist(point, q);
    if (distance < d) {
      best = point;
      d = distance;
    }
  }
  return best;
}
function finiteProjection(context, q, p, tolerance, a, shift) {
  const local = context.index.near(q, tolerance),
    axis = shift && a ? (Math.abs(p.x - a.x) > Math.abs(p.y - a.y) ? "y" : "x") : null,
    locked = axis ? a[axis] : 0;
  for (const auxiliary of [false, true]) {
    let best = null,
      d = tolerance;
    for (const near of local) {
      const item = near.item;
      if (S.isGuide(item) || S.isConstruction(item) !== auxiliary) continue;
      const entry = context._byId.get(item.id);
      if (!entry) continue;
      const point = closestFinite(entry, q, axis, locked);
      if (!point || !compatible(point, a, shift)) continue;
      const distance = camDist(point, q);
      if (distance < d) {
        best = {
          p: pt(point),
          kind:
            item.type === "line" ? "На линии" : item.type === "arc" ? "На дуге" : "На окружности",
          sourceIds: [item.id],
        };
        d = distance;
      }
    }
    if (best) return best;
  }
  return null;
}
function snap(indexOrContext, p, step, tolerance, pending = [], shift = false) {
  const context = indexOrContext && indexOrContext.points ? indexOrContext : null,
    index = context ? context.index : indexOrContext;
  if (!context) return B.snap(index, p, step, tolerance, pending, shift);
  const { q, a } = orthogonal(p, pending, shift);
  let found = nearPoint(context, q, tolerance, a, shift, 0),
    best = found && found.candidate,
    d = found ? found.d : tolerance;
  for (const node of pending) {
    const distance = camDist(q, node);
    if (distance < d && compatible(node, a, shift)) {
      best = { p: node, kind: "Точка" };
      d = distance;
    }
  }
  for (const point of index.crossings(q, tolerance)) {
    const distance = camDist(q, point);
    if (distance < d && compatible(point, a, shift)) {
      best = { p: point, kind: "Пересечение" };
      d = distance;
    }
  }
  if (best) return { p: pt(best.p), kind: best.kind, sourceIds: best.sourceIds };
  found = nearPoint(context, q, tolerance, a, shift, 1);
  if (found)
    return {
      p: pt(found.candidate.p),
      kind: found.candidate.kind,
      sourceIds: found.candidate.sourceIds,
    };
  const projection = finiteProjection(context, q, p, tolerance, a, shift);
  if (projection) return projection;
  return B.snap(index, p, step, tolerance, pending, shift);
}
function projectedSpan(group, b) {
  let min = Infinity,
    max = -Infinity;
  function include(p) {
    const value = camDot(camSub(p, b.a), b.n);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  for (const s of group.segs) {
    include(s.a);
    include(s.b);
    if (s.type === "L") continue;
    const start = Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x),
      angle = Math.atan2(b.n.y, b.n.x),
      radius = camDist(s.a, s.c);
    for (const target of [angle, angle + Math.PI]) {
      const delta = s.sw < 0 ? mod(start - target) : mod(target - start);
      if (delta <= Math.abs(s.sw) + 1e-8 || Math.abs(s.sw) >= TAU - 1e-8)
        include(camAdd(s.c, camP(radius * Math.cos(target), radius * Math.sin(target))));
    }
  }
  return { min, max, width: max - min };
}
function guidePriority(point) {
  return point.code === "zoneCenter"
    ? 0
    : point.code === "midpoint" || point.code === "circleCenter" || point.code === "arcCenter"
      ? 1
      : point.code === "endpoint"
        ? 3
        : 2;
}
function referenceEntry(context, reference) {
  const b = basis(reference);
  if (!context || !context.points || !b) return null;
  const id = reference.sourceId || reference.id || "",
    key =
      id + "|" + reference.a.x + "," + reference.a.y + "|" + reference.b.x + "," + reference.b.y;
  let entry = context.referenceCache.find((e) => e.key === key);
  if (entry) return entry;
  let source = context._byId.get(id);
  if (!source) source = context._byLine.get(signature(reference.a, reference.b));
  let group = context._selection,
    span = group ? projectedSpan(group, b) : null;
  if (!span || span.width <= EPS) {
    group = source && source.group;
    span = group ? projectedSpan(group, b) : null;
  }
  const sorted = context.points
      .map((point) => ({ offset: camDot(camSub(point.p, b.a), b.n), point }))
      .sort((a, b) => a.offset - b.offset || guidePriority(a.point) - guidePriority(b.point)),
    projected = [];
  for (const candidate of sorted) {
    const previous = projected[projected.length - 1];
    if (previous && Math.abs(previous.offset - candidate.offset) < 1e-7) {
      if (guidePriority(candidate.point) < guidePriority(previous.point))
        projected[projected.length - 1] = candidate;
    } else projected.push(candidate);
  }
  entry = { key, b, group, span, projected };
  if (context.referenceCache.length >= MAX_REFERENCE_CACHE) context.referenceCache.shift();
  context.referenceCache.push(entry);
  return entry;
}
function marksFor(entry, anchor, pointer) {
  if (!entry || !entry.span || entry.span.width <= EPS) return [];
  const { b, span } = entry,
    raw = finite(pointer) ? camDot(camSub(pointer, b.a), b.n) : 0,
    fromMin =
      Math.abs(span.min) < Math.abs(span.max) - EPS ||
      (Math.abs(Math.abs(span.min) - Math.abs(span.max)) <= EPS && raw >= 0),
    start = fromMin ? span.min : span.max,
    end = fromMin ? span.max : span.min,
    base = G.projection(
      { type: "line", a: b.a, b: camAdd(b.a, b.d) },
      finite(anchor) ? anchor : b.a,
    ),
    labels = ["¼", "½", "¾", "Край"],
    out = [];
  for (let n = 1; n <= 4; n++) {
    const offset = start + ((end - start) * n) / 4;
    out.push({
      p: camAdd(base, camMul(b.n, offset)),
      offset,
      distance: Math.abs(offset),
      label: labels[n - 1],
      numerator: n,
      denominator: 4,
      kind: n === 2 ? "Центр области" : n === 4 ? "Граница области" : "Четверть области",
    });
  }
  return out;
}
function referenceMarks(context, reference, anchor, pointer) {
  return marksFor(referenceEntry(context, reference), anchor, pointer);
}
function guideSnap(context, reference, pointer, tolerance) {
  if (!finite(pointer) || !Number.isFinite(tolerance) || tolerance <= 0) return null;
  const entry = referenceEntry(context, reference);
  if (!entry) return null;
  const { b, projected } = entry,
    raw = camDot(camSub(pointer, b.a), b.n),
    position = lower(projected, raw, (v) => v.offset);
  let best = null,
    error = tolerance;
  for (const i of [position - 1, position]) {
    const candidate = projected[i];
    if (!candidate) continue;
    const difference = Math.abs(candidate.offset - raw);
    if (difference <= error) {
      best = {
        offset: candidate.offset,
        kind: candidate.point.kind,
        sourcePoint: candidate.point.p,
        sourceIds: candidate.point.sourceIds,
      };
      error = difference;
    }
  }
  const markTolerance = entry.span ? Math.min(tolerance, entry.span.width / 12) : tolerance;
  for (const mark of marksFor(entry, pointer, pointer)) {
    const difference = Math.abs(mark.offset - raw);
    if (difference <= markTolerance && difference <= error + 1e-10) {
      best = { offset: mark.offset, kind: mark.kind, mark };
      error = difference;
    }
  }
  if (!best) return null;
  const base = camAdd(b.a, camMul(b.d, camDot(camSub(pointer, b.a), b.d))),
    point = camAdd(base, camMul(b.n, best.offset));
  return { ...best, distance: Math.abs(best.offset), point };
}

const api = { build, withSelection, snap, referenceMarks, guideSnap };
export default api;
