import { oriented as camOriented, offsetContour as camOffsetContour } from "../core/contours.js";
import {
  tangent as camTangent,
  bounds as camBounds,
  arc as camArc,
  slen as camSlen,
  line as camLine,
} from "../core/segments.js";
import {
  dist as camDist,
  cross as camCross,
  unit as camUnit,
  sub as camSub,
  P as camP,
  dot as camDot,
  mul as camMul,
  add as camAdd,
  left as camLeft,
} from "../core/math.js";
import {
  fmt as camFmt,
  feedFmt as camFeedFmt,
  roundArcCentre as camRoundArcCentre,
  compactArcs as camCompactArcs,
  arcFeed as camArcFeed,
} from "../nc/format.js";
import { generate as camGenerate } from "./basic-planner.js";
import { selfIntersects as camSelfIntersects } from "../core/spatial.js";
import { parseNC as camParseNC } from "../nc/parser.js";
import { planeCommand as camPlaneCommand, planeInfo as camPlaneInfo } from "../core/planes.js";

import SKETCH from "../geometry/sketch.js";
import COMPENSATION from "../nc/compensation.js";
import OPEN_WALL from "./open-wall.js";
import WALL_NETWORK from "./wall-network.js";
import ENTRY from "./entry.js";
import CONTROLLER from "../nc/controller.js";
import KONTUR_CNC from "./kontur-planner.js";
const S = SKETCH,
  CP = COMPENSATION,
  OW = OPEN_WALL,
  NW = WALL_NETWORK,
  E = ENTRY;
const profiles = {
  fanuc3000c: {
    id: "fanuc3000c",
    name: "FANUC 3000C",
    coordScale: 1000,
    feedScale: 10,
    decimal: false,
    spindleDigits: 4,
    toolDigits: 2,
  },
};
const cutModes = [
  { value: "auto", label: "Авто · по вложенности" },
  { value: "outside", label: "Стенка снаружи контура" },
  { value: "inside", label: "Стенка внутри контура" },
  { value: "on", label: "Центром по линии" },
];
function profile(id) {
  if (id && id !== "fanuc3000c")
    throw Error("Выбран неподдерживаемый станок. Поддерживается только FANUC 3000C.");
  return { ...profiles.fanuc3000c, machine: "fanuc3000c" };
}
function sourceContour(c) {
  return {
    id: c.id,
    closed: c.closed,
    parts: S.fromContours([c]).map((p) => ({ p, reverse: false })),
  };
}
function resolvedSide(contour) {
  return contour.side === "auto" ? contour.autoSide : contour.side;
}
function rightHandDirection(contours, direction) {
  if (!direction || direction === "climb") return true;
  return contours
    .filter((contour) => contour.enabled)
    .every((contour) => {
      const side = resolvedSide(contour);
      return side === "on" || direction === (side === "outside" ? "ccw" : "cw");
    });
}
function outsideCorners(contours, c) {
  const selected = contours.filter((contour) => contour.enabled);
  if (selected.length !== 1 || !c.autoLead || c.stockShape !== "none" || c.stockAllowance > 0)
    return false;
  const contour = selected[0];
  if (!contour.closed || resolvedSide(contour) !== "outside") return false;
  const path = camOriented(contour, "outside", "ccw");
  let corners = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i],
      b = path[(i + 1) % path.length],
      u = camTangent(a, true),
      v = camTangent(b);
    if (camDist(u, v) < 0.00001) continue;
    if (a.type !== "L" || b.type !== "L" || camCross(u, v) < 0.00001) return false;
    corners++;
  }
  return corners > 0;
}
function cornerDirection(previous, next, encode) {
  var _previous$segment, _next$segment;
  if (
    (previous === null || previous === void 0 ? void 0 : previous.stage) !== "Обход контура" ||
    (next === null || next === void 0 ? void 0 : next.stage) !== "Обход контура" ||
    ((_previous$segment = previous.segment) === null || _previous$segment === void 0
      ? void 0
      : _previous$segment.type) !== "line" ||
    ((_next$segment = next.segment) === null || _next$segment === void 0
      ? void 0
      : _next$segment.type) !== "line"
  )
    return null;
  const u = camUnit(camSub(previous.segment.b, previous.segment.a)),
    v = camUnit(camSub(next.segment.b, next.segment.a));
  if (camCross(u, v) < 0.00001) return null;
  const vector = (segment) =>
    camP(
      Number(encode(segment.b.x)) - Number(encode(segment.a.x)),
      Number(encode(segment.b.y)) - Number(encode(segment.a.y)),
    );
  const encoded = vector(next.segment);
  if (camCross(vector(previous.segment), encoded) <= 0)
    throw Error("Округление меняет наружный угол G39.");
  return "I" + camFmt(encoded.x, 1) + "J" + camFmt(encoded.y, 1);
}
function generateControl(contours, input, roundCorners = false) {
  const c = { ...input, ...profile(input.machine) };
  camGenerate(contours, { ...c, entryPlanner: null });
  const marking = c.toolKind === "scribe",
    chosen = contours.filter((c) => c.enabled).sort((a, b) => (b.nesting || 0) - (a.nesting || 0)),
    n = CP.number(c),
    D = "D" + String(n).padStart(2, "0"),
    F = (v) => camFeedFmt(v, c);
  if (!chosen.length) throw Error("Выбери хотя бы один контур.");
  const passes = marking ? 1 : Math.ceil(c.depth / c.stepDown);
  if (passes > 2000) throw Error("Слишком много проходов по Z.");
  const frames = [],
    operations = [],
    warnings = [],
    X = (v) => camFmt(v, 1000, false);
  function push(command, extras = {}) {
    var _frames$at;
    if (
      /^G00 ?Z-?\d+$/.test(command) &&
      command.replace(" ", "") ===
        ((_frames$at = frames.at(-1)) === null || _frames$at === void 0
          ? void 0
          : _frames$at.command.replace(" ", ""))
    )
      return;
    if (frames.length >= 50000) throw Error("Слишком много кадров. Раздели обработку.");
    frames.push({ command, ...extras });
  }
  if (c.useG92) push("G92 X" + X(c.initialX) + " Y" + X(c.initialY) + " Z" + X(c.initialZ));
  push(
    (c.spindleCommand ? "S" + c.rpm + " " : "") +
      "F" +
      F(c.feed) +
      (c.spindleCommand ? " M03" : ""),
  );
  push("G90G17");
  push("G40 D00");
  if (c.coolant) push("M08");
  push("G00 Z" + X(c.safeZ));
  const all = contours.map(sourceContour);
  for (const contour of chosen) {
    if (contour.ambiguous) throw Error("Контур " + contour.id + ": разветвление. Раздели линии.");
    const side = marking ? "on" : resolvedSide(contour);
    if (side === "on") {
      const r = camGenerate([{ ...contour, side: "on" }], {
        ...c,
        depth: c.depth,
        stepDown: marking ? c.depth : c.stepDown,
        useG92: false,
        spindleCommand: false,
        coolant: false,
        returnXY: false,
        lineNumbers: false,
        endCode: "M30",
      });
      const commands = r.code
        .split(/\r?\n/)
        .filter((t) => t && t !== "%")
        .slice(1, -1);
      for (const command of commands) push(command, { contour: contour.id });
      operations.push(...r.operations);
      warnings.push(...r.warnings);
      continue;
    }
    if (!contour.closed) throw Error("Для открытого контура выбери «Центром по линии».");
    if (camSelfIntersects(contour.segs, Math.max(0.02, c.tolerance)))
      throw Error("Контур " + contour.id + " пересекает себя.");
    const own = all.find((p) => p.id === contour.id);
    let plan;
    try {
      plan = KONTUR_CNC.buildMillingProgram(
        own,
        {
          corrector: n,
          origin: { x: c.originX, y: c.originY },
          kind: side === "inside" ? "inner" : "outer",
          toolDiameter: c.diameter,
          compensationRadius: c.diameter / 2 + c.allowance,
          cutZ: c.topZ - c.depth,
          safeY: camBounds(contours).minY - c.originY - c.diameter - 5,
          leadRadius: c.autoLead ? null : c.lead,
          roundArcCentre: camRoundArcCentre,
          compactArcs: camCompactArcs,
        },
        all,
      );
    } catch (e) {
      throw Error("Контур " + contour.id + ": " + e.message);
    }
    const workFrames = plan.frames.slice(3, -4);
    const cornerWords = roundCorners
      ? workFrames.map((frame, i) => cornerDirection(frame, workFrames[i + 1], X))
      : null;
    for (let pass = 1; pass <= passes; pass++) {
      const z = c.topZ - Math.min(c.depth, pass * c.stepDown);
      push("G00 Z" + X(c.safeZ));
      for (const [index, f] of workFrames.entries()) {
        if (f.stage === "Рабочий уровень Z") {
          push("G00 Z" + X(c.topZ + c.approach), { contour: contour.id });
          push("G01 Z" + X(z) + " F" + F(c.plunge), {
            contour: contour.id,
            stage: "plunge",
          });
        } else {
          let command = f.command;
          if (f.stage === "Включение G42 на прямой") {
            const v = camSub(f.segment.b, f.segment.a);
            command += " I" + X(v.x) + " J" + X(v.y);
          }
          if (f.segment && /^G0[123]\b/.test(command))
            command += " F" + F(f.segment.type === "arc" ? camArcFeed(c) : c.feed);
          push(command, { contour: contour.id, stage: f.stage });
        }
        const corner = cornerWords === null || cornerWords === void 0 ? void 0 : cornerWords[index];
        if (corner)
          push("G39" + corner + "F" + F(camArcFeed(c)), {
            contour: contour.id,
            stage: "Наружный угол",
          });
      }
      push("G00 Z" + X(c.safeZ));
      operations.push({ contour: contour.id, z, side });
    }
    warnings.push(
      profiles[c.machine].name +
        ": G42 " +
        D +
        ". В " +
        D +
        " установить радиус " +
        (c.diameter / 2 + c.allowance).toFixed(3) +
        " мм. Показан программный контур; радиусную коррекцию выполняет стойка.",
    );
  }
  if (c.coolant) push("M09");
  push("G00 Z" + X(c.endZ));
  if (c.returnXY) push("G00 X" + X(c.initialX) + " Y" + X(c.initialY));
  if (c.spindleCommand) push("M05");
  push(c.endCode === "M00" ? "M00" : "M30");
  const code = CP.frameCode(frames, c),
    parsed = camParseNC(code, profile(c.machine));
  if (parsed.errors.length)
    throw Error("Проверка кода " + profiles[c.machine].name + ": " + parsed.errors[0]);
  for (const m of parsed.motions) {
    const f = frames[m.line - 2];
    m.command = parsed.lines[m.line - 1];
    m.contour = f.contour;
    m.stage = f.stage || "cut";
  }
  return {
    machine: c.machine,
    code,
    motions: parsed.motions,
    operations,
    warnings: [...new Set([...warnings, ...parsed.warnings])],
    minutes: parsed.minutes,
    passes: operations.length,
    blocks: frames.length,
    toolKind: marking ? "scribe" : "mill",
    compensation: parsed.motions.some((m) => m.comp === 42)
      ? { kind: "full", number: n, tableValue: c.diameter / 2 + c.allowance }
      : { kind: "center" },
    bounds: camBounds(parsed.motions),
  };
}
function generatePlanar(contours, input) {
  if (
    input.machine === "fanuc3000c" &&
    input.toolKind === "mill" &&
    input.compMode === "control" &&
    input.correctionValue !== undefined
  ) {
    const controller = CONTROLLER;
    return controller.generate(contours, {
      ...input,
      ...profile(input.machine),
    });
  }
  if (!profiles[input.machine]) throw Error("Сначала выбери модель станка.");
  const sourceWalls = contours
    .filter(
      (t) => t.enabled && (t.side === "auto" ? t.autoSide : OW.normalizeSide(t.side)) !== "on",
    )
    .flatMap((t) => t.segs);
  const network = NW.prepare(contours, {
      ...input,
      ...profile(input.machine),
    }),
    wall = OW.prepare(network.contours, network.config),
    c = wall.config;
  contours = wall.contours;
  const wallActive = contours.some((t) => t.enabled && (t.openWall || t.wallNetwork)),
    mode = c.compMode || "center",
    marking = c.toolKind === "scribe";
  if (!["center", "control", "wear"].includes(mode)) throw Error("Неизвестный режим коррекции.");
  const prepared = CP.prepare(contours, c),
    changed = Object.keys(prepared.plans).length > 0,
    off = contours.some(
      (t) =>
        t.enabled &&
        (t.openWall || t.wallNetwork || (t.side === "auto" ? t.autoSide : t.side) !== "on"),
    ),
    warnings = [...network.warnings, ...wall.warnings],
    manualEntry = !marking && !!(c.startPoint || c.entryStart);
  let result;
  c.entryPlanner = E.create(
    contours,
    { ...c, lead: input.lead, autoLead: input.autoLead },
    prepared.plans,
    sourceWalls,
    network.info,
  );
  if (c.entryPlanner && !manualEntry) c.entryWalls = sourceWalls;
  if (!marking && off && mode === "control" && !changed && !wallActive && !manualEntry) {
    if (rightHandDirection(contours, c.direction)) {
      if (CP.tangential(contours)) result = generateControl(contours, c);
      else if (outsideCorners(contours, c)) {
        try {
          result = generateControl(contours, c, true);
        } catch (error) {
          warnings.push("Полный D с G39 не прошёл проверку: " + error.message);
        }
      }
    }
  }
  if (!result) {
    let base = camGenerate(contours, { ...c, preparedPaths: prepared.plans });
    if (!marking && off && mode !== "center") {
      if (mode === "control")
        warnings.push(
          manualEntry
            ? "Радиусный заход: рассчитан физический центр фрезы; выбранный D должен быть равен нулю."
            : wallActive
              ? "Стенки: рассчитан путь центра, выбранный D должен быть равен нулю."
              : changed
                ? "Доступный обход: включён режим D с нулевым значением. Реальный радиус уже в координатах."
                : "FANUC 3000C: для этих стыков или направления рассчитан путь центра с нулевым D.",
        );
      result = CP.wear(base, c, null, profile);
    } else result = { ...base, compensation: { kind: "center" } };
  }
  if (wall.verifyOutput) wall.verifyOutput(result.motions);
  return {
    ...result,
    machine: c.machine,
    rest: prepared.rest,
    fitReport: prepared.report,
    ...(wall.partial ? { partialOpenWall: true } : {}),
    ...(network.info ? { wallNetworkInfo: network.info } : {}),
    warnings: [...new Set([...prepared.warnings, ...warnings, ...result.warnings])],
  };
}
function planeCode(code, plane) {
  let out = camPlaneCommand(code, plane.id);
  if (plane.code !== 17 && !new RegExp("G" + plane.code + "(?!\\d)").test(out))
    out = out.replace(/G90/, "G90G" + plane.code);
  return out;
}
function roundOperationCorners(contours, radius, tolerance) {
  if (!Number.isFinite(radius) || radius < 0 || radius > 1000)
    throw Error("R углов обработки — число от 0 до 1000 мм.");
  if (!radius) return { contours, count: 0 };
  let count = 0;
  const rounded = contours.map((contour) => {
    if (!contour.enabled) return contour;
    const path = camCompactArcs(camOffsetContour(contour.segs, 0, tolerance, false)),
      n = path.length,
      joins = new Array(n),
      start = new Array(n).fill(0),
      end = new Array(n).fill(0);
    for (let i = 0; i < (contour.closed ? n : n - 1); i++) {
      const j = (i + 1) % n,
        a = path[i],
        b = path[j];
      if (a.type !== "L" || b.type !== "L") continue;
      if (camDist(a.b, b.a) > 0.000001)
        throw Error("Для скругления обработки нужна непрерывная стенка.");
      const u = camTangent(a, true),
        v = camTangent(b),
        cross = camCross(u, v),
        dot = Math.max(-1, Math.min(1, camDot(u, v)));
      if (Math.abs(cross) < 0.0000001) {
        if (dot < 0) throw Error("Разворот на 180° нельзя скруглить заданным R.");
        continue;
      }
      const angle = Math.atan2(cross, dot),
        trim = radius * Math.tan(Math.abs(angle) / 2),
        from = camSub(a.b, camMul(u, trim)),
        to = camAdd(b.a, camMul(v, trim)),
        centre = camAdd(from, camMul(camLeft(u), Math.sign(cross) * radius));
      joins[i] = camArc(from, to, centre, angle);
      end[i] = start[j] = trim;
    }
    for (let i = 0; i < n; i++)
      if (start[i] + end[i] > 0 && start[i] + end[i] > camSlen(path[i]) - 0.002)
        throw Error(
          "R углов обработки " +
            radius +
            " мм не помещается: скругления перекрывают короткую стенку. Уменьши R.",
        );
    const segs = [];
    for (let i = 0; i < n; i++) {
      const s = path[i];
      segs.push(
        s.type === "L"
          ? camLine(
              camAdd(s.a, camMul(camTangent(s), start[i])),
              camSub(s.b, camMul(camTangent(s, true), end[i])),
            )
          : s,
      );
      if (joins[i]) {
        segs.push(joins[i]);
        count++;
      }
    }
    if (camSelfIntersects(segs, Math.max(0.002, tolerance)))
      throw Error("Скругления обработки пересекают контур. Уменьши R.");
    return { ...contour, segs };
  });
  return { contours: rounded, count };
}
function generate(contours, input) {
  if (input.compMode === "tool") return generateToolProfile(contours, input);
  var _input$workPlane, _input$cornerRadius, _input$tolerance;
  if (input.entryMode === "auto")
    input = {
      ...input,
      lead: Math.min(1000, Math.max(10, Number.isFinite(input.lead) ? input.lead : 0)),
      autoLead: true,
      directedEntry: false,
      entryRun: undefined,
      startPoint: null,
      entryStart: null,
    };
  const plane = camPlaneInfo(
      (_input$workPlane = input.workPlane) !== null && _input$workPlane !== void 0
        ? _input$workPlane
        : "xy",
    ),
    rounded = roundOperationCorners(
      contours,
      (_input$cornerRadius = input.cornerRadius) !== null && _input$cornerRadius !== void 0
        ? _input$cornerRadius
        : 0,
      (_input$tolerance = input.tolerance) !== null && _input$tolerance !== void 0
        ? _input$tolerance
        : 0.02,
    );
  let result;
  try {
    result = generatePlanar(rounded.contours, { ...input, workPlane: "xy" });
  } catch (error) {
    const d = error.ncDiagnostic;
    if (d && plane.code !== 17) {
      d.code = planeCode(d.code, plane);
      d.command = camPlaneCommand(d.command, plane.id);
      d.plane = plane.code;
    }
    throw error;
  }
  if (rounded.count)
    result = {
      ...result,
      cornerRounding: { radius: input.cornerRadius, corners: rounded.count },
      warnings: [
        ...result.warnings,
        "Скругление углов обработки R" +
          input.cornerRadius.toFixed(3) +
          " мм: " +
          rounded.count +
          ". Исходный чертёж сохранён.",
      ],
    };
  if (plane.code === 17 && !input.workPlaneExplicit) return { ...result, workPlane: plane.id };
  const code =
      plane.code === 17
        ? result.code.replace(/G90(?!G17)/, "G90G17")
        : planeCode(result.code, plane),
    parsed = camParseNC(code, profile(input.machine));
  if (parsed.errors.length)
    throw Error("Проверка плоскости " + plane.id.toUpperCase() + ": " + parsed.errors[0]);
  const sourceMotions = new Map(result.motions.map((m) => [m.line, m]));
  const compensation = result.compensation;
  const preview =
    compensation && compensation.physicalPreview
      ? CONTROLLER.simulate(parsed, [
          { number: compensation.number, radius: compensation.tableValue },
        ])
      : parsed.motions;
  const motions = preview.map((m) => ({
    ...(sourceMotions.get(m.line) || {}),
    ...m,
    command: parsed.lines[m.line - 1],
  }));
  return { ...result, workPlane: plane.id, code, motions };
}

function toolRadius(input, depth) {
  const radius = Number(input.diameter) / 2;
  const shape = input.toolShape || "ball_mill";
  const length = Number(input.toolWorkingLength);
  if (!(radius > 0) || !(depth > 0) || !(length > 0) || depth > length)
    throw Error("Проверь диаметр, глубину и рабочую длину инструмента.");
  if (shape === "end_mill") return radius;
  if (!["ball_mill", "bull_mill"].includes(shape)) throw Error("Выбери форму фрезы.");
  const nose = shape === "ball_mill" ? radius : Number(input.toolProfileRadius);
  if (!(nose > 0) || nose > radius)
    throw Error("Радиус скругления должен быть больше нуля и не превышать половину диаметра.");
  const h = Math.min(depth, nose);
  return radius - nose + Math.sqrt(Math.max(0, 2 * nose * h - h * h));
}
function generateToolProfile(contours, input) {
  const depth = Math.abs(input.depth),
    step = Number(input.stepDown);
  if (!(step > 0) || !Number.isFinite(depth) || Math.ceil(depth / step) > 2000)
    throw Error("Проверь глубину и шаг обработки.");
  const depths = Array.from({ length: Math.ceil(depth / step) }, (_, i) =>
    Math.min(depth, (i + 1) * step),
  );
  const results = depths.map((h) => {
    const radius = toolRadius(input, h);
    const result = generate(contours, {
      ...input,
      compMode: "center",
      diameter: 2 * radius,
      allowance: 0,
      stockAllowance: 0,
      depth: h,
      stepDown: h,
    });
    result.operations.forEach((op) => {
      op.toolRadius = radius;
      op.toolShape = input.toolShape;
    });
    return result;
  });
  if (!results.length) throw Error("Укажи положительную глубину обработки.");
  const commands = [];
  results.forEach((result, index) => {
    const lines = result.code.split(/\r?\n/).filter((line) => line.trim() && line.trim() !== "%");
    lines.forEach((line) => {
      line = line.replace(/^N\d+/, "");
      if (/M0?[025]\b|M30\b/.test(line)) return;
      if (index && /G92/.test(line)) return;
      commands.push(line);
    });
  });
  commands.push("M30");
  const code = "%\r\n" + commands.join("\r\n") + "\r\n%\r\n";
  const parsed = camParseNC(code, profile(input.machine));
  if (parsed.errors.length) throw Error(parsed.errors[0]);
  return {
    ...results[0],
    code,
    motions: parsed.motions,
    operations: results.flatMap((r) => r.operations),
    passes: results.reduce((sum, r) => sum + r.passes, 0),
    minutes: parsed.minutes,
    warnings: [...new Set(results.flatMap((r) => r.warnings))],
    compensation: { kind: "center" },
    toolProfile: {
      shape: input.toolShape,
      diameter: input.diameter,
      radii: depths.map((h) => toolRadius(input, h)),
    },
  };
}

const api = {
  toolRadius,
  profiles,
  profile,
  generate,
  cutModes,
  roundOperationCorners,
  normalizeSide: OW.normalizeSide,
};
export default api;
