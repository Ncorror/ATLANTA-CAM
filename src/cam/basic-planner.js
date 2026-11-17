import { EPS, P, PI, add, angle, copy, dist, left, mul } from "../core/math.js";
import { arc, area, bounds, line, slen, sweep, tangent } from "../core/segments.js";
import { selfIntersects } from "../core/spatial.js";
import { lineSegmentDistance, offsetContour, oriented } from "../core/contours.js";
import {
  arcFeed,
  compactArcMoves,
  compactArcWords,
  feedFmt,
  feedPath,
  fmt,
  isFullArc,
  modalFeed,
  roundArcCentre,
  splitArcs,
} from "../nc/format.js";
import { motionLength } from "../nc/motion.js";
import { parseNC } from "../nc/interpreter.js";
function generate(contours, c) {
  c = { ...c };
  const marking = c.toolKind === "scribe";
  if (marking) {
    c.diameter = 0.001;
    c.lead = 0;
    c.allowance = 0;
    c.stockAllowance = 0;
    c.slowArcs = false;
    c.stockShape = "none";
    c.allowPlunge = true;
  }
  const numeric = [
    "diameter",
    "depth",
    "stepDown",
    "feed",
    "plunge",
    "safeZ",
    "topZ",
    "initialZ",
    "initialX",
    "initialY",
    "approach",
    "endZ",
    "lead",
    "allowance",
    "stockAllowance",
    "stepOver",
    "coordScale",
    "feedScale",
    "originX",
    "originY",
    "tolerance",
    "rpm",
    "flutes",
  ];
  for (const k of numeric) if (!Number.isFinite(+c[k])) throw Error("Неверное значение: " + k);
  if (
    c.diameter <= 0 ||
    c.depth <= 0 ||
    c.stepDown <= 0 ||
    c.feed <= 0 ||
    c.plunge <= 0 ||
    c.tolerance <= 0 ||
    c.coordScale <= 0 ||
    c.feedScale <= 0
  )
    throw Error("Диаметр, глубина, шаг, подачи, допуск и масштабы должны быть больше нуля.");
  if (
    c.safeZ <= c.topZ ||
    c.approach <= 0 ||
    c.topZ + c.approach > c.safeZ ||
    c.endZ < c.safeZ ||
    c.initialZ < c.safeZ
  )
    throw Error(
      "Нужно: начальный Z ≥ безопасного Z > Z верха; Z окончания ≥ безопасного; подход выше верха и не выше безопасного Z.",
    );
  if (c.allowance < 0 || c.stockAllowance < 0 || c.lead < 0 || c.stepOver <= 0)
    throw Error("Припуски/заход неотрицательны, радиальный шаг больше нуля.");
  const chosen = contours
    .filter((x) => x.enabled)
    .flatMap((contour) => {
      const plan = c.preparedPaths && c.preparedPaths[contour.id];
      return plan
        ? plan.paths.map((path, index) => ({
            ...contour,
            id: contour.id + "p" + index,
            sourceId: contour.id,
            preparedPath: path,
            effectiveAllowance: plan.allowance,
          }))
        : [contour];
    });
  if (!chosen.length) throw Error("Выберите хотя бы один контур.");
  const n = Math.ceil(c.depth / c.stepDown);
  if (n > 2000) throw Error("Слишком много проходов по Z (лимит 2000).");
  const warnings = [],
    operations = [],
    motions = [],
    commands = [];
  let pos = { x: c.initialX, y: c.initialY, z: c.initialZ },
    collapsed = 0;
  const X = (v) => fmt(v, c.coordScale, c.decimal),
    F = (v) => feedFmt(v, c),
    Q = (v) => +X(v) / (c.decimal ? 1 : c.coordScale),
    shift = (p) => P(p.x - c.originX, p.y - c.originY);
  pos = { x: Q(pos.x), y: Q(pos.y), z: Q(pos.z) };
  const feedState = {},
    push = (t) => {
      if (commands.length >= 50000)
        throw Error(
          "Для лёгкого режима 32 bit программа ограничена 50000 кадрами. Разделите обработку.",
        );
      commands.push(modalFeed(t, feedState));
    },
    move = (type, p, z, feed, extra = {}) => {
      const to = { x: Q(p.x), y: Q(p.y), z: Q(z) };
      const m = {
        type,
        a: { ...pos },
        b: to,
        feed: feed ? +F(feed) / (c.decimal ? 1 : c.feedScale) : 0,
        ...extra,
      };
      motions.push(m);
      pos = to;
      return m;
    };
  const rapidZ = (z) => {
    const command = "G00Z" + X(z);
    if (commands.at(-1) !== command) {
      push(command);
      move("rapid", P(pos.x, pos.y), z, 0);
    }
  };
  push("G90G17G40G80");
  if (c.useG92) push("G92X" + X(c.initialX) + "Y" + X(c.initialY) + "Z" + X(c.initialZ));
  if (c.spindleCommand) {
    if (!Number.isInteger(c.rpm) || c.rpm < 1)
      throw Error("Для S нужны целые положительные обороты.");
    push("S" + c.rpm + "M03");
  }
  if (c.coolant) push("M08");
  rapidZ(c.safeZ);
  for (const contour of chosen) {
    var _contour$effectiveAll;
    if (contour.ambiguous)
      throw Error("Контур " + contour.id + ": разветвление. Разделите элементы по слоям.");
    const side = marking ? "on" : contour.side === "auto" ? contour.autoSide : contour.side;
    if (!contour.closed && side !== "on")
      throw Error("Разомкнутый контур " + contour.id + ": доступна обработка по линии.");
    if (!marking && contour.closed && selfIntersects(contour.segs, Math.max(c.tolerance, 0.02)))
      throw Error("Контур " + contour.id + " пересекает себя.");
    const allowance =
      (_contour$effectiveAll = contour.effectiveAllowance) !== null &&
      _contour$effectiveAll !== void 0
        ? _contour$effectiveAll
        : c.allowance;
    let base = oriented(contour, side, "ccw");
    const depths = Array.from(
      { length: n },
      (_, i) => c.topZ - Math.min(c.depth, (i + 1) * c.stepDown),
    );
    const nr = side === "on" ? 1 : Math.max(1, Math.ceil(c.stockAllowance / c.stepOver) + 1);
    if (nr > 2000 || nr * n > 10000) throw Error("Слишком много проходов.");
    const extra =
      side === "on"
        ? [0]
        : Array.from({ length: nr }, (_, i) => Math.max(0, c.stockAllowance - i * c.stepOver));
    if (side === "on" && !marking && !contour.openWall && !contour.wallNetwork)
      warnings.push(
        "Контур " +
          contour.id +
          ": центр фрезы идёт по линии. Ширина обработки равна диаметру инструмента.",
      );
    for (const z of depths)
      for (const ex of extra) {
        const offset =
          side === "on" ? 0 : (c.diameter / 2 + allowance + ex) * (side === "outside" ? -1 : 1);
        let path = contour.preparedPath
          ? contour.preparedPath.map((s) =>
              s.type === "L" ? line(s.a, s.b) : arc(s.a, s.b, s.c, s.sw),
            )
          : side === "on"
            ? base
            : offsetContour(base, offset, c.tolerance);
        const desired = oriented(
          { segs: path, closed: contour.closed },
          side,
          contour.wallDirection || c.direction,
        );
        path = splitArcs(desired);
        if (c.startPoint && contour.closed && !c.entryPlanner) {
          let best = 0,
            near = Infinity;
          for (let i = 0; i < path.length; i++) {
            const d = dist(path[i].a, c.startPoint);
            if (d < near) {
              near = d;
              best = i;
            }
          }
          path = [...path.slice(best), ...path.slice(0, best)];
        }
        const arcEntry =
          !marking && c.entryPlanner
            ? c.entryPlanner({
                contour,
                path,
                side,
                allowance,
                radialExtra: ex,
              })
            : null;
        if (arcEntry) path = arcEntry.path;
        let start = path[0].a,
          entry = copy(start),
          exit = copy(path.at(-1).b);
        if (arcEntry) {
          entry = arcEntry.entry;
          exit = arcEntry.exit;
        }
        if (!arcEntry && c.lead > 0 && side !== "on") {
          const signed = area(path),
            normal = mul(left(tangent(path[0])), (side === "outside" ? -1 : 1) * Math.sign(signed)),
            en = mul(
              left(tangent(path.at(-1), true)),
              (side === "outside" ? -1 : 1) * Math.sign(signed),
            );
          const lengths = c.autoLead ? [c.lead, c.lead / 2, c.lead / 4, c.lead / 8, 0] : [c.lead];
          if (c.autoLead && c.stockShape === "circle" && side === "outside" && !c.allowPlunge)
            lengths.push(c.lead * 2, c.lead * 4, Math.max(c.lead, c.stockDia + c.diameter));
          const walls = (!contour.preparedPath && c.entryWalls) || base;
          let used = null;
          for (const length of lengths) {
            const ep = add(start, mul(normal, length)),
              xp = add(path.at(-1).b, mul(en, length)),
              leads = [line(ep, start), line(path.at(-1).b, xp)];
            const clear = leads.every((l) =>
              walls.every((s) => lineSegmentDistance(l, s) >= c.diameter / 2 + allowance - 0.005),
            );
            const free =
              c.stockShape !== "circle" ||
              c.allowPlunge ||
              dist(shift(ep), P(c.stockX, c.stockY)) >= c.stockDia / 2 + c.diameter / 2 + 0.001;
            if (clear && free) {
              entry = ep;
              exit = xp;
              used = length;
              break;
            }
          }
          if (used === null)
            throw Error(
              "Заход/выход пересекает деталь или вход находится в заготовке. Измените начало/длину захода; для внутреннего контура нужен подготовленный вход.",
            );
          if (Math.abs(used - c.lead) > 0.00001)
            warnings.push(
              "Контур " +
                contour.id +
                ": длина захода автоматически " +
                used.toFixed(3) +
                " мм, чтобы сохранить зазор до контура.",
            );
        }
        if (c.stockShape === "circle") {
          if (!(c.stockDia > 0)) throw Error("Диаметр заготовки должен быть больше нуля.");
          const clear = dist(shift(entry), P(c.stockX, c.stockY)) - c.stockDia / 2 - c.diameter / 2;
          if (clear < 0.001 && !c.allowPlunge)
            throw Error(
              "Точка опускания фрезы находится в кругляке. Увеличьте заход/выберите старт или разрешите осевое врезание подходящей фрезой.",
            );
        } else if (!c.allowPlunge)
          warnings.push(
            "Заготовка не задана: проверьте, что вертикальный вход находится в свободном месте.",
          );
        const sp = shift(start),
          ep = shift(entry),
          xp = shift(exit);
        const operation = {
          contour: contour.sourceId || contour.id,
          preserveJunctions: !!contour.preserveJunctions,
          z,
          side,
          path,
          entry,
          exit,
          offset,
          radialExtra: ex,
        };
        if (contour.openWall) {
          var _contour$openWallInfo;
          operation.openWall = true;
          if (
            (_contour$openWallInfo = contour.openWallInfo) !== null &&
            _contour$openWallInfo !== void 0 &&
            _contour$openWallInfo.entryRadius
          )
            operation.entryRadius = contour.openWallInfo.entryRadius;
          if (contour.entryHandled) {
            const info = contour.openWallInfo;
            Object.assign(operation, {
              path: info.wallPath,
              leadIn: info.leadIn,
              leadOut: info.leadOut,
              attachment: info.attachment,
              entry: info.entry,
              exit: info.exit,
              manualEntry: info.manualEntry,
              openBoundary: true,
              entryStartSpace: "tool",
            });
          }
        }
        if (contour.wallNetwork) operation.wallNetwork = true;
        if (arcEntry)
          Object.assign(operation, {
            leadIn: arcEntry.leadIn,
            leadOut: arcEntry.leadOut,
            entryRadius: arcEntry.radius,
            attachment: arcEntry.attachment,
            manualEntry: !!c.startPoint,
          });
        operations.push(operation);
        rapidZ(c.safeZ);
        push("G00X" + X(ep.x) + "Y" + X(ep.y));
        move("rapid", ep, c.safeZ, 0);
        rapidZ(c.topZ + c.approach);
        push("G01Z" + X(z) + "F" + F(c.plunge));
        move("feed", ep, z, c.plunge, { stage: "plunge" });
        if (!arcEntry && dist(ep, sp) > EPS) {
          push("G01X" + X(sp.x) + "Y" + X(sp.y) + "F" + F(c.feed));
          move("feed", sp, z, c.feed, { stage: "lead" });
        }
        const leadMoves = (segments) =>
            segments.map((segment) => ({
              segment,
              feed: segment.type === "A" ? arcFeed(c) : c.feed,
              stage: "lead",
            })),
          travel = arcEntry
            ? [
                ...leadMoves(arcEntry.leadIn),
                ...feedPath(path, base, side, c, contour.closed),
                ...leadMoves(arcEntry.leadOut),
              ]
            : feedPath(path, base, side, c, contour.closed);
        const plannedTravel =
          c.machine === "fanuc3000c" && !contour.preserveJunctions
            ? compactArcMoves(travel)
            : travel;
        for (const planned of plannedTravel) {
          const s = planned.segment,
            a = P(pos.x, pos.y),
            nominalB = shift(s.b),
            b = P(Q(nominalB.x), Q(nominalB.y)),
            f = planned.feed;
          if (dist(a, b) < EPS && !isFullArc(s)) {
            if (s.type === "A" && Math.abs(s.sw) > PI / 2)
              throw Error(
                "Дуга схлопнулась после округления координат. Увеличьте масштаб/разрешение стойки.",
              );
            collapsed++;
            continue;
          }
          let cmd =
              (s.type === "L" ? "G01" : "G0" + (s.sw > 0 ? "3" : "2")) +
              "X" +
              X(b.x) +
              "Y" +
              X(b.y),
            centre,
            actualSweep;
          if (s.type === "A") {
            var _fit$sw;
            const p = shift(s.c),
              nearest = P(Q(p.x), Q(p.y)),
              scale = c.decimal ? 1000 : c.coordScale;
            const fanuc = c.machine === "fanuc3000c",
              r = dist(a, nearest) || dist(s.a, s.c);
            const limit = Math.min(
              fanuc ? PI / 4 : Infinity,
              Math.max(0.02, (c.tolerance * 4) / r),
            );
            const fit = fanuc ? roundArcCentre(a, b, p, s.sw, scale, limit) : null;
            centre = (fit === null || fit === void 0 ? void 0 : fit.centre) || nearest;
            if (dist(a, centre) < EPS) throw Error("Радиус дуги меньше разрешения стойки.");
            actualSweep =
              (_fit$sw = fit === null || fit === void 0 ? void 0 : fit.sw) !== null &&
              _fit$sw !== void 0
                ? _fit$sw
                : sweep(angle(centre, a), angle(centre, b), Math.sign(s.sw));
            if (Math.abs(actualSweep - s.sw) > limit) {
              if (slen(s) < 2 / (c.decimal ? 1000 : c.coordScale)) {
                collapsed++;
                continue;
              }
              throw Error(
                "Округление меняет направление/угол короткой дуги. Увеличьте масштаб или допуск аппроксимации.",
              );
            }
            cmd += "I" + X(centre.x - a.x) + "J" + X(centre.y - a.y);
          }
          cmd += "F" + F(f);
          push(cmd);
          move(s.type === "A" ? "arc" : "feed", b, z, f, {
            stage: planned.stage || "cut",
            c: centre,
            sw: actualSweep,
            contour: contour.sourceId || contour.id,
          });
        }
        if (!arcEntry && dist(shift(path.at(-1).b), xp) > EPS) {
          push("G01X" + X(xp.x) + "Y" + X(xp.y) + "F" + F(c.feed));
          move("feed", xp, z, c.feed, { stage: "lead" });
        }
        rapidZ(c.safeZ);
      }
  }
  if (c.coolant) push("M09");
  if (c.spindleCommand) push("M05");
  rapidZ(c.endZ);
  if (c.returnXY) {
    var _c$returnX, _c$returnY;
    const rx = (_c$returnX = c.returnX) !== null && _c$returnX !== void 0 ? _c$returnX : c.initialX,
      ry = (_c$returnY = c.returnY) !== null && _c$returnY !== void 0 ? _c$returnY : c.initialY;
    push("G00X" + X(rx) + "Y" + X(ry));
    move("rapid", P(rx, ry), c.endZ, 0);
  }
  push(c.endCode === "M30" ? "M30" : "M00");
  if (collapsed)
    warnings.push(
      "Пропущены элементы, схлопнувшиеся до одной точки после округления стойки: " +
        collapsed +
        ". Их размер меньше разрешения координат.",
    );
  const numbered = c.lineNumbers && commands.length <= 999;
  if (c.lineNumbers && !numbered)
    warnings.push("Более 999 кадров: номера N отключены целиком для формата N3.");
  const arcWordsState = {};
  const code =
    "%\r\n" +
    commands
      .map(
        (t, i) =>
          (numbered ? "N" + String(i + 1).padStart(3, "0") : "") +
          (c.machine === "fanuc3000c" ? compactArcWords(t, arcWordsState) : t),
      )
      .join("\r\n") +
    "\r\n%\r\n";
  const parsed = parseNC(code, {
    coordScale: c.coordScale,
    feedScale: c.feedScale,
    decimal: c.decimal,
    machine: c.machine,
    spindleDigits: c.spindleDigits,
    toolDigits: c.toolDigits,
    allowUnframed: true,
  });
  if (parsed.errors.length)
    throw Error("Ошибка проверки сгенерированного кода: " + parsed.errors[0]);
  const minutes = motions.reduce(
    (sum, m) => sum + (m.type === "rapid" ? 0 : motionLength(m) / (m.feed || 1)),
    0,
  );
  const codeMinutes = parsed.minutes;
  if (Math.abs(codeMinutes - minutes) > Math.max(0.005, minutes * 0.001))
    throw Error("Выгружаемый код отличается от рассчитанного пути после округления.");
  let motionIndex = 0;
  for (const pm of parsed.motions) {
    while (motionIndex < motions.length && motionLength(motions[motionIndex]) < EPS) motionIndex++;
    if (motionIndex < motions.length) {
      motions[motionIndex].line = pm.line;
      motions[motionIndex].command = parsed.lines[pm.line - 1];
      motionIndex++;
    }
  }
  return {
    code,
    motions,
    operations,
    warnings: [...new Set(warnings)],
    minutes,
    passes: operations.length,
    blocks: commands.length,
    toolKind: marking ? "scribe" : "mill",
    bounds: bounds(c.machine === "fanuc3000c" ? motions : motions.flatMap((m) => [m.a, m.b])),
  };
}
export { generate };
