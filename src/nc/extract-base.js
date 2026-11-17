import { EPS, dist } from "../core/math.js";
import { motionToLocal, planeInfo } from "../core/planes.js";
import { arc, flatten, inside, line, point } from "../core/segments.js";
import { parseNC } from "./interpreter.js";
function extractNC(text, profile, section = "all") {
  const p = parseNC(text, profile);
  if (p.errors.length) throw Error("Сначала исправьте код: " + p.errors[0]);
  const planes = new Set(
    p.motions
      .filter(
        (m) => (section === "all" || m.section === +section) && m.type !== "rapid" && !m.cycle,
      )
      .map((m) => m.plane || 17),
  );
  if (planes.size > 1) throw Error("Для извлечения выбери участок в одной рабочей плоскости.");
  const workPlane = planeInfo(planes.size ? [...planes][0] : 17).id;
  if (workPlane !== "xy") p.motions = p.motions.map((m) => motionToLocal(m, workPlane));
  const result = [],
    warnings = [],
    seen = new Set();
  let chunk = [];
  function save(ss, closed, comp) {
    if (!ss.length) return;
    const q = (a) => Math.round(a.x * 1000) + "," + Math.round(a.y * 1000),
      key = ss
        .map(
          (s) =>
            [q(s.a), q(s.b)].sort().join(":") + (s.c ? ":" + q(s.c) + ":" + q(point(s, 0.5)) : ""),
        )
        .sort()
        .join("|");
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      id: "c" + (result.length + 1),
      segs: ss,
      closed,
      nominal: comp,
      layer: (comp ? "NC_NOMINAL_" : "NC_CENTER_") + (result.length + 1),
      enabled: true,
      side: comp ? "auto" : "on",
    });
  }
  function flush() {
    if (!chunk.length) return;
    const ss = chunk.map((m) => (m.type === "arc" ? arc(m.a, m.b, m.c, m.sw) : line(m.a, m.b))),
      points = [ss[0].a, ...ss.map((s) => s.b)];
    let found = false,
      last = 0;
    for (let i = 1; i < points.length; i++) {
      let j = -1;
      for (let k = last; k < i - 1; k++)
        if (dist(points[k], points[i]) < 0.003) {
          j = k;
          break;
        }
      if (j >= 0) {
        save(
          ss.slice(j, i),
          true,
          chunk.slice(j, i).some((m) => m.comp !== 40),
        );
        found = true;
        last = i;
      }
    }
    if (!found)
      save(
        ss,
        dist(ss[0].a, ss.at(-1).b) < 0.003,
        chunk.some((m) => m.comp !== 40),
      );
    else
      warnings.push("У замкнутого контура исключены участки подвода/отвода вне найденной петли.");
    chunk = [];
  }
  for (const m of p.motions) {
    if (section !== "all" && m.section !== +section) {
      flush();
      continue;
    }
    if (m.type === "rapid" || m.cycle || (m.type !== "arc" && dist(m.a, m.b) < EPS)) {
      flush();
      continue;
    }
    if (Math.abs(m.a.z - m.b.z) > 0.001)
      throw Error(
        "Есть наклонные/винтовые режущие перемещения. Для извлечения нужен плоский участок на постоянном Z.",
      );
    if (chunk.length && dist(chunk.at(-1).b, m.a) > 0.003) flush();
    chunk.push(m);
  }
  flush();
  if (!result.length) throw Error("В участке не найдены плоские контуры фрезерования.");
  for (const c of result) {
    let n = 0;
    if (c.closed)
      for (const other of result)
        if (
          other !== c &&
          other.closed &&
          inside(point(c.segs[0], 0.37), flatten(other.segs, 0.03))
        )
          n++;
    c.autoSide = c.closed ? (n % 2 ? "inside" : "outside") : "on";
  }
  if (result.some((c) => !c.nominal))
    warnings.push(
      "Участки G40 извлечены как путь центра: по умолчанию обработка по линии, без нового смещения на радиус.",
    );
  warnings.push(
    "Проверьте, какие линии задают деталь, а какие являются заходом. Извлечение геометрии не переносит сверление и M-коды. Исходный код остаётся во вкладке программы.",
  );
  return { contours: result, workPlane, warnings: [...new Set(warnings)] };
}
export { extractNC };
