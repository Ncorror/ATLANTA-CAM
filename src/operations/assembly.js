import { tokenizeNC as camTokenizeNC } from "../nc/tokenizer.js";
import {
  planeCommand as camPlaneCommand,
  planeToLocal as camPlaneToLocal,
  planeInfo as camPlaneInfo,
} from "../core/planes.js";
import { fmt as camFmt } from "../nc/format.js";
import { parseNC as camParseNC } from "../nc/parser.js";
import { motionMinutes as camMotionMinutes } from "../nc/motion.js";

import CP from "../nc/compensation.js";
import M from "../cam/machines.js";
import CONTROLLER from "../nc/controller.js";
import { DEFAULT_TOOL_NAME_SPACES, PARK_Z } from "./tools.js";
import { headerFeedWord } from "./settings.js";
import { zReference } from "../nc/z-reference.js";
function millingFrames(result) {
  const motions = new Map(result.motions.map((m) => [m.line, m]));
  return result.code.split(/\r?\n/).flatMap((line, i) => {
    const raw = camTokenizeNC(line)
      .words.filter((w) => w.letter !== "N")
      .map((w) => w.letter + w.raw)
      .join("");
    const command = camPlaneCommand(raw, result.workPlane || "xy", true);
    if (
      !command ||
      /^G92/.test(command) ||
      ["M00", "M02", "M30", "M05", "G90G17G40G80", "G90G40G80"].includes(command)
    )
      return [];
    if (result.machine === "fanuc3000c" && ["G90G17", "G90", "G40D00"].includes(command)) return [];
    return [{ command, motion: motions.get(i + 1) }];
  });
}

function withoutInitialPark(body, parkZ = PARK_Z) {
  const parkCommand = "G00Z" + camFmt(parkZ, 1000, false);
  let atStart = true;
  return body.filter((frame) => {
    if (atStart && [parkCommand, "G00X0Y0"].includes(frame.command)) return false;
    if (/[XYZ]/.test(frame.command)) atStart = false;
    return true;
  });
}

function withoutFeedWords(body) {
  return body.flatMap((frame) => {
    if (camTokenizeNC(frame.command).words.some((w) => w.letter === "G" && w.value === 4))
      return [frame];
    const command = frame.command.replace(/F[+-]?\d+(?:\.\d+)?/g, "");
    if (!command) return [];
    return [command === frame.command ? frame : { ...frame, command }];
  });
}

function incrementalMilling(body, workPlane = "xy", parkZ = PARK_Z) {
  const park = camPlaneToLocal({ x: 0, y: 0, z: parkZ }, workPlane);
  const position = { X: park.x * 1000, Y: park.y * 1000, Z: park.z * 1000 };
  return body.map((frame) => {
    const words = camTokenizeNC(frame.command).words;
    if (words.some((w) => w.letter === "G" && w.value === 4)) return { ...frame };
    const command = words
      .map((word) => {
        const { letter, value, raw } = word;
        if (letter === "G" && [73, 81, 82, 83, 85, 89, 90, 91, 92].includes(value)) {
          throw Error(
            "G91 поддерживается для движений по контуру без смены режима внутри операции.",
          );
        }
        if (!"XYZ".includes(letter)) return letter + raw;
        const delta = value - position[letter];
        position[letter] = value;
        return letter + camFmt(delta, 1, false);
      })
      .join("");
    return { ...frame, command };
  });
}

function assemble(parts, c) {
  var _c$toolNameSpaces;
  if (
    new Set(
      parts.map((part) => {
        var _part$config$workPlan;
        return camPlaneInfo(
          (_part$config$workPlan = part.config.workPlane) !== null &&
            _part$config$workPlan !== void 0
            ? _part$config$workPlan
            : "xy",
        ).id;
      }),
    ).size > 1
  )
    throw Error(
      "У операций разные рабочие плоскости. Включи «Рассчитать только эту операцию» для отдельных программ и установок.",
    );
  if (parts.some((part) => part.config.originIsLocal) && parts.length > 1) {
    const first = parts[0].config;
    if (
      parts.some(
        (part) =>
          Math.abs(part.config.originX - first.originX) > 0.0005 ||
          Math.abs(part.config.originY - first.originY) > 0.0005,
      )
    ) {
      throw Error(
        "У операций разные локальные нули X/Y. Выбери «Рассчитать только эту операцию» для отдельных программ или общий ноль для совместной обработки. G92 не перемещает станок к следующему нулю.",
      );
    }
  }
  const frames = [],
    fanuc = c.machine === "fanuc3000c",
    limit = fanuc ? 50000 : 999;
  const stopSpindle = !fanuc || c.stopSpindle === true;
  const spaces =
    (_c$toolNameSpaces = c.toolNameSpaces) !== null && _c$toolNameSpaces !== void 0
      ? _c$toolNameSpaces
      : DEFAULT_TOOL_NAME_SPACES;
  if (fanuc && (!Number.isInteger(spaces) || spaces < 0 || spaces > 100)) {
    throw Error("Пробелы после «(» — целое число от 0 до 100.");
  }
  const toolNameIndent = fanuc ? " ".repeat(spaces) : "";
  const m98Subprograms = [];
  for (const [i, part] of parts.entries()) {
    const reference = zReference(part.config),
      parkZ = reference.z;
    const parkWord = camFmt(parkZ, part.config.coordScale || 1000, false);
    const pushReference = () => frames.push({ ...reference, part });
    var _part$config$workPlan2;
    const plane = camPlaneInfo(
      (_part$config$workPlan2 = part.config.workPlane) !== null && _part$config$workPlan2 !== void 0
        ? _part$config$workPlan2
        : "xy",
    );
    const push = (command) => frames.push({ command: camPlaneCommand(command, plane.id), part });
    const circleCorrection = part.result.g12 && part.result.compensation;
    const toolComment =
      toolNameIndent +
      part.name +
      (circleCorrection
        ? " | ATLANTA D" +
          String(circleCorrection.number).padStart(2, "0") +
          "=" +
          circleCorrection.tableValue.toFixed(3) +
          " MM"
        : "");
    const isM98 = fanuc && part.config.repeatMode === "m98";
    const relative =
      fanuc &&
      !part.result.drilling &&
      !part.result.g25 &&
      (part.config.coordinateMode === "g91" || isM98);
    let body = part.result.frames || millingFrames(part.result);
    if (isM98) {
      frames.push({ command: "", comment: toolComment, part });
      part.start = frames.length;
      push("G40G80");
      pushReference();
      const feed = part.config.feedInHeader ? headerFeedWord(part.config) : "";
      push(feed + "G91G" + plane.code);
      const subN = 101 + i * 100;
      const repeats = Math.max(1, Math.min(9999, Math.round(Number(part.config.m98R) || 8)));
      push("M98P" + String(subN).padStart(3, "0") + "R" + repeats);
      push("G90");
      push("G00Z" + camFmt(part.config.safeZ || PARK_Z, part.config.coordScale || 1000, false));
      push("G00X0Y0");
      if (plane.code !== 17) {
        frames.push({ command: "G90G00Z" + parkWord, part });
        frames.push({ command: "G00X0Y0", part });
      } else if (part.config.zReferenceEnabled || part.config.safeZ > parkZ || part.result.g25)
        push("G00Z" + parkWord);
      if (stopSpindle) push("M05");
      part.endCommand =
        i === parts.length - 1
          ? ["M00", "M02", "M30"].includes(c.endCode)
            ? c.endCode
            : "M02"
          : "M00";
      push(part.endCommand);
      part.end = frames.length - 1;
      m98Subprograms.push({ part, subN, body, plane, feed, parkZ });
    } else if (fanuc) {
      frames.push({ command: "", comment: toolComment, part });
      part.start = frames.length;
      push("G40G80");
      pushReference();
      const feed = part.config.feedInHeader ? headerFeedWord(part.config) : "";
      push(feed + (relative ? "G91" : "G90") + ("G" + plane.code));
      if (plane.code === 17) body = withoutInitialPark(body, parkZ);
      if (feed && !part.result.g25) body = withoutFeedWords(body);
      if (relative) body = incrementalMilling(body, plane.id, parkZ);
    } else {
      part.start = frames.length;
      frames.push({
        command: camPlaneCommand("G90G17G40G80", plane.id),
        comment: part.name,
        part,
      });
      if (i === 0 && c.useG92) pushReference();
      push("G00Z" + parkWord);
      push("G00X0Y0");
    }
    if (!isM98) {
      const returnFrames =
        plane.code !== 17
          ? 2
          : Number(
              !!part.config.zReferenceEnabled || part.config.safeZ > parkZ || !!part.result.g25,
            );
      const tail = 1 + Number(stopSpindle) + Number(relative) + returnFrames;
      if (frames.length + body.length + tail > limit)
        throw Error(
          "Слишком много кадров для " + M.profiles[c.machine].name + ". Раздели программу.",
        );
      for (const frame of body)
        frames.push({
          ...frame,
          command: camPlaneCommand(frame.command, plane.id),
          part,
        });
      if (relative) push("G90");
      if (plane.code !== 17) {
        frames.push({ command: "G90G00Z" + parkWord, part });
        frames.push({ command: "G00X0Y0", part });
      } else if (part.config.zReferenceEnabled || part.config.safeZ > parkZ || part.result.g25)
        push("G00Z" + parkWord);
      if (stopSpindle) push("M05");
      part.endCommand =
        i === parts.length - 1
          ? fanuc
            ? ["M00", "M02", "M30"].includes(c.endCode)
              ? c.endCode
              : "M02"
            : "M30"
          : "M00";
      push(part.endCommand);
      part.end = frames.length - 1;
    }
  }
  for (const sub of m98Subprograms) {
    let curN = sub.subN;
    let subBody = sub.plane.code === 17 ? withoutInitialPark(sub.body, sub.parkZ) : sub.body;
    if (sub.feed) subBody = withoutFeedWords(subBody);
    // Each incremental call must return to its own reference before the pattern step.
    // Otherwise a different clearance/reference height accumulates on every M98 repeat.
    if (sub.part.config.zReferenceEnabled) {
      subBody = [
        ...subBody,
        { command: camPlaneCommand("G00Z" + camFmt(sub.parkZ, 1000, false), sub.plane.id, true) },
        { command: camPlaneCommand("G00X0Y0", sub.plane.id, true) },
      ];
    }
    subBody = incrementalMilling(subBody, sub.plane.id, sub.parkZ);
    for (const frame of subBody) {
      frames.push({
        ...frame,
        command: camPlaneCommand(frame.command, sub.plane.id),
        customN: curN++,
        part: sub.part,
      });
    }
    const stepX = Number(sub.part.config.m98StepX) || 0;
    const stepY = Number(sub.part.config.m98StepY) || 0;
    if (stepX !== 0 || stepY !== 0) {
      const scale = sub.part.config.coordScale || 1000;
      frames.push({
        command: camPlaneCommand(
          "G00X" + Math.round(stepX * scale) + "Y" + Math.round(stepY * scale),
          sub.plane.id,
        ),
        customN: curN++,
        part: sub.part,
      });
    }
    const retP =
      sub.part.config.m98ReturnMode === "p"
        ? "P" + String(sub.part.config.m98ReturnP || 9).padStart(3, "0")
        : "";
    frames.push({ command: "M99" + retP, customN: curN++, part: sub.part });
  }
  const hasG25 = frames.some((frame) => frame.repeatStart);
  if (hasG25) {
    let sequence = 0;
    const addresses = new Map(),
      subprogramAddresses = new Map();
    for (const frame of frames) {
      if (!frame.command) continue;
      if (frame.customN != null) subprogramAddresses.set(Number(frame.customN), sequence + 1);
      frame.customN = ++sequence;
      if (frame.repeatLabel) addresses.set(frame.part.id + frame.repeatLabel, sequence);
    }
    if (sequence > 999) throw Error("Для G25 допускается до 999 нумерованных кадров.");
    for (const frame of frames) {
      if (/M(?:98|99)/.test(frame.command))
        frame.command = frame.command.replace(/P(\d+)/, (word, n) =>
          subprogramAddresses.has(Number(n)) ? "P" + subprogramAddresses.get(Number(n)) : word,
        );
    }
    for (const frame of frames)
      if (frame.repeatStart) {
        frame.command =
          "G25P" +
          addresses.get(frame.part.id + frame.repeatStart) +
          "Q" +
          addresses.get(frame.part.id + frame.repeatEnd) +
          "R" +
          frame.repeatCount;
      }
  }
  const code = CP.frameCode(frames, {
      ...c,
      lineNumbers: hasG25 || c.lineNumbers,
    }),
    parsed = camParseNC(code, M.profile(c.machine)),
    offset = 2;
  if (parsed.errors.length) throw Error("Проверка программы: " + parsed.errors[0]);
  const records = new Map(
    (parsed.sourceRecords || parsed.records).filter(Boolean).map((r) => [r.line, r]),
  );
  const atPark = (p, parkZ) => {
    if (!p) return false;
    const q = p;
    return Math.abs(q.x) < 1e-6 && Math.abs(q.y) < 1e-6 && Math.abs(q.z - parkZ) < 1e-6;
  };
  for (const [index, part] of parts.entries()) {
    const parkZ = zReference(part.config).z;
    const previousPark = index ? zReference(parts[index - 1].config).z : PARK_Z;
    var _part$config$workPlan3;
    const plane = camPlaneInfo(
      (_part$config$workPlan3 = part.config.workPlane) !== null && _part$config$workPlan3 !== void 0
        ? _part$config$workPlan3
        : "xy",
    );
    const first = records.get(part.start + offset),
      last = records.get(part.end + offset);
    const zero = fanuc ? records.get(part.start + offset + 1) : null;
    if (
      ((index > 0 || plane.code === 17) &&
        !atPark(first === null || first === void 0 ? void 0 : first.before, previousPark)) ||
      !atPark(last === null || last === void 0 ? void 0 : last.after, parkZ) ||
      last.comp !== 40 ||
      (fanuc &&
        (first.comp !== 40 ||
          !(zero !== null && zero !== void 0 && zero.g92) ||
          !atPark(zero.after, parkZ) ||
          !last.absolute))
    ) {
      throw Error(
        "Проверка начала и возврата " +
          part.name +
          ": ожидается X0 Y0 Z" +
          camFmt(parkZ, 1000, false) +
          " со снятой коррекцией в конце.",
      );
    }
    part.startLine = part.start + offset;
    part.endLine = part.end + offset;
    part.motions = [];
  }
  let preview;
  try {
    preview = parts.some((part) => {
      var _part$result$compensa;
      return (_part$result$compensa = part.result.compensation) === null ||
        _part$result$compensa === void 0
        ? void 0
        : _part$result$compensa.physicalPreview;
    })
      ? CONTROLLER.simulate(
          parsed,
          parts.map((part) => {
            const d = part.result.compensation;
            return d !== null && d !== void 0 && d.physicalPreview
              ? { number: d.number, radius: d.tableValue }
              : null;
          }),
        )
      : parsed.motions;
  } catch (error) {
    throw CONTROLLER.diagnose(error, parsed, c, frames, offset);
  }
  for (const motion of preview) {
    const frame = frames[motion.line - offset],
      part = frame.part,
      source = frame.motion;
    if (source) {
      motion.stage = source.stage;
      motion.contour = source.contour;
      if (source.comp === 40 && motion.comp !== 40) {
        motion.programComp = motion.comp;
        motion.comp = 40;
      }
    }
    motion.command = parsed.lines[motion.line - 1];
    part.motions.push(motion);
  }
  const warnings = [];
  if (fanuc && c.lineNumbers && frames.filter((frame) => frame.command).length > 999)
    warnings.push("Более 999 кадров: номера N отключены во всей программе.");
  const correctors = new Map();
  for (const part of parts) {
    const d = part.result.compensation;
    if (!d || d.kind === "center") continue;
    if (correctors.has(d.number) && Math.abs(correctors.get(d.number) - d.tableValue) > 0.0005)
      warnings.push(
        "D" +
          String(d.number).padStart(2, "0") +
          " используется с разными значениями. Проверь таблицу коррекции на M00 перед продолжением.",
      );
    correctors.set(d.number, d.tableValue);
  }
  return {
    parts,
    code,
    motions: preview,
    lineCount: parsed.lines.length,
    blocks: frames.filter((frame) => frame.command).length,
    minutes: preview.reduce((total, m) => total + camMotionMinutes(m), 0),
    warnings: [...new Set([...warnings, ...parsed.warnings])],
  };
}
export { millingFrames, withoutInitialPark, withoutFeedWords, incrementalMilling, assemble };
