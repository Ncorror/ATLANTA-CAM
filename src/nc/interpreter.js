import { EPS, P, PI, TAU, add, angle, dist, left, len, mul, sub, unit } from "../core/math.js";
import { planeInfo, planeToLocal, planeToWorld } from "../core/planes.js";
import { sweep } from "../core/segments.js";
import { cycleDepths, motionLength, motionMinutes, peckCount } from "./motion.js";
import { tokenizeNC } from "./tokenizer.js";
import { repeatExecution } from "./g25-execution.js";
function parseNC(text, profile = {}) {
  const drillCycles = [73, 81, 82, 83, 85, 89];
  const cfg = { coordScale: 1000, feedScale: 10, decimal: false, ...profile },
    lines = text.replace(/\r/g, "").split("\n"),
    motions = [],
    errors = [],
    warnings = [],
    records = [],
    sections = [];
  const val = (w, feed = false) =>
    cfg.decimal ? +w.raw : +w.raw / (feed ? cfg.feedScale : cfg.coordScale);
  const spindleDigits = cfg.spindleDigits === 2 ? 2 : 4;
  const toolDigits = cfg.toolDigits === 5 ? 5 : 2;
  if (cfg.machine === "fanuc3000c" && spindleDigits === 4 && toolDigits === 5)
    errors.push(
      "Профиль: опции S4/T5/B3 взаимоисключающие (§3.3, примечание 6, с. 20). Выбери S4/T2 или S2/T5.",
    );
  let p = { x: 0, y: 0, z: 30 },
    absolute = cfg.machine !== "fanuc3000c",
    mode = 0,
    comp = 40,
    feed = 0,
    feedSet = false,
    plane = 17,
    planeExplicit = false,
    section = 0,
    cycle = null,
    ret = 98,
    units = 1,
    feedMode = 94,
    ended = false,
    tapeDataSeen = false,
    cornerOffsets = 0,
    selectedCorrector = 0;
  const cycleData = { q: 0, seconds: 0, r: null };
  const notedCorrections = {};
  let notedToolRadius = null;
  const correctionWarnings = new Set();
  sections.push({ index: 0, start: 0, label: "1 · Начало" });
  const repeats = cfg.machine === "fanuc3000c" ? repeatExecution(lines) : null,
    sourceRecords = repeats ? new Array(lines.length) : null;
  if (repeats !== null && repeats !== void 0 && repeats.errors.length)
    return {
      motions,
      errors: repeats.errors,
      warnings,
      records,
      sections: [],
      minutes: 0,
      lines,
      repeats: [],
      sourceRecords,
    };
  let executionIndex = 0,
    step = null;
  const annotate = (row) => {
    var _step;
    return repeats
      ? Object.assign(
          row,
          ((_step = step) === null || _step === void 0 ? void 0 : _step.meta) || {},
          { executionIndex },
        )
      : row;
  };
  const record = (row) => {
    annotate(row);
    records.push(row);
    if (sourceRecords && !sourceRecords[row.line - 1]) sourceRecords[row.line - 1] = row;
    if (row.searchOnly || row.ended) return;
    const ms = row.words.filter((w) => w.letter === "M").map((w) => w.value);
    if (ms.some((m) => m === 0 || m === 1) && row.line < lines.length) {
      sections[section].end = row.line - 1;
      section++;
      sections.push({
        index: section,
        start: row.line,
        label: section + 1 + " · После строки " + row.line,
      });
    }
    if (ms.some((m) => m === 2 || m === 30)) ended = true;
  };
  function warn(s) {
    warnings.push(s);
  }
  function err(i, s) {
    errors.push("Строка " + (i + 1) + ": " + s);
  }
  function emit(type, to, i, extras = {}) {
    if (motions.length >= 100000)
      throw Error(
        "Для просмотра в 32 bit слишком много перемещений: более 100000. Разделите программу.",
      );
    if (![to.x, to.y, to.z].every(Number.isFinite)) {
      err(i, "неверная координата");
      return;
    }
    const m = annotate({
      type,
      a: { ...p },
      b: { ...to },
      line: i + 1,
      section,
      feed,
      comp,
      ...(plane === 17 ? {} : { plane }),
      ...extras,
    });
    if (type === "dwell" ? extras.seconds > 0 : motionLength(m) > EPS) motions.push(m);
    p = { ...to };
  }
  for (
    executionIndex = 0;
    executionIndex < (repeats ? repeats.steps.length : lines.length);
    executionIndex++
  ) {
    var _step2;
    step = repeats ? repeats.steps[executionIndex] : null;
    const i = step ? step.index : executionIndex;
    const source = lines[i].replace(/\*\s*$/, "");
    if (!(step && step.searchOnly)) {
      const toolNote = /\(\s*(?:MILL\s+DIA|ФРЕЗА)[^)]*<\s*(\d+(?:\.\d+)?)\s*\)/i.exec(source);
      if (toolNote) notedToolRadius = Number(toolNote[1]) / 2;
      const correctionNote = /ATLANTA\s+[DH](\d{1,2})=([+-]?\d+(?:\.\d+)?)\s+MM/i.exec(source);
      if (correctionNote) notedCorrections[Number(correctionNote[1])] = Number(correctionNote[2]);
    }
    const t = repeats ? repeats.frames[i] : tokenizeNC(source),
      w = t.words,
      get = (a) => w.findLast((x) => x.letter === a),
      gs = w.filter((x) => x.letter === "G").map((x) => x.value),
      ms = w.filter((x) => x.letter === "M").map((x) => x.value);
    if (ended) {
      if (w.some((x) => x.letter !== "N") || (t.code.trim() && t.code.trim() !== "%"))
        warn("После окончания программы есть код: он не исполняется и не показывается.");
      record({ line: i + 1, section, words: w, ended: true });
      continue;
    }
    if (cfg.machine === "fanuc3000c" && t.code.trim() === "%") {
      const tapeEnd = tapeDataSeen;
      record({ line: i + 1, section, words: w, tapeEnd });
      if (tapeEnd) ended = true;
      continue;
    }
    if (w.length) tapeDataSeen = true;
    const remainder = t.code
      .replace(/([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/gi, "")
      .replace(/[\s%/]/g, "");
    if (remainder) err(i, "неразобранные символы/выражения: " + remainder.slice(0, 35));
    if (
      !cfg.decimal &&
      w.some(
        (x) =>
          ["X", "Y", "Z", "I", "J", "K", "R", "Q", "F"].includes(x.letter) && x.raw.includes("."),
      )
    )
      err(i, "десятичная точка в профиле целых чисел. Выберите правильный формат.");
    const sequence = get("N");
    if (
      cfg.machine === "fanuc3000c" &&
      sequence &&
      /^\d{3}(?:73|81|82|83|85|89)$/.test(sequence.raw) &&
      get("Z") &&
      get("R") &&
      !gs.some((g) => drillCycles.includes(g))
    ) {
      err(
        i,
        "Кадр " +
          sequence.letter +
          sequence.raw +
          ": похоже, пропущена G перед номером цикла сверления. Сверь с оригиналом.",
      );
      record({ line: i + 1, section, words: w });
      continue;
    }
    if (
      !cfg.decimal &&
      w.some(
        (x) => x.letter === "N" && (x.raw.length > 3 || x.value < 0 || !Number.isInteger(x.value)),
      )
    )
      err(
        i,
        "Для FANUC 3000C используются номера N000–N999 (три цифры); чужая нумерация не переносится автоматически.",
      );
    if (!w.length) {
      record({ line: i + 1, section, words: w });
      continue;
    }
    const fanuc = cfg.machine === "fanuc3000c";
    if (fanuc && t.code.includes("%"))
      err(
        i,
        "Знак % внутри кадра вызывает останов и сброс (§3.20, с. 100). В просмотре размещай % отдельной строкой.",
      );
    if (fanuc)
      for (const word of w) {
        if (!"NGXYZIJKRQFSDHTMPLABCUVW".includes(word.letter))
          err(
            i,
            "Адрес " +
              word.letter +
              " не поддерживается выбранным ISO-профилем FANUC 3000C (§3.9, с. 25–26). Степенная запись чисел не допускается.",
          );
      }
    const allowedG = fanuc
      ? [
          0, 1, 2, 3, 4, 12, 13, 17, 18, 19, 25, 38, 39, 40, 41, 42, 73, 80, 81, 82, 83, 85, 89, 90,
          91, 92, 98, 99,
        ]
      : [
          0, 1, 2, 3, 4, 17, 18, 19, 20, 21, 40, 41, 42, 43, 44, 49, 54, 55, 56, 57, 58, 59, 73, 80,
          81, 82, 83, 85, 89, 90, 91, 92, 94, 95, 98, 99,
        ];
    for (const g of gs) {
      if (!allowedG.includes(g)) {
        const reason =
          fanuc && [12, 13].includes(g)
            ? " — цикл круговой поверхности (§3.12.5), с заходом и возвратом в центр; в этой версии не моделируется"
            : fanuc && [14, 15].includes(g)
              ? " — спираль типа A (§3.12.6); в этой версии не моделируется"
              : fanuc && [43, 44, 45, 46, 47, 48, 49].includes(g)
                ? " — коррекция длины A/B; для её расчёта нужна таблица станка, эта версия её не моделирует"
                : fanuc && [20, 21, 54, 55, 56, 57, 58, 59, 94, 95].includes(g)
                  ? " отсутствует в таблице G-кодов FANUC 3000C (§3.12, с. 33–34)"
                  : " не поддерживается";
        err(i, "G" + g + reason + ". Траектория не может считаться проверенной.");
      }
      if (!fanuc && [54, 55, 56, 57, 58, 59, 43, 44, 49].includes(g))
        warn(
          "Рабочие/длиновые коррекции показываются в программных координатах без таблицы станка.",
        );
    }
    if (fanuc) {
      const count = cfg.correctorCount === 64 ? 64 : 32;
      for (const word of w.filter((word) => ["D", "H"].includes(word.letter))) {
        if (
          !Number.isInteger(word.value) ||
          word.value < 0 ||
          word.value >= count ||
          word.raw.length > 2
        )
          err(
            i,
            "В профиле с " + count + " корректорами допустимы D/H00–" + (count - 1) + " (§3.13).",
          );
      }
      if (!gs.includes(4))
        for (const word of w.filter((word) => "XYZIJKRQ".includes(word.letter))) {
          if (Math.abs(word.value) > 8388607)
            err(
              i,
              "Слово " +
                word.letter +
                " превышает ±8388607 отсчётов (±8388,607 мм для M2V; §3.7, с. 24; приложение 2.3, с. 196).",
            );
        }
      for (const word of w.filter((word) => word.letter === "G")) {
        if (
          !Number.isInteger(word.value) ||
          word.value < 0 ||
          word.value > 99 ||
          word.raw.replace(/[+-]/g, "").length > 2
        )
          err(i, "Формат G2 допускает коды G00–G99, до двух цифр (§3.3, с. 19).");
      }
      for (const word of w.filter((word) => word.letter === "M")) {
        if (
          !Number.isInteger(word.value) ||
          word.value < 0 ||
          word.value > 99 ||
          word.raw.replace(/[+-]/g, "").length > 2
        )
          err(i, "Для FANUC 3000C допустимы целые M00–M99 (§3.17, с. 96).");
      }
      for (const word of w.filter((word) => word.letter === "S" || word.letter === "T")) {
        const digits = word.letter === "S" ? spindleDigits : toolDigits;
        if (
          !Number.isInteger(word.value) ||
          word.value < 0 ||
          word.value >= Math.pow(10, digits) ||
          word.raw.replace(/[+-]/g, "").length > digits
        )
          err(
            i,
            "Выбран формат " +
              word.letter +
              digits +
              ": допустимы целые " +
              word.letter +
              "0–" +
              (Math.pow(10, digits) - 1) +
              " (§3.14–3.15, с. 95).",
          );
      }
      if (
        gs.filter((g) =>
          [4, 12, 13, 25, 27, 28, 29, 38, 39, 43, 44, 45, 46, 47, 48, 49, 92].includes(g),
        ).length > 1
      )
        err(i, "В одном кадре допустима только одна немодальная команда группы * (§3.12).");
    }
    if (!gs.includes(4) && w.some((x) => ["A", "B", "C", "U", "V", "W"].includes(x.letter)))
      err(i, "поворотные/дополнительные оси не поддерживаются.");
    if (ms.some((x) => [98, 99].includes(x)) || /[#\[\]]/.test(t.code))
      err(i, "макросы/подпрограммы M98/M99 не разворачиваются.");
    if (t.code.trim().startsWith("/"))
      err(i, "условный пропуск кадра: исполнение зависит от переключателя станка.");
    const previousPlane = plane,
      previousComp = comp,
      previousAbsolute = absolute;
    const requestedCycle = gs.findLast((g) => g === 80 || drillCycles.includes(g));
    const requestedMotion = gs.findLast((g) => [0, 1, 2, 3].includes(g));
    const cycleActiveForBlock =
      requestedCycle !== undefined
        ? requestedCycle !== 80
        : !!cycle && requestedMotion === undefined;
    const ignoredCompensation =
      fanuc && cycleActiveForBlock && gs.some((g) => [38, 39, 40, 41, 42].includes(g));
    const absoluteFor = (letter) => {
      if (!fanuc) return absolute;
      let value = previousAbsolute;
      const selected = get(letter);
      for (const word of w) {
        if (word.letter === "G" && [90, 91].includes(word.value)) value = word.value === 90;
        if (word === selected) return value;
      }
      return absolute;
    };
    for (const g of gs) {
      if (g === 90) absolute = true;
      if (g === 91) absolute = false;
      if ([17, 18, 19].includes(g)) {
        plane = g;
        planeExplicit = true;
      }
      if ([40, 41, 42].includes(g) && !ignoredCompensation) comp = g;
      if (g === 20) units = 25.4;
      if (g === 21) units = 1;
      if ([94, 95].includes(g)) feedMode = g;
      if (g === 98 || g === 99) ret = g;
    }
    if (!fanuc && previousPlane !== plane && previousComp !== 40 && !gs.includes(40))
      err(i, "Перед сменой плоскости отмени коррекцию через G40.");
    if (feedMode === 95) err(i, "G95: подача на оборот не поддерживается для расчёта времени.");
    const fw = get("F");
    if (fw && !gs.includes(4)) {
      feed = val(fw, true) * units;
      feedSet = true;
      if (feed < 0) err(i, "Подача F не может быть отрицательной.");
      if (fanuc && feed > 3600)
        err(i, "Подача превышает 3600,0 мм/мин для метрического профиля M2V (§3.11.3).");
      if (!cfg.decimal && fw.value !== 0 && fw.raw.replace(/[+-]/g, "").length === 1)
        err(
          i,
          "однозначный F" +
            fw.raw +
            " может обозначать ступень подачи. Уточните формат/добавьте ведущий ноль.",
        );
    }
    const motionCode = gs.findLast((g) => [0, 1, 2, 3].includes(g));
    const blockMode = motionCode === undefined ? mode : motionCode;
    const corrector = w.findLast((word) => ["D", "H"].includes(word.letter));
    if (fanuc && !cycleActiveForBlock && !(step && step.searchOnly) && [2, 3].includes(blockMode)) {
      if (comp !== previousComp)
        err(
          i,
          (comp === 40 ? "G40 отменяет вектор" : "Включение/смена стороны G41/G42 выполняется") +
            " только в G00/G01, не на дуге (§3.12.10, с. 59–60).",
        );
      if (comp !== 40 && corrector && corrector.value !== selectedCorrector && !gs.includes(38))
        err(
          i,
          "Смена D/H при G41/G42 допустима только в G00/G01; для перезаписи вектора есть G38 (§3.12.10, с. 60).",
        );
    }
    if (corrector) selectedCorrector = corrector.value;
    if ((_step2 = step) !== null && _step2 !== void 0 && _step2.searchOnly) {
      const motion = gs.findLast((g) => g >= 0 && g <= 3);
      if (motion !== undefined) {
        mode = motion;
        cycle = null;
        cycleData.r = null;
      }
      if (gs.includes(80)) {
        cycle = null;
        cycleData.r = null;
      }
      const drilling = gs.find((g) => drillCycles.includes(g)),
        normal = planeInfo(fanuc ? 17 : plane).axes[2].toLowerCase(),
        ref = p[normal];
      if (drilling !== undefined)
        cycle = cycle
          ? { ...cycle, g: drilling }
          : {
              g: drilling,
              plane: fanuc ? 17 : plane,
              r: ref,
              z: ref,
              initial: ref,
              q: cycleData.q,
              seconds: cycleData.seconds,
              readyR: false,
              readyZ: false,
            };
      if (cycle && !gs.includes(4)) {
        if (get("R")) {
          cycle.r = absoluteFor("R")
            ? val(get("R")) * units
            : cycle.initial + val(get("R")) * units;
          cycle.readyR = true;
        }
        if (get(normal.toUpperCase())) {
          cycle.z = absoluteFor(normal.toUpperCase())
            ? val(get(normal.toUpperCase())) * units
            : cycle.r + val(get(normal.toUpperCase())) * units;
          cycle.readyZ = true;
        }
        if (get("Q")) cycle.q = val(get("Q")) * units;
        if (get("P")) cycle.seconds = get("P").value / 1000;
        Object.assign(cycleData, {
          q: cycle.q,
          seconds: cycle.seconds,
          r: cycle.r,
        });
      }
      record({
        line: i + 1,
        section,
        words: w,
        absolute,
        mode,
        comp,
        plane,
        units,
        before: { ...p },
        after: { ...p },
        searchOnly: true,
      });
      continue;
    }
    if (repeats && gs.includes(25)) {
      Object.assign(cycleData, {
        q: val(get("Q")) * units,
        r: absolute ? val(get("R")) * units : p.z + val(get("R")) * units,
        seconds: get("P").value / 1000,
      });
      if (cycle) {
        Object.assign(cycle, cycleData);
      }
      record({
        line: i + 1,
        section,
        words: w,
        absolute,
        mode,
        comp,
        plane,
        units,
        before: { ...p },
        after: { ...p },
        repeatControl: true,
      });
      continue;
    }
    if (fanuc && gs.includes(38) && !ignoredCompensation) {
      const nextMode = gs.findLast((g) => [0, 1, 2, 3].includes(g));
      if (nextMode !== undefined) mode = nextMode;
      const offsets = planeInfo(planeExplicit ? plane : 17).offsets;
      const dx = get(offsets[0]) ? get(offsets[0]).value : 0;
      const dy = get(offsets[1]) ? get(offsets[1]).value : 0;
      if (
        comp === 40 ||
        cycle ||
        ![0, 1, 2, 3].includes(mode) ||
        !Number.isFinite(dx) ||
        !Number.isFinite(dy) ||
        (dx === 0 && dy === 0) ||
        w.some((word) => !("NGFDHMST" + offsets[0] + offsets[1]).includes(word.letter))
      ) {
        err(
          i,
          "G38: нужен ненулевой вектор " +
            offsets[0] +
            "/" +
            offsets[1] +
            " при G41/G42, без перемещения X/Y/Z (§3.12.10).",
        );
      }
      record({
        line: i + 1,
        section,
        words: w,
        absolute,
        mode,
        comp,
        plane: planeExplicit ? plane : 17,
        units,
        before: { ...p },
        after: { ...p },
        vectorRewrite: true,
        feed,
      });
      warn("G38 меняет вектор коррекции без перемещения инструмента (§3.12.10).");
      continue;
    }
    if (cfg.machine === "fanuc3000c" && gs.includes(39) && !ignoredCompensation) {
      const nextMode = gs.findLast((g) => [0, 1, 2, 3].includes(g));
      if (nextMode !== undefined) mode = nextMode;
      if (!planeExplicit) plane = 17;
      var _get$value, _get, _get$value2, _get2;
      const offsets = planeInfo(plane).offsets,
        dx =
          (_get$value =
            (_get = get(offsets[0])) === null || _get === void 0 ? void 0 : _get.value) !== null &&
          _get$value !== void 0
            ? _get$value
            : 0,
        dy =
          (_get$value2 =
            (_get2 = get(offsets[1])) === null || _get2 === void 0 ? void 0 : _get2.value) !==
            null && _get$value2 !== void 0
            ? _get$value2
            : 0;
      const vector = Number.isFinite(dx) && Number.isFinite(dy) && (dx !== 0 || dy !== 0);
      if (
        comp === 40 ||
        cycle ||
        gs.some((g) => ![0, 1, 2, 3, 17, 18, 19, 39, 90, 91, 98, 99].includes(g)) ||
        !vector ||
        w.some((word) => !("NGFMST" + offsets[0] + offsets[1]).includes(word.letter))
      ) {
        err(
          i,
          "G39 требует ненулевой вектор " +
            offsets[0] +
            "/" +
            offsets[1] +
            " при G41/G42 в G" +
            plane +
            ", без X/Y/Z. Команда не меняет модальную G00/G01/G02/G03.",
        );
      } else if (feed <= 0) err(i, "для угла G39 не задана режущая подача.");
      else cornerOffsets++;
      record({
        line: i + 1,
        section,
        words: w,
        absolute,
        mode,
        comp,
        plane,
        units,
        before: { ...p },
        after: { ...p },
        cornerOffset: true,
        feed,
      });
      continue;
    }
    const before = { ...p };
    if (gs.includes(92)) {
      for (const a of ["X", "Y", "Z"]) if (get(a)) p[a.toLowerCase()] = val(get(a)) * units;
      record({
        line: i + 1,
        section,
        words: w,
        absolute,
        mode,
        comp,
        plane,
        before,
        after: { ...p },
        g92: true,
        coordinateValues: Object.fromEntries(
          ["X", "Y", "Z"].filter((axis) => get(axis)).map((axis) => [axis, val(get(axis)) * units]),
        ),
      });
      continue;
    }
    const motionG = gs.findLast((g) => g >= 0 && g <= 3);
    if (motionG !== undefined) {
      mode = motionG;
      cycle = null;
      cycleData.r = null;
    }
    if (gs.includes(80)) {
      cycle = null;
      cycleData.r = null;
    }
    if (fanuc && !planeExplicit && !gs.some((g) => [4, 92].includes(g))) {
      plane = 17;
      if ([2, 3].includes(mode)) {
        const present = ["X", "Y", "Z"].filter((axis, index) => get(axis) || get("IJK"[index]));
        if (present.length === 2)
          plane = !present.includes("X") ? 19 : !present.includes("Y") ? 18 : 17;
      }
    }
    const cycleG = gs.findLast((g) => drillCycles.includes(g));
    const axes = planeInfo(fanuc && (cycle || cycleG !== undefined) ? 17 : plane),
      normal = axes.axes[2],
      normalKey = normal.toLowerCase();
    if (cycleG !== undefined) {
      const z = get(normal),
        r = get("R");
      const priorCycle = cycle;
      const ref = priorCycle ? priorCycle.initial : p[normalKey],
        rr = r ? val(r) * units : 0,
        zz = z ? val(z) * units : 0;
      cycle = {
        g: cycleG,
        plane: fanuc ? 17 : plane,
        r: r
          ? absoluteFor("R")
            ? rr
            : p[normalKey] + rr
          : priorCycle
            ? priorCycle.r
            : cycleData.r === null
              ? ref
              : cycleData.r,
        z: priorCycle ? priorCycle.z : ref,
        initial: ref,
        q: get("Q") ? val(get("Q")) * units : cycleData.q,
        seconds: get("P") ? get("P").value / 1000 : cycleData.seconds,
        readyR: !!r || (!!priorCycle && priorCycle.readyR),
        readyZ: !!z || (!!priorCycle && priorCycle.readyZ),
      };
      if (z) cycle.z = absoluteFor(normal) ? zz : cycle.r + zz;
    }
    if (gs.includes(4)) {
      const timers = w.filter((word) => "PXYZUVWABCF".includes(word.letter));
      const timer = timers[0];
      const seconds = timer
        ? fanuc
          ? timer.value / 1000
          : timer.letter === "P"
            ? timer.value / 1000
            : timer.value
        : 0;
      if (
        timers.length !== 1 ||
        seconds < 0 ||
        !Number.isFinite(seconds) ||
        (fanuc && (!Number.isInteger(timer.value) || seconds > 1048.575))
      )
        err(
          i,
          "G04: задай одно время P/X/Y/Z/U/V/W/A/B/C/F от 0 до 1048575 отсчётов (M2V: 1000 = 1 с, §3.12.4).",
        );
      else emit("dwell", { ...p }, i, { seconds });
      record({
        line: i + 1,
        section,
        words: w,
        absolute,
        mode,
        comp,
        plane,
        before,
        after: { ...p },
        dwell: true,
        seconds,
      });
      continue;
    }
    if (fanuc && gs.some((g) => g === 12 || g === 13)) {
      const g = gs.findLast((g) => g === 12 || g === 13);
      let correction = cfg.corrections && cfg.corrections[selectedCorrector];
      if (correction == null) correction = notedCorrections[selectedCorrector];
      if (correction == null && notedToolRadius != null) {
        correction = notedToolRadius;
        const key = selectedCorrector + ":" + correction;
        if (!correctionWarnings.has(key)) {
          warn(
            "G12/G13: D/H" +
              selectedCorrector +
              " принят равным радиусу " +
              correction +
              " мм из комментария инструмента. Сверь значение с таблицей станка.",
          );
          correctionWarnings.add(key);
        }
      }
      const radius = get("I") ? Math.abs(val(get("I")) * units) : NaN;
      const effective = radius - Number(correction);
      if (
        plane !== 17 ||
        cycle ||
        comp !== 40 ||
        gs.some((g) => [0, 1, 2, 3, 4, 25, 38, 39, 92].includes(g)) ||
        w.some((word) => "XYZJKRL".includes(word.letter))
      ) {
        err(
          i,
          "G12/G13: отдельный круговой цикл в XY, с G40 и G80, без перемещения XYZ (§3.12.5, с. 41).",
        );
      } else if (
        !Number.isFinite(radius) ||
        radius <= 0 ||
        correction == null ||
        !Number.isFinite(Number(correction)) ||
        effective <= 0
      ) {
        err(
          i,
          "G12/G13: нужны ненулевой радиус I и известное значение D/H; радиус траектории |I| − корректор должен быть положительным.",
        );
      } else if (!feedSet || feed <= 0) {
        err(i, "G12/G13: задай положительную рабочую подачу F.");
      } else {
        const center = { ...p },
          edge = { ...p, x: p.x + effective };
        const midpoint = { x: p.x + effective / 2, y: p.y },
          sign = g === 12 ? -1 : 1;
        emit("arc", edge, i, {
          c: midpoint,
          sw: sign * Math.PI,
          comp: 40,
          planarFeed: true,
          circularCycle: g,
        });
        emit("arc", edge, i, {
          c: { x: center.x, y: center.y },
          sw: sign * 2 * Math.PI,
          comp: 40,
          planarFeed: true,
          circularCycle: g,
        });
        emit("arc", center, i, {
          c: midpoint,
          sw: sign * Math.PI,
          comp: 40,
          planarFeed: true,
          circularCycle: g,
        });
      }
      record({
        line: i + 1,
        section,
        words: w,
        absolute,
        mode,
        comp,
        plane,
        before,
        after: { ...p },
        circularCycle: g,
        feed,
      });
      continue;
    }
    const hasAxis = w.some((x) => ["X", "Y", "Z"].includes(x.letter));
    if (
      fanuc &&
      step &&
      step.meta &&
      step.meta.cycleLastLine === i + 1 &&
      (cycleG !== undefined || (cycle && (hasAxis || get("L"))))
    )
      err(
        i,
        "G25: последний кадр Q повторяемого участка не должен выполнять постоянный цикл. Заверши участок кадром без перемещения, например G04 (§3.12.8, с. 47).",
      );
    if (cycle) {
      if (cycleG === undefined) {
        if (get("R"))
          cycle.r = absoluteFor("R") ? val(get("R")) * units : p[normalKey] + val(get("R")) * units;
        if (get(normal))
          cycle.z = absoluteFor(normal)
            ? val(get(normal)) * units
            : cycle.r + val(get(normal)) * units;
        if (get("Q")) cycle.q = val(get("Q")) * units;
        if (get("P")) cycle.seconds = get("P").value / 1000;
        if (get("R")) cycle.readyR = true;
        if (get(normal)) cycle.readyZ = true;
      }
      Object.assign(cycleData, {
        q: cycle.q,
        seconds: cycle.seconds,
        r: cycle.r,
      });
      if (
        cycle.seconds < 0 ||
        !Number.isFinite(cycle.seconds) ||
        (fanuc &&
          ((!Number.isInteger(cycle.seconds * 1000) &&
            Math.abs(cycle.seconds * 1000 - Math.round(cycle.seconds * 1000)) > 1e-7) ||
            cycle.seconds > 1048.575))
      )
        err(i, "P цикла: время выдержки должно быть 0–1048575 отсчётов, 1000 = 1 с.");
    }
    const passiveArc =
      fanuc &&
      !planeExplicit &&
      [2, 3].includes(mode) &&
      ![axes.axes[0], axes.axes[1], axes.offsets[0], axes.offsets[1], "R"].some((letter) =>
        get(letter),
      );
    if (ignoredCompensation)
      warn("Команды G38/G39/G40/G41/G42 в постоянном цикле не действуют (§3.12.13, с. 81).");
    if (cycle && (hasAxis || get("L"))) {
      const count = get("L") ? get("L").value : 1;
      const peck = cycle.g === 73 || cycle.g === 83;
      if (!cycle.readyR || !cycle.readyZ)
        err(
          i,
          "Перед первым выполнением цикла задай явные " +
            normal +
            " и R: G80 сбрасывает точки R/Z (§3.12.13, с. 83).",
        );
      else if (!fanuc && cycle.plane !== plane)
        err(i, "Перед сменой плоскости отмени цикл через G80.");
      else if (!(cycle.z < cycle.r)) err(i, "дно отверстия " + normal + " должно быть ниже R.");
      else if (peck && !(cycle.q > 0)) err(i, "G" + cycle.g + " требует положительного Q.");
      else if (peck && peckCount(cycle.r, cycle.z, cycle.q) > 3000)
        err(i, "более 3000 шагов Q на отверстие.");
      else if (!Number.isInteger(count) || count < 1 || count > 8388607)
        err(
          i,
          "Для просмотра цикла поддерживаются целые L1–8388607; L действует только в текущем кадре (§3.12.13).",
        );
      else if (
        count * (peck ? peckCount(cycle.r, cycle.z, cycle.q) * 3 + 3 : 6) + motions.length >
        100000
      )
        err(i, "Развёртка L/Q превышает предел просмотра 100000 перемещений. Раздели программу.");
      else {
        for (let hole = 0; hole < count; hole++) {
          const to = { ...p };
          for (const a of axes.axes.slice(0, 2))
            if (get(a))
              to[a.toLowerCase()] = (absoluteFor(a) ? 0 : p[a.toLowerCase()]) + val(get(a)) * units;
          if (to[normalKey] < cycle.r) {
            emit("rapid", { ...p, [normalKey]: cycle.r }, i, {
              cycle: true,
              plane: fanuc ? 17 : plane,
            });
            to[normalKey] = p[normalKey];
          }
          emit("rapid", to, i, { cycle: true, plane: fanuc ? 17 : plane });
          emit("rapid", { ...p, [normalKey]: cycle.r }, i, {
            cycle: true,
            plane: fanuc ? 17 : plane,
          });
          const clearance = cfg.machine === "fanuc3000c" ? units : Math.min(0.5, cycle.q / 5);
          cycleDepths(cycle.g, cycle.r, cycle.z, cycle.q, clearance, (rapid, z) =>
            emit(
              rapid || (fanuc && feedSet && feed === 0) ? "rapid" : "feed",
              { ...p, [normalKey]: z },
              i,
              { cycle: true, plane: fanuc ? 17 : plane },
            ),
          );
          if ([82, 89].includes(cycle.g) && cycle.seconds > 0)
            emit("dwell", { ...p }, i, {
              seconds: cycle.seconds,
              cycle: true,
              plane: cycle.plane,
            });
          if ([85, 89].includes(cycle.g))
            emit(
              fanuc && feedSet && feed === 0 ? "rapid" : "feed",
              { ...p, [normalKey]: cycle.r },
              i,
              { cycle: true, plane: cycle.plane },
            );
          emit("rapid", { ...p, [normalKey]: ret === 99 ? cycle.r : cycle.initial }, i, {
            cycle: true,
            plane: fanuc ? 17 : plane,
          });
        }
      }
    } else if (
      !cycle &&
      !passiveArc &&
      (hasAxis || ([2, 3].includes(mode) && w.some((x) => ["I", "J", "K", "R"].includes(x.letter))))
    ) {
      const to = { ...p };
      for (const a of ["X", "Y", "Z"])
        if (get(a))
          to[a.toLowerCase()] = (absoluteFor(a) ? 0 : p[a.toLowerCase()]) + val(get(a)) * units;
      if (fanuc && !planeExplicit && [2, 3].includes(mode))
        to[axes.axes[2].toLowerCase()] = p[axes.axes[2].toLowerCase()];
      if (mode === 0) emit("rapid", to, i);
      else if (mode === 1) emit(fanuc && feedSet && feed === 0 ? "rapid" : "feed", to, i);
      else {
        let centre = null;
        const sign = (mode === 3 ? 1 : -1) * (planeInfo(plane).orientation || 1),
          a = planeToLocal(p, plane),
          b = planeToLocal(to, plane),
          ij = axes.offsets;
        if (fanuc && get("R"))
          err(
            i,
            "В FANUC 3000C центр G02/G03 задаётся I/J/K от начала дуги; запись дуги через R в §3.12.3 не предусмотрена.",
          );
        if (get(ij[2]) && (!fanuc || planeExplicit))
          err(
            i,
            "В G" +
              plane +
              " смещение центра задаётся " +
              ij[0] +
              "/" +
              ij[1] +
              ", без " +
              ij[2] +
              ".",
          );
        if (get(ij[0]) || get(ij[1]))
          centre = P(
            a.x + (get(ij[0]) ? val(get(ij[0])) * units : 0),
            a.y + (get(ij[1]) ? val(get(ij[1])) * units : 0),
          );
        else if (get("R")) {
          const r = val(get("R")) * units,
            v = sub(b, a),
            d = len(v),
            mid = mul(add(b, a), 0.5);
          if (Math.abs(r) <= EPS || d <= EPS || d > 2 * Math.abs(r) + 0.005)
            err(i, "некорректная дуга R");
          else {
            const h = Math.sqrt(Math.max(0, r * r - (d * d) / 4)),
              u = mul(left(unit(v)), h),
              cs = [add(mid, u), sub(mid, u)];
            centre =
              cs.find(
                (c) => Math.abs(sweep(angle(c, a), angle(c, b), sign)) <= PI + 0.00001 === r >= 0,
              ) || cs[0];
          }
        }
        if (!centre) {
          err(i, "у дуги нет " + ij[0] + "/" + ij[1] + " или R");
          emit("feed", to, i);
        } else {
          const r = dist(a, centre),
            r2 = dist(b, centre),
            delta = Math.abs(r - r2);
          if (r <= EPS) err(i, "нулевой радиус дуги");
          if (delta > Math.max(0.01, 2 / cfg.coordScale))
            err(i, "радиусы начала/конца дуги отличаются на " + delta.toFixed(4) + " мм");
          const sw = sweep(angle(centre, a), angle(centre, b), sign, dist(a, b) < EPS);
          if (fanuc && Math.abs(b.z - a.z) > EPS) {
            const pitch = (Math.abs(b.z - a.z) * TAU) / Math.abs(sw);
            if (
              (comp === 40 && pitch > 8 * PI * r + 1e-8) ||
              pitch > 1647096 / cfg.coordScale + 1e-8
            )
              err(i, "Шаг спирали типа B превышает предел §3.12.6: min(8πr, 1647096p).");
            if (comp !== 40)
              warn(
                "Для спирали с G41/G42 предел 8πr проверяется по радиусу центра инструмента после коррекции D/H (§3.12.6). В NC-просмотре таблица стойки не задана.",
              );
          }
          emit("arc", to, i, {
            c: plane === 17 ? centre : planeToWorld({ ...centre, z: a.z }, plane),
            sw,
            planarFeed: fanuc,
          });
        }
      }
    }
    record({
      line: i + 1,
      section,
      words: w,
      absolute,
      mode,
      comp,
      plane,
      cycle: !!cycle,
      incrementalAxes: fanuc && ["X", "Y", "Z"].some((axis) => get(axis) && !absoluteFor(axis)),
      coordinateModes: Object.fromEntries(
        ["X", "Y", "Z"].filter((axis) => get(axis)).map((axis) => [axis, absoluteFor(axis)]),
      ),
      coordinateValues: Object.fromEntries(
        ["X", "Y", "Z"].filter((axis) => get(axis)).map((axis) => [axis, val(get(axis)) * units]),
      ),
      planeExplicit,
      ignoredCompensation,
      units,
      before,
      after: { ...p },
    });
  }
  if (sections.length) sections.at(-1).end = lines.length - 1;
  const activity = new Map();
  for (const r of records) {
    const info = activity.get(r.section) || { axes: false, drill: false };
    for (const w of r.words) {
      if (["X", "Y", "Z"].includes(w.letter)) info.axes = true;
      if (w.letter === "G" && drillCycles.includes(w.value)) info.drill = true;
    }
    activity.set(r.section, info);
  }
  const active = sections.filter((s) => {
    var _activity$get;
    return (_activity$get = activity.get(s.index)) === null || _activity$get === void 0
      ? void 0
      : _activity$get.axes;
  });
  for (const s of active)
    s.label =
      s.index +
      1 +
      " · " +
      (activity.get(s.index).drill ? "Сверление" : "Фрезерование/перемещения") +
      " · строки " +
      (s.start + 1) +
      "–" +
      (s.end + 1);
  if (motions.some((m) => m.comp !== 40))
    warn(
      "G41/G42: показан программный контур. Центр фрезы и заход с коррекцией рассчитывает стойка; здесь они не моделируются.",
    );
  if (cornerOffsets)
    warn(
      "G39: дуги коррекции на углах выполняет стойка по радиусу D. В просмотре показаны вершины программного контура.",
    );
  for (const m of motions) {
    const plane = m.plane || 17,
      a = planeToLocal(m.a, plane),
      b = planeToLocal(m.b, plane);
    if (
      m.type === "rapid" &&
      ((!m.cycle && b.z < -0.001) || (Math.min(a.z, b.z) < -0.001 && dist(a, b) > 0.001))
    )
      warn(
        "Есть G00 ниже " +
          planeInfo(plane).axes[2] +
          "0 (например, строка " +
          m.line +
          "). Проверьте свободное место/заготовку.",
      );
    if (!["rapid", "dwell"].includes(m.type) && m.feed <= 0)
      err(m.line - 1, "режущая подача не задана.");
  }
  if ((repeats || cfg.machine === "fanuc3000c") && errors.length) motions.length = 0;
  const minutes = motions.reduce((s, m) => s + motionMinutes(m), 0);
  return {
    motions,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    records,
    sections: active,
    minutes,
    lines,
    ...(repeats ? { sourceRecords, repeats: repeats.cycles.map(({ a, b, ...c }) => c) } : {}),
  };
}
export { parseNC };
