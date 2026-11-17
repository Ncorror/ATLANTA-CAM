import { dist as camDist } from "../core/math.js";
import { feedFmt as camFeedFmt } from "../nc/format.js";

import { PARK_Z } from "./tools.js";
function getCircle(contourOrItem) {
  if (!contourOrItem) return null;
  if (contourOrItem.type === "circle" && contourOrItem.c && typeof contourOrItem.r === "number") {
    return { c: contourOrItem.c, r: contourOrItem.r };
  }
  if (contourOrItem.closed && Array.isArray(contourOrItem.segs) && contourOrItem.segs.length) {
    const segs = contourOrItem.segs,
      first = segs[0];
    if (first.type !== "A" || !first.c) return null;
    const radius = camDist(first.a, first.c),
      sign = Math.sign(first.sw);
    if (
      segs.every(
        (seg, i) =>
          seg.type === "A" &&
          seg.c &&
          Math.sign(seg.sw) === sign &&
          camDist(seg.c, first.c) < 0.0001 &&
          Math.abs(camDist(seg.a, seg.c) - radius) < 0.0001 &&
          camDist(seg.b, segs[(i + 1) % segs.length].a) < 0.0001,
      ) &&
      Math.abs(Math.abs(segs.reduce((sum, seg) => sum + seg.sw, 0)) - Math.PI * 2) < 0.00001
    )
      return { c: first.c, r: radius };
  }
  return null;
}

function calculateDepths(topZ, depth, stepDown) {
  const totalDepth = Math.abs(typeof depth === "number" ? depth : 1) || 1;
  const step = Math.abs(typeof stepDown === "number" ? stepDown : totalDepth) || totalDepth;
  if (
    !Number.isFinite(depth) ||
    Math.abs(depth) < 0.001 ||
    !Number.isFinite(stepDown) ||
    stepDown < 0.001 ||
    !Number.isFinite(topZ)
  )
    throw Error("Задай конечную глубину и шаг от 0,001 мм.");
  const passes = Math.max(1, Math.ceil(totalDepth / step));
  if (passes > 2000)
    throw Error("Более 2000 проходов по глубине. Увеличь шаг или раздели операцию.");
  const depths = [];
  for (let pass = 1; pass <= passes; pass++) {
    const curCut = Math.min(totalDepth, pass * step);
    depths.push(topZ - curCut);
  }
  return depths;
}

function generateG12(part, op, c, circles, tool) {
  if (c.workPlane && c.workPlane !== "xy") {
    throw Error(
      "Цикл расфрезерования G12/G13 поддерживается только в плоскости XY (G17) (§3.12.5).",
    );
  }
  const scale = c.coordScale || 1000;
  const X = (val) => Math.round(val * scale);
  const topZ = typeof c.topZ === "number" ? c.topZ : 0;
  const safeZ = typeof c.safeZ === "number" ? c.safeZ : PARK_Z;
  const approachHeight =
    typeof c.approach === "number" && c.approach > 0 ? topZ + c.approach : topZ + 5;
  const depths = calculateDepths(topZ, c.depth, c.stepDown);
  if (
    !Number.isFinite(safeZ) ||
    !Number.isFinite(approachHeight) ||
    approachHeight > safeZ ||
    circles.length * depths.length > 10000
  )
    throw Error(
      "Проверь безопасную высоту и высоту подхода; допускается до 10000 круговых проходов.",
    );
  const isCW = c.direction === "climb" || c.direction === "cw";
  const gCode = isCW ? "G12" : "G13";
  const dNum =
    c.corrector != null && c.corrector !== "" ? String(c.corrector).padStart(2, "0") : "01";
  const toolDiam = (tool && tool.diameter) || (c.diameter ? +c.diameter : 0);
  if (c.compMode === "tool" && c.toolShape && c.toolShape !== "end_mill")
    throw Error(
      "Для G12/G13 нужен постоянный радиус корректора. Для сферической или тороидальной фрезы выбери обычную обработку по форме инструмента.",
    );
  const radius =
    c.correctionValue != null
      ? Number(c.correctionValue) / 1000
      : tool && tool.correctionRadius != null
        ? Number(tool.correctionRadius)
        : toolDiam / 2;
  if (
    !Number.isFinite(radius) ||
    radius < 0 ||
    !Number.isInteger(Number(dNum)) ||
    Number(dNum) < 1 ||
    Number(dNum) > 31
  )
    throw Error("G12/G13: задай корректор D01–D31 и неотрицательный радиус в таблице.");
  const cutFeed = c.feedInHeader ? "" : "F" + camFeedFmt(c.feed, c);
  const plungeFeed = c.feedInHeader ? "" : "F" + camFeedFmt(c.plunge, c);
  const ox = c.originX || 0;
  const oy = c.originY || 0;
  const warnings = [];
  for (const circle of circles) {
    if (circle.r <= Math.max(toolDiam / 2, radius) + 1e-4) {
      throw Error(
        "Диаметр отверстия (" +
          (circle.r * 2).toFixed(3) +
          " мм) должен быть больше диаметра фрезы (" +
          toolDiam +
          " мм).",
      );
    }
  }
  const frames = [];
  const push = (command) => frames.push({ command });
  let lastX = 0,
    lastY = 0,
    lastG = "G00";
  push("G00Z" + X(safeZ));
  for (const [idx, circle] of circles.entries()) {
    const xc = circle.c.x - ox;
    const yc = circle.c.y - oy;
    const iVal = X(circle.r);
    let moveCmd = "";
    if (idx === 0 || lastG !== "G00") {
      moveCmd += "G00";
      lastG = "G00";
    }
    if (xc !== lastX) moveCmd += "X" + X(xc);
    if (yc !== lastY) moveCmd += "Y" + X(yc);
    if (!moveCmd) moveCmd = "X" + X(xc);
    push(moveCmd);
    lastX = xc;
    lastY = yc;
    let appCmd = idx === 0 || lastG !== "G00" ? "G00" : "";
    appCmd += "Z" + X(approachHeight);
    push(appCmd);
    lastG = "G00";
    for (let pIdx = 0; pIdx < depths.length; pIdx++) {
      if (pIdx === 0) {
        push("G01Z" + X(depths[pIdx]) + plungeFeed);
      } else {
        push("G01Z" + X(depths[pIdx]) + plungeFeed);
      }
      lastG = "G01";
      push(gCode + "I" + Math.abs(iVal) + "D" + dNum + cutFeed);
      lastG = gCode;
    }
    push("G00Z" + X(safeZ));
    lastG = "G00";
  }
  let retCmd = lastG !== "G00" ? "G00" : "";
  retCmd += "X0Y0";
  push(retCmd);
  return {
    frames,
    warnings,
    passes: circles.length * depths.length,
    operations: circles.map((circle) => ({
      circularCycle: true,
      entry: { ...circle.c },
      exit: { ...circle.c },
      attachment: { x: circle.c.x + circle.r, y: circle.c.y },
      entryRadius: (circle.r - radius) / 2,
      programEntryRadius: (circle.r - radius) / 2,
    })),
    toolKind: "mill",
    g12: true,
    compensation: {
      kind: "g12",
      number: Number(dNum),
      tableValue: radius,
      physicalPreview: false,
    },
  };
}
export { getCircle, calculateDepths, generateG12 };
