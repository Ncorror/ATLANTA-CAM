import {
  SKETCH_ITEM_LIMIT as camSKETCH_ITEM_LIMIT,
  add as camAdd,
  P as camP,
  mul as camMul,
  left as camLeft,
  unit as camUnit,
  sub as camSub,
  dot as camDot,
  dist as camDist,
} from "../core/math.js";
import {
  isConstruction as camIsConstruction,
  isMachining as camIsMachining,
  isGuide as camIsGuide,
} from "./marks.js";
import {
  line as camLine,
  arc as camArc,
  bounds as camBounds,
  area as camArea,
  slen as camSlen,
  point as camPoint,
  tangent as camTangent,
  pSegDist as camPSegDist,
} from "../core/segments.js";
import { selfIntersects as camSelfIntersects } from "../core/spatial.js";
import { importSketch as camImportSketch } from "../formats/sketch-import.js";
import { contoursToDXF as camContoursToDXF } from "../formats/dxf-writer.js";
import { isFullArc as camIsFullArc } from "../nc/format.js";
import {
  motionToLocal as camMotionToLocal,
  planeToWorld as camPlaneToWorld,
  motionPoint as camMotionPoint,
} from "../core/planes.js";

import GUIDES from "./guides.js";
import KONTUR_GEOMETRY from "./kontur/primitives.js";

const G = KONTUR_GEOMETRY;
const Guides = GUIDES;
const clone = (x) => JSON.parse(JSON.stringify(x));
function checkItemCount(count) {
  if (count > camSKETCH_ITEM_LIMIT)
    throw Error("В эскизе допускается до " + camSKETCH_ITEM_LIMIT + " элементов.");
}
function validate(items) {
  if (!Array.isArray(items)) throw Error("Неверный список элементов эскиза.");
  checkItemCount(items.length);
  const ids = new Set();
  for (const p of items) {
    camIsConstruction(p);
    if (!G.validPrimitive(p) || p.unconfirmed || ids.has(p.id))
      throw Error(
        "Проверь размеры элемента: " +
          ((p && p.id) || "?") +
          ". Линия должна быть длиннее 0,001 мм, дуга — через три разные точки.",
      );
    ids.add(p.id);
  }
  return items;
}
function segments(p) {
  if (p.type === "line") return [camLine(p.a, p.b)];
  if (p.type === "circle") {
    const a = camAdd(p.c, camP(p.r, 0)),
      b = camAdd(p.c, camP(-p.r, 0));
    return [camArc(a, b, p.c, Math.PI), camArc(b, a, p.c, Math.PI)];
  }
  const g = G.arcGeometry(p);
  if (!g) throw Error("Три точки дуги лежат на одной прямой.");
  return [camArc(p.a, p.b, g.c, g.sweep)];
}
function contourGeometryKey(contour) {
  const key = (p) => String(p.x) + "," + String(p.y);
  return (
    (contour.closed ? "closed:" : "open:") +
    contour.segs
      .map((s) => {
        const a = key(s.a),
          b = key(s.b),
          forward = a <= b;
        return s.type === "L"
          ? "L:" + (forward ? a + "|" + b : b + "|" + a)
          : "A:" +
              (forward ? a + "|" + b : b + "|" + a) +
              "|" +
              key(s.c) +
              "|" +
              String(forward ? s.sw : -s.sw);
      })
      .sort()
      .join(";")
  );
}
function boundarySide(contour, plan, cache) {
  if (contour.closed || contour.ambiguous) return null;
  if (!cache.boundaries) {
    cache.boundaries = [];
    for (const boundary of plan.contours)
      if (boundary.closed) {
        if (boundary.ambiguous && camSelfIntersects(boundary.segs, 0.02)) continue;
        cache.boundaries.push({
          segs: boundary.segs,
          box: camBounds(boundary.segs),
          material: Math.sign(camArea(boundary.segs)) * (boundary.nesting % 2 ? -1 : 1),
        });
      }
  }
  const boundaries = cache.boundaries;
  const probes = contour.segs
    .map((s) => ({ s, length: camSlen(s) }))
    .sort((a, b) => b.length - a.length)
    .slice(0, 8);
  let answer = 0;
  for (const { s, length } of probes) {
    if (length < 0.01) continue;
    const q = camPoint(s, 0.5),
      t =
        s.type === "L" ? camTangent(s) : camMul(camLeft(camUnit(camSub(q, s.c))), Math.sign(s.sw)),
      matches = [];
    for (const boundary of boundaries) {
      if (--cache.remaining < 0) return null;
      const box = boundary.box;
      if (
        q.x < box.minX - 0.001 ||
        q.x > box.maxX + 0.001 ||
        q.y < box.minY - 0.001 ||
        q.y > box.maxY + 0.001
      )
        continue;
      for (const edge of boundary.segs) {
        if (--cache.remaining < 0) return null;
        if (camPSegDist(q, edge) > 0.00001) continue;
        const u =
          edge.type === "L"
            ? camTangent(edge)
            : camMul(camLeft(camUnit(camSub(q, edge.c))), Math.sign(edge.sw));
        const dot = camDot(t, u);
        if (Math.abs(dot) < 0.999999) continue;
        matches.push(boundary.material * Math.sign(dot));
      }
    }
    if (matches.length && !matches.every((value) => value === matches[0])) return null;
    if (matches.length) {
      if (answer && answer !== matches[0]) return null;
      answer = matches[0];
    }
  }
  return answer || null;
}
function machiningScene(items, plan, operation = "primary") {
  const ordinary = items.filter((p) => !camIsConstruction(p));
  const marked = ordinary.filter((p) => {
    var _p$millOps;
    return operation === "primary"
      ? camIsMachining(p)
      : (_p$millOps = p.millOps) === null || _p$millOps === void 0
        ? void 0
        : _p$millOps.includes(operation);
  });
  let machining = { contours: [], warnings: [] };
  if (marked.length)
    machining =
      marked.length === ordinary.length
        ? {
            contours: plan.contours.map((c) => ({ ...c })),
            warnings: plan.warnings.slice(),
          }
        : camImportSketch({ items: marked });
  // Keep real junctions visible in NC even when only one wall is selected.
  const endpointGroups = new Map();
  for (const item of ordinary) {
    if (item.type === "circle") continue;
    for (const point of [item.a, item.b]) {
      const key = Math.round(point.x / 0.0005) + "," + Math.round(point.y / 0.0005);
      if (!endpointGroups.has(key)) endpointGroups.set(key, { point, count: 0 });
      endpointGroups.get(key).count++;
    }
  }
  const junctions = [...endpointGroups.values()]
    .filter((group) => group.count > 2)
    .map((group) => group.point);
  for (const contour of machining.contours)
    contour.preserveJunctions = junctions.some((point) =>
      contour.segs.some((segment) => camPSegDist(point, segment) < 0.0005),
    );
  const closedPlan = new Map();
  for (const c of plan.contours)
    if (c.closed && !c.ambiguous) closedPlan.set(contourGeometryKey(c), c);
  const boundaryCache = { remaining: 2000000 };
  let incomplete = false;
  for (const c of machining.contours) {
    const full = c.closed && !c.ambiguous ? closedPlan.get(contourGeometryKey(c)) : null;
    if (full) {
      c.autoSide = full.autoSide;
      c.nesting = full.nesting;
    } else {
      incomplete = true;
      const materialLeft = boundarySide(c, plan, boundaryCache);
      if (materialLeft) c.materialLeft = materialLeft;
    }
  }
  if (incomplete)
    machining.warnings.push(
      "Обработка отмечена по отдельным элементам. Проверь выбранные стенки и сторону обработки.",
    );
  const machiningDxf = machining.contours.length ? camContoursToDXF(machining.contours) : "";
  const machiningSignature = machiningDxf
    ? machiningDxf +
      "\n" +
      JSON.stringify(
        machining.contours.map((c) => [c.autoSide, c.nesting || 0, c.materialLeft || 0]),
      )
    : "";
  return {
    machiningContours: machining.contours,
    machiningDxf,
    machiningWarnings: machining.warnings,
    markedCount: marked.length,
    machiningSignature,
  };
}
function toScene(items, operation = "primary") {
  validate(items);
  const ordinary = items.filter((p) => !camIsConstruction(p)),
    plan = ordinary.length ? camImportSketch({ items: ordinary }) : { contours: [], warnings: [] },
    dxf = plan.contours.length ? camContoursToDXF(plan.contours) : "";
  const marksSignature = JSON.stringify(
    items
      .filter((p) => {
        var _p$millOps2, _p$drillOps;
        return (
          p.machining ||
          ((_p$millOps2 = p.millOps) === null || _p$millOps2 === void 0
            ? void 0
            : _p$millOps2.length) ||
          ((_p$drillOps = p.drillOps) === null || _p$drillOps === void 0
            ? void 0
            : _p$drillOps.length)
        );
      })
      .map((p) => [p.id, p.machining === true, p.millOps || [], p.drillOps || []]),
  );
  return {
    ...plan,
    dxf,
    planContours: plan.contours,
    planDxf: dxf,
    marksSignature,
    ...machiningScene(items, plan, operation),
  };
}
function fromContours(contours) {
  const items = [];
  let next = 1;
  for (const c of contours) {
    const ss = c.segs;
    const head = ss[0],
      r =
        (head === null || head === void 0 ? void 0 : head.type) === "A"
          ? camDist(head.a, head.c)
          : 0;
    const circle =
      c.closed &&
      !c.ambiguous &&
      (ss.length >= 2 || (ss.length === 1 && camIsFullArc(head))) &&
      r > 0 &&
      ss.every(
        (s) =>
          s.type === "A" &&
          Math.sign(s.sw) === Math.sign(head.sw) &&
          camDist(s.c, head.c) < 1e-7 &&
          Math.abs(camDist(s.a, s.c) - r) < 1e-7,
      ) &&
      Math.abs(Math.abs(ss.reduce((sum, s) => sum + s.sw, 0)) - Math.PI * 2) < 1e-6;
    checkItemCount(items.length + (circle ? 1 : ss.length));
    if (circle) {
      items.push({
        id: "s" + next++,
        type: "circle",
        c: { ...ss[0].c },
        r: camDist(ss[0].a, ss[0].c),
      });
      continue;
    }
    for (const s of ss)
      items.push(
        s.type === "L"
          ? { id: "s" + next++, type: "line", a: { ...s.a }, b: { ...s.b } }
          : {
              id: "s" + next++,
              type: "arc",
              a: { ...s.a },
              m: camPoint(s, 0.5),
              b: { ...s.b },
            },
      );
  }
  return validate(items);
}
function rectangle(a, b, id) {
  if (Math.abs(a.x - b.x) <= 0.001 || Math.abs(a.y - b.y) <= 0.001)
    throw Error("У прямоугольника нужны ненулевые ширина и высота.");
  const points = [a, camP(b.x, a.y), b, camP(a.x, b.y)];
  return points.map((p, i) => ({
    id: id + "-" + i,
    type: "line",
    a: { ...p },
    b: { ...points[(i + 1) % 4] },
  }));
}
function traceSegments(ctx, segs, project) {
  let previous = null;
  for (const s of segs) {
    const first = project(s.a);
    if (!previous || camDist(previous, s.a) > 1e-7) ctx.moveTo(first.x, first.y);
    if (s.type === "A" || s.type === "arc") {
      var _local$a$z, _local$b$z;
      const plane = s.plane || 17,
        local = s.type === "arc" ? camMotionToLocal(s, plane) : s,
        z = (_local$a$z = local.a.z) !== null && _local$a$z !== void 0 ? _local$a$z : 0,
        r = camDist(local.a, local.c);
      const back = (p) => (s.type === "arc" ? camPlaneToWorld(p, plane) : p);
      const c = project(back({ ...local.c, z })),
        u = project(back({ x: local.c.x + r, y: local.c.y, z })),
        v = project(back({ x: local.c.x, y: local.c.y + r, z })),
        angle = Math.atan2(local.a.y - local.c.y, local.a.x - local.c.x);
      if (
        Math.abs(
          ((_local$b$z = local.b.z) !== null && _local$b$z !== void 0 ? _local$b$z : z) - z,
        ) < 1e-8 &&
        typeof ctx.transform === "function"
      ) {
        ctx.save();
        ctx.transform(u.x - c.x, u.y - c.y, v.x - c.x, v.y - c.y, c.x, c.y);
        ctx.arc(0, 0, 1, angle, angle + s.sw, s.sw < 0);
        ctx.restore();
      } else {
        const pixels = Math.max(Math.hypot(u.x - c.x, u.y - c.y), Math.hypot(v.x - c.x, v.y - c.y)),
          delta = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - 0.2 / Math.max(0.2, pixels)))),
          limit =
            typeof ctx.transform === "function"
              ? 4096
              : Math.abs(s.sw) >= 2 * Math.PI - 1e-8
                ? 255
                : 127,
          count = Math.min(limit, Math.max(2, Math.ceil(Math.abs(s.sw) / Math.max(0.0001, delta))));
        for (let i = 1; i <= count; i++) {
          const q = project(
            s.type === "arc" ? camMotionPoint(s, i / count) : camPoint(s, i / count),
          );
          ctx.lineTo(q.x, q.y);
        }
      }
    } else {
      const b = project(s.b);
      ctx.lineTo(b.x, b.y);
    }
    previous = s.b;
  }
}
function hit(items, p, tolerance) {
  let ordinary = null,
    auxiliary = null,
    od = tolerance,
    ad = tolerance;
  for (const item of items) {
    const ds = camIsGuide(item)
      ? Guides.distance(item, p)
      : Math.min(...segments(item).map((s) => camPSegDist(p, s)));
    if (camIsConstruction(item)) {
      if (
        ds < ad &&
        !(camIsGuide(item) && Guides.covered(item, Guides.projection(item, p), items))
      ) {
        ad = ds;
        auxiliary = item;
      }
    } else if (ds < od) {
      od = ds;
      ordinary = item;
    }
  }
  return ordinary || auxiliary;
}
function snap(items, p, step, tolerance, pending = [], orthogonal = false) {
  let q = { ...p };
  const a = pending.at(-1);
  if (orthogonal && a) {
    if (Math.abs(q.x - a.x) > Math.abs(q.y - a.y)) q.y = a.y;
    else q.x = a.x;
  }
  let best = null,
    d = tolerance;
  for (const item of items) {
    if (camIsGuide(item)) continue;
    for (const pt of item.type === "circle"
      ? [item.c, ...segments(item).map((s) => s.a)]
      : item.type === "arc"
        ? [item.a, item.b, segments(item)[0].c]
        : [item.a, item.b]) {
      const ds = camDist(q, pt);
      if (
        ds < d &&
        (!orthogonal || !a || Math.abs(pt.x - a.x) < 1e-8 || Math.abs(pt.y - a.y) < 1e-8)
      ) {
        best = pt;
        d = ds;
      }
    }
  }
  for (const pt of pending) {
    const ds = camDist(q, pt);
    if (
      ds < d &&
      (!orthogonal || !a || Math.abs(pt.x - a.x) < 1e-8 || Math.abs(pt.y - a.y) < 1e-8)
    ) {
      best = pt;
      d = ds;
    }
  }
  if (best) return { p: { ...best }, kind: "Точка" };
  if (step > 0) {
    q = {
      x: Math.round(q.x / step) * step,
      y: Math.round(q.y / step) * step,
    };
    if (orthogonal && a) {
      if (Math.abs(p.x - a.x) > Math.abs(p.y - a.y)) q.y = a.y;
      else q.x = a.x;
    }
    return { p: q, kind: "Сетка" };
  }
  return { p: q, kind: "" };
}
function replace(items, id, replacement, linked) {
  validate(items);
  const old = items.find((p) => p.id === id);
  if (!old) throw Error("Выбери элемент эскиза.");
  const next = clone(items),
    moves = [];
  const auxiliary = camIsConstruction(old),
    updated = { ...replacement, id };
  for (const key of ["construction", "guide", "machining", "millOps", "drillOps"])
    if (
      !Object.prototype.hasOwnProperty.call(replacement, key) &&
      Object.prototype.hasOwnProperty.call(old, key)
    )
      updated[key] = old[key];
  if (updated.type !== "circle") delete updated.drillOps;
  camIsGuide(updated);
  if (
    linked &&
    !camIsGuide(old) &&
    !camIsGuide(updated) &&
    camIsConstruction(updated) === auxiliary &&
    old.type !== "circle" &&
    replacement.type !== "circle"
  )
    for (const key of ["a", "b"])
      if (camDist(old[key], replacement[key]) > 1e-9)
        moves.push({ from: old[key], to: replacement[key] });
  for (let i = 0; i < next.length; i++) {
    if (next[i].id === id) {
      next[i] = clone(updated);
      continue;
    }
    if (
      next[i].type === "circle" ||
      camIsGuide(next[i]) ||
      camIsConstruction(next[i]) !== auxiliary
    )
      continue;
    for (const key of ["a", "b"]) {
      const m = moves.find((m) => camDist(next[i][key], m.from) < 0.0005);
      if (m) next[i][key] = { ...m.to };
    }
  }
  return validate(next);
}
function expandDimension(items, p1, p2, newLength, direction = "p2") {
  validate(items);
  const oldLen = camDist(p1, p2);
  if (oldLen <= 0.0001) throw Error("Расстояние между точками измерения слишком мало.");
  const delta = newLength - oldLen;
  if (Math.abs(delta) <= 1e-7) return clone(items);
  const u = camP((p2.x - p1.x) / oldLen, (p2.y - p1.y) / oldLen),
    moves = [];
  function collectSide(anchor, target, amount) {
    const shift = camMul(u, amount);
    const targetItems = items.filter((it) => {
      if (it.type === "line")
        return (
          camDist(it.a, target) < 0.05 ||
          camDist(it.b, target) < 0.05 ||
          camPSegDist(target, camLine(it.a, it.b)) < 0.05
        );
      if (it.type === "arc") return camDist(it.a, target) < 0.05 || camDist(it.b, target) < 0.05;
      if (it.type === "circle") return camDist(it.c, target) < 0.05;
      return false;
    });
    const wallItems = new Set(),
      movingVertices = [],
      queue = [];
    for (const it of targetItems) {
      if (it.type === "line") {
        const dot =
          Math.abs((it.b.x - it.a.x) * u.x + (it.b.y - it.a.y) * u.y) /
          Math.max(0.0001, camDist(it.a, it.b));
        if (dot < 0.3) {
          wallItems.add(it);
          queue.push(it.a, it.b);
        } else {
          const da = camDist(it.a, target),
            db = camDist(it.b, target);
          movingVertices.push(da < db ? it.a : it.b);
        }
      } else if (it.type === "arc") {
        const da = camDist(it.a, target),
          db = camDist(it.b, target);
        movingVertices.push(da < db ? it.a : it.b);
      } else if (it.type === "circle") {
        movingVertices.push(it.c);
      }
    }
    while (queue.length > 0) {
      const v = queue.pop();
      if (movingVertices.some((mv) => camDist(mv, v) < 0.001)) continue;
      movingVertices.push(v);
      for (const it of items) {
        if (it.type === "line" && !wallItems.has(it)) {
          if (camDist(it.a, v) < 0.001 || camDist(it.b, v) < 0.001) {
            const dot =
              Math.abs((it.b.x - it.a.x) * u.x + (it.b.y - it.a.y) * u.y) /
              Math.max(0.0001, camDist(it.a, it.b));
            if (dot < 0.3) {
              wallItems.add(it);
              queue.push(it.a, it.b);
            }
          }
        }
      }
    }
    if (!movingVertices.length) movingVertices.push(target);
    for (const v of movingVertices) {
      if (!moves.some((m) => camDist(m.point, v) < 0.001)) moves.push({ point: { ...v }, shift });
    }
  }
  if (direction === "p2") collectSide(p1, p2, delta);
  else if (direction === "p1") collectSide(p2, p1, -delta);
  else if (direction === "center") {
    collectSide(p1, p2, delta / 2);
    collectSide(p2, p1, -delta / 2);
  }
  const next = clone(items);
  for (const it of next) {
    for (const k of ["a", "b", "c"]) {
      if (it[k]) {
        for (const m of moves) {
          if (camDist(it[k], m.point) < 0.001) {
            it[k] = camAdd(it[k], m.shift);
            break;
          }
        }
      }
    }
    if (it.type === "arc" && it.m) {
      let sa = null,
        sb = null;
      for (const m of moves) {
        if (camDist(it.a, camAdd(m.point, m.shift)) < 0.001) sa = m.shift;
        if (camDist(it.b, camAdd(m.point, m.shift)) < 0.001) sb = m.shift;
      }
      if (sa && sb && camDist(sa, sb) < 0.001) it.m = camAdd(it.m, sa);
    }
  }
  return validate(next);
}

const api = {
  traceSegments,
  validate,
  clone,
  segments,
  toScene,
  machiningScene,
  fromContours,
  rectangle,
  hit,
  snap,
  replace,
  expandDimension,
  isConstruction: camIsConstruction,
  isGuide: camIsGuide,
  isMachining: camIsMachining,
  contourGeometryKey,
  lineWithLengthAngle: G.lineWithLengthAngle,
  arcGeometry: G.arcGeometry,
};
export default api;
