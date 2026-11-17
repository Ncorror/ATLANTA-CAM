import {
  point as camPoint,
  arc as camArc,
  tangent as camTangent,
  line as camLine,
  slen as camSlen,
  area as camArea,
  rev as camRev,
  bounds as camBounds,
} from "../core/segments.js";
import {
  dist as camDist,
  P as camP,
  len as camLen,
  left as camLeft,
  unit as camUnit,
  mul as camMul,
  add as camAdd,
  sub as camSub,
  dot as camDot,
  cross as camCross,
} from "../core/math.js";
import {
  planeInfo as camPlaneInfo,
  planeToLocal as camPlaneToLocal,
  planeToWorld as camPlaneToWorld,
  motionToLocal as camMotionToLocal,
} from "../core/planes.js";
import {
  isFullArc as camIsFullArc,
  compactArcs as camCompactArcs,
  fmt as camFmt,
  feedFmt as camFeedFmt,
  roundXYSegment as camRoundXYSegment,
  arcFeed as camArcFeed,
  roundArcCentre as camRoundArcCentre,
} from "./format.js";
import { motionLength as camMotionLength, feedLength as camFeedLength } from "./motion.js";
import { oriented as camOriented, offsetContour as camOffsetContour } from "../core/contours.js";
import {
  selfIntersects as camSelfIntersects,
  segmentDistanceIndex as camSegmentDistanceIndex,
} from "../core/spatial.js";
import { generate as camGenerate } from "../cam/basic-planner.js";
import { tokenizeNC as camTokenizeNC } from "./tokenizer.js";
import { parseNC as camParseNC } from "./parser.js";

import SKETCH from "../geometry/sketch.js";
import REACHABLE from "../cam/reachability.js";
import COMPENSATION from "./compensation.js";
import ENTRY from "../cam/entry.js";
import KONTUR_CNC from "../cam/kontur-planner.js";

const S = SKETCH;
const R = REACHABLE;
const CP = COMPENSATION;
const E = ENTRY;
const TAU = 2 * Math.PI,
  EPS = 1e-7,
  AUTO_ENTRY = 10;
function amount(c) {
  const value = c.correctionValue;
  if (!Number.isInteger(value) || value < 0 || value > 999999)
    throw Error("Значение корректора — целое число от 0 до 999999 отсчётов. 4000 = 4,000 мм.");
  return value / 1000;
}
function quadrantParts(parts) {
  const out = [];
  for (const part of parts) {
    const s = part.segment;
    if (s.type !== "A") {
      out.push(part);
      continue;
    }
    const start = Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x),
      total = Math.abs(s.sw),
      sign = Math.sign(s.sw),
      cuts = [0, total];
    for (let k = 0; k < 4; k++) {
      const angle = (k * Math.PI) / 2;
      let travel = ((((angle - start) * sign) % TAU) + TAU) % TAU;
      if (travel < 1e-9) travel += TAU;
      for (; travel < total - 1e-9; travel += TAU) cuts.push(travel);
    }
    cuts.sort((a, b) => a - b);
    let a = s.a;
    for (let i = 1; i < cuts.length; i++) {
      const b = i === cuts.length - 1 ? s.b : camPoint(s, cuts[i] / total);
      out.push({
        ...part,
        segment: camArc(a, b, s.c, sign * (cuts[i] - cuts[i - 1])),
      });
      a = b;
    }
  }
  return out;
}
function turn(a, b, sign) {
  let angle = Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x);
  if (sign > 0) {
    while (angle <= 0) angle += TAU;
  } else while (angle >= 0) angle -= TAU;
  return angle;
}
function arcError(reason, record, source, radius, number, actualRadius) {
  const error = Error("Ошибка дуги с коррекцией в строке " + record.line + ".");
  const xy = (p) => ({ x: p.x, y: p.y }),
    segment = {
      type: "A",
      a: xy(source.a),
      b: xy(source.b),
      c: xy(source.c),
      sw: source.sw,
    };
  error.ncDiagnostic = {
    kind: "correction",
    reason,
    line: record.line,
    section: record.section,
    comp: record.comp,
    corrector: number,
    correctionRadius: radius,
    correctionValue: Math.round(radius * 1000),
    nominalRadius: camDist(source.a, source.c),
    actualRadius,
    segment,
    point: camPoint(segment, 0.5),
    space: "work",
  };
  return error;
}
function diagnose(error, parsed, c, frames = [], offset = 2) {
  var _frame$part, _frame$motion, _frame$motion2, _frame$part2, _frame$part3, _exec;
  const d = error.ncDiagnostic;
  if (!d) return error;
  const frame = frames[d.line - offset] || {},
    settings =
      ((_frame$part = frame.part) === null || _frame$part === void 0
        ? void 0
        : _frame$part.config) || c;
  d.stage =
    frame.stage ||
    ((_frame$motion = frame.motion) === null || _frame$motion === void 0
      ? void 0
      : _frame$motion.stage) ||
    "Дуга программы";
  d.contour =
    frame.contour ||
    ((_frame$motion2 = frame.motion) === null || _frame$motion2 === void 0
      ? void 0
      : _frame$motion2.contour);
  d.operation =
    ((_frame$part2 = frame.part) === null || _frame$part2 === void 0
      ? void 0
      : _frame$part2.label) ||
    ((_frame$part3 = frame.part) === null || _frame$part3 === void 0 ? void 0 : _frame$part3.name);
  if (d.space === "work") {
    const world = (p) => ({
      x: p.x + (settings.originX || 0),
      y: p.y + (settings.originY || 0),
    });
    d.point = world(d.point);
    d.segment = {
      ...d.segment,
      a: world(d.segment.a),
      b: world(d.segment.b),
      c: world(d.segment.c),
    };
    d.space = "drawing";
  }
  const lines = parsed.lines;
  let size = 0,
    full = lines.length <= 1000;
  if (full)
    for (const line of lines) {
      size += line.length + 2;
      if (size > 65536) {
        full = false;
        break;
      }
    }
  const first = full ? 0 : Math.max(0, d.line - 21),
    last = full ? lines.length : Math.min(lines.length, d.line + 20);
  d.code = lines
    .slice(first, last)
    .map((line) => (full ? line : line.slice(0, 1024)))
    .join("\r\n");
  d.firstLine = first + 1;
  d.displayLine = d.line - first;
  d.totalLines = lines.length;
  d.truncated = !full;
  d.command = (lines[d.line - 1] || "").slice(0, 1024);
  d.block =
    ((_exec = /^\s*(N\s*\d+)/i.exec(d.command)) === null || _exec === void 0 ? void 0 : _exec[1]) ||
    null;
  const mm = (value) => value.toFixed(3).replace(".", ","),
    where =
      d.stage === "Обход контура"
        ? "Дуга контура"
        : d.stage === "Радиусный заход"
          ? "Дуга захода"
          : d.stage === "Радиусный выход"
            ? "Дуга выхода"
            : "Дуга программы";
  const location = (d.block ? d.block + " · " : "") + "строка " + d.line;
  const values =
    "R" +
    mm(d.nominalRadius) +
    " мм, G" +
    d.comp +
    ", D" +
    String(d.corrector).padStart(2, "0") +
    "=" +
    d.correctionValue +
    " (" +
    mm(d.correctionRadius) +
    " мм). ";
  if (d.reason === "arc-radius") {
    error.message =
      where +
      " · " +
      location +
      ": " +
      values +
      "Радиус пути центра R−D=" +
      mm(d.actualRadius) +
      " мм; отрицательный радиус недопустим. " +
      (d.stage === "Обход контура"
        ? "Проверь радиус контура и соответствие фрезы/значения D."
        : "Проверь радиус этой дуги и соответствие фрезы/значения D.");
  } else
    error.message =
      where +
      " · " +
      location +
      ": " +
      values +
      "Вектор коррекции не совпадает с началом дуги. Проверь стык элементов и направление G41/G42.";
  return error;
}
function simulate(parsed, settings) {
  if (parsed.errors && parsed.errors.length)
    throw Error("Расчёт центра инструмента остановлен: " + parsed.errors[0]);
  const byLine = new Map();
  for (const m of parsed.motions) {
    const key = m.executionIndex !== undefined ? m.executionIndex : m.line;
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(m);
  }
  const motions = [],
    vectors = { 17: camP(0, 0), 18: camP(0, 0), 19: camP(0, 0) },
    normals = { 17: null, 18: null, 19: null };
  let position = { x: 0, y: 0, z: 30 },
    offsetNumber = 0,
    feed = 0,
    vectorPlane = null,
    previousComp = 40;
  for (const record of parsed.records) {
    if (record.ended || record.repeatControl) continue;
    const setting = settings[record.section];
    const known = setting && (setting.radius !== undefined || setting.table);
    const plane = record.plane || 17,
      axes = camPlaneInfo(plane);
    const get = (letter) => record.words.findLast((w) => w.letter === letter);
    const correction = record.words.findLast((w) => w.letter === "D" || w.letter === "H");
    if (get("F") && !record.dwell && !record.words.some((w) => w.letter === "G" && w.value === 4))
      feed = get("F").value / 10;
    if (correction) offsetNumber = correction.value;
    if (record.searchOnly) continue;
    if (record.g92) {
      for (const axis of ["X", "Y", "Z"])
        if (get(axis))
          position[axis.toLowerCase()] = record.coordinateValues
            ? record.coordinateValues[axis]
            : get(axis).value / 1000;
      continue;
    }
    const key = record.executionIndex !== undefined ? record.executionIndex : record.line;
    const original = byLine.get(key) || [];
    if (record.dwell) {
      for (const m of original) motions.push({ ...m, a: { ...position }, b: { ...position } });
      continue;
    }
    if (known && record.cycle) {
      if (!original.length) continue;
      if ([17, 18, 19].some((code) => camLen(vectors[code]) > EPS))
        throw Error(
          "Строка " +
            record.line +
            ": физический переход из действующей G41/G42 в постоянный цикл не моделируется. Для этого расчёта отмени вектор через G40 перед циклом (§3.12.13, с. 81).",
        );
      const first = original[0].a;
      if (Math.hypot(first.x - position.x, first.y - position.y, first.z - position.z) > 0.004)
        throw Error(
          "Строка " +
            record.line +
            ": физическое начало постоянного цикла отличается от программного после изменения вектора/координат. Задай исходное положение явно; неподтверждённый переход не показывается.",
        );
    }
    if (!known || record.cycle) {
      for (const m of original) motions.push({ ...m });
      if (record.after) position = { ...record.after };
      for (const code of [17, 18, 19]) {
        vectors[code] = camP(0, 0);
        normals[code] = null;
      }
      continue;
    }
    if (!record.before || !record.after || record.dwell) continue;
    if (record.comp !== 40 && previousComp === 40) vectorPlane = plane;
    previousComp = record.comp;
    const suspended = record.comp !== 40 && vectorPlane !== null && plane !== vectorPlane;
    const active = suspended ? camP(0, 0) : vectors[plane];
    const radius =
      record.comp === 40
        ? 0
        : setting.table && Object.prototype.hasOwnProperty.call(setting.table, offsetNumber)
          ? setting.table[offsetNumber]
          : offsetNumber === setting.number
            ? setting.radius
            : undefined;
    if (radius === undefined)
      throw Error("Нет значения D/H" + offsetNumber + " для просмотра строки " + record.line + ".");
    if (!Number.isFinite(radius) || Math.abs(radius) > 999.999)
      throw Error(
        "Строка " +
          record.line +
          ": величина D/H должна быть числом от −999,999 до +999,999 мм для M2V (§3.12.10, с. 63).",
      );
    const side = (record.comp === 41 ? 1 : -1) * (axes.orientation || 1);
    const direction = () =>
      camP(
        get(axes.offsets[0]) ? get(axes.offsets[0]).value : 0,
        get(axes.offsets[1]) ? get(axes.offsets[1]).value : 0,
      );
    if (record.vectorRewrite) {
      vectorPlane = plane;
      normals[plane] = camLeft(camUnit(direction()));
      vectors[plane] = camMul(normals[plane], side * radius);
      continue;
    }
    const hasAxes = record.words.some((w) => "XYZ".includes(w.letter));
    const hasVector = get(axes.offsets[0]) || get(axes.offsets[1]);
    const changesComp = record.words.some(
      (w) => w.letter === "G" && [40, 41, 42].includes(w.value),
    );
    if (
      !original.length &&
      !record.cornerOffset &&
      !hasAxes &&
      !hasVector &&
      !changesComp &&
      !correction
    )
      continue;
    const start = camPlaneToLocal(position, plane);
    const reference = {
      x: start.x - active.x,
      y: start.y - active.y,
      z: start.z,
    };
    const targetWorld = camPlaneToWorld(reference, plane);
    for (const axis of ["X", "Y", "Z"])
      if (get(axis)) {
        const value = record.coordinateValues
          ? record.coordinateValues[axis]
          : get(axis).value / 1000;
        const absolute = record.coordinateModes ? record.coordinateModes[axis] : record.absolute;
        targetWorld[axis.toLowerCase()] = (absolute ? 0 : targetWorld[axis.toLowerCase()]) + value;
      }
    const target = camPlaneToLocal(targetWorld, plane);
    if (!record.planeExplicit && [2, 3].includes(record.mode)) target.z = reference.z;
    let next = { ...active },
      to = { ...start },
      centre = null,
      sweep = null;
    let type = original[0] ? original[0].type : record.mode === 0 || feed === 0 ? "rapid" : "feed";
    if (record.cornerOffset) {
      if (suspended || (Math.abs(radius) > EPS && camLen(active) <= EPS))
        throw Error(
          "Строка " +
            record.line +
            ": G39 требует действующий исходный вектор коррекции в выбранной плоскости.",
        );
      normals[plane] = camLeft(camUnit(direction()));
      next = camMul(normals[plane], side * radius);
      to = { x: reference.x + next.x, y: reference.y + next.y, z: start.z };
      if (Math.abs(radius) > EPS && camDist(active, next) > EPS) {
        centre = camP(reference.x, reference.y);
        sweep = turn(
          active,
          next,
          (record.comp === 42 ? 1 : -1) * (axes.orientation || 1) * (radius < 0 ? -1 : 1),
        );
        type = "arc";
      }
    } else if (original[0] && original[0].type === "arc") {
      const originalSource = camMotionToLocal(original[0], plane);
      const source = {
        ...originalSource,
        a: reference,
        b: target,
        c: camAdd(reference, camMul(direction(), 0.001)),
      };
      source.sw =
        camDist(reference, target) < EPS
          ? Math.sign(originalSource.sw) * TAU
          : turn(
              camSub(reference, source.c),
              camSub(target, source.c),
              Math.sign(originalSource.sw),
            );
      const r = camDist(source.a, source.c),
        sign = Math.sign(source.sw);
      if (Math.abs(camDist(target, source.c) - r) > 0.01)
        throw Error(
          "Строка " +
            record.line +
            ": радиусы начала/конца дуги после G38/G92 отличаются. Проверь абсолютные координаты и вектор.",
        );
      const signedRadius = r - side * sign * (suspended ? 0 : radius),
        zeroRadius =
          !suspended &&
          Math.abs(Math.round(r * 1000) / 1000 - side * sign * radius) < EPS &&
          Math.abs(signedRadius) < 0.001;
      if (signedRadius < -EPS && !zeroRadius)
        throw arcError("arc-radius", record, source, radius, offsetNumber, signedRadius);
      const actualRadius = zeroRadius ? 0 : Math.max(0, signedRadius);
      if (Math.abs(source.b.z - source.a.z) > EPS) {
        const pitch = (Math.abs(source.b.z - source.a.z) * TAU) / Math.abs(source.sw);
        if (pitch > 8 * Math.PI * actualRadius + 1e-8 || pitch > 1647.096 + 1e-8)
          throw Error(
            "Строка " +
              record.line +
              ": шаг спирали превышает предел §3.12.6 по радиусу центра инструмента после D/H.",
          );
      }
      centre = source.c;
      if (Math.abs(camDist(start, centre) - actualRadius) > 0.004)
        throw arcError("arc-vector", record, source, radius, offsetNumber, actualRadius);
      const radial = camMul(camUnit(camSub(source.b, source.c)), actualRadius);
      to = { x: centre.x + radial.x, y: centre.y + radial.y, z: target.z };
      if (camIsFullArc(source)) to = { ...start, z: target.z };
      next = camSub(to, target);
      normals[plane] = camMul(camUnit(camSub(target, centre)), -sign);
      sweep = source.sw;
      type = "arc";
    } else {
      if (record.comp === 40) next = camP(0, 0);
      else if (
        !suspended &&
        (hasVector || record.words.some((w) => axes.axes.slice(0, 2).includes(w.letter)))
      ) {
        const d = hasVector ? direction() : camSub(target, reference);
        if (camLen(d) > EPS) {
          normals[plane] = camLeft(camUnit(d));
          next = camMul(normals[plane], side * radius);
        } else if (hasVector && Math.abs(radius) > EPS)
          throw Error(
            "Строка " +
              record.line +
              ": нулевой направляющий вектор " +
              axes.offsets[0] +
              "/" +
              axes.offsets[1] +
              " для коррекции.",
          );
      } else if (!suspended && normals[plane]) next = camMul(normals[plane], side * radius);
      to = { x: target.x + next.x, y: target.y + next.y, z: target.z };
    }
    vectors[plane] = next;
    if (record.comp === 40) {
      for (const code of [17, 18, 19]) {
        vectors[code] = camP(0, 0);
        normals[code] = null;
      }
      vectorPlane = null;
    }
    const destination = camPlaneToWorld(to, plane);
    const motion = {
      ...(original[0] || {}),
      type,
      a: { ...position },
      b: destination,
      line: record.line,
      section: record.section,
      feed,
      comp: 40,
      programComp: record.comp,
      physical: true,
      planarFeed: true,
    };
    if (record.executionIndex !== undefined) {
      for (const name of [
        "executionIndex",
        "cycleReplay",
        "cycleTriggerN",
        "cycleTriggerLine",
        "cycleRepeat",
        "cycleRepeatCount",
      ])
        motion[name] = record[name];
    }
    if (plane !== 17) motion.plane = plane;
    else delete motion.plane;
    if (centre) {
      motion.c = plane === 17 ? centre : camPlaneToWorld({ ...centre, z: start.z }, plane);
      motion.sw = sweep;
    } else {
      delete motion.c;
      delete motion.sw;
    }
    if (camMotionLength(motion) > EPS) motions.push(motion);
    position = destination;
    if (motions.length > 100000)
      throw Error("Слишком много перемещений с коррекцией. Раздели программу.");
  }
  return motions;
}
function fittedInside(contour, c, radius) {
  const base = camOriented(contour, "inside", "ccw"),
    limit = Math.max(radius, c.diameter / 2) + (c.allowance || 0);
  const margin = Math.max(0.05, 2 * c.tolerance + 0.01),
    opening = limit + margin;
  const smooth = base.every(
    (s, i) => camDist(camTangent(s, true), camTangent(base[(i + 1) % base.length])) < 0.00001,
  );
  const exact =
    smooth && base.every((s) => s.type === "L" || s.sw < 0 || camDist(s.a, s.c) > opening);
  if (exact) return { contours: [contour], partial: false };
  if (!c.autoFit)
    throw Error(
      "Внутренний угол не подходит для фрезы или корректора. Включи обработку доступного.",
    );
  const centres = R.offsetAvailable(base, opening);
  if (!centres.length) return { contours: [], partial: true, blocked: true };
  const contours = centres
    .flatMap((path) => R.offsetAvailable(path, -opening))
    .map((segs, i) => {
      return {
        ...contour,
        id: contour.id + "-d" + i,
        sourceId: contour.id,
        closed: true,
        segs,
      };
    });
  return { contours, partial: true };
}
function clippedRuns(path, mouth, outward, height) {
  const level = (p) => camDot(camSub(p, mouth), outward),
    runs = [];
  let run = [];
  function finish() {
    if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  for (const segment of path) {
    const cuts = [0, 1];
    if (segment.type === "L") {
      const delta = level(segment.b) - level(segment.a);
      if (Math.abs(delta) > EPS) {
        const t = (height - level(segment.a)) / delta;
        if (t > EPS && t < 1 - EPS) cuts.push(t);
      }
    } else {
      const r = camDist(segment.a, segment.c),
        ratio = (height - level(segment.c)) / r;
      if (ratio > -1 && ratio < 1) {
        const start = Math.atan2(segment.a.y - segment.c.y, segment.a.x - segment.c.x),
          axis = Math.atan2(outward.y, outward.x);
        for (const angle of [axis + Math.acos(ratio), axis - Math.acos(ratio)]) {
          const travel = ((((angle - start) * Math.sign(segment.sw)) % TAU) + TAU) % TAU,
            t = travel / Math.abs(segment.sw);
          if (t > EPS && t < 1 - EPS) cuts.push(t);
        }
      }
    }
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const lo = cuts[i - 1],
        hi = cuts[i],
        a = camPoint(segment, lo),
        b = camPoint(segment, hi);
      if (level(camPoint(segment, (lo + hi) / 2)) > height + EPS) {
        finish();
        continue;
      }
      const piece =
        segment.type === "L" ? camLine(a, b) : camArc(a, b, segment.c, segment.sw * (hi - lo));
      if (camSlen(piece) > 0.001) run.push(piece);
    }
  }
  finish();
  if (runs.length > 1 && camDist(runs.at(-1).at(-1).b, runs[0][0].a) < 0.0005)
    runs[0] = [...runs.pop(), ...runs[0]];
  return runs.filter((parts) => parts.some((segment) => level(camPoint(segment, 0.5)) < -0.001));
}
function openRoutes(contour, c, radius, side) {
  const first = contour.segs[0].a,
    last = contour.segs.at(-1).b;
  const area = camArea([...contour.segs, camLine(last, first)]);
  if (Math.abs(area) < 0.001) throw Error("У открытой стенки не определяется сторона обработки.");
  const source = area > 0 ? contour.segs : contour.segs.slice().reverse().map(camRev);
  if (side === "outside") return [source];
  if (c.entryStart && !c.autoFit) return [source];
  const margin = Math.max(0.05, 2 * c.tolerance + 0.01),
    opening = Math.max(radius, c.diameter / 2) + (c.allowance || 0) + margin;
  const a = source[0].a,
    b = source.at(-1).b,
    mouth = camMul(camAdd(a, b), 0.5),
    outward = camLeft(camUnit(camSub(b, a)));
  const box = camBounds([source]),
    extension = Math.max(100, box.w * 2, box.h * 2, opening * 4);
  const farA = camSub(a, camMul(camTangent(source[0]), extension)),
    farB = camAdd(b, camMul(camTangent(source.at(-1), true), extension));
  if (camDot(camSub(farA, a), outward) <= EPS || camDot(camSub(farB, b), outward) <= EPS)
    throw Error(
      "Концы открытой стенки не допускают вход по касательной со свободного края. Раздели стенку на однозначные участки.",
    );
  const boundary = [camLine(farA, a), ...source, camLine(b, farB), camLine(farB, farA)];
  if (camSelfIntersects(boundary, Math.max(0.02, c.tolerance)))
    throw Error("Открытая стенка не допускает однозначный вход со стороны свободного края.");
  const centres = R.offsetAvailable(boundary, opening);
  const routes = centres
    .flatMap((path) => R.offsetAvailable(path, -opening))
    .flatMap((path) => clippedRuns(path, mouth, outward, 0));
  if (!routes.length)
    throw Error("В открытой стенке нет доступного прохода для фрезы и корректора.");
  return routes;
}
function slotAxis(contour, tolerance = 0.02) {
  if (
    !contour ||
    contour.closed ||
    contour.ambiguous ||
    !Array.isArray(contour.segs) ||
    contour.segs.length > 700
  )
    return null;
  const nominal = camCompactArcs(camOffsetContour(contour.segs, 0, tolerance, false));
  const bottom = nominal.findIndex((s, i) => {
    var _nominal, _nominal2;
    return (
      s.type === "A" &&
      Math.abs(Math.abs(s.sw) - Math.PI) < 0.000001 &&
      ((_nominal = nominal[i - 1]) === null || _nominal === void 0 ? void 0 : _nominal.type) ===
        "L" &&
      ((_nominal2 = nominal[i + 1]) === null || _nominal2 === void 0 ? void 0 : _nominal2.type) ===
        "L" &&
      camDist(camTangent(nominal[i - 1], true), camTangent(s)) < 0.000001 &&
      camDist(camTangent(s, true), camTangent(nominal[i + 1])) < 0.000001 &&
      camDot(camTangent(nominal[i - 1]), camTangent(nominal[i + 1])) < -0.999999
    );
  });
  if (bottom < 0) return null;
  const r = camDist(nominal[bottom].a, nominal[bottom].c);
  const area = camArea([...nominal, camLine(nominal.at(-1).b, nominal[0].a)]);
  if (Math.abs(area) < 0.001) return null;
  const ccw = area > 0 ? nominal : nominal.slice().reverse().map(camRev),
    a = ccw[0].a,
    b = ccw.at(-1).b,
    mouth = camMul(camAdd(a, b), 0.5),
    outward = camLeft(camUnit(camSub(b, a)));
  const mid = nominal[bottom].c,
    axis = camSub(mid, mouth);
  if (Math.abs(camCross(camUnit(axis), outward)) > 0.00001 || camDot(axis, outward) >= 0)
    return null;
  return { nominal, ccw, mouth, outward, radius: r };
}
function axisSlot(contour, c, radius, side) {
  var _c$entryStart;
  if (side !== "inside") return null;
  const info = slotAxis(contour, c.tolerance);
  if (!info) return null;
  const { nominal, ccw, mouth, outward, radius: r } = info;
  if (!c.autoLead && Math.abs(r - radius) > 0.000001) return null;
  if (radius > r + 0.000001)
    throw Error(
      "Для осевого прохода этого паза максимальный D = " +
        Math.round(r * 1000) +
        " (" +
        r.toFixed(3) +
        " мм). Заданный D сохранён.",
    );
  if (c.diameter / 2 > r + 0.000001)
    throw Error(
      "Фреза Ø" +
        c.diameter +
        " мм не помещается в паз шириной " +
        (2 * r).toFixed(3) +
        " мм. Диаметр и D сохранены.",
    );
  if (camSelfIntersects(nominal, Math.max(0.02, c.tolerance)))
    throw Error("Открытый паз пересекает себя.");
  const conventional = c.direction === "conventional" || c.direction === "ccw",
    comp = conventional ? 41 : 42,
    path = conventional ? ccw : ccw.slice().reverse().map(camRev);
  const lead = c.autoLead ? Math.max(AUTO_ENTRY, c.lead) : c.lead,
    common = c.entryStart
      ? camP(c.entryStart.x, c.entryStart.y)
      : camAdd(mouth, camMul(outward, lead));
  if (
    (_c$entryStart = c.entryStart) !== null &&
    _c$entryStart !== void 0 &&
    _c$entryStart.space &&
    c.entryStart.space !== "tool"
  )
    throw Error(
      "Начало внутреннего паза задаётся центром фрезы. Выбери начало заново; прежняя точка сохранена.",
    );
  if (c.startPoint && camDist(c.startPoint, path[0].a) > 0.003) return null;
  if (Math.abs(camCross(camSub(common, mouth), outward)) > 0.003) {
    const error = Error(
      "Начало осевого прохода должно лежать на оси паза за открытым краем. Точка сохранена.",
    );
    error.entryPoint = common;
    throw error;
  }
  if (camDot(camSub(common, mouth), outward) < c.diameter / 2 + 0.001) {
    const error = Error(
      "Начало паза должно быть на его оси за открытым краем с местом для всей фрезы. Точка сохранена.",
    );
    error.entryPoint = common;
    throw error;
  }
  const sign = comp === 42 ? -1 : 1;
  let connectorClear = null;
  function connector(point, t, incoming) {
    const n = camMul(camLeft(t), sign),
      contact = camAdd(point, camMul(n, radius)),
      delta = camSub(common, contact);
    if (Math.abs(camCross(delta, t)) < 0.000001 && camDot(delta, t) * (incoming ? -1 : 1) > 0) {
      const pre = camSub(common, camMul(n, radius));
      return {
        end: pre,
        initial: t,
        segment: incoming ? camLine(pre, point) : camLine(point, pre),
      };
    }
    if (!c.autoLead) return null;
    if (radius < r - 0.000001) {
      const travel = incoming ? t : camMul(t, -1),
        hand = incoming ? sign : -sign;
      connectorClear = connectorClear || E.clearance(contour.segs);
      let reason = null;
      for (
        let trial = 0, entryRadius = Math.max(1, c.lead);
        trial < 12 && entryRadius >= 0.01;
        trial++, entryRadius /= 2
      )
        try {
          const physical = E.contactLead(contact, travel, common, entryRadius, hand);
          if (
            !physical.segments.every((s) =>
              connectorClear(s, Math.max(0, Math.min(radius, c.diameter / 2) - 0.004)),
            )
          )
            continue;
          const nominal = physical.segments.map((s) =>
            E.compensatedSegment(s, (incoming ? sign : -sign) * radius),
          );
          const parts = incoming ? nominal : nominal.slice().reverse().map(camRev);
          return {
            end: incoming ? parts[0].a : parts.at(-1).b,
            initial: incoming ? camTangent(parts[0]) : camTangent(parts.at(-1), true),
            segments: parts,
          };
        } catch (error) {
          reason = error;
        }
      if (reason) throw reason;
      throw Error(
        "Касательный вход с оси паза задевает стенку. Измени начало; фреза и D сохранены.",
      );
    }
    const lead = E.circleLead({
      point,
      tangent: t,
      normal: n,
      radius: radius + AUTO_ENTRY,
      start: common,
      offset: radius,
      physical: true,
      autoRadius: true,
      sign,
    });
    const arc = incoming ? lead.arcIn : lead.arcOut;
    return {
      end: lead.pre,
      initial: lead.initial,
      segment: camArc(arc.a, arc.b, arc.c, arc.sweep),
    };
  }
  const incoming = connector(path[0].a, camTangent(path[0]), true),
    outgoing = connector(path.at(-1).b, camTangent(path.at(-1), true), false);
  if (!incoming || !outgoing) return null;
  if (c.entryStart && c.directedEntry) {
    const angle = (c.entryAngle * Math.PI) / 180,
      desired = camP(Math.cos(angle), Math.sin(angle));
    if (camDot(desired, incoming.initial) < 0.999999) {
      const error = Error(
        "Заданный угол не совпадает с входом из этой точки на оси паза. Измени угол или отключи его; точка сохранена.",
      );
      error.entryPoint = common;
      throw error;
    }
  }
  return {
    path,
    comp,
    radius: r,
    common,
    incoming,
    outgoing,
    exact: Math.abs(r - radius) < 0.000001,
  };
}
function referenceSlot(contour, c, side) {
  if (
    side !== "inside" ||
    c.startPoint ||
    c.entryStart ||
    c.directedEntry ||
    (c.stockShape && c.stockShape !== "none")
  )
    return null;
  const info = slotAxis(contour, c.tolerance);
  if (!info) return null;
  const conventional = c.direction === "conventional" || c.direction === "ccw",
    comp = conventional ? 41 : 42,
    path = conventional ? info.ccw : info.ccw.slice().reverse().map(camRev),
    t = camMul(camLeft(info.outward), conventional ? -1 : 1),
    r = c.autoLead ? info.radius : c.lead;
  if ((c.openOffsetSide === "left" && comp !== 41) || (c.openOffsetSide === "right" && comp !== 42))
    return null;
  if (!(r >= 0.001))
    throw Error("Для захода паза задай положительный радиус или включи автоподбор.");
  if (amount(c) > info.radius + EPS)
    throw Error("D превышает радиус дна паза R" + info.radius.toFixed(3) + " мм.");
  if (c.diameter > 2 * info.radius + 0.000001)
    throw Error("Фреза не помещается в паз шириной " + (2 * info.radius).toFixed(3) + " мм.");
  if (amount(c) > r + EPS)
    throw Error(
      "D превышает заданный радиус захода. Увеличь R захода; координаты контура сохранены.",
    );
  const run = c.entryRun === undefined ? r * (4 - Math.SQRT2) : c.entryRun,
    exitRun = (info.radius * 10) / 3;
  if (!(run > 0.001)) throw Error("Прямой подвод паза должен быть положительным.");
  const attach = camSub(path[0].a, camMul(t, run)),
    centre = camAdd(attach, camMul(info.outward, r)),
    start = camAdd(centre, camMul(camSub(info.outward, t), r / Math.SQRT2)),
    entryArc = camArc(start, attach, centre, conventional ? (3 * Math.PI) / 4 : (-3 * Math.PI) / 4),
    exit = camAdd(path.at(-1).b, camMul(t, exitRun));
  return {
    path,
    comp,
    start,
    exit,
    radius: r,
    entryArc,
    parts: [
      { segment: entryArc, stage: "Радиусный заход" },
      { segment: camLine(attach, path[0].a), stage: "Прямой заход" },
      ...path.map((segment) => ({ segment, stage: "Обход контура" })),
      { segment: camLine(path.at(-1).b, exit), stage: "Прямой выход" },
    ],
  };
}
function generate(contours, input) {
  const c = { ...input, allowance: 0 },
    radius = amount(c),
    number = CP.number(c),
    D = "D" + String(number).padStart(2, "0");
  if (
    c.directedEntry &&
    c.entryStart &&
    contours.some((contour) => contour.enabled && !contour.closed) &&
    !Number.isFinite(c.entryAngle)
  )
    throw Error("Задай угол подхода числом в градусах.");
  camGenerate(
    contours.map((contour) => ({ ...contour, side: "on" })),
    {
      ...c,
      entryPlanner: null,
      startPoint: null,
      lead: 0,
      stockShape: "none",
      allowPlunge: true,
    },
  );
  if (c.stockAllowance > 0) throw Error("Для полного D установи боковой черновой припуск 0.");
  const frames = [],
    operations = [],
    fitReport = [],
    warnings = [],
    X = (v) => camFmt(v, 1000, false),
    F = (v) => camFeedFmt(v, c);
  const frameTangent = (frame, end = false) => {
    const segment = frame.segment;
    if (segment.type === "line")
      return camP(
        Math.round(segment.b.x * 1000) / 1000 - Math.round(segment.a.x * 1000) / 1000,
        Math.round(segment.b.y * 1000) / 1000 - Math.round(segment.a.y * 1000) / 1000,
      );
    const words = camTokenizeNC(frame.command).words,
      get = (letter) => {
        var _words$find;
        return (
          Number(
            ((_words$find = words.find((w) => w.letter === letter)) === null ||
            _words$find === void 0
              ? void 0
              : _words$find.value) || 0,
          ) / 1000
        );
      };
    const radial = end
      ? camSub(
          camSub(
            {
              x: Math.round(segment.b.x * 1000) / 1000,
              y: Math.round(segment.b.y * 1000) / 1000,
            },
            {
              x: Math.round(segment.a.x * 1000) / 1000,
              y: Math.round(segment.a.y * 1000) / 1000,
            },
          ),
          { x: get("I"), y: get("J") },
        )
      : { x: -get("I"), y: -get("J") };
    return camMul(camLeft(radial), Math.sign(segment.sweep));
  };
  const push = (command, extra = {}) => {
    var _frames$at;
    if (
      /^G00\s*Z[+-]?\d+(?:\.\d+)?$/.test(command) &&
      command.replace(/\s/g, "") ===
        ((_frames$at = frames.at(-1)) === null || _frames$at === void 0
          ? void 0
          : _frames$at.command.replace(/\s/g, ""))
    )
      return;
    if (frames.length >= 50000) throw Error("Более 50000 кадров с корректором. Раздели обработку.");
    frames.push({ command, ...extra });
  };
  const emitPath = (parts, comp, contour, operation) => {
    const rounded = quadrantParts(parts).map((part) => {
      const fit = camRoundXYSegment(part.segment, c);
      if (!fit) throw Error("Элемент контура меньше точности стойки.");
      return { ...part, nominal: part.segment, segment: fit.segment };
    });
    const xy = (p) => "X" + X(p.x - c.originX) + "Y" + X(p.y - c.originY);
    for (let i = 0; i < rounded.length; i++) {
      const { segment: s, stage } = rounded[i],
        next = rounded[i + 1];
      let command = "G01" + xy(s.b),
        feed = c.feed;
      if (s.type === "A") {
        const nominal = rounded[i].nominal,
          r = camDist(nominal.a, nominal.c),
          actual = r - (comp === 41 ? 1 : -1) * Math.sign(nominal.sw) * radius;
        if (actual < -EPS)
          throw Error(
            "Дуга R" +
              r.toFixed(3) +
              " мм: D" +
              String(number).padStart(2, "0") +
              "=" +
              c.correctionValue +
              " даёт отрицательный радиус центра " +
              actual.toFixed(3) +
              " мм. D не должен превышать радиус дна; дуга не заменена прямой.",
          );
        command =
          "G0" + (s.sw > 0 ? 3 : 2) + xy(s.b) + "I" + X(s.c.x - s.a.x) + "J" + X(s.c.y - s.a.y);
        feed = camArcFeed(c);
      }
      push(command + "F" + F(feed), { contour, operation, stage });
      if (!next) continue;
      const u = camTangent(rounded[i].nominal, true),
        v = camTangent(next.nominal),
        angle = camCross(u, v) * (comp === 42 ? 1 : -1);
      if (angle > 0.00001)
        push("G39" + CP.vectorWords(CP.cornerVector(next.segment, c)) + "F" + F(camArcFeed(c)), {
          contour,
          operation,
          stage: "Обход контура",
        });
      else if (angle < -0.00001 || camDot(u, v) < -0.99999)
        throw Error(
          "Внутренний острый угол требует касательной дуги для коррекции FANUC 3000C. Задай скругление или выбери обработку доступных участков.",
        );
    }
  };
  push("G90G17G40G80");
  if (c.useG92) push("G92X" + X(c.initialX) + "Y" + X(c.initialY) + "Z" + X(c.initialZ));
  if (c.spindleCommand) push("S" + c.rpm + "M03");
  if (c.coolant) push("M08");
  push("G00Z" + X(c.safeZ));
  const chosen = contours.filter((contour) => contour.enabled),
    programs = [];
  for (const contour of chosen) {
    const side = contour.side === "auto" ? contour.autoSide : contour.side;
    if (side === "on") {
      programs.push({ contour, side });
      continue;
    }
    if (contour.ambiguous) throw Error("Для полного D выдели однозначный контур без ветвлений.");
    if (!contour.closed) {
      const reference = referenceSlot(contour, c, side);
      if (reference) {
        programs.push({ contour, side, reference });
        continue;
      }
      var _boundary;
      let boundary = E.boundaryRoute(contour, c, side);
      if ((_boundary = boundary) !== null && _boundary !== void 0 && _boundary.inferred) {
        try {
          const physical = camOffsetContour(
            boundary.path,
            boundary.offsetSign * radius,
            0.0000001,
            false,
          );
          if (camSlen(physical[0]) <= EPS || camSlen(physical.at(-1)) <= EPS) boundary = null;
          else boundary.physical = physical.filter((s) => camSlen(s) > EPS);
        } catch (error) {
          if (error.geometryComplexity) throw error;
          boundary = null;
        }
      }
      if (boundary) {
        programs.push({
          contour,
          side,
          boundary,
          slot: !!slotAxis(contour, c.tolerance),
        });
        continue;
      }
      const axis = axisSlot(contour, c, radius, side);
      if (axis) {
        programs.push({ contour, side, axis, slot: true });
        continue;
      }
      const routes = openRoutes(contour, c, radius, side);
      programs.push(...routes.map((path) => ({ contour, side, route: path })));
      if (side === "inside")
        fitReport.push({
          contour: contour.id,
          partial: true,
          requestedRadius: radius,
          actualToolRadius: c.diameter / 2,
          appliedAllowance: 0,
          maxExactRadius: radius,
        });
      continue;
    }
    if (side === "inside") {
      const fitted = fittedInside(contour, c, radius);
      programs.push(
        ...fitted.contours.map((part) => ({
          contour: part,
          source: contour,
          side,
          partial: fitted.partial,
        })),
      );
      if (fitted.partial)
        fitReport.push({
          contour: contour.id,
          partial: true,
          requestedRadius: radius,
          actualToolRadius: c.diameter / 2,
          appliedAllowance: 0,
          maxExactRadius: radius,
          blocked: fitted.blocked === true,
        });
    } else programs.push({ contour, side });
  }
  if (!programs.length) throw Error("Нет доступной области для выбранной фрезы и корректора.");
  let manualTarget = null,
    manualDistance = Infinity;
  const chosenEntry = c.startPoint || c.entryStart;
  if (chosenEntry)
    for (const program of programs) {
      var _program$source, _E$nearest;
      const id =
        ((_program$source = program.source) === null || _program$source === void 0
          ? void 0
          : _program$source.id) || program.contour.id;
      if (chosenEntry.contourId && chosenEntry.contourId !== id) continue;
      if (program.route && !c.entryStart)
        throw Error(
          "Для ручного захода открытой стенки задай отдельное начало в свободном месте. Касание и начало сохранены.",
        );
      const distance =
        (_E$nearest = E.nearest(program.contour.segs, chosenEntry)) === null ||
        _E$nearest === void 0
          ? void 0
          : _E$nearest.distance;
      if (distance < manualDistance) {
        manualTarget = program.contour;
        manualDistance = distance;
      }
    }
  if (chosenEntry && !manualTarget) {
    const error = Error(
      "Контур выбранного захода изменился. Укажи касание заново; точка не перенесена.",
    );
    error.entryPoint = chosenEntry;
    throw error;
  }
  const all = programs
    .filter((part) => !part.route)
    .map(({ contour }) => {
      const nominal = {
        ...contour,
        segs: camOffsetContour(contour.segs, 0, c.tolerance, contour.closed),
      };
      return {
        id: contour.id,
        closed: contour.closed,
        parts: S.fromContours([nominal]).map((p) => ({ p, reverse: false })),
      };
    });
  for (const contour of chosen.filter(
    (item) =>
      item.closed &&
      !programs.some((program) => {
        var _program$source2;
        return (
          (((_program$source2 = program.source) === null || _program$source2 === void 0
            ? void 0
            : _program$source2.id) || program.contour.id) === item.id
        );
      }),
  )) {
    all.push({
      id: contour.id,
      closed: true,
      parts: S.fromContours([contour]).map((p) => ({ p, reverse: false })),
    });
  }
  const passes = Math.ceil(c.depth / c.stepDown);
  let boundaryClear = null;
  for (const { contour, source, side, route, axis, boundary, reference, slot } of programs) {
    var _c$entryStart3;
    const id = (source === null || source === void 0 ? void 0 : source.id) || contour.id;
    if (reference) {
      const xy = (p) => "X" + X(p.x - c.originX) + "Y" + X(p.y - c.originY);
      for (let pass = 1; pass <= passes; pass++) {
        const z = c.topZ - Math.min(c.depth, pass * c.stepDown),
          operation = operations.length;
        operations.push({
          contour: id,
          z,
          side,
          path: [],
          leadIn: [],
          leadOut: [],
          offset: radius,
          radialExtra: 0,
          openWall: true,
          tangentEntry: true,
          referenceSlot: true,
          attachment: { ...reference.path[0].a },
          nominalEntryStart: { ...reference.start },
          entryStartSpace: "program",
          programEntryRadius: reference.radius,
        });
        push("G00Z" + X(c.safeZ));
        push(
          "G01G" +
            reference.comp +
            xy(reference.start) +
            CP.vectorWords(CP.cornerVector(reference.entryArc, c)) +
            "F" +
            F(c.feed) +
            D,
          { contour: id, operation, stage: "compensation-air" },
        );
        push("G00Z" + X(c.topZ + c.approach), { contour: id, operation });
        push("G01Z" + X(z) + "F" + F(c.plunge), {
          contour: id,
          operation,
          stage: "plunge",
        });
        emitPath(reference.parts, reference.comp, id, operation);
        push("G00Z" + X(c.safeZ));
        push("G01G40" + xy(reference.exit) + "F" + F(c.feed) + "D00", {
          contour: id,
          operation,
          stage: "compensation-air",
        });
      }
      continue;
    }
    if (side === "on") {
      const result = camGenerate([{ ...contour, side: "on" }], {
        ...c,
        useG92: false,
        lineNumbers: false,
        spindleCommand: false,
        coolant: false,
        returnXY: false,
        endCode: "M30",
      });
      const metadata = new Map(result.motions.map((m) => [m.line, m]));
      for (const [i, line] of result.code.split(/\r?\n/).entries()) {
        var _metadata$get;
        const command = camTokenizeNC(line)
          .words.filter((w) => w.letter !== "N")
          .map((w) => w.letter + w.raw)
          .join("");
        if (command && !["G90G40G80", "G90G17G40G80", "M30"].includes(command))
          push(command, {
            contour: id,
            stage:
              (_metadata$get = metadata.get(i + 1)) === null || _metadata$get === void 0
                ? void 0
                : _metadata$get.stage,
          });
      }
      operations.push(...result.operations);
      continue;
    }
    if (boundary) {
      var _c$entryStart2;
      const { path, comp, offsetSign } = boundary,
        offset = offsetSign * radius,
        manual = manualTarget === contour;
      if (manual && c.startPoint && camDist(c.startPoint, path[0].a) > 0.003) {
        const error = Error(
          "Для открытого внешнего контура выбери касание на начальном конце выбранного обхода. Вся отмеченная стенка сохраняется.",
        );
        error.entryPoint = c.startPoint;
        throw error;
      }
      const physical =
        boundary.physical ||
        camOffsetContour(path, offset, 0.0000001, false).filter((s) => camSlen(s) > EPS);
      if (!physical.length) throw Error("Путь открытого контура исчез после коррекции.");
      boundaryClear = boundaryClear || E.clearance(chosen.flatMap((item) => item.segs));
      if (
        manual &&
        ((_c$entryStart2 = c.entryStart) === null || _c$entryStart2 === void 0
          ? void 0
          : _c$entryStart2.space) === "program"
      ) {
        const error = Error(
          "Для этого открытого контура начало задаётся центром фрезы. Выбери начало заново; прежняя точка программы сохранена.",
        );
        error.entryPoint = c.entryStart;
        throw error;
      }
      const settings = {
        ...c,
        entryStart: manual ? c.entryStart : null,
        directedEntry: manual && c.directedEntry,
      };
      const plan = E.boundaryPlan(
        physical,
        settings,
        boundaryClear,
        Math.max(0, Math.min(radius, c.diameter / 2) - 0.004),
        offsetSign,
      );
      const leadIn = plan.leadIn.map((s) => E.compensatedSegment(s, offset)),
        leadOut = plan.leadOut.map((s) => E.compensatedSegment(s, offset));
      const parts = [
        ...leadIn.map((segment) => ({
          segment,
          stage: segment.type === "A" ? "Радиусный заход" : "Прямой заход",
        })),
        ...path.map((segment) => ({ segment, stage: "Обход контура" })),
        ...leadOut.map((segment) => ({
          segment,
          stage: segment.type === "A" ? "Радиусный выход" : "Прямой выход",
        })),
      ];
      const xy = (p) => "X" + X(p.x - c.originX) + "Y" + X(p.y - c.originY);
      for (let pass = 1; pass <= passes; pass++) {
        const z = c.topZ - Math.min(c.depth, pass * c.stepDown),
          operation = operations.length;
        operations.push({
          contour: id,
          z,
          side,
          path: [],
          leadIn: [],
          leadOut: [],
          offset: radius,
          radialExtra: 0,
          openWall: true,
          openBoundary: true,
          tangentEntry: true,
          manualEntry: manual && !!c.entryStart,
          attachment: { ...path[0].a },
          entry: { ...plan.entry },
          exit: { ...plan.exit },
          programEntryRadius: camDist(leadIn.at(-1).a, leadIn.at(-1).c),
          entryStartSpace: "tool",
          nominalEntryStart: { ...leadIn[0].a },
        });
        push("G00Z" + X(c.safeZ));
        push("G00" + xy(plan.entry), {
          contour: id,
          operation,
          stage: "entry-rapid",
        });
        push(
          (slot ? "G01G" : "G00G") +
            comp +
            xy(leadIn[0].a) +
            CP.vectorWords(CP.cornerVector(leadIn[0], c)) +
            (slot ? "F" + F(c.feed) : "") +
            D,
          { contour: id, operation, stage: "compensation-air" },
        );
        push("G00Z" + X(c.topZ + c.approach), { contour: id, operation });
        push("G01Z" + X(z) + "F" + F(c.plunge), {
          contour: id,
          operation,
          stage: "plunge",
        });
        if (slot) emitPath(parts, comp, id, operation);
        else {
          for (let i = 0; i < parts.length; i++) {
            var _parts;
            const { segment, stage } = parts[i],
              rounded = camRoundXYSegment(segment, c);
            if (!rounded) throw Error("Элемент касательного захода меньше точности стойки.");
            const s = rounded.segment,
              next =
                (_parts = parts[i + 1]) === null || _parts === void 0 ? void 0 : _parts.segment,
              actual =
                segment.type === "A"
                  ? camDist(segment.a, segment.c) - Math.sign(segment.sw) * offset
                  : null;
            const collapse =
              stage === "Обход контура" && actual !== null && Math.abs(actual) < 0.0000001;
            let command;
            if (collapse) {
              const terminal = camTangent(segment, true),
                turn = next && camCross(terminal, camTangent(next)) * (comp === 42 ? 1 : -1);
              if (!next || (camDist(terminal, camTangent(next)) > 0.00001 && !(turn > 0.00001)))
                throw Error("В центре дуги максимального D нет допустимого продолжения коррекции.");
              const direction =
                camDist(terminal, camTangent(next)) <= 0.00001
                  ? CP.cornerVector(next, c)
                  : terminal;
              command = "G01" + xy(s.b) + CP.vectorWords(direction);
            } else if (s.type === "L")
              command = "G01" + xy(s.b) + CP.vectorWords(CP.cornerVector(s, c));
            else
              command =
                "G0" +
                (s.sw > 0 ? 3 : 2) +
                xy(s.b) +
                "I" +
                X(s.c.x - s.a.x) +
                "J" +
                X(s.c.y - s.a.y);
            push(command + "F" + F(s.type === "A" && !collapse ? camArcFeed(c) : c.feed), {
              contour: id,
              operation,
              stage,
              collapsedBoundary: collapse,
            });
            if (
              next &&
              camCross(camTangent(segment, true), camTangent(next)) * (comp === 42 ? 1 : -1) >
                0.00001
            )
              push("G39" + CP.vectorWords(CP.cornerVector(next, c)) + "F" + F(camArcFeed(c)), {
                contour: id,
                operation,
                stage: "Обход контура",
              });
          }
        }
        push("G00Z" + X(c.safeZ));
        push((slot ? "G01G40" : "G00G40") + xy(plan.exit) + (slot ? "F" + F(c.feed) : "") + "D00", {
          contour: id,
          operation,
          stage: "compensation-air",
        });
      }
      continue;
    }
    if (axis) {
      const { path, comp, common, incoming, outgoing } = axis,
        xy = (p) => "X" + X(p.x - c.originX) + "Y" + X(p.y - c.originY);
      const segments = [
        ...(incoming.segments || [incoming.segment]).map((segment) => ({
          segment,
          stage: "Прямой заход",
        })),
        ...path.map((segment) => ({ segment, stage: "Обход контура" })),
        ...(outgoing.segments || [outgoing.segment]).map((segment) => ({
          segment,
          stage: "Прямой выход",
        })),
      ];
      for (let pass = 1; pass <= passes; pass++) {
        const z = c.topZ - Math.min(c.depth, pass * c.stepDown),
          operation = operations.length;
        operations.push({
          contour: id,
          z,
          side,
          path: [],
          leadIn: [],
          leadOut: [],
          offset: radius,
          radialExtra: 0,
          openWall: true,
          axisEntry: true,
          exactSlot: axis.exact,
          entry: { ...common },
          exit: { ...common },
          attachment: { ...path[0].a },
          entryStartSpace: "tool",
          manualEntry: !!c.entryStart,
        });
        push("G00Z" + X(c.safeZ));
        push("G00" + xy(common), {
          contour: id,
          operation,
          stage: "axis-rapid",
        });
        push(
          (slot ? "G01G" : "G00G") +
            comp +
            xy(incoming.end) +
            CP.vectorWords(incoming.initial) +
            (slot ? "F" + F(c.feed) : "") +
            D,
          { contour: id, operation, stage: "compensation-air" },
        );
        push("G00Z" + X(c.topZ + c.approach), { contour: id, operation });
        push("G01Z" + X(z) + "F" + F(c.plunge), {
          contour: id,
          operation,
          stage: "plunge",
        });
        if (slot) emitPath(segments, comp, id, operation);
        else {
          for (let i = 0; i < segments.length; i++) {
            var _segments;
            const { segment, stage } = segments[i],
              rounded = camRoundXYSegment(segment, c);
            if (!rounded) throw Error("Элемент осевого входа меньше точности стойки.");
            const s = rounded.segment,
              next =
                (_segments = segments[i + 1]) === null || _segments === void 0
                  ? void 0
                  : _segments.segment;
            const collapse =
              axis.exact &&
              stage === "Обход контура" &&
              segment.type === "A" &&
              Math.abs(Math.abs(segment.sw) - Math.PI) < 0.000001 &&
              Math.abs(camDist(segment.a, segment.c) - radius) < 0.000001;
            let command;
            if (collapse) {
              if (!next || next.type !== "L")
                throw Error("После дна точного паза нужна касательная прямая.");
              command = "G01" + xy(s.b) + CP.vectorWords(CP.cornerVector(next, c));
            } else if (s.type === "L") command = "G01" + xy(s.b) + CP.vectorWords(camTangent(s));
            else
              command =
                "G0" +
                (s.sw > 0 ? 3 : 2) +
                xy(s.b) +
                "I" +
                X(s.c.x - s.a.x) +
                "J" +
                X(s.c.y - s.a.y);
            push(command + "F" + F(s.type === "A" && !collapse ? camArcFeed(c) : c.feed), {
              contour: id,
              operation,
              stage,
              collapsedSlot: collapse,
            });
            if (
              next &&
              camCross(camTangent(segment, true), camTangent(next)) * (comp === 42 ? 1 : -1) >
                0.00001
            )
              push("G39" + CP.vectorWords(CP.cornerVector(next, c)) + "F" + F(camArcFeed(c)), {
                contour: id,
                operation,
                stage: "Обход контура",
              });
          }
        }
        push("G00Z" + X(c.safeZ));
        push((slot ? "G01G40" : "G00G40") + xy(common) + (slot ? "F" + F(c.feed) : "") + "D00", {
          contour: id,
          operation,
          stage: "compensation-air",
        });
      }
      warnings.push(
        "Вход в открытый паз по оси: центр фрезы X" +
          (common.x - c.originX).toFixed(3) +
          " Y" +
          (common.y - c.originY).toFixed(3) +
          ". Полный " +
          D +
          " = " +
          c.correctionValue +
          " (" +
          radius.toFixed(3) +
          " мм) сохранён." +
          (axis.exact ? " Фреза проходит по оси до центра полукруглого дна и возвращается." : ""),
      );
      continue;
    }
    if (route) {
      const reverse = side === "inside";
      let path = reverse ? route.slice().reverse().map(camRev) : route;
      const conventional =
        c.direction === "conventional" || c.direction === (side === "outside" ? "cw" : "ccw");
      if (conventional) path = path.slice().reverse().map(camRev);
      path = camCompactArcs(path);
      const comp = conventional ? 41 : 42,
        lead = c.autoLead ? Math.max(AUTO_ENTRY, c.lead) : c.lead;
      if (!(lead > 0.001))
        throw Error("Для открытой стенки задай положительный заход или включи автоподбор.");
      if (!c.autoLead && !c.entryStart && lead < c.diameter / 2 - 0.004)
        throw Error(
          "Заход открытой стенки слишком короткий для фрезы и D. Увеличь заход / выход; диаметр и корректор сохранены.",
        );
      let pre = camSub(path[0].a, camMul(camTangent(path[0]), lead));
      const lastSeg = path[path.length - 1];
      const post = camAdd(lastSeg.b, camMul(camTangent(lastSeg, true), lead));
      const withdraw = camAdd(lastSeg.b, camMul(camTangent(lastSeg, true), lead / 2));
      const active = camSub(path[0].a, camMul(camTangent(path[0]), lead / 2));
      const manual = manualTarget === contour && c.entryStart;
      let approach = null;
      if (manual) {
        if (c.startPoint && camDist(c.startPoint, path[0].a) > 0.003) {
          const error = Error(
            "Для открытой цепочки выбери касание на начальном конце выбранного обхода. Начало стенки не пропускается; точки сохранены.",
          );
          error.entryPoint = c.startPoint;
          throw error;
        }
        approach = E.openLead(
          path,
          c.entryStart,
          lead,
          c.directedEntry ? c.entryAngle : undefined,
          comp === 42 ? -1 : 1,
        );
        pre = approach.entry;
        path = [
          ...approach.leadIn,
          ...approach.path,
          camLine(path[path.length - 1].b, withdraw),
          camLine(withdraw, post),
        ];
      } else
        path = [
          camLine(pre, active),
          camLine(active, path[0].a),
          ...path,
          camLine(path[path.length - 1].b, withdraw),
          camLine(withdraw, post),
        ];
      for (let pass = 1; pass <= passes; pass++) {
        const z = c.topZ - Math.min(c.depth, pass * c.stepDown),
          operation = operations.length;
        operations.push({
          contour: id,
          z,
          side,
          path: [],
          leadIn: [],
          leadOut: [],
          offset: radius,
          radialExtra: 0,
          openWall: true,
          ...(approach
            ? {
                manualEntry: true,
                attachment: approach.attachment,
                programEntryRadius: lead,
              }
            : {}),
        });
        const xy = (p) => "X" + X(p.x - c.originX) + "Y" + X(p.y - c.originY);
        push("G00Z" + X(c.safeZ));
        push("G00" + xy(pre), { contour: id, operation });
        if (!manual)
          push("G00G" + comp + xy(pre) + CP.vectorWords(CP.cornerVector(path[0], c)) + D, {
            contour: id,
            operation,
            stage: "compensation-air",
          });
        push("G00Z" + X(c.topZ + c.approach), { contour: id, operation });
        push("G01Z" + X(z) + "F" + F(c.plunge), {
          contour: id,
          operation,
          stage: "plunge",
        });
        for (const [i, segment] of path.entries()) {
          const rounded = camRoundXYSegment(segment, c);
          if (!rounded) throw Error("Элемент открытой стенки меньше точности стойки.");
          const part = rounded.segment,
            t = camTangent(part);
          let command;
          if (part.type === "L")
            command =
              (i === 0 && manual ? "G" + comp : "") +
              "G01" +
              xy(part.b) +
              (i === 0
                ? CP.vectorWords(camSub(part.b, part.a))
                : manual
                  ? ""
                  : "I" + X(t.x) + "J" + X(t.y));
          else
            command =
              "G0" +
              (part.sw > 0 ? 3 : 2) +
              xy(part.b) +
              "I" +
              X(part.c.x - part.a.x) +
              "J" +
              X(part.c.y - part.a.y);
          command += "F" + F(part.type === "A" ? camArcFeed(c) : c.feed);
          if (i === 0 && manual) command += D;
          const stage =
            i === 0
              ? manual
                ? "Включение G" + comp + " на прямой"
                : "Прямой заход"
              : i < 2
                ? manual
                  ? "Радиусный заход"
                  : "Прямой заход"
                : i >= path.length - 2
                  ? "Прямой выход"
                  : "Обход контура";
          push(command, { contour: id, operation, stage });
          const next = path[i + 1];
          if (next) {
            const u = camTangent(segment, true),
              v = camTangent(next);
            if (camCross(u, v) * (comp === 42 ? 1 : -1) > 0.00001)
              push("G39" + CP.vectorWords(CP.cornerVector(next, c)) + "F" + F(camArcFeed(c)), {
                contour: id,
                operation,
                stage: "Обход контура",
              });
          }
        }
        push("G01G40" + xy(post) + "F" + F(c.feed) + "D00", {
          contour: id,
          operation,
          stage: "Отключение коррекции на прямой",
        });
        push("G00Z" + X(c.safeZ));
      }
      continue;
    }
    const reversed =
      c.direction === "conventional" || c.direction === (side === "outside" ? "cw" : "ccw");
    const reflect = (p) => ({ x: -p.x, y: p.y });
    const shapes = reversed
      ? all.map((item) => ({
          ...item,
          parts: item.parts.map(({ p, reverse }) => ({
            p: {
              ...p,
              ...(p.a ? { a: reflect(p.a) } : {}),
              ...(p.b ? { b: reflect(p.b) } : {}),
              ...(p.m ? { m: reflect(p.m) } : {}),
              ...(p.c ? { c: reflect(p.c) } : {}),
            },
            reverse,
          })),
        }))
      : all;
    const origin = { x: reversed ? -c.originX : c.originX, y: c.originY };
    const box = camBounds(
      reversed
        ? contours.map((item) => ({
            ...item,
            segs: item.segs.map((s) =>
              s.type === "L"
                ? camLine(reflect(s.a), reflect(s.b))
                : camArc(reflect(s.a), reflect(s.b), reflect(s.c), -s.sw),
            ),
          }))
        : contours,
    );
    const own = shapes.find((item) => item.id === contour.id),
      selectedContact =
        manualTarget === contour && c.startPoint ? E.nearest(contour.segs, c.startPoint) : null,
      entry = selectedContact === null || selectedContact === void 0 ? void 0 : selectedContact.p;
    if (
      manualTarget === contour &&
      (_c$entryStart3 = c.entryStart) !== null &&
      _c$entryStart3 !== void 0 &&
      _c$entryStart3.space &&
      c.entryStart.space !== (side === "inside" ? "tool" : "program")
    ) {
      const error = Error(
        "Сторона обработки изменилась. Задай начало заново: внутри это центр фрезы, снаружи с D — точка программы. Точка сохранена.",
      );
      error.entryPoint = c.entryStart;
      throw error;
    }
    if (selectedContact && selectedContact.distance > 0.003) {
      const error = Error(
        "Выбранное касание находится в недоступном участке для этой фрезы и D. Укажи касание на доступной стенке. Точка сохранена.",
      );
      error.entryPoint = c.startPoint;
      throw error;
    }
    const opts = {
      corrector: number,
      origin,
      kind: side === "inside" ? "inner" : "outer",
      toolDiameter: c.diameter,
      compensationRadius: side === "outside" ? 0 : radius,
      cutZ: c.topZ - c.depth,
      safeX: box.minX - origin.x - 5,
      safeY: box.minY - origin.y - 5,
      leadRadius: c.autoLead ? (side === "outside" ? Math.max(AUTO_ENTRY, c.lead) : null) : c.lead,
      roundArcCentre: camRoundArcCentre,
      compactArcs: camCompactArcs,
      transparentEntry: side === "inside" || (manualTarget === contour && !!c.entryStart),
      autoRadius: c.autoLead,
      entryStartPhysical: side === "inside",
    };
    if (entry) {
      const point = reversed ? reflect(entry) : entry;
      opts.entryPoint = { x: point.x - origin.x, y: point.y - origin.y };
    }
    if (manualTarget === contour && c.entryStart) {
      const point = reversed ? reflect(c.entryStart) : c.entryStart;
      opts.entryStart = { x: point.x - origin.x, y: point.y - origin.y };
    }
    const worldPoint = (p) => ({
      x: (reversed ? -p.x : p.x) + c.originX,
      y: p.y + c.originY,
    });
    if (opts.transparentEntry) {
      const nearestContact = camSegmentDistanceIndex((source || contour).segs);
      opts.acceptEntry = (point) => nearestContact(worldPoint(point)) < 0.003;
    }
    let plan;
    try {
      plan = KONTUR_CNC.buildMillingProgram(own, opts, shapes);
    } catch (error) {
      if (error.entryPoint) error.entryPoint = worldPoint(error.entryPoint);
      else if (manualTarget === contour && chosenEntry) error.entryPoint = chosenEntry;
      throw error;
    }
    const body = plan.frames
      .slice(3, -4)
      .filter((frame) => frame.stage !== "Безопасная точка на Z30");
    if (plan.leadRadius <= radius + 0.002) {
      const error = Error(
        "Выбранные точки дают R" +
          plan.leadRadius.toFixed(3) +
          " мм, а D = " +
          radius.toFixed(3) +
          " мм. Для касательной дуги нужен R больше D. Измени начало или касание; точки не перенесены.",
      );
      error.entryPoint = c.entryStart || c.startPoint || worldPoint(plan.entry);
      throw error;
    }
    const xy = (p) => "X" + X(p.x) + "Y" + X(p.y),
      inward = plan.activation.a;
    const initialVector = frameTangent(body.find((frame) => frame.stage === "Радиусный заход"));
    const mirror = (command) =>
      !reversed
        ? command
        : command.replace(/([A-Z])([+-]?\d+)/g, (text, letter, raw) => {
            const value = Number(raw);
            if (letter === "X" || letter === "I") return letter + (-value || 0);
            if (letter === "G" && [2, 3, 41, 42].includes(value))
              return "G" + { 2: 3, 3: 2, 41: 42, 42: 41 }[value];
            return text;
          });
    for (let pass = 1; pass <= passes; pass++) {
      const z = c.topZ - Math.min(c.depth, pass * c.stepDown),
        operation = operations.length;
      operations.push({
        contour: id,
        z,
        side,
        path: [],
        leadIn: [],
        leadOut: [],
        offset: radius,
        radialExtra: 0,
        programEntryRadius: plan.leadRadius,
        tangentEntry: true,
        manualEntry: !!chosenEntry && manualTarget === contour,
        attachment: worldPoint(plan.entry),
        nominalEntryStart: worldPoint(inward),
        entryStartSpace: side === "inside" ? "tool" : "program",
      });
      push(
        mirror("G00G42" + xy(inward) + "I" + X(initialVector.x) + "J" + X(initialVector.y) + D),
        { contour: id, operation, stage: "compensation-air" },
      );
      push("G00Z" + X(c.topZ + c.approach), { contour: id, operation });
      push("G01Z" + X(z) + "F" + F(c.plunge), {
        contour: id,
        operation,
        stage: "plunge",
      });
      for (const [i, f] of body.entries()) {
        if (["Подход на Z30", "Рабочий уровень Z"].includes(f.stage)) continue;
        let command = f.command;
        if (["Включение G42 на прямой", "Отключение коррекции на прямой"].includes(f.stage)) {
          if (camDist(f.segment.a, f.segment.b) < 0.0005) continue;
          command = "G01" + xy(f.segment.b);
        }
        if (f.segment && /^G0[123](?:\s|[XYZ])/.test(command))
          command += " F" + F(f.segment.type === "arc" ? camArcFeed(c) : c.feed);
        push(mirror(command), { contour: id, operation, stage: f.stage });
        const next = body[i + 1];
        if (
          f.stage === "Обход контура" &&
          (next === null || next === void 0 ? void 0 : next.stage) === "Обход контура" &&
          f.segment &&
          next.segment
        ) {
          const exact = (segment, end = false) =>
            segment.type === "line"
              ? camUnit(camSub(segment.b, segment.a))
              : camMul(
                  camLeft(camUnit(camSub(end ? segment.b : segment.a, segment.c))),
                  Math.sign(segment.sweep),
                );
          if (camCross(exact(f.segment, true), exact(next.segment)) > 0.00001)
            push(mirror("G39" + CP.vectorWords(frameTangent(next)) + "F" + F(camArcFeed(c))), {
              contour: id,
              operation,
              stage: "Обход контура",
            });
        }
      }
      push("G00Z" + X(c.safeZ));
      push(mirror("G00G40" + xy(plan.withdrawal.b) + "D00"), {
        contour: id,
        operation,
        stage: "compensation-air",
      });
    }
  }
  if (c.coolant) push("M09");
  if (c.endZ !== c.safeZ) push("G00Z" + X(c.endZ));
  if (c.returnXY) push("G00X" + X(c.initialX) + "Y" + X(c.initialY));
  if (c.spindleCommand) push("M05");
  push(c.endCode === "M30" ? "M30" : "M00");
  const code = CP.frameCode(frames, c),
    parsed = camParseNC(code, c);
  if (parsed.errors.length) throw Error(parsed.errors[0]);
  let motions;
  try {
    motions = simulate(parsed, [{ radius, number }]);
  } catch (error) {
    throw diagnose(error, parsed, c, frames);
  }
  const world = (p) => ({ x: p.x + c.originX, y: p.y + c.originY });
  for (const motion of motions) {
    const frame = frames[motion.line - 2];
    motion.command = parsed.lines[motion.line - 1];
    motion.stage = frame.stage;
    motion.contour = frame.contour;
    const op = operations[frame.operation];
    if (
      !op ||
      motion.type === "rapid" ||
      motion.stage === "plunge" ||
      motion.stage === "compensation-air" ||
      camMotionLength(motion) < EPS
    )
      continue;
    const segment =
      motion.type === "arc"
        ? camArc(world(motion.a), world(motion.b), world(motion.c), motion.sw)
        : camLine(world(motion.a), world(motion.b));
    if (motion.stage === "Обход контура") op.path.push(segment);
    else if (
      motion.stage === "Радиусный выход" ||
      motion.stage === "Прямой выход" ||
      motion.stage === "Отключение коррекции на прямой"
    )
      op.leadOut.push(segment);
    else op.leadIn.push(segment);
  }
  for (const operation of operations.filter((operation) => operation.tangentEntry)) {
    var _operation$leadIn$, _operation$leadOut$at;
    operation.entry =
      (_operation$leadIn$ = operation.leadIn[0]) === null || _operation$leadIn$ === void 0
        ? void 0
        : _operation$leadIn$.a;
    operation.exit =
      (_operation$leadOut$at = operation.leadOut.at(-1)) === null ||
      _operation$leadOut$at === void 0
        ? void 0
        : _operation$leadOut$at.b;
    const firstArc = operation.leadIn.find((segment) => segment.type === "A");
    operation.entryRadius = firstArc
      ? camDist(firstArc.a, firstArc.c)
      : operation.programEntryRadius - radius;
    operation.entryCircle = firstArc ? { c: firstArc.c, r: camDist(firstArc.a, firstArc.c) } : null;
  }
  if (operations.some((operation) => operation.openWall || operation.tangentEntry)) {
    const walls = chosen.flatMap((contour) => contour.segs),
      clear = E.clearance(walls),
      nearest = camSegmentDistanceIndex(walls);
    const cuttingRadius = Math.max(0, Math.min(radius, c.diameter / 2) - 0.004);
    for (const operation of operations.filter(
      (operation) => operation.openWall || operation.tangentEntry,
    )) {
      var _operation$leadIn$2, _operation$leadOut$at2;
      const start =
          (_operation$leadIn$2 = operation.leadIn[0]) === null || _operation$leadIn$2 === void 0
            ? void 0
            : _operation$leadIn$2.a,
        end =
          (_operation$leadOut$at2 = operation.leadOut.at(-1)) === null ||
          _operation$leadOut$at2 === void 0
            ? void 0
            : _operation$leadOut$at2.b;
      const path = [...operation.leadIn, ...operation.path, ...operation.leadOut];
      if (
        !start ||
        !end ||
        nearest(start) < c.diameter / 2 - 0.004 ||
        nearest(end) < c.diameter / 2 - 0.004 ||
        !path.every((segment) => clear(segment, cuttingRadius))
      ) {
        const error = Error(
          operation.openWall
            ? "Заход открытой стенки слишком короткий для фрезы и D. Увеличь заход / выход; диаметр и корректор сохранены."
            : "Касательный заход или погружение задевает стенку. Измени начало, касание или R. Точки, фреза и D сохранены.",
        );
        error.entryPoint = c.entryStart || c.startPoint || start;
        throw error;
      }
    }
  }
  if (parsed.motions.some((m) => m.comp !== 40) && radius < c.diameter / 2 - 0.0005)
    warnings.push(
      D +
        " = " +
        c.correctionValue +
        " (" +
        radius.toFixed(3) +
        " мм), фреза Ø" +
        c.diameter +
        ". Вдоль стенки возможен зарез до " +
        (c.diameter / 2 - radius).toFixed(3) +
        " мм.",
    );
  if (fitReport.length)
    warnings.push("Внутренние тесные углы и проходы исключены. Остаток показан красным.");
  return {
    machine: c.machine,
    code,
    motions,
    operations,
    fitReport,
    rest: [],
    warnings,
    passes: operations.length,
    blocks: frames.length,
    toolKind: "mill",
    compensation: parsed.motions.some((m) => m.comp !== 40)
      ? {
          kind: "full",
          number,
          tableValue: radius,
          value: c.correctionValue,
          physicalPreview: true,
        }
      : { kind: "center" },
    minutes: motions.reduce(
      (total, m) => total + (m.type === "rapid" ? 0 : camFeedLength(m) / m.feed),
      0,
    ),
    bounds: camBounds(motions),
  };
}

const api = { amount, simulate, diagnose, generate, slotAxis };
export default api;
