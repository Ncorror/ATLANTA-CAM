import { EPS, dist } from "./math.js";
import { bounds, crossing, pSegDist, sample } from "./segments.js";
function complexityError(message) {
  const error = Error(message);
  error.geometryComplexity = true;
  return error;
}

function flattenBounded(segs, tol = 0.03, maxPoints = 120001) {
  const out = [];
  for (const s of segs) {
    const pts = sample(s, tol),
      start = out.length && dist(out.at(-1), pts[0]) < EPS ? 1 : 0;
    if (out.length + pts.length - start > maxPoints)
      throw complexityError(
        "Для проверки контура нужно больше " +
          (maxPoints - 1) +
          " отрезков. Увеличь допуск аппроксимации.",
      );
    for (let i = start; i < pts.length; i++) out.push(pts[i]);
  }
  return out;
}

function geometryTree(entries) {
  if (!entries.length) return null;
  const box = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const entry of entries) {
    const b = entry.box;
    box.minX = Math.min(box.minX, b.minX);
    box.minY = Math.min(box.minY, b.minY);
    box.maxX = Math.max(box.maxX, b.maxX);
    box.maxY = Math.max(box.maxY, b.maxY);
  }
  if (entries.length <= 12) return { box, entries };
  const axis = box.maxX - box.minX >= box.maxY - box.minY ? "X" : "Y",
    low = "min" + axis,
    high = "max" + axis;
  entries.sort((a, b) => a.box[low] + a.box[high] - (b.box[low] + b.box[high]));
  const mid = entries.length >>> 1;
  return {
    box,
    left: geometryTree(entries.slice(0, mid)),
    right: geometryTree(entries.slice(mid)),
  };
}

function geometryWork(budget) {
  if (--budget.remaining < 0)
    throw complexityError(
      "Проверка геометрии остановлена: слишком много перекрывающихся участков. Упрости контур или раздели обработку.",
    );
}

function boxDistanceSquared(p, b) {
  const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX),
    dy = Math.max(b.minY - p.y, 0, p.y - b.maxY);
  return dx * dx + dy * dy;
}

function segmentDistanceIndex(segs, budget = { remaining: 20000000 }) {
  const tree = geometryTree(segs.map((s) => ({ s, box: bounds([s]) })));
  return (p) => {
    let nearest = Infinity;
    function visit(node) {
      if (!node || boxDistanceSquared(p, node.box) > nearest * nearest) return;
      geometryWork(budget);
      if (node.entries) {
        for (const entry of node.entries)
          if (boxDistanceSquared(p, entry.box) <= nearest * nearest) {
            geometryWork(budget);
            nearest = Math.min(nearest, pSegDist(p, entry.s));
          }
        return;
      }
      const a = boxDistanceSquared(p, node.left.box),
        b = boxDistanceSquared(p, node.right.box);
      if (a <= b) {
        visit(node.left);
        visit(node.right);
      } else {
        visit(node.right);
        visit(node.left);
      }
    }
    visit(tree);
    return nearest;
  };
}

function polygonIndex(points, budget = { remaining: 20000000 }) {
  const entries = [];
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (a.y === b.y) continue;
    entries.push({
      a,
      b,
      box: {
        minX: Math.min(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxX: Math.max(a.x, b.x),
        maxY: Math.max(a.y, b.y),
      },
    });
  }
  const tree = geometryTree(entries);
  return (p) => {
    let yes = false;
    function visit(node) {
      if (!node || node.box.maxX <= p.x || p.y < node.box.minY || p.y >= node.box.maxY) return;
      geometryWork(budget);
      if (node.entries) {
        for (const { a, b } of node.entries) {
          geometryWork(budget);
          if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
            yes = !yes;
        }
      } else {
        visit(node.left);
        visit(node.right);
      }
    }
    visit(tree);
    return yes;
  };
}

function selfIntersects(segs, tol = 0.05) {
  const pts = flattenBounded(segs, tol),
    n = pts.length - 1,
    closed = n > 0 && dist(pts[0], pts[n]) < 0.001;
  const entries = Array.from({ length: n }, (_, i) => ({
    i,
    a: pts[i],
    b: pts[i + 1],
    box: {
      minX: Math.min(pts[i].x, pts[i + 1].x),
      minY: Math.min(pts[i].y, pts[i + 1].y),
      maxX: Math.max(pts[i].x, pts[i + 1].x),
      maxY: Math.max(pts[i].y, pts[i + 1].y),
    },
  }));
  const tree = geometryTree(entries.slice()),
    budget = { remaining: 20000000 };
  let candidates = 0;
  const overlaps = (a, b) =>
    a.minX <= b.maxX + EPS &&
    a.maxX + EPS >= b.minX &&
    a.minY <= b.maxY + EPS &&
    a.maxY + EPS >= b.minY;
  function intersects(entry, node) {
    if (!node || !overlaps(entry.box, node.box)) return false;
    geometryWork(budget);
    if (!node.entries) return intersects(entry, node.left) || intersects(entry, node.right);
    for (const other of node.entries) {
      if (
        other.i <= entry.i + 1 ||
        (closed && entry.i === 0 && other.i === n - 1) ||
        !overlaps(entry.box, other.box)
      )
        continue;
      if (++candidates > 3000000)
        throw complexityError(
          "Для проверки самопересечений слишком много перекрывающихся участков. Упрости контур или раздели обработку.",
        );
      if (crossing(entry.a, entry.b, other.a, other.b)) return true;
    }
    return false;
  }
  return entries.some((entry) => intersects(entry, tree));
}
export {
  complexityError,
  flattenBounded,
  geometryTree,
  geometryWork,
  boxDistanceSquared,
  segmentDistanceIndex,
  polygonIndex,
  selfIntersects,
};
