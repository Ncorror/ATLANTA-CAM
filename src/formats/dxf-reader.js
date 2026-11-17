import { EPS, P, PI, TAU, add, dist, left, len, mul } from "../core/math.js";
import { arc, bulge, line, pLineDist, slen, sweep } from "../core/segments.js";
import { connect } from "../core/contours.js";
function parseDXF(text, opt = {}) {
  var _opt$scale;
  if (text.startsWith("AutoCAD Binary DXF"))
    throw Error("Бинарный DXF не поддерживается. Сохраните ASCII DXF.");
  const rows = text
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split("\n");
  while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
  if (rows.length % 2) throw Error("Нарушены пары код/значение DXF.");
  const pairs = [];
  for (let i = 0; i < rows.length; i += 2) {
    const k = Number(rows[i].trim());
    if (!Number.isInteger(k)) throw Error("Неверный код группы DXF в строке " + (i + 1));
    pairs.push([k, rows[i + 1].trim()]);
  }
  const warnings = [],
    unsupported = new Map(),
    entities = [],
    blocks = new Map();
  let section = "",
    block = null,
    poly = null,
    insUnits = 0;
  for (let i = 0; i < pairs.length; i++) {
    var _block;
    const [k, v] = pairs[i];
    if (k === 9 && v === "$INSUNITS" && pairs[i + 1]) insUnits = +pairs[i + 1][1];
    if (k !== 0) continue;
    if (v === "SECTION") {
      var _pairs;
      section = ((_pairs = pairs[i + 1]) === null || _pairs === void 0 ? void 0 : _pairs[1]) || "";
      continue;
    }
    if (v === "ENDSEC") {
      section = "";
      continue;
    }
    if (!["ENTITIES", "BLOCKS"].includes(section)) continue;
    let j = i + 1;
    while (j < pairs.length && pairs[j][0] !== 0) j++;
    const data = pairs.slice(i + 1, j),
      get = (g, d = 0) => {
        const a = data.find((x) => x[0] === g);
        return a ? a[1] : d;
      };
    const ent = { type: v, data, get, layer: String(get(8, "0")) };
    if (v === "BLOCK") {
      block = {
        name: String(get(2, "")),
        base: P(get(10), get(20)),
        entities: [],
      };
      blocks.set(block.name, block);
      poly = null;
      continue;
    }
    if (v === "ENDBLK") {
      block = null;
      poly = null;
      continue;
    }
    const dest =
      section === "BLOCKS"
        ? ((_block = block) === null || _block === void 0 ? void 0 : _block.entities) || []
        : entities;
    if (v === "POLYLINE") {
      poly = { ...ent, verts: [] };
      dest.push(poly);
      continue;
    }
    if (v === "VERTEX" && poly) {
      poly.verts.push({
        p: P(get(10), get(20)),
        z: +get(30),
        bulge: +get(42),
      });
      continue;
    }
    if (v === "SEQEND") {
      poly = null;
      continue;
    }
    poly = null;
    dest.push(ent);
  }
  const unitFactors = {
    1: 25.4,
    2: 304.8,
    4: 1,
    5: 10,
    6: 1000,
    8: 0.0000254,
    9: 0.0254,
    10: 914.4,
    13: 0.001,
    14: 100,
    21: 304.800609601,
  };
  const factor =
      (_opt$scale = opt.scale) !== null && _opt$scale !== void 0
        ? _opt$scale
        : unitFactors[insUnits] || 1,
    raw = [];
  if (!(factor > 0 && Number.isFinite(factor))) throw Error("Неверный масштаб DXF.");
  if (!insUnits)
    warnings.push(
      "В DXF не заданы единицы. Принято: 1 единица = " +
        factor +
        " мм. Проверьте размер на экране.",
    );
  else if (!unitFactors[insUnits] && opt.scale == null)
    throw Error("Единицы DXF " + insUnits + " не поддерживаются. Укажите масштаб вручную.");
  const tr = (p, t) => P(t.a * p.x + t.c * p.y + t.x, t.b * p.x + t.d * p.y + t.y);
  const compose = (t, u) => ({
    a: t.a * u.a + t.c * u.b,
    b: t.b * u.a + t.d * u.b,
    c: t.a * u.c + t.c * u.d,
    d: t.b * u.c + t.d * u.d,
    x: t.a * u.x + t.c * u.y + t.x,
    y: t.b * u.x + t.d * u.y + t.y,
  });
  function emit(segs, layer, t) {
    const det = t.a * t.d - t.b * t.c;
    for (const s of segs) {
      const v =
        s.type === "L"
          ? line(tr(s.a, t), tr(s.b, t))
          : arc(tr(s.a, t), tr(s.b, t), tr(s.c, t), s.sw * Math.sign(det));
      v.layer = layer;
      if (slen(v) > EPS) raw.push(v);
      if (raw.length > 30000) throw Error("Слишком много элементов DXF (лимит 30000).");
    }
  }
  function spline(e) {
    const g = e.get,
      p = e.data;
    const degree = +g(71),
      knots = p.filter((x) => x[0] === 40).map((x) => +x[1]),
      weights = p.filter((x) => x[0] === 41).map((x) => +x[1]),
      ctrl = [];
    let current = null;
    for (const [k, v] of p) {
      if (k === 10) {
        current = { x: +v, y: 0, z: 0 };
        ctrl.push(current);
      }
      if (k === 20 && current) current.y = +v;
      if (k === 30 && current) current.z = +v;
    }
    if (ctrl.some((p) => Math.abs(p.z) > EPS)) throw Error("SPLINE вне плоскости XY.");
    if (
      degree < 1 ||
      degree > 10 ||
      ctrl.length < degree + 1 ||
      knots.length !== ctrl.length + degree + 1
    )
      throw Error(
        "SPLINE: нужны полные контрольные точки и узловой вектор. Сохраните сплайн как полилинию.",
      );
    function evalAt(u) {
      const n = ctrl.length - 1;
      let span = n;
      if (u < knots[n + 1]) {
        span = degree;
        while (span < n && u >= knots[span + 1]) span++;
      }
      const d = [];
      for (let j = 0; j <= degree; j++) {
        var _weights$k;
        const k = span - degree + j,
          w = (_weights$k = weights[k]) !== null && _weights$k !== void 0 ? _weights$k : 1;
        d.push([ctrl[k].x * w, ctrl[k].y * w, w]);
      }
      for (let r = 1; r <= degree; r++)
        for (let j = degree; j >= r; j--) {
          const k = span - degree + j,
            den = knots[k + degree - r + 1] - knots[k],
            a = den ? (u - knots[k]) / den : 0;
          d[j] = d[j].map((v, i) => (1 - a) * d[j - 1][i] + a * v);
        }
      if (Math.abs(d[degree][2]) < EPS) throw Error("Нулевая рациональная масса SPLINE.");
      return P(d[degree][0] / d[degree][2], d[degree][1] / d[degree][2]);
    }
    const out = [],
      lo = knots[degree],
      hi = knots[ctrl.length],
      tol = (opt.tolerance || 0.03) / factor;
    function rec(a, b, pa, pb, depth) {
      const mid = (a + b) / 2,
        pm = evalAt(mid),
        p1 = evalAt(a + (b - a) * 0.25),
        p3 = evalAt(a + (b - a) * 0.75);
      if (
        depth < 18 &&
        Math.max(pLineDist(pm, pa, pb), pLineDist(p1, pa, pb), pLineDist(p3, pa, pb)) > tol
      ) {
        rec(a, mid, pa, pm, depth + 1);
        rec(mid, b, pm, pb, depth + 1);
      } else out.push(line(pa, pb));
      if (out.length > 10000) throw Error("Сплайн слишком сложный.");
    }
    const unique = [...new Set(knots.filter((x) => x >= lo && x <= hi))];
    for (let i = 1; i < unique.length; i++)
      if (unique[i] > unique[i - 1])
        rec(unique[i - 1], unique[i], evalAt(unique[i - 1]), evalAt(unique[i]), 0);
    if (+g(70) & 1 && out.length && dist(out[0].a, out.at(-1).b) > tol)
      out.push(line(out.at(-1).b, out[0].a));
    warnings.push(
      "SPLINE аппроксимирован отрезками с допуском " + (opt.tolerance || 0.03) + " мм.",
    );
    return out;
  }
  function expand(list, t, inherited = "0", depth = 0) {
    if (depth > 12) throw Error("Циклические или слишком вложенные блоки DXF.");
    for (const e of list) {
      const g = e.get,
        L = e.layer === "0" ? inherited : e.layer;
      if (+g(67) === 1) continue;
      if (+g(210) !== 0 || +g(220) !== 0 || Math.abs(+g(230, 1) - 1) > EPS)
        throw Error(
          "Элемент " +
            e.type +
            " имеет наклонную/обратную OCS. Разверните чертёж в XY и экспортируйте DXF.",
        );
      let ss = [];
      if (e.type === "INSERT") {
        const block = blocks.get(String(g(2, "")));
        if (!block) throw Error("Не найден блок " + g(2));
        const sx = +g(41, 1),
          sy = +g(42, 1),
          a = (+g(50) * PI) / 180;
        if (Math.abs(Math.abs(sx) - Math.abs(sy)) > EPS || !sx || !sy)
          throw Error("Блок с неравномерным масштабом. Выполните EXPLODE в CAD.");
        if (Math.abs(+g(30)) > EPS) throw Error("Блок вне плоскости XY.");
        const cols = +g(70, 1),
          rows = +g(71, 1);
        if (cols * rows > 2000) throw Error("Слишком большой массив блоков.");
        for (let row = 0; row < rows; row++)
          for (let col = 0; col < cols; col++) {
            const u = {
              a: Math.cos(a) * sx,
              b: Math.sin(a) * sx,
              c: -Math.sin(a) * sy,
              d: Math.cos(a) * sy,
              x: +g(10),
              y: +g(20),
            };
            const off = P(col * +g(44) - block.base.x * sx, row * +g(45) - block.base.y * sy);
            u.x += Math.cos(a) * off.x - Math.sin(a) * off.y;
            u.y += Math.sin(a) * off.x + Math.cos(a) * off.y;
            expand(block.entities, compose(t, u), L, depth + 1);
          }
        continue;
      }
      if (
        ["LINE", "ARC", "CIRCLE", "LWPOLYLINE", "POLYLINE", "SPLINE", "ELLIPSE"].includes(e.type)
      ) {
        if (
          Math.abs(+g(30)) > EPS ||
          Math.abs(+g(31)) > EPS ||
          Math.abs(+g(38)) > EPS ||
          Math.abs(+g(39)) > EPS
        )
          throw Error(
            "Элемент " +
              e.type +
              " имеет высоту/толщину вне XY. Для 2D обработки экспортируйте плоский DXF.",
          );
      }
      if (e.type === "LINE") ss = [line(P(g(10), g(20)), P(g(11), g(21)))];
      else if (e.type === "ARC" || e.type === "CIRCLE") {
        const c = P(g(10), g(20)),
          r = +g(40),
          a = (+g(50) * PI) / 180,
          b = (+g(51) * PI) / 180;
        if (!(r > 0)) throw Error("Нулевой радиус дуги DXF.");
        if (e.type === "CIRCLE") {
          const p = add(c, P(r, 0)),
            q = add(c, P(-r, 0));
          ss = [arc(p, q, c, PI), arc(q, p, c, PI)];
        } else
          ss = [
            arc(
              add(c, P(r * Math.cos(a), r * Math.sin(a))),
              add(c, P(r * Math.cos(b), r * Math.sin(b))),
              c,
              sweep(a, b, 1),
            ),
          ];
      } else if (e.type === "LWPOLYLINE" || e.type === "POLYLINE") {
        let verts = e.verts || [];
        if (e.type === "LWPOLYLINE") {
          let v = null;
          for (const [k, x] of e.data) {
            if (k === 10) {
              v = { p: P(x, 0), bulge: 0 };
              verts.push(v);
            } else if (k === 20 && v) v.p.y = +x;
            else if (k === 42 && v) v.bulge = +x;
          }
        }
        if (+g(70) & (8 | 16 | 64) || verts.some((v) => Math.abs(v.z || 0) > EPS))
          throw Error("3D POLYLINE/сетка не поддерживается.");
        const n = verts.length,
          closed = (+g(70) & 1) !== 0;
        for (let i = 0; i < n - (closed ? 0 : 1); i++)
          ss.push(bulge(verts[i].p, verts[(i + 1) % n].p, verts[i].bulge));
      } else if (e.type === "SPLINE") ss = spline(e);
      else if (e.type === "ELLIPSE") {
        const c = P(g(10), g(20)),
          major = P(g(11), g(21)),
          ratio = +g(40),
          a = +g(41),
          b = +g(42, TAU),
          sw = b - a;
        if (!(ratio > 0 && ratio <= 1 && len(major) > 0)) throw Error("Некорректный ELLIPSE.");
        const minor = mul(left(major), ratio),
          evalAt = (u) => add(c, add(mul(major, Math.cos(u)), mul(minor, Math.sin(u))));
        const n = Math.min(
          10000,
          Math.max(
            12,
            Math.ceil(
              Math.abs(sw) /
                Math.max(0.001, Math.sqrt((8 * (opt.tolerance || 0.03)) / (len(major) * factor))),
            ),
          ),
        );
        for (let i = 0; i < n; i++)
          ss.push(line(evalAt(a + (sw * i) / n), evalAt(a + (sw * (i + 1)) / n)));
        warnings.push("ELLIPSE аппроксимирован отрезками.");
      } else if (
        ![
          "POINT",
          "TEXT",
          "MTEXT",
          "DIMENSION",
          "HATCH",
          "SOLID",
          "TRACE",
          "ATTDEF",
          "ATTRIB",
          "SEQEND",
          "VIEWPORT",
          "LEADER",
        ].includes(e.type)
      ) {
        unsupported.set(e.type, (unsupported.get(e.type) || 0) + 1);
        continue;
      } else {
        unsupported.set(e.type, (unsupported.get(e.type) || 0) + 1);
        continue;
      }
      for (const s of ss)
        if (![s.a.x, s.a.y, s.b.x, s.b.y, ...(s.c ? [s.c.x, s.c.y] : [])].every(Number.isFinite))
          throw Error("В DXF есть неверные координаты.");
      emit(ss, L, t);
    }
  }
  expand(entities, { a: factor, b: 0, c: 0, d: factor, x: 0, y: 0 });
  if (unsupported.size)
    warnings.push(
      "Не включены в траекторию: " +
        [...unsupported].map(([t, n]) => t + " ×" + n).join(", ") +
        ".",
    );
  if (!raw.length)
    throw Error(
      "В ENTITIES нет поддерживаемой геометрии. Нужны линии, дуги, окружности, полилинии, эллипсы или сплайны.",
    );
  const connected = connect(raw, opt.joinTolerance || 0.01);
  warnings.push(...connected.warnings);
  return {
    contours: connected.contours,
    warnings: [...new Set(warnings)],
    units: insUnits,
    factor,
    unsupported: [...unsupported.keys()],
  };
}
export { parseDXF };
