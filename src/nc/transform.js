import { planeInfo } from "../core/planes.js";
import { feedFmt, fmt } from "./format.js";
import { tokenizeNC } from "./tokenizer.js";
import { parseNC } from "./interpreter.js";
function transformNC(text, profile, changes) {
  var _parsed$repeats, _parsed$repeats2;
  const parsed = parseNC(text, profile);
  if (parsed.errors.length) throw Error("Сначала исправьте код: " + parsed.errors[0]);
  const selected = parsed.records.filter(
      (r) =>
        !r.ended && !r.tapeEnd && (changes.section === "all" || r.section === +changes.section),
    ),
    set = new Set(selected.map((r) => r.line));
  if (
    (_parsed$repeats = parsed.repeats) !== null &&
    _parsed$repeats !== void 0 &&
    _parsed$repeats.length &&
    changes.section !== "all" &&
    parsed.records.some((r) => set.has(r.line) && r.section !== +changes.section && !r.searchOnly)
  )
    throw Error(
      "Кадры этого участка повторяются G25 в других участках. Для общей правки выбери «Вся программа».",
    );
  const depthValues = selected
    .filter((r) => !r.g92 && !r.dwell && (!r.cycle || changes.includeCycles))
    .flatMap((r) =>
      r.words
        .filter((w) => w.letter === planeInfo(r.plane || 17).axes[2])
        .map((w) => (profile.decimal ? +w.raw : +w.raw / profile.coordScale)),
    )
    .filter((v) => v < 0);
  const selectedPlanes = new Set(
    parsed.motions
      .filter((m) => set.has(m.line) && m.type !== "rapid" && !m.cycle)
      .map((m) => m.plane || 17),
  );
  if (
    selectedPlanes.size > 1 &&
    (changes.dx || changes.dy || changes.depth != null || changes.safeZ != null)
  )
    throw Error("Для изменения геометрии выбери участок в одной рабочей плоскости.");
  const deepest = depthValues.length ? Math.abs(Math.min(...depthValues)) : 0;
  if (changes.depth != null && (!(changes.depth > 0) || !deepest))
    throw Error(
      "Для замены глубины нужен положительный размер и отрицательная глубина выбранного участка.",
    );
  if (changes.feed != null && !(changes.feed > 0)) throw Error("Подача должна быть больше нуля.");
  if (changes.safeZ != null && !(changes.safeZ > 0))
    throw Error("Безопасная высота должна быть больше нуля.");
  const forbidden = selected.find(
    (r) =>
      !r.g92 &&
      (r.incrementalAxes ||
        (r.absolute === false && r.words.some((w) => ["X", "Y", "Z"].includes(w.letter)))),
  );
  if (forbidden && (changes.dx || changes.dy || changes.depth != null || changes.safeZ != null))
    throw Error("Смещение/замена Z для G91 отключены. Переведите выбранный участок в G90.");
  if (
    selected.some(
      (r) => r.units === 25.4 || r.words.some((w) => w.letter === "G" && w.value === 20),
    )
  )
    throw Error("Преобразование дюймового кода не поддерживается.");
  const X = (v) => fmt(v, profile.coordScale, profile.decimal),
    F = (v) => feedFmt(v, profile),
    number = (w) => (profile.decimal ? +w.raw : +w.raw / profile.coordScale);
  const eligibleMotion = (m) =>
    set.has(m.line) && m.type !== "rapid" && (!m.cycle || changes.includeCycles);
  if (
    (_parsed$repeats2 = parsed.repeats) !== null &&
    _parsed$repeats2 !== void 0 &&
    _parsed$repeats2.length &&
    changes.feed != null
  ) {
    const feeds = new Map();
    for (const m of parsed.motions.filter(eligibleMotion)) {
      if (feeds.has(m.line) && Math.abs(feeds.get(m.line) - m.feed) > 0.000001)
        throw Error(
          "Один кадр G25 выполняется с разной модальной подачей. Измени исходные F вручную: общая замена нарушит их соотношение.",
        );
      feeds.set(m.line, m.feed);
    }
  }
  const cornerRecords = parsed.records.filter((record) => record.cornerOffset);
  const maxFeed = Math.max(
    parsed.motions.reduce((max, m) => (eligibleMotion(m) ? Math.max(max, m.feed) : max), 0),
    cornerRecords.reduce((max, r) => (set.has(r.line) ? Math.max(max, r.feed) : max), 0),
  );
  if (changes.feed != null && !maxFeed)
    throw Error("В выбранном участке нет режущих перемещений для смены подачи.");
  const feedAtLine = new Map();
  for (const m of parsed.motions)
    if (m.type !== "rapid")
      feedAtLine.set(m.line, {
        original: m.feed,
        desired:
          changes.feed != null && eligibleMotion(m) ? (m.feed * changes.feed) / maxFeed : m.feed,
      });
  for (const r of cornerRecords)
    feedAtLine.set(r.line, {
      original: r.feed,
      desired: changes.feed != null && set.has(r.line) ? (r.feed * changes.feed) / maxFeed : r.feed,
    });
  let replaced = 0,
    needXY = true;
  const out = parsed.lines.map((original, idx) => {
    if (!set.has(idx + 1)) return original;
    const rec = (parsed.sourceRecords || parsed.records)[idx],
      axes = planeInfo(rec.plane || 17).axes;
    if (rec.g92) {
      needXY = true;
      return original;
    }
    if (rec.ended || rec.dwell || rec.repeatControl) return original;
    let clean = "";
    let pos = 0;
    const rx = /\([^)]*\)|;.*$|([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/gi;
    let match;
    while ((match = rx.exec(original))) {
      clean += original.slice(pos, match.index);
      pos = rx.lastIndex;
      if (!match[1]) {
        clean += match[0];
        continue;
      }
      const a = match[1].toUpperCase(),
        w = { raw: match[2] },
        v = number(w);
      let token = match[0];
      if (a === axes[0] && changes.dx) token = a + X(v + changes.dx);
      if (a === axes[1] && changes.dy) token = a + X(v + changes.dy);
      if (a === axes[2] && changes.depth != null && v < 0 && (!rec.cycle || changes.includeCycles))
        token = a + X((v * changes.depth) / deepest);
      if (a === axes[2] && changes.safeZ != null && v > 0 && !rec.cycle && rec.mode === 0)
        token = a + X(changes.safeZ);
      if (a === "S" && changes.rpm != null) token = "S" + Math.round(changes.rpm);
      if (token !== match[0]) replaced++;
      clean += token;
    }
    clean += original.slice(pos);
    if (rec.words.some((w) => w.letter === axes[0] || w.letter === axes[1])) {
      if (needXY && (changes.dx || changes.dy)) {
        const additions =
          (!rec.words.some((w) => w.letter === axes[0])
            ? axes[0] + X(rec.before[axes[0].toLowerCase()] + (changes.dx || 0))
            : "") +
          (!rec.words.some((w) => w.letter === axes[1])
            ? axes[1] + X(rec.before[axes[1].toLowerCase()] + (changes.dy || 0))
            : "");
        if (additions) {
          const ci = clean.search(/[;(]/);
          clean = ci < 0 ? clean + additions : clean.slice(0, ci) + additions + clean.slice(ci);
          replaced++;
        }
      }
      needXY = false;
    }
    return clean;
  });
  if (changes.feed != null) {
    let current = 0;
    for (let i = 0; i < out.length; i++) {
      const fw = tokenizeNC(out[i]).words.findLast((w) => w.letter === "F");
      if (fw) current = profile.decimal ? +fw.raw : +fw.raw / profile.feedScale;
      const expected = feedAtLine.get(i + 1);
      if (!expected) continue;
      const encoded = F(expected.desired),
        actual = profile.decimal ? +encoded : +encoded / profile.feedScale;
      if (Math.abs(current - actual) > 1e-8) {
        let found = false;
        out[i] = out[i].replace(/\([^)]*\)|;.*$|F\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)/gi, (t) => {
          if (/^F/i.test(t)) {
            found = true;
            return "F" + encoded;
          }
          return t;
        });
        if (!found) {
          const ci = out[i].search(/[;(]/);
          out[i] =
            ci < 0
              ? out[i] + "F" + encoded
              : out[i].slice(0, ci) + "F" + encoded + out[i].slice(ci);
        }
        replaced++;
        current = actual;
      }
    }
  }
  const code = out.join("\r\n"),
    checked = parseNC(code, profile);
  if (checked.errors.length) throw Error("После преобразования: " + checked.errors[0]);
  return { code, parsed: checked, replaced };
}
export { transformNC };
