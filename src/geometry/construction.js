import {
  bounds as camBounds,
  pSegDist as camPSegDist,
  rev as camRev,
  point as camPoint,
} from "../core/segments.js";
import {
  dist as camDist,
  SKETCH_ITEM_LIMIT as camSKETCH_ITEM_LIMIT,
  left as camLeft,
  unit as camUnit,
  sub as camSub,
  P as camP,
} from "../core/math.js";
import { compactArcs as camCompactArcs, isFullArc as camIsFullArc } from "../nc/format.js";

import GUIDES from "./guides.js";
import SKETCH from "./sketch.js";
import KONTUR_GEOMETRY from "./kontur/primitives.js";
import KONTUR_TRIM from "./kontur/trim.js";
const S = SKETCH,
  T = KONTUR_TRIM,
  G = KONTUR_GEOMETRY;
const Guides = GUIDES;
const EPS = 0.0005,
  pt = (p) => ({ x: p.x, y: p.y });
const LARGE_INDEX = 2000,
  MAX_DENSE_NODE_PAIRS = 250000;
function inheritStatus(item, source) {
  const next = { ...item };
  S.isConstruction(source);
  for (const key of ["construction", "guide", "machining", "millOps", "drillOps"])
    if (Object.prototype.hasOwnProperty.call(source, key)) next[key] = source[key];
    else delete next[key];
  if (next.type !== "circle") delete next.drillOps;
  return next;
}
function connectingStatus(item, first, second) {
  const next = inheritStatus(item, first);
  if (S.isMachining(first) && S.isMachining(second)) next.machining = true;
  else if (
    Object.prototype.hasOwnProperty.call(first, "machining") ||
    Object.prototype.hasOwnProperty.call(second, "machining")
  )
    next.machining = false;
  else delete next.machining;
  next.millOps = (first.millOps || []).filter((id) => {
    var _second$millOps;
    return (_second$millOps = second.millOps) === null || _second$millOps === void 0
      ? void 0
      : _second$millOps.includes(id);
  });
  return next;
}
function rejectGuide(item) {
  if (S.isGuide(item))
    throw Error(
      "Бесконечная направляющая не обрезается и не соединяется фаской. Выбери обычный отрезок.",
    );
}
function sameStatus(first, second) {
  rejectGuide(first);
  rejectGuide(second);
  if (S.isConstruction(first) !== S.isConstruction(second))
    throw Error("Нельзя соединять вспомогательную линию с линией обработки.");
}
function intersections(first, second) {
  return S.isGuide(first) || S.isGuide(second)
    ? Guides.intersections(first, second)
    : T.primitiveIntersections(first, second);
}
function overlap(a, b, t = EPS) {
  return (
    a.minX <= b.maxX + t && a.maxX + t >= b.minX && a.minY <= b.maxY + t && a.maxY + t >= b.minY
  );
}
function boxLookup(entries) {
  if (entries.length <= LARGE_INDEX) return (box) => entries.filter((e) => overlap(e.box, box));
  function build(items) {
    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    for (const { box } of items) {
      bounds.minX = Math.min(bounds.minX, box.minX);
      bounds.minY = Math.min(bounds.minY, box.minY);
      bounds.maxX = Math.max(bounds.maxX, box.maxX);
      bounds.maxY = Math.max(bounds.maxY, box.maxY);
    }
    if (items.length <= 24) return { bounds, items };
    const axis = bounds.maxX - bounds.minX >= bounds.maxY - bounds.minY ? "X" : "Y",
      lo = "min" + axis,
      hi = "max" + axis;
    items.sort((a, b) => a.box[lo] + a.box[hi] - (b.box[lo] + b.box[hi]));
    const mid = items.length >>> 1;
    return {
      bounds,
      left: build(items.slice(0, mid)),
      right: build(items.slice(mid)),
    };
  }
  const tree = build(entries.slice());
  function collect(node, box, result) {
    if (!overlap(node.bounds, box)) return;
    if (node.items) {
      for (const e of node.items) if (overlap(e.box, box)) result.push(e);
      return;
    }
    collect(node.left, box, result);
    collect(node.right, box, result);
  }
  return (box) => {
    const result = [];
    collect(tree, box, result);
    return result;
  };
}
function autoNode(items, newId, options = {}) {
  S.validate(items);
  const changed = options.changedIds == null ? null : new Set(options.changedIds),
    entries = [],
    used = new Set(items.map((item) => item.id));
  let count = items.length;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (S.isGuide(item)) continue;
    entries.push({
      item,
      index: i,
      auxiliary: S.isConstruction(item),
      box: camBounds([{ segs: S.segments(item) }]),
      length: T.extent(item),
      cuts: [],
    });
  }
  function addCut(entry, point) {
    const item = entry.item,
      t = Math.max(0, Math.min(1, T.parameter(item, point)));
    if (item.type !== "circle" && (t * entry.length <= EPS || (1 - t) * entry.length <= EPS))
      return;
    if (entry.cuts.some((c) => camDist(c.point, point) < EPS)) return;
    const n = entry.cuts.length;
    entry.cuts.push({ t, point: pt(point) });
    if (item.type !== "circle" || n !== 1) count++;
    if (count > camSKETCH_ITEM_LIMIT)
      throw Error(
        "После создания узлов в эскизе будет больше " +
          camSKETCH_ITEM_LIMIT +
          " элементов. Исходный эскиз сохранён.",
      );
  }
  function onFinite(item, point) {
    const t = T.parameter(item, point);
    if (item.type !== "circle" && (t < 0 || t > 1)) return false;
    return camDist(T.pointAt(item, t), point) <= 1e-8;
  }
  function pair(first, second) {
    const a = first.item,
      b = second.item,
      points = Guides.intersections(a, b);
    for (const item of [a, b])
      if (item.type !== "circle")
        for (const point of [item.a, item.b])
          if (
            onFinite(a, point) &&
            onFinite(b, point) &&
            !points.some((q) => camDist(q, point) < EPS)
          )
            points.push(point);
    for (const point of points)
      if (onFinite(a, point) && onFinite(b, point)) {
        addCut(first, point);
        addCut(second, point);
      }
  }
  const byStart = (a, b) => a.box.minX - b.box.minX || a.index - b.index,
    ordered = entries.slice().sort(byStart),
    large = entries.length > LARGE_INDEX;
  let pairs = 0;
  function candidate(first, second) {
    if (first.auxiliary !== second.auxiliary || !overlap(first.box, second.box)) return;
    if (large && ++pairs > MAX_DENSE_NODE_PAIRS)
      throw Error(
        "Слишком много перекрытий для автоматических узлов за один раз. Измени элементы частями. Исходный эскиз сохранён.",
      );
    pair(first, second);
  }
  if (large && (!changed || changed.size > 8)) {
    const lookup = boxLookup(entries);
    for (const first of ordered) {
      if (changed && !changed.has(first.item.id)) continue;
      for (const second of lookup(first.box).sort(byStart)) {
        if (
          changed
            ? first === second || (changed.has(second.item.id) && first.index > second.index)
            : byStart(first, second) >= 0
        )
          continue;
        candidate(first, second);
      }
    }
  } else if (changed) {
    for (const first of ordered)
      if (changed.has(first.item.id))
        for (const second of ordered) {
          if (second.box.minX > first.box.maxX + EPS) break;
          if (
            first.index === second.index ||
            second.box.maxX < first.box.minX - EPS ||
            (changed.has(second.item.id) && first.index > second.index)
          )
            continue;
          candidate(first, second);
        }
  } else
    for (let i = 0; i < ordered.length; i++) {
      const first = ordered[i];
      for (let j = i + 1; j < ordered.length && ordered[j].box.minX <= first.box.maxX + EPS; j++)
        candidate(first, ordered[j]);
    }
  const plans = new Map();
  for (const entry of entries) {
    if (!entry.cuts.length) continue;
    const source = entry.item,
      ts = entry.cuts.map((c) => c.t).sort((a, b) => a - b),
      bounds = source.type === "circle" ? ts : [0, ...ts, 1],
      pieces = [];
    if (source.type === "circle" && bounds.length === 1) bounds.push(bounds[0] + 0.5);
    const n = source.type === "circle" ? bounds.length : bounds.length - 1;
    for (let i = 0; i < n; i++) {
      const from = bounds[i],
        to = i + 1 < bounds.length ? bounds[i + 1] : bounds[0] + 1,
        piece = { ...source, ...T.piece(source, from, to) };
      if (source.type === "circle") {
        delete piece.c;
        delete piece.r;
        delete piece.drillOps;
      }
      if (!G.validPrimitive(piece))
        throw Error(
          "После создания узлов остаётся участок короче 0,001 мм. Исходный эскиз сохранён.",
        );
      pieces.push(piece);
    }
    plans.set(source.id, pieces);
  }
  const next = [],
    sourceMap = new Map();
  for (const item of items) {
    const pieces = plans.get(item.id),
      resultIds = [];
    sourceMap.set(item.id, resultIds);
    if (!pieces) {
      next.push(item);
      resultIds.push(item.id);
      continue;
    }
    for (let i = 0; i < pieces.length; i++) {
      let id = item.id;
      if (i) {
        if (typeof newId !== "function")
          throw Error("Для новых узлов нужны уникальные номера элементов.");
        id = newId();
        if (typeof id !== "string" || used.has(id))
          throw Error("Номер нового элемента уже занят. Исходный эскиз сохранён.");
        used.add(id);
      }
      next.push({ ...pieces[i], id });
      resultIds.push(id);
    }
  }
  S.validate(next);
  Object.defineProperty(next, "sourceMap", { value: sourceMap });
  return next;
}
function makeIndex(items) {
  const entries = items.map((item, index) => {
    const segs = S.segments(item),
      guide = S.isGuide(item),
      normal = guide ? camLeft(camUnit(camSub(item.b, item.a))) : null;
    return { item, index, segs, guide, normal, box: camBounds([{ segs }]) };
  });
  const guides = entries.filter((e) => e.guide),
    lookup = boxLookup(entries.filter((e) => !e.guide)),
    byInput = (a, b) => a.index - b.index;
  function distance(e, p) {
    if (e.guide) return Math.abs((p.x - e.item.a.x) * e.normal.x + (p.y - e.item.a.y) * e.normal.y);
    let d = Infinity;
    for (const s of e.segs) d = Math.min(d, camPSegDist(p, s));
    return d;
  }
  function near(p, t) {
    const found = lookup({
      minX: p.x - t,
      maxX: p.x + t,
      minY: p.y - t,
      maxY: p.y + t,
    });
    for (const guide of guides) if (distance(guide, p) <= t) found.push(guide);
    if (entries.length > LARGE_INDEX || guides.length) found.sort(byInput);
    return found;
  }
  function hit(p, t, predicate = () => true) {
    const local = near(p, t);
    let ordinary = null,
      d = t;
    for (const e of local)
      if (!S.isConstruction(e.item) && predicate(e.item)) {
        const dd = distance(e, p);
        if (dd < d) {
          ordinary = e.item;
          d = dd;
        }
      }
    if (ordinary) return ordinary;
    const normals = local.filter((e) => !S.isConstruction(e.item)).map((e) => e.item);
    let auxiliary = null;
    d = t;
    for (const e of local)
      if (S.isConstruction(e.item) && predicate(e.item)) {
        const dd = distance(e, p);
        if (dd < d && !(e.guide && Guides.covered(e.item, Guides.projection(e.item, p), normals))) {
          auxiliary = e.item;
          d = dd;
        }
      }
    return auxiliary;
  }
  function neighbours(target) {
    const e = entries.find((e) => e.item.id === target.id);
    if (!e) return [];
    const box = {
      minX: e.box.minX - EPS,
      minY: e.box.minY - EPS,
      maxX: e.box.maxX + EPS,
      maxY: e.box.maxY + EPS,
    };
    return entries
      .filter(
        (other) =>
          other.item.id !== target.id &&
          (e.guide
            ? intersections(target, other.item).length > 0
            : other.guide
              ? Guides.intersectsRect(other.item, box)
              : overlap(e.box, other.box)),
      )
      .map((e) => e.item);
  }
  function crossings(p, t) {
    const candidates = near(p, t),
      normals = candidates.filter((e) => !S.isConstruction(e.item)).map((e) => e.item),
      local = candidates
        .map((e) => ({ e, d: distance(e, p) }))
        .filter((v) => v.d <= t)
        .sort((a, b) =>
          Math.abs(a.d - b.d) < EPS
            ? Number(S.isConstruction(a.e.item)) - Number(S.isConstruction(b.e.item))
            : a.d - b.d,
        )
        .slice(0, 16),
      out = [];
    for (let i = 0; i < local.length; i++)
      for (let j = i + 1; j < local.length; j++) {
        const first = local[i].e.item,
          second = local[j].e.item;
        for (const q of intersections(first, second))
          if (
            camDist(q, p) <= t &&
            !(
              (S.isGuide(first) && Guides.covered(first, q, normals)) ||
              (S.isGuide(second) && Guides.covered(second, q, normals))
            ) &&
            !out.some((a) => camDist(a, q) < EPS)
          )
            out.push(q);
      }
    return out;
  }
  function sweepHits(a, b, t) {
    const box = {
      minX: Math.min(a.x, b.x) - t,
      maxX: Math.max(a.x, b.x) + t,
      minY: Math.min(a.y, b.y) - t,
      maxY: Math.max(a.y, b.y) + t,
    };
    const local = lookup(box).filter((e) => !S.isConstruction(e.item)),
      hits = new Set();
    if (!local.length) return hits;
    const count = Math.min(512, Math.ceil(camDist(a, b) / (t / 2)));
    for (let i = 0; i <= count; i++) {
      const u = count ? i / count : 0,
        p = camP(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
      let best = null,
        d = t;
      const candidates =
        local.length > 512
          ? lookup({
              minX: p.x - t,
              maxX: p.x + t,
              minY: p.y - t,
              maxY: p.y + t,
            })
          : local;
      for (const e of candidates) {
        if (S.isConstruction(e.item)) continue;
        if (
          p.x < e.box.minX - d ||
          p.x > e.box.maxX + d ||
          p.y < e.box.minY - d ||
          p.y > e.box.maxY + d
        )
          continue;
        const gap = distance(e, p);
        if (gap < d || (best && gap === d && e.index < best.index)) {
          best = e;
          d = gap;
        }
      }
      if (best) hits.add(best.item);
    }
    return hits;
  }
  function rectangleHits(box, includeCentres = false) {
    return lookup(box)
      .filter(
        (e) =>
          !S.isConstruction(e.item) &&
          (Guides.intersectsRect(e.item, box) ||
            (includeCentres &&
              e.item.type === "circle" &&
              e.item.c.x >= box.minX &&
              e.item.c.x <= box.maxX &&
              e.item.c.y >= box.minY &&
              e.item.c.y <= box.maxY)),
      )
      .map((e) => e.item);
  }
  return {
    near,
    hit,
    neighbours,
    crossings,
    distance,
    sweepHits,
    rectangleHits,
  };
}
function snap(index, p, step, tolerance, pending = [], orthogonal = false) {
  const a = pending.at(-1),
    q = pt(p);
  if (orthogonal && a) {
    if (Math.abs(q.x - a.x) > Math.abs(q.y - a.y)) q.y = a.y;
    else q.x = a.x;
  }
  const local = index.near(q, tolerance).map((e) => e.item),
    base = S.snap(local, q, 0, tolerance, pending, orthogonal);
  let best = null,
    d = base.kind ? camDist(q, base.p) : tolerance;
  for (const cross of index.crossings(q, tolerance)) {
    if (orthogonal && a && Math.abs(cross.x - a.x) > 1e-7 && Math.abs(cross.y - a.y) > 1e-7)
      continue;
    const dd = camDist(q, cross);
    if (dd < d) {
      best = cross;
      d = dd;
    }
  }
  if (best) return { p: pt(best), kind: "Пересечение" };
  if (base.kind) return base;
  const normals = local.filter((item) => !S.isConstruction(item)),
    guides = local
      .filter(S.isGuide)
      .map((item) => ({ item, d: Guides.distance(item, q) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 16);
  let projected = null;
  d = tolerance;
  for (const value of guides) {
    const candidate = Guides.projection(value.item, q),
      dd = camDist(candidate, q);
    if (
      dd < d &&
      (!orthogonal ||
        !a ||
        Math.abs(candidate.x - a.x) < 1e-8 ||
        Math.abs(candidate.y - a.y) < 1e-8) &&
      !Guides.covered(value.item, candidate, normals)
    ) {
      projected = candidate;
      d = dd;
    }
  }
  return projected
    ? { p: pt(projected), kind: "Направляющая" }
    : S.snap(local, q, step, tolerance, pending, orthogonal);
}
function cutsFor(target, others) {
  const points = [];
  for (const other of others)
    if (other.id !== target.id)
      for (const p of intersections(target, other))
        if (!points.some((q) => camDist(p, q) < EPS)) points.push(p);
  return points;
}
function replacePieces(items, target, pieces, newId) {
  const next = [];
  for (const item of items) {
    if (item.id !== target.id) {
      next.push(item);
      continue;
    }
    for (let i = 0; i < pieces.length; i++)
      next.push({
        ...inheritStatus(pieces[i], target),
        id: i === 0 ? target.id : newId(),
      });
  }
  return S.validate(next);
}
function trimPlan(target, others, p) {
  if (!others.some(S.isGuide)) {
    rejectGuide(target);
    const plan = T.trimPrimitive(target, others, p);
    return {
      ...plan,
      pieces: plan.pieces.map((piece) => inheritStatus(piece, target)),
      removed: inheritStatus(plan.removed, target),
    };
  }
  rejectGuide(target);
  if (!G.validPrimitive(target) || !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))
    throw Error("Выбери линию, дугу или окружность.");
  if (target.unconfirmed) throw Error("Сначала подтверди размеры выбранного элемента.");
  const points = cutsFor(target, others);
  if (!points.length) throw Error("Нет пересечений с другими примитивами.");
  const cuts = points
      .map((point) => ({
        t: Math.max(0, Math.min(1, T.parameter(target, point))),
        point,
      }))
      .sort((a, b) => a.t - b.t),
    length = T.extent(target),
    eps = EPS / length,
    t = Math.max(0, Math.min(1, T.parameter(target, p)));
  if (cuts.some((c) => Math.abs(c.t - t) * length < EPS))
    throw Error("Нажми на участок между пересечениями, а не на точку пересечения.");
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
    pieces = [T.piece(target, to, from + 1)];
  } else {
    const boundaries = [0, ...cuts.filter((c) => c.t > eps && c.t < 1 - eps).map((c) => c.t), 1];
    let index = boundaries.findIndex((b, i) => i > 0 && t < b);
    if (index < 1) index = boundaries.length - 1;
    from = boundaries[index - 1];
    to = boundaries[index];
    if (from > eps) pieces.push(T.piece(target, 0, from));
    if (to < 1 - eps) pieces.push(T.piece(target, to, 1));
  }
  if (pieces.some((piece) => !G.validPrimitive(piece)))
    throw Error("После отсечения остаётся участок короче 0,001 мм. Уточни геометрию.");
  return {
    pieces: pieces.map((piece) => inheritStatus(piece, target)),
    removed: inheritStatus(T.piece(target, from, to), target),
    cuts: points,
  };
}
function trim(items, id, p, newId, index = makeIndex(items)) {
  const target = items.find((v) => v.id === id);
  if (!target) throw Error("Выбери участок для обрезки.");
  const plan = trimPlan(target, index.neighbours(target), p);
  return { ...plan, items: replacePieces(items, target, plan.pieces, newId) };
}
function splitPlan(target, others) {
  rejectGuide(target);
  const cuts = cutsFor(target, others),
    length = T.extent(target),
    eps = EPS / length,
    ts = cuts.map((p) => Math.max(0, Math.min(1, T.parameter(target, p)))).sort((a, b) => a - b);
  let pieces = [];
  if (target.type === "circle") {
    if (ts.length < 2) throw Error("Для разделения окружности нужны две разные точки пересечения.");
    for (let i = 0; i < ts.length; i++)
      pieces.push(T.piece(target, ts[i], i + 1 < ts.length ? ts[i + 1] : ts[0] + 1));
  } else {
    const inside = ts.filter((t) => t > eps && t < 1 - eps);
    if (!inside.length) throw Error("У элемента нет внутренних точек пересечения.");
    const bounds = [0, ...inside, 1];
    for (let i = 1; i < bounds.length; i++) pieces.push(T.piece(target, bounds[i - 1], bounds[i]));
  }
  for (const piece of pieces)
    if (!G.validPrimitive(piece))
      throw Error("После разделения остаётся участок короче 0,001 мм. Уточни геометрию.");
  return {
    pieces: pieces.map((piece) => inheritStatus(piece, target)),
    cuts,
  };
}
function split(items, id, newId, index = makeIndex(items)) {
  const target = items.find((v) => v.id === id);
  if (!target) throw Error("Выбери элемент для разделения.");
  const plan = splitPlan(target, index.neighbours(target));
  return { ...plan, items: replacePieces(items, target, plan.pieces, newId) };
}
function filletPlan(first, second, r, keepFirst, keepSecond) {
  sameStatus(first, second);
  const plan = G.filletLines(first, second, r, keepFirst, keepSecond, true);
  plan.arc = connectingStatus(plan.arc, first, second);
  for (const key of ["first", "second"])
    if (camDist(plan[key].a, plan[key].b) < 1e-7) plan[key] = null;
  return plan;
}
function fillet(items, firstId, secondId, r, newId, keepFirst, keepSecond) {
  const first = items.find((p) => p.id === firstId),
    second = items.find((p) => p.id === secondId);
  if (!first || !second) throw Error("Выбери две линии для скругления.");
  const plan = filletPlan(first, second, r, keepFirst, keepSecond),
    arc = { ...plan.arc, id: newId };
  const next = items
    .map((p) => (p.id === firstId ? plan.first : p.id === secondId ? plan.second : p))
    .filter(Boolean);
  next.push(arc);
  S.validate(next);
  return { ...plan, arc, items: next };
}
function chamferPlan(first, second, size, keepFirst, keepSecond) {
  sameStatus(first, second);
  const plan = G.chamferLines(first, second, size, keepFirst, keepSecond);
  return { ...plan, chamfer: connectingStatus(plan.chamfer, first, second) };
}
function chamfer(items, firstId, secondId, size, newId, keepFirst, keepSecond) {
  const first = items.find((p) => p.id === firstId),
    second = items.find((p) => p.id === secondId);
  if (!first || !second) throw Error("Выбери две линии для фаски.");
  const plan = chamferPlan(first, second, size, keepFirst, keepSecond),
    edge = { ...plan.chamfer, id: newId },
    next = items.map((p) => (p.id === firstId ? plan.first : p.id === secondId ? plan.second : p));
  next.push(edge);
  S.validate(next);
  return { ...plan, chamfer: edge, items: next };
}

function heal(items) {
  const result = items.slice(),
    sourceMap = new Map(items.map((item) => [item.id, [item.id]]));
  const status = (item) =>
    JSON.stringify([
      !!item.construction,
      !!item.guide,
      !!item.machining,
      (item.millOps || []).slice().sort(),
      (item.drillOps || []).slice().sort(),
    ]);
  let changed = true;
  while (changed) {
    changed = false;
    const ends = new Map();
    const key = (p) => Math.round(p.x / EPS) + "," + Math.round(p.y / EPS);
    result.forEach((item, index) => {
      if (item.type === "circle" || S.isGuide(item)) return;
      for (const point of [item.a, item.b]) {
        const k = key(point);
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k).push(index);
      }
    });
    for (const indices of ends.values()) {
      if (indices.length !== 2 || indices[0] === indices[1]) continue;
      const [i, j] = indices,
        a = result[i],
        b = result[j];
      if (status(a) !== status(b) || a.type !== b.type) continue;
      let first = S.segments(a)[0],
        second = S.segments(b)[0];
      if (camDist(first.b, second.a) > EPS) {
        if (camDist(first.b, second.b) < EPS) second = camRev(second);
        else if (camDist(first.a, second.a) < EPS) first = camRev(first);
        else if (camDist(first.a, second.b) < EPS) {
          first = camRev(first);
          second = camRev(second);
        } else continue;
      }
      const join = first.b;
      if (
        result.some(
          (other, k) =>
            k !== i &&
            k !== j &&
            !S.isGuide(other) &&
            !!other.construction === !!a.construction &&
            S.segments(other).some((seg) => camPSegDist(join, seg) < EPS),
        )
      )
        continue;
      const merged = camCompactArcs([first, second]);
      if (merged.length !== 1) continue;
      const segment = merged[0];
      let geometry;
      if (segment.type === "L") geometry = { type: "line", a: segment.a, b: segment.b };
      else if (camIsFullArc(segment))
        geometry = {
          type: "circle",
          c: segment.c,
          r: camDist(segment.a, segment.c),
        };
      else
        geometry = {
          type: "arc",
          a: segment.a,
          m: camPoint(segment, 0.5),
          b: segment.b,
        };
      const item = { ...a, ...geometry };
      if (item.type === "circle") {
        delete item.a;
        delete item.b;
        delete item.m;
      }
      result[i] = item;
      result.splice(j, 1);
      for (const ids of sourceMap.values()) if (ids[0] === b.id) ids[0] = a.id;
      changed = true;
      break;
    }
  }
  if (items.sourceMap)
    for (const [id, ids] of items.sourceMap)
      sourceMap.set(id, [...new Set(ids.flatMap((value) => sourceMap.get(value) || [value]))]);
  Object.defineProperty(result, "sourceMap", { value: sourceMap });
  return result;
}

const api = {
  heal,
  makeIndex,
  snap,
  autoNode,
  trim,
  trimPlan,
  split,
  splitPlan,
  fillet,
  filletPlan,
  chamfer,
  chamferPlan,
  intersections,
};
export default api;
