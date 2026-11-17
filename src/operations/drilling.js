import { fmt as camFmt, feedFmt as camFeedFmt } from "../nc/format.js";
import { peckCount as camPeckCount } from "../nc/motion.js";
import { planeInfo as camPlaneInfo } from "../core/planes.js";
import { parseNC as camParseNC } from "../nc/parser.js";

import M from "../cam/machines.js";

import { PARK_Z, allowed, cycles } from "./tools.js";
import { headerFeedWord } from "./settings.js";
function drillParameters(op, c, holes, tool) {
  var _op$drill$returnMode;
  if (c.machine !== "fanuc3000c")
    throw Error("Операции сверления G73/G81/G82/G83 доступны для FANUC 3000C.");
  const cycle = Number(op.drill.cycle),
    depth = Number(op.drill.depth),
    clearance = Number(op.drill.clearance),
    peck = Number(op.drill.peck);
  const returnMode = Number(
    (_op$drill$returnMode = op.drill.returnMode) !== null && _op$drill$returnMode !== void 0
      ? _op$drill$returnMode
      : 98,
  );
  const feed = c.feedInHeader
    ? Number(headerFeedWord(c).slice(1)) / c.feedScale
    : Number(op.drill.feed);
  if (!Object.prototype.hasOwnProperty.call(cycles, cycle)) throw Error("Выбери цикл сверления.");
  if (returnMode !== 98 && returnMode !== 99) throw Error("Выбери высоту отвода при сверлении.");
  if (!tool || !allowed(tool, "drill"))
    throw Error("Выбери сверло, центровку или фасочный инструмент.");
  if (!holes.length) throw Error("Отметь хотя бы одну окружность для сверления.");
  if (!Number.isFinite(depth) || depth < 0.001)
    throw Error("Задай глубину сверления от верха, минимум 0,001 мм.");
  if (!Number.isFinite(clearance) || clearance < 0.001)
    throw Error("Задай высоту R над верхом, минимум 0,001 мм.");
  if (!Number.isFinite(feed) || feed < 0.1 || feed > 3600)
    throw Error("Задай подачу от 0,1 до 3600 мм/мин.");
  if (c.spindleCommand && (!Number.isInteger(c.rpm) || c.rpm < 1))
    throw Error("Задай положительные целые обороты S.");
  const encode = (v) => camFmt(v, c.coordScale, c.decimal),
    quant = (v) => +encode(v) / c.coordScale;
  const z = quant(c.topZ - depth),
    r = quant(c.topZ + clearance),
    safe = quant(c.safeZ),
    top = quant(c.topZ),
    q = [73, 83].includes(cycle) ? quant(peck / 1000) : 0,
    seconds = cycle === 82 ? Number(op.drill.dwell || 0) : 0;
  if (!(z < top && top < r && r <= safe))
    throw Error("Проверь высоты: дно < верх < R ≤ безопасный Z.");
  if ([73, 83].includes(cycle) && (q <= 0 || !Number.isFinite(peck)))
    throw Error("Для G" + cycle + " задай шаг Q (1 мм = 1000, минимум 1).");
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 1048.575)
    throw Error("Выдержка P должна быть от 0 до 1048,575 с.");
  if (q && camPeckCount(r, z, q) > 3000)
    throw Error("Слишком много шагов Q на отверстие. Увеличь Q.");
  return {
    cycle,
    returnMode,
    z,
    r,
    safe,
    q,
    seconds: Math.round(seconds * 1000) / 1000,
    feed,
    encode,
    points: holes.map((hole) => ({
      x: quant(hole.c.x - c.originX),
      y: quant(hole.c.y - c.originY),
    })),
  };
}

function drill(op, c, holes, tool) {
  var _c$workPlane;
  const {
      cycle,
      returnMode,
      z,
      r,
      safe,
      q,
      seconds,
      feed,
      encode: X,
      points,
    } = drillParameters(op, c, holes, tool),
    frames = [],
    warnings = [];
  const push = (command) => {
    if (frames.length >= 50000) throw Error("Слишком много кадров. Раздели сверление.");
    frames.push({ command });
  };
  if (c.spindleCommand) push("S" + c.rpm + "M03");
  if (c.coolant) push("M08");
  if (safe !== PARK_Z) push("G00Z" + X(safe));
  const F = camFeedFmt(feed, c),
    xy = (p) => "X" + X(p.x) + "Y" + X(p.y),
    visited = new Set();
  for (const p of points) {
    const key = xy(p);
    if (visited.has(key))
      throw Error(
        "Две выбранные окружности имеют один центр " + key + ". Оставь одну на операцию.",
      );
    visited.add(key);
  }
  push(
    "G" +
      returnMode +
      "G" +
      cycle +
      xy(points[0]) +
      "Z" +
      X(z) +
      (q ? "Q" + X(q) : "") +
      (cycle === 82 ? "P" + Math.round(seconds * 1000) : "") +
      "R" +
      X(r) +
      "F" +
      F,
  );
  for (const p of points.slice(1)) push(xy(p));
  push("G80");
  if (c.coolant) push("M09");
  push("G00Z" + X(safe));
  push("G00X0Y0");
  if (tool.type === "drill" && holes.some((hole) => Math.abs(hole.r * 2 - tool.diameter) > 0.001))
    warnings.push(
      "Диаметр сверла отличается от диаметра одной или нескольких отмеченных окружностей.",
    );
  if (tool.workingLength > 0 && Math.abs(c.topZ - z) > tool.workingLength + 0.0005)
    warnings.push(
      "Глубина больше рабочей длины инструмента из базы (" + tool.workingLength + " мм).",
    );
  const plane = camPlaneInfo(
    (_c$workPlane = c.workPlane) !== null && _c$workPlane !== void 0 ? _c$workPlane : "xy",
  );
  if (plane.code !== 17) {
    const parsed = camParseNC(
      "G92X0Y0Z30000\nG90\n" + frames.map((f) => f.command).join("\n"),
      M.profile(c.machine),
    );
    if (parsed.errors.length) throw Error(parsed.errors[0]);
    const byLine = new Map();
    for (const m of parsed.motions) {
      if (!byLine.has(m.line)) byLine.set(m.line, []);
      byLine.get(m.line).push(m);
    }
    const source = frames.slice();
    frames.length = 0;
    for (const [i, frame] of source.entries()) {
      const record = parsed.records[i + 2];
      if (record.cycle) {
        for (const m of byLine.get(i + 3) || []) {
          if (m.type === "dwell") {
            push("G04P" + Math.round(m.seconds * 1000));
            continue;
          }
          let command = m.type === "rapid" ? "G00" : "G01";
          for (const axis of ["x", "y", "z"])
            if (Math.abs(m.b[axis] - m.a[axis]) > 0.000001)
              command += axis.toUpperCase() + X(m.b[axis]);
          if (m.type !== "rapid") command += "F" + F;
          push(command);
        }
      } else push(frame.command);
    }
    warnings.push(
      "Сверление в " +
        plane.id.toUpperCase() +
        ": цикл G" +
        cycle +
        " развёрнут в G00/G01" +
        (cycle === 82 ? "/G04" : "") +
        " по оси " +
        plane.axes[2] +
        ".",
    );
  }
  return {
    frames,
    warnings,
    drilling: {
      cycle,
      returnMode,
      z,
      r,
      q,
      seconds,
      feed,
      expanded: plane.code !== 17,
    },
    passes: points.length,
    operations: [],
    toolKind: "drill",
  };
}
export { drillParameters, drill };
