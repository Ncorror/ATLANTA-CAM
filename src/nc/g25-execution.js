import { tokenizeNC } from "./tokenizer.js";
function repeatExecution(lines) {
  if (!lines.some((line) => /G\s*0*25(?![\d.])/i.test(line))) return null;
  if (lines.length > 50000)
    return {
      steps: [],
      cycles: [],
      errors: ["Для программы с G25 допустимо не более 50000 исходных строк; раздели программу."],
    };
  const frames = lines.map(tokenizeNC),
    has = (f) => f.words.some((w) => w.letter === "G" && w.value === 25);
  if (!frames.some(has)) return null;
  const maps = [],
    owners = [],
    steps = [],
    cycles = [],
    descriptors = new Map(),
    stack = new Set();
  let program = 0,
    stopped = false,
    tapeDataSeen = false;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.code.trim() === "%") program++;
    owners[i] = program;
    const map = maps[program] || (maps[program] = new Map()),
      n = f.words.findLast((w) => w.letter === "N");
    if (n) map.set(n.value, map.has(n.value) ? -1 : i);
    if (f.words.some((w) => w.letter === "M" && [2, 30].includes(w.value))) program++;
  }
  const fail = (i, message) => {
    const error = Error("Строка " + (i + 1) + ": G25 — " + message);
    throw error;
  };
  function descriptor(i) {
    if (descriptors.has(i)) return descriptors.get(i);
    const f = frames[i],
      get = (a) => f.words.filter((w) => w.letter === a),
      n = get("N"),
      p = get("P"),
      q = get("Q"),
      r = get("R"),
      map = maps[owners[i]];
    if (f.words.some((w) => !"NGPQR".includes(w.letter)) || get("G").length !== 1)
      fail(i, "нужен отдельный кадр N…G25P…Q…R…");
    if (n.length !== 1 || p.length !== 1 || q.length !== 1 || r.length !== 1)
      fail(i, "нужны один собственный N и параметры P, Q, R");
    if (
      ![n[0], p[0], q[0]].every((w) => Number.isInteger(w.value) && w.value >= 0 && w.value <= 999)
    )
      fail(i, "N/P/Q должны быть целыми номерами от 0 до 999 (приложение 2.1, с. 194)");
    if (!Number.isSafeInteger(r[0].value) || r[0].value < 1)
      fail(i, "R должен быть положительным целым числом повторов");
    if (map.get(n[0].value) !== i) fail(i, "собственный номер N неоднозначен");
    const a = map.get(p[0].value),
      b = map.get(q[0].value);
    if (a === undefined || b === undefined || a < 0 || b < 0)
      fail(i, "диапазон P–Q не найден однозначно в этой программе");
    if (a > b) fail(i, "начало P находится после конца Q");
    if (i >= a && i <= b) fail(i, "диапазон P–Q включает сам кадр G25");
    for (let j = a; j <= b; j++)
      if (has(frames[j])) fail(i, "внутри повторяемого участка запрещена другая G25");
    const d = {
      line: i + 1,
      block: "N" + n[0].raw,
      number: n[0].value,
      first: p[0].value,
      last: q[0].value,
      count: r[0].value,
      executions: 0,
      a,
      b,
    };
    descriptors.set(i, d);
    cycles.push(d);
    return d;
  }
  function append(i, meta, depth) {
    if (stopped) return;
    if (steps.length >= 50000)
      fail(i, "превышен предел 50000 исполняемых кадров; раздели программу");
    steps.push({ index: i, meta });
    const f = frames[i];
    if (f.code.trim() === "%") {
      if (tapeDataSeen) stopped = true;
      return;
    }
    if (f.words.length) tapeDataSeen = true;
    if (f.words.some((w) => w.letter === "M" && [2, 30].includes(w.value))) {
      stopped = true;
      return;
    }
    if (!has(f)) return;
    if (depth >= 16 || stack.has(i))
      fail(i, "обнаружена рекурсия или превышены 16 уровней вложения");
    const d = descriptor(i);
    if (steps.length + (d.b - d.a + 1) * d.count + Math.max(0, i - d.b) > 50000)
      fail(i, "развёртка превышает предел просмотра 50000 исполняемых кадров; раздели программу");
    d.executions++;
    stack.add(i);
    for (let repeat = 1; repeat <= d.count && !stopped; repeat++) {
      const child = {
        cycleReplay: true,
        cycleTriggerLine: d.line,
        cycleTriggerN: d.number,
        cycleTriggerBlock: d.block,
        cycleRepeat: repeat,
        cycleRepeatCount: d.count,
        cycleLastLine: d.b + 1,
        cycleDepth: depth + 1,
      };
      for (let j = d.a; j <= d.b && !stopped; j++) append(j, child, depth + 1);
    }
    if (!stopped && d.b < i)
      for (let j = d.b + 1; j <= i; j++) {
        if (steps.length >= 50000)
          fail(i, "превышен предел 50000 исполняемых кадров; раздели программу");
        steps.push({ index: j, meta: null, searchOnly: true });
      }
    stack.delete(i);
  }
  try {
    for (let i = 0; i < lines.length; i++) {
      if (stopped) steps.push({ index: i, meta: null });
      else append(i, null, 0);
    }
  } catch (error) {
    return { frames, steps: [], cycles, errors: [error.message] };
  }
  return { frames, steps, cycles, errors: [] };
}
export { repeatExecution };
