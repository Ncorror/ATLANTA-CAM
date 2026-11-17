import { extractNC as extractBase } from "./extract-base.js";
import { parseNC } from "./parser.js";
import { expandM98Program } from "./subprograms.js";
function extractNC(text, profile, section) {
  if (!/M\s*0*(?:98|99)(?![\d.])/i.test(text)) return extractBase(text, profile, section || "all");
  const p = parseNC(text, profile);
  if (p.errors && p.errors.length) throw Error("Сначала исправьте код: " + p.errors[0]);
  let maxR = 1;
  for (let i = 0; i < p.motions.length; i++) {
    if (p.motions[i].subRepeatCount > maxR) maxR = p.motions[i].subRepeatCount;
  }
  const lines = text.replace(/\r/g, "").split("\n");
  const exp = expandM98Program(lines, profile);
  const clean = exp.steps
    .filter(function (s) {
      return !s.meta || s.meta.subRepeat === 1;
    })
    .map(function (s) {
      return s.lineText.replace(/\bG0*(45|46|47)\b/gi, "");
    })
    .join("\n");
  const res = extractBase(clean, profile, section || "all");
  if (
    p.motions.some(function (m) {
      return m.subRepeat && m.subRepeat > 1;
    })
  ) {
    res.warnings.push(
      "Геометрия вспомогательной программы (M98) извлечена один раз (повторов в УП: " + maxR + ").",
    );
  }
  return res;
}
export { extractNC };
