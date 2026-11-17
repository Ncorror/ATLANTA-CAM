import { dist as camDist } from "../core/math.js";
import {
  point as camPoint,
  rev as camRev,
  tangent as camTangent,
  area as camArea,
  bounds as camBounds,
} from "../core/segments.js";
import {
  flattenBounded as camFlattenBounded,
  polygonIndex as camPolygonIndex,
} from "../core/spatial.js";
import { offsetContour as camOffsetContour } from "../core/contours.js";

import SKETCH from "../geometry/sketch.js";
import CONSTRUCTION from "../geometry/construction.js";
import REACHABLE from "./reachability.js";
import OPEN_WALL from "./open-wall.js";
const S = SKETCH,
  B = CONSTRUCTION,
  R = REACHABLE,
  OW = OPEN_WALL,
  EPS = 0.0005;
function graph(contours, split = true) {
  let items = S.fromContours(contours.filter((c) => c.enabled));
  if (split) {
    let next = 1;
    items = B.autoNode(items, () => "nw-" + next++);
  }
  const nodes = [],
    buckets = new Map(),
    edges = [],
    halves = [],
    seen = new Set(),
    edgeOf = new Map();
  function node(p) {
    const x = Math.floor(p.x / EPS),
      y = Math.floor(p.y / EPS);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const candidate of buckets.get(x + dx + "," + (y + dy)) || [])
          if (camDist(candidate.p, p) <= EPS) return candidate;
    const created = { id: nodes.length, p: { ...p }, out: [] },
      key = x + "," + y,
      list = buckets.get(key) || [];
    nodes.push(created);
    list.push(created);
    buckets.set(key, list);
    return created;
  }
  for (const item of items)
    for (const segment of S.segments(item)) {
      const a = node(segment.a),
        b = node(segment.b);
      if (a === b) continue;
      const key =
        [a.id, b.id].sort((x, y) => x - y).join("/") +
        (segment.type === "A"
          ? "/" +
            segment.c.x +
            "," +
            segment.c.y +
            "/" +
            camPoint(segment, 0.5).x +
            "," +
            camPoint(segment, 0.5).y
          : "");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(segment);
      const forward = { id: halves.length, from: a, to: b, segment },
        back = {
          id: halves.length + 1,
          from: b,
          to: a,
          segment: camRev(segment),
        };
      edgeOf.set(forward.segment, edges.length - 1);
      edgeOf.set(back.segment, edges.length - 1);
      forward.twin = back;
      back.twin = forward;
      halves.push(forward, back);
      a.out.push(forward);
      b.out.push(back);
    }
  for (const n of nodes) {
    for (const half of n.out) {
      const t = camTangent(half.segment);
      half.angle = Math.atan2(t.y, t.x);
    }
    n.out.sort((a, b) => a.angle - b.angle || a.id - b.id);
    n.out.forEach((half, index) => (half.position = index));
  }
  let component = 0;
  for (const start of nodes)
    if (start.component === undefined) {
      const queue = [start];
      start.component = component;
      for (let i = 0; i < queue.length; i++)
        for (const half of queue[i].out)
          if (half.to.component === undefined) {
            half.to.component = component;
            queue.push(half.to);
          }
      component++;
    }
  const issues = nodes
    .filter((n) => n.out.length === 1 || n.out.length > 2)
    .sort((a, b) => b.p.y - a.p.y || a.p.x - b.p.x)
    .map((n, index) => ({
      id: index + 1,
      point: n.p,
      kind: n.out.length === 1 ? "end" : "junction",
      text: n.out.length === 1 ? "Открытый конец стенки" : "Соединение " + n.out.length + " стенок",
    }));
  return {
    nodes,
    edges,
    halves,
    edgeOf,
    issues,
    branched: nodes.some((n) => n.out.length > 2),
  };
}
function inspect(contours, includeEnds = false) {
  if (!contours.some((c) => c.enabled)) return [];
  const data = graph(contours, false);
  return data.branched || includeEnds ? data.issues : [];
}
function faces(data) {
  const visited = new Set(),
    result = [];
  for (const start of data.halves) {
    if (visited.has(start.id)) continue;
    const segs = [];
    let current = start;
    do {
      if (visited.has(current.id)) throw Error("Не удалось однозначно обойти соединение стенок.");
      visited.add(current.id);
      segs.push(current.segment);
      const outgoing = current.to.out;
      current = outgoing[(current.twin.position + outgoing.length - 1) % outgoing.length];
    } while (current !== start);
    const area = camArea(segs);
    result.push({ segs, area, component: start.from.component });
  }
  return result;
}
function regions(data, side = "inside") {
  const all = faces(data),
    budget = { remaining: 20000000 },
    bounded = [],
    outer = [];
  let remainingPoints = 120001;
  for (const face of all)
    if (face.area > 1e-7) {
      const points = camFlattenBounded(face.segs, 0.003, remainingPoints);
      remainingPoints -= points.length;
      bounded.push({
        ...face,
        rings: [face.segs],
        contains: camPolygonIndex(points, budget),
      });
    }
  for (const face of all.filter((face) => face.area <= 1e-7)) {
    const p = camPoint(face.segs[0], 0.5),
      parent = bounded
        .filter((region) => region.component !== face.component && region.contains(p))
        .sort((a, b) => a.area - b.area)[0];
    if (parent) parent.rings.push(face.segs);
    else outer.push(face.segs);
  }
  if (side === "outside")
    return outer.length ? [{ segs: outer[0], rings: outer, exterior: true }] : [];
  return bounded;
}
function primitive(s, id) {
  return s.type === "L"
    ? { id, type: "line", a: s.a, b: s.b }
    : { id, type: "arc", a: s.a, m: camPoint(s, 0.5), b: s.b };
}
function clearance(walls, radius) {
  const items = walls.map((s, i) => primitive(s, "wall-" + i)),
    index = B.makeIndex(items);
  let work = 0;
  return (path) =>
    path.every((segment) => {
      const box = camBounds([segment]),
        middle = {
          x: (box.minX + box.maxX) / 2,
          y: (box.minY + box.maxY) / 2,
        },
        span = Math.max(box.w, box.h) / 2 + radius,
        shape = primitive(segment, "cut");
      return index.near(middle, span).every((entry) => {
        if (++work > 20000000)
          throw Error("Сеть стенок: слишком много проверок зазора. Раздели обработку на участки.");
        return OW.distance(segment, walls[entry.index], shape, entry.item) >= radius - 0.000002;
      });
    });
}
function outsideInteraction(contours, c) {
  const selected = contours.filter((contour) => contour.enabled);
  if (
    selected.length < 2 ||
    !selected.every(
      (contour) =>
        (contour.side === "auto" ? contour.autoSide : OW.normalizeSide(contour.side)) === "outside",
    )
  )
    return false;
  const boxes = selected.map((contour) => camBounds(contour.segs)).sort((a, b) => a.minX - b.minX),
    gap = c.diameter + 2 * c.allowance;
  let work = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length && boxes[j].minX <= boxes[i].maxX + gap; j++) {
      if (++work > 100000) return true;
      if (boxes[i].minY <= boxes[j].maxY + gap && boxes[j].minY <= boxes[i].maxY + gap) return true;
    }
  return false;
}
function prepare(contours, c) {
  if (c.toolKind !== "mill") return { contours, config: c, warnings: [] };
  const requested = contours.some(
      (contour) =>
        contour.enabled &&
        (contour.side === "network" || (c.autoFit && contour.ambiguous && contour.side !== "on")),
    ),
    coupled = !requested && outsideInteraction(contours, c);
  if (coupled && !c.autoFit)
    throw Error(
      "Наружные обходы расположены близко. Включи «Обработать доступное автоматически», чтобы проверить общий зазор и объединить проходы.",
    );
  if (!requested && !coupled) return { contours, config: c, warnings: [] };
  const sides = new Set(
    contours
      .filter((contour) => contour.enabled)
      .map((contour) => OW.normalizeSide(contour.side))
      .filter((side) => side !== "auto"),
  );
  if (sides.has("on") || sides.size > 1)
    throw Error("Для соединённых стенок выбери одну сторону обработки: «Внутри» или «Снаружи».");
  const side = sides.has("outside") || coupled ? "outside" : "inside";
  for (const key of ["diameter", "allowance", "stockAllowance", "tolerance"])
    if (!Number.isFinite(c[key])) throw Error("Проверь параметр обработки стенок: " + key + ".");
  if (c.diameter <= 0 || c.allowance < 0 || c.stockAllowance < 0 || c.tolerance <= 0)
    throw Error("Проверь диаметр, припуски и допуск обработки стенок.");
  if (c.stockAllowance > 0) throw Error("Для сети стенок установи боковой черновой припуск 0.");
  const data = graph(contours),
    bounded = regions(data, side),
    radius = c.diameter / 2 + c.allowance,
    paths = [],
    valid = clearance(data.edges, radius),
    notes = [];
  const info = {
    side,
    walls: data.edges,
    rings: bounded.flatMap((face) => face.rings),
    issues: data.issues,
    allowance: c.allowance,
    sourceElements: data.edges.length,
    blockedRegions: 0,
  };
  if (!bounded.length) {
    const error = Error(
      "Для сети стенок отметь внешнюю замкнутую границу области. Открытые концы отмечены на чертеже.",
    );
    error.wallNetworkInfo = info;
    throw error;
  }
  for (const face of bounded) {
    let candidates;
    try {
      candidates = R.offsetAvailable(face.segs, radius, {
        network: true,
        rings: face.rings,
        walls: data.edges,
        exterior: face.exterior,
      });
    } catch (error) {
      error.wallNetworkInfo = info;
      throw error;
    }
    const accepted = candidates.map((path) => camOffsetContour(path, 0, c.tolerance)).filter(valid);
    if (!accepted.length || accepted.length < candidates.length) info.blockedRegions++;
    paths.push(...accepted);
  }
  const covered = new Set(info.rings.flatMap((ring) => ring.map((s) => data.edgeOf.get(s))));
  info.excludedElements = data.edges.length - covered.size;
  if (info.excludedElements)
    notes.push(
      side === "outside"
        ? "Внутренние стенки за замкнутой выбранной границей не входят в наружный обход. Для них выбери «Внутри»."
        : "Есть стенки вне замкнутых границ. В этом расчёте обрабатываются только области внутри границ.",
    );
  if (!paths.length) {
    const error = Error(
      "В доступных областях между отмеченными стенками фреза Ø" +
        c.diameter +
        " не помещается. Недоступные участки показаны красным.",
    );
    error.wallNetworkInfo = info;
    throw error;
  }
  const direction = {
    climb: "cw",
    conventional: "ccw",
    cw: "cw",
    ccw: "ccw",
  }[c.direction];
  if (!direction) throw Error("Неизвестное направление обработки стенок.");
  const prepared = paths.map((path, index) => ({
    id: "network-" + (index + 1),
    sourceId: "network",
    closed: true,
    enabled: true,
    side: "on",
    autoSide: "on",
    segs: path,
    wallNetwork: true,
    wallDirection: ["climb", "conventional"].includes(c.direction)
      ? Math.sign(camArea(path)) * (c.direction === "climb" ? -1 : 1) > 0
        ? "ccw"
        : "cw"
      : direction,
  }));
  return {
    contours: prepared,
    config: { ...c, lead: 0, allowance: 0, stockAllowance: 0, direction },
    info,
    warnings: [
      (side === "outside"
        ? "Снаружи выбранных стенок: рассчитан доступный наружный обход."
        : "Все выбранные стенки: рассчитаны доступные проходы внутри замкнутых границ.") +
        " Учтён реальный Ø. Недорез показан красной заливкой. Это обход стенок; свободное место для погружения должно быть подготовлено.",
      ...notes,
    ],
  };
}

const api = {
  graph,
  inspect,
  faces,
  regions,
  prepare,
  outsideInteraction,
};
export default api;
