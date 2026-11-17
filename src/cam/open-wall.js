import {
  line as camLine,
  arc as camArc,
  bounds as camBounds,
  rev as camRev,
  point as camPoint,
  area as camArea,
  slen as camSlen,
  tangent as camTangent,
} from "../core/segments.js";
import {
  mul as camMul,
  add as camAdd,
  dist as camDist,
  left as camLeft,
  unit as camUnit,
  sub as camSub,
  dot as camDot,
  P as camP,
  cross as camCross,
} from "../core/math.js";
import { offsetContour as camOffsetContour } from "../core/contours.js";
import { selfIntersects as camSelfIntersects } from "../core/spatial.js";
import { roundXYSegment as camRoundXYSegment } from "../nc/format.js";
import { primitive, distance } from "../geometry/wall-distance.js";

import CONSTRUCTION from "../geometry/construction.js";
import REACHABLE from "./reachability.js";
import ENTRY from "./entry.js";
const B = CONSTRUCTION,
  EPS = 1e-7;
const R = REACHABLE;
const ROUNDING_MARGIN = 0.003,
  MAX_ROUTE_SEGMENTS = 2104;
const finite = (p) =>
  p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e6 && Math.abs(p.y) <= 1e6;
const copy = (s) => (s.type === "L" ? camLine(s.a, s.b) : camArc(s.a, s.b, s.c, s.sw));
const midpoint = (a, b) => camMul(camAdd(a, b), 0.5);
const normalizeSide = (side) => (side === "wall" || side === "network" ? "inside" : side);
const isRequested = (contour) =>
  contour.side === "wall" || (["inside", "outside"].includes(contour.side) && !contour.closed);
function clearanceError(error, contour) {
  error.openWallClearance = contour.id;
  return error;
}

function wallEntry(segment) {
  return { segment, shape: primitive(segment), box: camBounds([segment]) };
}
function clearSegment(segment, walls, radius) {
  const box = camBounds([segment]),
    shape = primitive(segment);
  return walls.every((wall) => {
    const b = wall.box;
    if (
      box.maxX + radius < b.minX ||
      box.minX - radius > b.maxX ||
      box.maxY + radius < b.minY ||
      box.minY - radius > b.maxY
    )
      return true;
    return distance(segment, wall.segment, shape, wall.shape) >= radius - 0.00001;
  });
}
function availableInsideRoute(contour, c, radius, allWalls, area, wanted) {
  if (c.startPoint)
    throw Error(
      "Для предварительного обхода сбрось выбранный заход. Вход и выход будут через открытый край.",
    );
  const clearance = radius + ROUNDING_MARGIN;
  const lead = c.autoLead ? Math.max(c.diameter, c.lead, clearance) : c.lead;
  if (lead < clearance)
    throw Error(
      "Для предварительного обхода увеличь заход до " +
        clearance.toFixed(3) +
        " мм или включи автоподбор.",
    );
  const source = area > 0 ? contour.segs : contour.segs.slice().reverse().map(camRev);
  const start = source[0].a,
    end = source.at(-1).b;
  if (camDist(start, end) <= 2 * clearance) return null;
  const mouth = midpoint(start, end),
    outward = camLeft(camUnit(camSub(end, start)));
  const height = (p) => camDot(camSub(p, mouth), outward);
  const extension = camMul(outward, lead + clearance);
  const farStart = camAdd(start, extension),
    farEnd = camAdd(end, extension);
  const freeEdges = [camLine(end, farEnd), camLine(farEnd, farStart), camLine(farStart, start)];
  const boundary = camOffsetContour([...source, ...freeEdges], 0, c.tolerance);
  if (camSelfIntersects(boundary, Math.max(0.02, c.tolerance))) return null;
  const barriers = [...allWalls, ...freeEdges.map(wallEntry)];
  const paths = R.offsetAvailable(boundary, clearance);
  for (const path of paths) {
    if (path.length >= MAX_ROUTE_SEGMENTS)
      throw Error("Предварительный обход слишком сложный. Раздели открытую стенку.");
    if (
      !path.some(
        (segment) => height(segment.a) < -clearance || height(camPoint(segment, 0.5)) < -clearance,
      )
    )
      continue;
    const signedArea = camArea(path);
    if (Math.abs(signedArea) < 0.00001) continue;
    const directed = Math.sign(signedArea) === wanted ? path : path.slice().reverse().map(camRev);
    const cap = directed.findIndex(
      (s) =>
        s.type === "L" &&
        camSlen(s) > 0.002 &&
        Math.abs(height(s.a) - lead) < 0.001 &&
        Math.abs(height(s.b) - lead) < 0.001,
    );
    if (cap < 0) continue;
    const segment = directed[cap],
      entry = midpoint(segment.a, segment.b);
    const route = [
      camLine(entry, segment.b),
      ...directed.slice(cap + 1),
      ...directed.slice(0, cap),
      camLine(segment.a, entry),
    ];
    if (!route.every((s) => clearSegment(s, barriers, radius + 0.001))) continue;
    return {
      ...contour,
      side: "on",
      autoSide: "on",
      closed: false,
      segs: route,
      openWall: true,
      openWallInfo: {
        entry,
        lead,
        radius,
        side: "inside",
        entryMethod: "available",
        partial: true,
      },
    };
  }
  return null;
}
function verifyAvailableOutput(motions, ids, walls, radius, c) {
  const checkedDepths = new Map(),
    world = (p) => camP(p.x + c.originX, p.y + c.originY);
  for (const motion of motions) {
    if (motion.stage !== "cut" || !ids.has(motion.contour)) continue;
    if (!checkedDepths.has(motion.contour)) checkedDepths.set(motion.contour, motion.b.z);
    if (checkedDepths.get(motion.contour) !== motion.b.z) continue;
    const a = world(motion.a),
      b = world(motion.b),
      center = motion.c && world(motion.c);
    const segment = center ? camArc(a, b, center, motion.sw) : camLine(a, b);
    const arcError = center ? Math.abs(camDist(a, center) - camDist(b, center)) : 0;
    if (!clearSegment(segment, walls, radius + arcError)) {
      throw clearanceError(
        Error(
          "После округления стойки предварительный обход задевает стенку. Нужна фреза меньшего диаметра.",
        ),
        { id: motion.contour },
      );
    }
  }
  for (const id of ids)
    if (!checkedDepths.has(id)) {
      throw clearanceError(Error("Предварительный обход исчез после округления координат."), {
        id,
      });
    }
}
function validate(contour, tolerance, knownBoundary = false) {
  if (contour.closed || contour.ambiguous || !Array.isArray(contour.segs) || !contour.segs.length)
    throw Error(
      "Открытая стенка: выбери одну неразветвлённую незамкнутую цепочку выбранных элементов.",
    );
  let points = 1;
  const flattenTolerance = Math.max(0.02, tolerance);
  for (let i = 0; i < contour.segs.length; i++) {
    const s = contour.segs[i];
    if (
      !s ||
      !["L", "A"].includes(s.type) ||
      !finite(s.a) ||
      !finite(s.b) ||
      (s.type === "A" &&
        (!finite(s.c) || !Number.isFinite(s.sw) || Math.abs(s.sw) >= 2 * Math.PI - EPS))
    )
      throw Error("Открытая стенка содержит повреждённую линию или дугу.");
    if (
      camSlen(s) <= 0.0005 ||
      (s.type === "A" &&
        (camDist(s.a, s.c) <= 0.0005 || Math.abs(camDist(s.a, s.c) - camDist(s.b, s.c)) > 0.002))
    )
      throw Error("Открытая стенка содержит слишком короткий или некорректный элемент.");
    if (i && camDist(contour.segs[i - 1].b, s.a) > 0.0005)
      throw Error("Открытая стенка: выбранные элементы должны соединяться без разрывов.");
    if (s.type === "L") points++;
    else {
      const r = camDist(s.a, s.c),
        delta = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - flattenTolerance / r)));
      points += Math.min(
        10000,
        Math.max(2, Math.ceil(Math.abs(s.sw) / Math.max(0.002, Math.min(Math.PI / 12, delta)))),
      );
    }
    if (points > 4400)
      throw Error(
        "Открытая стенка слишком сложная для ограниченной проверки на 32-битном компьютере. Увеличь допуск или упрости дуги.",
      );
  }
  if (camDist(contour.segs[0].a, contour.segs.at(-1).b) <= 0.001)
    throw Error("Для открытой стенки нужны два разных конца у свободного входа.");
  const virtual = [...contour.segs, camLine(contour.segs.at(-1).b, contour.segs[0].a)];
  if (knownBoundary) {
    if (camSelfIntersects(contour.segs, Math.max(0.02, tolerance)))
      throw Error("Открытая граница детали пересекает себя.");
    return camArea(virtual) || 1;
  }
  if (camSelfIntersects(virtual, Math.max(0.02, tolerance)))
    throw Error("Открытая стенка или её свободный вход пересекает себя.");
  const signedArea = camArea(virtual);
  if (Math.abs(signedArea) < Math.max(1e-6, tolerance * tolerance))
    throw Error(
      "Не удалось определить внутреннюю сторону открытой стенки. Выбери П-образную цепочку с одним свободным входом.",
    );
  return signedArea;
}
function roundedLead(a, b, c, preferred) {
  const incoming = camUnit(camSub(b, a)),
    outgoing = camUnit(camSub(c, b));
  const turn = Math.atan2(camCross(incoming, outgoing), camDot(incoming, outgoing));
  if (Math.abs(turn) < 0.001 || Math.abs(turn) > Math.PI - 0.001) return null;
  const ratio = Math.tan(Math.abs(turn) / 2);
  const radius = Math.min(preferred, (0.45 * Math.min(camDist(a, b), camDist(b, c))) / ratio);
  if (radius < 0.01) return null;
  const trim = radius * ratio,
    from = camSub(b, camMul(incoming, trim)),
    to = camAdd(b, camMul(outgoing, trim));
  const centre = camAdd(from, camMul(camLeft(incoming), Math.sign(turn) * radius));
  return {
    radius,
    path: [camLine(a, from), camArc(from, to, centre, turn), camLine(to, c)],
  };
}
function wallRoute(contour, c, radius, allWalls, originalArea) {
  const E = ENTRY;
  const boundary =
    c.machine === "fanuc3000c" && ["inside", "outside"].includes(contour.side)
      ? E.boundaryRoute(contour, c, contour.side)
      : null;
  if (boundary) {
    let offsetReady = false;
    try {
      const wallPath = camOffsetContour(
        boundary.path,
        boundary.offsetSign * radius,
        0.0000001,
        false,
      ).filter((s) => camSlen(s) > EPS);
      offsetReady = true;
      if (c.startPoint && camDist(c.startPoint, boundary.path[0].a) > 0.003) {
        const error = Error(
          "Для открытого контура выбери касание на начальном конце выбранного обхода. Вся стенка сохраняется.",
        );
        error.entryPoint = c.startPoint;
        throw error;
      }
      const clear = E.clearance(allWalls.map((w) => w.segment)),
        plan = E.boundaryPlan(wallPath, c, clear, radius - 0.004, boundary.offsetSign);
      return {
        ...contour,
        side: "on",
        autoSide: "on",
        closed: false,
        segs: [...plan.leadIn, ...wallPath, ...plan.leadOut],
        openWall: true,
        entryHandled: true,
        openWallInfo: {
          entry: plan.entry,
          exit: plan.exit,
          attachment: boundary.path[0].a,
          lead: c.lead,
          radius,
          side: contour.side,
          entryMethod: "boundaryTangent",
          entryRadius: plan.radius,
          wallPath,
          leadIn: plan.leadIn,
          leadOut: plan.leadOut,
          manualEntry: !!c.entryStart,
        },
      };
    } catch (error) {
      if (
        offsetReady ||
        contour.side !== "inside" ||
        !c.autoFit ||
        ["left", "right"].includes(c.openOffsetSide) ||
        contour.materialLeft !== Math.sign(originalArea) ||
        error.geometryComplexity
      )
        throw error;
    }
  }
  const outside = normalizeSide(contour.side) === "outside",
    wanted = {
      climb: outside ? 1 : -1,
      conventional: outside ? -1 : 1,
      cw: -1,
      ccw: 1,
    }[c.direction || "climb"];
  if (wanted === undefined) throw Error("Неизвестное направление обработки открытой стенки.");
  const reversed = Math.sign(originalArea) !== wanted,
    source = reversed ? contour.segs.slice().reverse().map(camRev) : contour.segs.map(copy),
    signedArea = reversed ? -originalArea : originalArea;
  let wallPath;
  try {
    wallPath = camOffsetContour(
      source,
      Math.sign(signedArea) * radius * (outside ? -1 : 1),
      c.tolerance,
      false,
    );
  } catch (error) {
    if (outside || !c.autoFit || error.geometryComplexity) throw clearanceError(error, contour);
    let available;
    try {
      available = availableInsideRoute(contour, c, radius, allWalls, originalArea, wanted);
    } catch (failure) {
      throw clearanceError(failure, contour);
    }
    if (available) return available;
    throw clearanceError(
      Error(
        error.message +
          " Не найден непрерывный предварительный проход от открытого края для Ø" +
          c.diameter +
          " мм с заданным припуском.",
      ),
      contour,
    );
  }
  const first = wallPath[0],
    last = wallPath.at(-1);
  const start = source[0].a,
    end = source.at(-1).b,
    mouth = midpoint(start, end),
    outward = camMul(camLeft(camUnit(camSub(end, start))), Math.sign(signedArea));
  const startDirection = camMul(camTangent(camSlen(first) > EPS ? first : source[0]), -1),
    endDirection = camTangent(camSlen(last) > EPS ? last : source.at(-1), true);
  const lead = c.autoLead ? Math.max(c.diameter, c.lead) : c.lead;
  if (!Number.isFinite(lead) || lead <= 0.001)
    throw Error("Для открытой стенки задай положительный заход или включи автоматический подбор.");
  const candidates = [];
  const cutting = wallPath.filter((s) => camSlen(s) > EPS).map(copy);
  if (camDot(startDirection, outward) > 0.25 && camDot(endDirection, outward) > 0.25)
    candidates.push({
      a: startDirection,
      b: endDirection,
      method: "tangent",
    });
  candidates.push({ a: outward, b: outward, method: "mouthNormal" });
  let entryOutside = false;
  for (const candidate of candidates) {
    const a = camAdd(first.a, camMul(candidate.a, lead)),
      b = camAdd(last.b, camMul(candidate.b, lead)),
      entry = midpoint(a, b);
    if (camDot(camSub(entry, mouth), outward) <= 0.001) continue;
    entryOutside = true;
    const route = [],
      line = (a, b) => {
        if (camDist(a, b) > EPS) route.push(camLine(a, b));
      };
    line(entry, a);
    line(a, first.a);
    route.push(...cutting);
    line(last.b, b);
    line(b, entry);
    if (route.length > MAX_ROUTE_SEGMENTS)
      throw Error("Открытая стенка слишком сложная для безопасного автоматического входа.");
    const info = {
      entry: { ...entry },
      lead,
      radius,
      side: outside ? "outside" : "inside",
      entryMethod: candidate.method,
      wallPath: wallPath.map(copy),
    };
    if (
      candidate.method === "tangent" &&
      c.machine === "fanuc3000c" &&
      c.autoLead &&
      c.lead > 0 &&
      !c.startPoint &&
      camSlen(first) > EPS &&
      camSlen(last) > EPS
    ) {
      const inLead = roundedLead(entry, a, first.a, c.lead),
        outLead = roundedLead(last.b, b, entry, c.lead);
      const rounded = [
        ...((inLead === null || inLead === void 0 ? void 0 : inLead.path) || []),
        ...((outLead === null || outLead === void 0 ? void 0 : outLead.path) || []),
      ];
      if (
        inLead &&
        outLead &&
        route.length + 2 <= MAX_ROUTE_SEGMENTS &&
        wallPath.every((s) => clearSegment(s, allWalls, radius)) &&
        rounded.every((s) => {
          const emitted = camRoundXYSegment(s, c);
          return (
            emitted &&
            clearSegment(s, allWalls, radius) &&
            clearSegment(emitted.segment, allWalls, radius + emitted.radiusError - 2 / c.coordScale)
          );
        })
      ) {
        return {
          ...contour,
          side: "on",
          autoSide: "on",
          closed: false,
          segs: [...inLead.path, ...cutting, ...outLead.path],
          openWall: true,
          openWallInfo: {
            ...info,
            entryRadius: inLead.radius,
            exitRadius: outLead.radius,
          },
        };
      }
    }
    if (route.every((segment) => clearSegment(segment, allWalls, radius)))
      return {
        ...contour,
        side: "on",
        autoSide: "on",
        closed: false,
        segs: route,
        openWall: true,
        openWallInfo: info,
      };
  }
  if (!entryOutside) throw Error("Общая точка входа не вышла за открытый край. Увеличь заход.");
  throw clearanceError(
    Error(
      "Открытая стенка: фреза с заданным припуском задевает выбранную стенку на обходе, входе или выходе. Уменьши физический диаметр, измени геометрию или длину захода.",
    ),
    contour,
  );
}
function prepare(contours, c) {
  const selected = contours.filter((contour) => contour.enabled),
    walls = selected.filter(isRequested);
  if (c.toolKind !== "mill" || !walls.length) return { contours, config: c, warnings: [] };
  if (walls.length !== selected.length)
    throw Error(
      "Открытую стенку пока обрабатывай отдельным расчётом: сними отметки с других типов обработки.",
    );
  for (const key of ["diameter", "allowance", "stockAllowance", "lead", "tolerance"])
    if (!Number.isFinite(c[key])) throw Error("Проверь параметр открытой стенки: " + key + ".");
  if (c.diameter <= 0 || c.allowance < 0 || c.stockAllowance < 0 || c.lead < 0 || c.tolerance <= 0)
    throw Error("Проверь диаметр, припуски, заход и допуск открытой стенки.");
  if (c.stockAllowance > 0)
    throw Error(
      "Открытая стенка: боковые черновые проходы пока не поддерживаются. Установи боковой припуск 0.",
    );
  if (walls.reduce((sum, wall) => sum + (Array.isArray(wall.segs) ? wall.segs.length : 0), 0) > 700)
    throw Error("Открытые стенки ограничены 700 выбранными элементами для 32-битной системы.");
  const areas = walls.map((wall) =>
    validate(
      wall,
      c.tolerance,
      c.machine === "fanuc3000c" &&
        ["inside", "outside"].includes(wall.side) &&
        ([-1, 1].includes(wall.materialLeft) || ["left", "right"].includes(c.openOffsetSide)),
    ),
  );
  const radius = c.diameter / 2 + c.allowance,
    allWalls = walls.flatMap((wall) => wall.segs.map(wallEntry)),
    prepared = new Map();
  walls.forEach((wall, i) => prepared.set(wall, wallRoute(wall, c, radius, allWalls, areas[i])));
  const partial = [...prepared.values()].filter((wall) => wall.openWallInfo.partial);
  if (partial.reduce((total, wall) => total + wall.segs.length, 0) > MAX_ROUTE_SEGMENTS)
    throw Error("Слишком много участков предварительного обхода. Раздели обработку.");
  const partialIds = new Set(partial.map((wall) => wall.id));
  const sides = [...new Set(walls.map((wall) => normalizeSide(wall.side)))],
    description =
      sides.length > 1
        ? "с выбранных сторон"
        : sides[0] === "outside"
          ? "с наружной стороны"
          : "с внутренней стороны";
  const warnings = [
    "Открытая стенка: обработаны только выбранные элементы " +
      description +
      ". Вход и выход проходят через одну свободную точку; линия условного замыкания не обрабатывается. Это обход стенки, а не выборка кармана. Свободное место для опускания инструмента должно быть подготовлено.",
  ];
  if (partial.length)
    warnings.push(
      "Предварительный обход открытого паза фрезой Ø" +
        c.diameter +
        " мм с заданным припуском. Красным показан остаток у стенки для следующей операции меньшей фрезой.",
    );
  return {
    contours: contours.map((contour) => prepared.get(contour) || contour),
    config: {
      ...c,
      lead: 0,
      allowance: 0,
      stockAllowance: 0,
      direction: "ccw",
      returnXY: true,
      returnX: 0,
      returnY: 0,
    },
    warnings,
    partial: partial.length > 0,
    verifyOutput: partial.length
      ? (motions) => verifyAvailableOutput(motions, partialIds, allWalls, radius, c)
      : null,
  };
}

const api = { prepare, isRequested, distance, normalizeSide };
export default api;
