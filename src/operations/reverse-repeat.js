import {
  fmt as camFmt,
  compactArcs as camCompactArcs,
  feedFmt as camFeedFmt,
} from "../nc/format.js";
import { rev as camRev } from "../core/segments.js";
import { dist as camDist } from "../core/math.js";

import M from "../cam/machines.js";

function generateG25(part, op, c, tool) {
  const shift = Number(c.g25Shift),
    repeats = Number(c.g25R);
  if (!Number.isFinite(shift) || Math.abs(shift) < 1 / c.coordScale)
    throw Error("Укажи ненулевое смещение G25 по оси углубления.");
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 9999)
    throw Error("R G25 — целое число от 1 до 9999 дополнительных повторов.");
  if (c.compMode === "control" || c.compMode === "wear")
    throw Error("Для реверса G25 выбери расчёт центра фрезы или коррекцию по форме инструмента.");
  if (c.compMode === "tool") {
    const depth = Math.abs(c.depth),
      count = (c.g25Reverse !== false ? 2 : 1) * (repeats + 1);
    const firstRadius = M.toolRadius(c, depth);
    const lastRadius = M.toolRadius(c, depth - shift * (count - 1));
    M.toolRadius(c, depth - shift * count);
    if (Math.abs(firstRadius - lastRadius) > 0.000001)
      throw Error(
        "G25 повторяет неизменную траекторию, а при этих глубинах радиус контакта фрезы меняется. Отключи G25 и используй обработку по глубинам либо выбери участок с постоянным радиусом контакта.",
      );
  }
  const planned = M.generate(part.contours, {
    ...c,
    stepDown: Math.abs(c.depth),
    stockAllowance: 0,
    workPlane: "xy",
    workPlaneExplicit: false,
  });
  const frames = [],
    scale = c.coordScale || 1000;
  const X = (value) => camFmt(value, scale, false);
  const push = (command) => {
    const frame = { command };
    frames.push(frame);
    return frame;
  };
  const increment = (segment) => {
    const xy = "X" + X(segment.b.x - segment.a.x) + "Y" + X(segment.b.y - segment.a.y);
    if (segment.type === "L") return "G01" + xy;
    return (
      (segment.sw > 0 ? "G03" : "G02") +
      xy +
      "I" +
      X(segment.c.x - segment.a.x) +
      "J" +
      X(segment.c.y - segment.a.y)
    );
  };
  for (const operation of planned.operations) {
    const path = operation.preserveJunctions ? operation.path : camCompactArcs(operation.path),
      first = path[0].a;
    const endDepth = operation.z + (c.g25Reverse !== false ? 2 : 1) * shift * (repeats + 1);
    const retract = Math.max(c.safeZ, operation.z + c.approach, endDepth + c.approach);
    push("G90G00Z" + X(c.safeZ));
    push("G00X" + X(operation.entry.x - c.originX) + "Y" + X(operation.entry.y - c.originY));
    push("G00Z" + X(c.topZ + c.approach));
    push("G01Z" + X(operation.z) + "F" + camFeedFmt(c.plunge, c));
    if (operation.leadIn && operation.leadIn.length) {
      push("G91");
      operation.leadIn.forEach((segment) => push(increment(segment)));
    } else push("G01X" + X(first.x - c.originX) + "Y" + X(first.y - c.originY));
    push("G91F" + camFeedFmt(c.feed, c));
    const start = push(increment(path[0]));
    start.repeatLabel = "g25-" + frames.length + "-start";
    path.slice(1).forEach((segment) => push(increment(segment)));
    if (c.g25Reverse !== false) {
      push("G01Z" + X(shift));
      path
        .slice()
        .reverse()
        .map(camRev)
        .forEach((segment) => push(increment(segment)));
    } else if (camDist(first, path[path.length - 1].b) > 0.0005) {
      throw Error("Для открытой траектории G25 включи реверсную обработку.");
    }
    const last = push("G01Z" + X(shift));
    last.repeatLabel = "g25-" + frames.length + "-end";
    push("G25");
    frames[frames.length - 1].repeatStart = start.repeatLabel;
    frames[frames.length - 1].repeatEnd = last.repeatLabel;
    frames[frames.length - 1].repeatCount = repeats;
    operation.exit = first;
    operation.leadOut = [];
    push("G90G00Z" + X(retract));
    push("G00X0Y0");
  }
  return {
    ...planned,
    frames,
    g25: true,
    passes: planned.operations.length * (repeats + 1) * (c.g25Reverse !== false ? 2 : 1),
  };
}
export { generateG25 };
