import { parseNC as parseBase } from "./interpreter.js";
import { tokenizeNC } from "./tokenizer.js";
import { expandM98Program } from "./subprograms.js";
function parseNC(text, profile) {
  const lines = text.replace(/\r/g, "").split("\n");
  const hasM98orM99 = lines.some(function (l) {
    return tokenizeNC(l).words.some((w) => w.letter === "M" && (w.value === 98 || w.value === 99));
  });
  if (hasM98orM99) {
    const exp = expandM98Program(lines, profile);
    if (exp.errors.length) {
      return {
        motions: [],
        errors: exp.errors,
        warnings: exp.warnings,
        records: [],
        sections: [],
        minutes: 0,
        lines: lines,
        repeats: [],
        sourceRecords: [],
      };
    }
    const expandedLines = exp.steps.map((step) => step.lineText);
    const parsed = parseBase(expandedLines.join("\n"), profile);
    if (parsed.errors && parsed.errors.length) {
      parsed.errors = parsed.errors.map((message) =>
        message.replace(/^Строка (\d+):/, (prefix, n) => {
          const step = exp.steps[Number(n) - 1];
          return step ? "Строка " + (step.origLineIdx + 1) + ":" : prefix;
        }),
      );
      parsed.lines = lines;
      return parsed;
    }
    parsed.lines = lines;
    parsed.m98Repeats = true;
    for (const m of parsed.motions) {
      const s = exp.steps[m.line - 1];
      if (s) {
        m.expandedLine = m.line;
        m.line = s.origLineIdx + 1;
        if (s.meta) {
          m.subprogramReplay = m.cycleReplay = true;
          m.subTriggerBlock = m.cycleTriggerBlock = s.meta.subTriggerBlock;
          m.subRepeat = m.cycleRepeat = s.meta.subRepeat;
          m.subRepeatCount = m.cycleRepeatCount = s.meta.subRepeatCount;
          m.subDepth = s.meta.subDepth;
        }
      }
    }
    parsed.warnings = [...(parsed.warnings || []), ...exp.warnings];
    parsed.sourceRecords = new Array(lines.length);
    for (const rec of parsed.records) {
      if (!rec) continue;
      const st = exp.steps[rec.line - 1];
      if (!st) continue;
      rec.expandedLine = rec.line;
      rec.line = st.origLineIdx + 1;
      if (!parsed.sourceRecords[st.origLineIdx]) parsed.sourceRecords[st.origLineIdx] = { ...rec };
    }
    return parsed;
  }
  return parseBase(text, profile);
}
export { parseNC };
