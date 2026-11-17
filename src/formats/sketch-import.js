import { P, PI, SKETCH_ITEM_LIMIT, add, dist } from "../core/math.js";
import { arc, arcThroughPoints, line } from "../core/segments.js";
import { connect } from "../core/contours.js";
import { isConstruction, isGuide, isMachining } from "../geometry/marks.js";
function importSketch(project, options = {}) {
  if (
    !project ||
    !Array.isArray(project.items) ||
    !project.items.length ||
    project.items.length > SKETCH_ITEM_LIMIT
  )
    throw Error("В проекте эскиза нужны 1–" + SKETCH_ITEM_LIMIT + " линий, дуг или окружностей.");
  const raw = [],
    check = (p) =>
      p &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      Math.abs(p.x) < 1e6 &&
      Math.abs(p.y) < 1e6;
  for (const p of project.items) {
    const auxiliary = isConstruction(p);
    if (p && p.unconfirmed)
      throw Error("В эскизе есть неподтверждённые размеры. Подтвердите их в исходном редакторе.");
    if (!p) throw Error("Неизвестная или повреждённая геометрия в эскизе.");
    let ss = [];
    if (p.type === "line" && check(p.a) && check(p.b)) {
      if (isGuide(p) && dist(p.a, p.b) <= 0.001)
        throw Error("У направляющей должны быть две разные опорные точки.");
      ss = [line(p.a, p.b)];
    } else if (p.type === "circle" && check(p.c) && Number.isFinite(p.r) && p.r > 0 && p.r < 1e6) {
      const a = add(p.c, P(p.r, 0)),
        b = add(p.c, P(-p.r, 0));
      ss = [arc(a, b, p.c, PI), arc(b, a, p.c, PI)];
    } else if (p.type === "arc" && check(p.a) && check(p.b) && check(p.m)) {
      const g = arcThroughPoints(p.a, p.m, p.b);
      if (!g) throw Error("Три точки дуги лежат на одной прямой или совпадают.");
      ss = [arc(p.a, p.b, g.c, g.sweep)];
    } else throw Error("Неизвестная или повреждённая геометрия в эскизе.");
    if (auxiliary || (options.machiningOnly === true && !isMachining(p))) continue;
    for (const s of ss) {
      s.layer = "SKETCH";
      raw.push(s);
    }
  }
  return connect(raw, 0.01);
}
export { importSketch };
