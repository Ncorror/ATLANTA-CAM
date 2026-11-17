import {
  fmt as camFmt,
  roundXYSegment as camRoundXYSegment,
  lastCorrector as camLastCorrector,
  modalFeed as camModalFeed,
  feedFmt as camFeedFmt,
} from "./format.js";
import {
  sub as camSub,
  mul as camMul,
  left as camLeft,
  dist as camDist,
  add as camAdd,
} from "../core/math.js";
import { tangent as camTangent } from "../core/segments.js";
import { parseNC as camParseNC } from "./parser.js";
import { tokenizeNC as camTokenizeNC } from "./tokenizer.js";

import REACHABLE from "../cam/reachability.js";
const R = REACHABLE;
function number(c) {
  var _c$corrector;
  const n = (_c$corrector = c.corrector) !== null && _c$corrector !== void 0 ? _c$corrector : 1,
    max = c.machine === "fanuc3000c" ? (c.correctorCount === 64 ? 63 : 31) : 99,
    min = c.machine === "fanuc3000c" ? 0 : 1;
  if (!Number.isInteger(n) || n < min || n > max)
    throw Error(
      "Для этого профиля выбери номер D от " +
        min +
        " до " +
        max +
        ". FANUC 3000C: 32 ячейки имеют номера 00–31 (§3.13).",
    );
  return n;
}
function vectorWords(vector, scale = 1000) {
  const x = camFmt(vector.x, scale, false),
    y = camFmt(vector.y, scale, false);
  if (Number(x) === 0 && Number(y) === 0) throw Error("Вектор I/J после округления равен нулю.");
  return (Number(x) !== 0 ? "I" + x : "") + (Number(y) !== 0 ? "J" + y : "");
}
function cornerVector(segment, c) {
  const rounded = camRoundXYSegment(segment, c);
  if (!rounded) throw Error("Следующая грань G39 меньше точности стойки.");
  const s = rounded.segment;
  return s.type === "L" ? camSub(s.b, s.a) : camMul(camLeft(camSub(s.a, s.c)), Math.sign(s.sw));
}
function tangential(contours) {
  return contours
    .filter((c) => c.enabled && c.side !== "on")
    .every(
      (c) =>
        c.closed &&
        c.segs.every(
          (s, i) =>
            camDist(camTangent(s, true), camTangent(c.segs[(i + 1) % c.segs.length])) < 0.00001,
        ),
    );
}
function prepare(contours, c) {
  const plans = {},
    warnings = [],
    rest = [],
    report = [];
  if (c.toolKind === "scribe" || !c.autoFit) return { plans, warnings, rest, report };
  for (const contour of contours.filter((c) => c.enabled)) {
    const side = contour.side === "auto" ? contour.autoSide : contour.side;
    if (side === "on") continue;
    const plan = R.plan(contour, c);
    if (plan.partial || Math.abs(plan.allowance - c.allowance) > 0.0005) {
      if (c.stockAllowance > 0)
        throw Error("Для автоматического доступного обхода установи боковой черновой припуск 0.");
      plans[contour.id] = plan;
      if (plan.partial) {
        rest.push(...R.restSegments(plan, c.diameter / 2));
        warnings.push(
          "Контур " +
            contour.id +
            ": доступный обход фрезой Ø" +
            c.diameter +
            ". Тесные места оставлены на доработку; фактический радиус " +
            (c.diameter / 2).toFixed(3) +
            " мм сохранён.",
        );
      } else
        warnings.push(
          "Контур " +
            contour.id +
            ": припуск автоматически уменьшен с " +
            c.allowance.toFixed(3) +
            " до " +
            plan.allowance.toFixed(3) +
            " мм, диаметр фрезы не менялся.",
        );
      report.push({
        contour: contour.id,
        partial: plan.partial,
        requestedRadius: c.diameter / 2 + c.allowance,
        actualToolRadius: c.diameter / 2,
        appliedAllowance: plan.allowance,
        maxExactRadius: plan.maxExactRadius,
        suggestedDiameter: Math.max(0, 2 * (plan.maxExactRadius - c.allowance)),
      });
    }
  }
  return { plans, warnings, rest, report };
}
function frameCodeBase(frames, c, formatVP) {
  if (frames.length > 50000)
    throw Error("Программа с D превышает 50000 кадров. Раздели обработку.");
  const feedState = {},
    modal = frames.map((f) => {
      if (f.comment) delete feedState.value;
      const command = camLastCorrector(camModalFeed(f.command, feedState));
      return { ...f, command };
    });
  const numbered = c.lineNumbers && modal.filter((frame) => frame.command).length <= 999;
  let sequence = 0;
  return (
    "%\r\n" +
    modal
      .map((frame) => {
        const number = numbered && frame.command ? "N" + String(++sequence).padStart(3, "0") : "";
        return (
          number +
          frame.command.replace(/\s/g, "") +
          (frame.comment ? (frame.commentSpace ? " " : "") + "(" + frame.comment + ")" : "")
        );
      })
      .join("\r\n") +
    "\r\n%\r\n"
  );
}
function wear(base, c, formatVP, profile) {
  const n = number(c),
    D = String(n).padStart(2, "0"),
    F = (v) => camFeedFmt(v, c),
    X = (v) => camFmt(v, 1000, false),
    plunges = base.motions.filter((m) => m.stage === "plunge"),
    before = new Map(),
    after = new Map(),
    metadata = new Map();
  for (const m of base.motions) if (m.line) metadata.set(m.line, m);
  for (let i = 0; i < plunges.length; i++) {
    const plunge = plunges[i],
      operation = base.operations[i];
    if (!operation) throw Error("Нет данных операции для корректора D.");
    if (operation.side === "on" && !operation.openWall && !operation.wallNetwork) continue;
    before.set(plunge.line - 1, operation);
    const index = base.motions.indexOf(plunge),
      retract = base.motions
        .slice(index + 1)
        .find((m) => m.type === "rapid" && m.b.z >= c.safeZ - 0.0001);
    if (!retract || !retract.line) throw Error("Нет безопасного снятия коррекции.");
    after.set(retract.line, operation);
  }
  const frames = [],
    lines = base.code.replace(/\r/g, "").split("\n"),
    push = (command, extra = {}) => {
      if (frames.length >= 50000) throw Error("Слишком много кадров с D. Раздели обработку.");
      frames.push({ command, ...extra });
    };
  const parsedBase = camParseNC(base.code, {
    ...profile(c.machine),
    allowUnframed: true,
  });
  if (parsedBase.errors.length) throw Error(parsedBase.errors[0]);
  const records = new Map(parsedBase.records.map((r) => [r.line, r]));
  for (let i = 0; i < lines.length; i++) {
    const sourceLine = i + 1,
      record = records.get(sourceLine),
      activate = before.get(sourceLine);
    if (activate) {
      const p = record.before,
        t = camTangent(activate.path[0]),
        q = camAdd(p, camMul(t, 0.01));
      push(
        "G01G42D" + D + "X" + X(q.x) + "Y" + X(q.y) + "I" + X(t.x) + "J" + X(t.y) + "F" + F(c.feed),
        { stage: "compensation" },
      );
      push("G01X" + X(p.x) + "Y" + X(p.y) + "I" + X(t.x) + "J" + X(t.y) + "F" + F(c.feed), {
        stage: "compensation",
      });
    }
    const words = camTokenizeNC(lines[i]).words.filter((w) => w.letter !== "N");
    if (!words.length) continue;
    const old = metadata.get(sourceLine),
      feedMotion = old && old.type !== "rapid";
    push(
      words
        .filter((w) => !feedMotion || w.letter !== "F")
        .map((w) => w.letter + w.raw)
        .join("") + (feedMotion ? "F" + F(old.feed) : ""),
      { sourceLine },
    );
    if (after.has(sourceLine)) {
      const p = record.after;
      push("G01G40D00X" + X(p.x + 0.01) + "Y" + X(p.y) + "F" + F(c.feed), {
        stage: "compensation",
      });
      push("G00X" + X(p.x) + "Y" + X(p.y), { stage: "compensation" });
    }
  }
  const code = frameCode(frames, c, formatVP),
    parsed = camParseNC(code, profile(c.machine));
  if (parsed.errors.length) throw Error("Проверка D: " + parsed.errors[0]);
  for (const m of parsed.motions) {
    const f = frames[m.line - 2],
      old = f && metadata.get(f.sourceLine);
    if (old) {
      m.stage = old.stage;
      m.contour = old.contour;
    } else m.stage = "compensation";
    m.programComp = m.comp;
    m.comp = 40;
    m.command = parsed.lines[m.line - 1];
  }
  return {
    ...base,
    code,
    motions: parsed.motions,
    minutes: parsed.minutes,
    blocks: frames.length,
    compensation: { kind: "wear", number: n, tableValue: 0 },
    warnings: [
      ...base.warnings,
      ...(c.lineNumbers && frames.length > 999
        ? ["Более 999 кадров с D: номера N отключены целиком."]
        : []),
      "В " +
        ("D" + D) +
        " установить 0.000 мм: радиус реальной фрезы уже учтён в координатах. Полный радиус фрезы повторно в этот корректор вводить нельзя.",
    ],
  };
}

function frameCode(frames, c, formatVP) {
  const hasCustomN = frames.some(function (f) {
    return f.customN != null;
  });
  if (!hasCustomN) {
    return frameCodeBase(frames, c, formatVP);
  }
  if (frames.length > 50000)
    throw Error("Программа с D превышает 50000 кадров. Раздели обработку.");
  const feedState = {},
    modal = frames.map(function (f) {
      if (f.comment) delete feedState.value;
      const command = camLastCorrector(camModalFeed(f.command, feedState));
      return Object.assign({}, f, { command: command });
    });
  const numbered =
    c.lineNumbers &&
    modal.filter(function (frame) {
      return frame.command;
    }).length <= 999;
  let sequence = 0;
  return (
    "%\r\n" +
    modal
      .map(function (frame) {
        let number = "";
        if (numbered && frame.command) {
          if (frame.customN != null) {
            sequence = Math.max(sequence, Number(frame.customN) || 0);
            number = "N" + String(frame.customN).padStart(3, "0");
          } else {
            number = "N" + String(++sequence).padStart(3, "0");
          }
        }
        return (
          number +
          frame.command.replace(/\s/g, "") +
          (frame.comment ? (frame.commentSpace ? " " : "") + "(" + frame.comment + ")" : "")
        );
      })
      .join("\r\n") +
    "\r\n%\r\n"
  );
}
const api = {
  number,
  vectorWords,
  cornerVector,
  tangential,
  prepare,
  frameCode,
  wear,
};
export default api;
