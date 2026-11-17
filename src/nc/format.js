import { EPS, P, PI, TAU, add, copy, cross, dist, dot, sub, unit } from "../core/math.js";
import { arc, line, point, slen, sweep, tangent } from "../core/segments.js";
import { tokenizeNC } from "./tokenizer.js";
function fmt(v, m = 1000, decimal = false) {
  if (!Number.isFinite(v)) throw Error("Нечисловая координата.");
  if (decimal) {
    const a = (Math.round(v * 1000) / 1000).toFixed(3).replace(/\.?0+$/, "");
    return a === "-0" ? "0" : a;
  }
  const n = Math.round(v * m);
  if (Math.abs(n) > 99999999) throw Error("Координата вне диапазона постпроцессора.");
  return String(n === 0 ? 0 : n);
}

function feedFmt(v, c) {
  if (!(v > 0)) throw Error("Подача должна быть больше нуля.");
  if (c.machine === "fanuc3000c" && v > 3600)
    throw Error("Метрический профиль M2V: подача F4 не более 3600,0 мм/мин (§3.11.3).");
  const n = c.decimal ? Math.round(v * 1000) / 1000 : Math.round(v * c.feedScale);
  if (n <= 0) throw Error("Подача меньше разрешения стойки.");
  return c.decimal ? String(n) : String(n).padStart(2, "0");
}

function arcFeed(c, ratio = 1) {
  if (!c.slowArcs || c.toolKind === "scribe") return c.feed;
  const percent = c.slowFeedPercent == null ? 50 : Number(c.slowFeedPercent);
  if (!Number.isFinite(percent) || percent < 1 || percent > 100)
    throw Error("Подача на дугах и углах: от 1 до 100% основной.");
  if (!Number.isFinite(ratio) || ratio <= 0) throw Error("Неверное ограничение подачи на дуге.");
  const scale = c.decimal ? 1000 : c.feedScale,
    maximum = Number(feedFmt(c.feed, c)) / (c.decimal ? 1 : scale);
  return Math.min(
    maximum,
    Math.max(1 / scale, Math.round(c.feed * Math.min(1, percent / 100, ratio) * scale) / scale),
  );
}

function feedPath(path, base, side, c, closed) {
  if (!c.slowArcs || c.toolKind === "scribe")
    return path.map((segment) => ({ segment, feed: c.feed }));
  const reduced = arcFeed(c),
    sharp = (a, b) => a && b && dot(tangent(a, true), tangent(b)) < Math.cos(Math.PI / 6) - 1e-10,
    out = [];
  for (let i = 0; i < path.length; i++) {
    const s = path[i];
    if (s.type === "A") {
      const nominal =
        side === "on"
          ? null
          : base
              .filter((t) => t.type === "A" && dist(t.c, s.c) < 0.001)
              .sort(
                (a, b) =>
                  Math.abs(dist(a.a, a.c) - dist(s.a, s.c)) -
                  Math.abs(dist(b.a, b.c) - dist(s.a, s.c)),
              )[0];
      out.push({
        segment: s,
        feed: arcFeed(c, nominal ? Math.min(1, dist(s.a, s.c) / dist(nominal.a, nominal.c)) : 1),
      });
      continue;
    }
    const previous = i ? path[i - 1] : closed ? path.at(-1) : null,
      next = i + 1 < path.length ? path[i + 1] : closed ? path[0] : null,
      L = slen(s),
      zone = Math.min(c.diameter / 4, L / 2),
      start = sharp(previous, s) ? zone : 0,
      end = sharp(s, next) ? zone : 0;
    if (reduced >= c.feed || (!start && !end)) {
      out.push({ segment: s, feed: c.feed });
      continue;
    }
    if (start + end >= L - 1e-9) {
      out.push({ segment: s, feed: reduced });
      continue;
    }
    if (start) out.push({ segment: line(s.a, point(s, start / L)), feed: reduced });
    out.push({
      segment: line(point(s, start / L), point(s, 1 - end / L)),
      feed: c.feed,
    });
    if (end) out.push({ segment: line(point(s, 1 - end / L), s.b), feed: reduced });
  }
  return out;
}

function modalFeed(command, state) {
  if (/G\s*0*4(?![\d.])/i.test(command)) return command;
  const match = /F([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i.exec(command);
  if (!match) return command;
  const value = Number(match[1]),
    same = state.value === value;
  state.value = value;
  const without = command.slice(0, match.index) + command.slice(match.index + match[0].length);
  return same && /[A-EG-Z]/i.test(without) ? without : command;
}

function splitArcs(ss) {
  const out = [];
  for (const s of ss) {
    if (s.type === "A" && Math.abs(s.sw) > PI + 0.00001) {
      const n = Math.ceil(Math.abs(s.sw) / PI);
      for (let i = 0; i < n; i++)
        out.push(arc(point(s, i / n), point(s, (i + 1) / n), s.c, s.sw / n));
    } else out.push(s);
  }
  return out;
}

function isFullArc(s) {
  var _s$sw;
  return (
    (s.type === "A" || s.type === "arc") &&
    Math.abs(Math.abs((_s$sw = s.sw) !== null && _s$sw !== void 0 ? _s$sw : s.sweep) - TAU) <
      1e-8 &&
    dist(s.a, s.b) < 1e-7
  );
}

function compactArcs(input) {
  const out = [],
    angular = (s) => {
      var _s$sw2;
      return (_s$sw2 = s.sw) !== null && _s$sw2 !== void 0 ? _s$sw2 : s.sweep;
    },
    isArc = (s) => s && (s.type === "A" || s.type === "arc");
  const piece = (s, a, b, sw) => ({
    ...s,
    a: { ...a },
    b: { ...b },
    c: { ...s.c },
    ...(s.type === "A" || s.sw !== undefined ? { sw } : { sweep: sw }),
  });
  const put = (s) => {
    if (out.length >= 50000)
      throw Error("Более 50000 элементов дуговой траектории. Раздели обработку.");
    out.push(s);
  };
  for (const source of input) {
    if (!isArc(source)) {
      const previous = out.at(-1);
      if (
        source.type === "L" &&
        previous &&
        previous.type === "L" &&
        !source.keepStart &&
        dist(previous.b, source.a) < 1e-7 &&
        Math.abs(cross(unit(sub(previous.b, previous.a)), unit(sub(source.b, source.a)))) < 1e-9 &&
        dot(sub(previous.b, previous.a), sub(source.b, source.a)) > 0
      ) {
        previous.b = copy(source.b);
        continue;
      }
      put({ ...source });
      continue;
    }
    let current = piece(source, source.a, source.b, angular(source)),
      remaining = Math.abs(angular(current));
    const sign = Math.sign(angular(current));
    if (!Number.isFinite(remaining) || !sign)
      throw Error("У дуги нет правильного направления или угла.");
    while (remaining > 0) {
      const previous = out.at(-1),
        join =
          isArc(previous) &&
          !isFullArc(previous) &&
          Math.abs(angular(previous)) < TAU - 1e-10 &&
          Math.sign(angular(previous)) === sign &&
          dist(previous.b, current.a) < 1e-7 &&
          dist(previous.c, current.c) < 1e-7 &&
          Math.abs(dist(previous.a, previous.c) - dist(current.a, current.c)) < 1e-7;
      const before = join ? Math.abs(angular(previous)) : 0,
        first = join ? previous.a : current.a;
      const closes = Math.abs(before + remaining - TAU) < 1e-8 && dist(first, current.b) < 1e-7;
      const take = closes ? remaining : Math.min(remaining, TAU - before),
        last = take === remaining;
      const start = current.a,
        angle = Math.atan2(start.y - current.c.y, start.x - current.c.x) + sign * take,
        r = dist(start, current.c);
      let end = last ? current.b : add(current.c, P(r * Math.cos(angle), r * Math.sin(angle)));
      const total = closes ? TAU : before + take;
      if (Math.abs(total - TAU) < 1e-8 && dist(first, end) < 1e-7) end = first;
      const merged = piece(join ? previous : current, first, end, sign * total);
      if (join) out[out.length - 1] = merged;
      else put(merged);
      remaining -= take;
      if (remaining > 0) current = piece(current, end, current.b, sign * remaining);
    }
  }
  return out;
}

function compactArcMoves(moves) {
  const out = [];
  let batch = [];
  const flush = () => {
    if (batch.length) {
      const first = batch[0];
      for (const segment of compactArcs(batch.map((m) => m.segment)))
        out.push({ ...first, segment });
      batch = [];
    }
  };
  for (const move of moves) {
    const first = batch[0];
    if (
      first &&
      ["feed", "stage", "z", "comp", "contour", "operation", "pass"].some(
        (key) => move[key] !== first[key],
      )
    )
      flush();
    batch.push(move);
  }
  flush();
  return out;
}

function compactArcWords(command, state) {
  const words = tokenizeNC(command).words,
    gs = words.filter((w) => w.letter === "G").map((w) => w.value),
    get = (letter) => words.findLast((w) => w.letter === letter);
  if (gs.includes(4)) return command;
  const oldMode = state.mode,
    mode = gs.findLast((g) => [0, 1, 2, 3].includes(g));
  if (mode !== undefined) state.mode = mode;
  if (gs.includes(90)) state.absolute = true;
  if (gs.includes(91)) state.absolute = false;
  if (state.absolute === undefined) state.absolute = true;
  if (!state.position) state.position = {};
  const before = { ...state.position },
    g92 = gs.includes(92);
  for (const letter of ["X", "Y", "Z"]) {
    var _before$letter;
    if (get(letter))
      state.position[letter] =
        g92 || state.absolute
          ? get(letter).value
          : ((_before$letter = before[letter]) !== null && _before$letter !== void 0
              ? _before$letter
              : 0) + get(letter).value;
  }
  const blocked = gs.some((g) => ![2, 3, 90, 91].includes(g)),
    arcBlock =
      [2, 3].includes(state.mode) && !blocked && words.some((w) => "IJKR".includes(w.letter));
  if (!arcBlock) return command;
  const nonzero = words.some((w) => "IJK".includes(w.letter) && w.value !== 0);
  return words
    .filter((w) => {
      if (w.letter === "G" && [2, 3].includes(w.value) && w.value === oldMode) return false;
      if (
        "XYZ".includes(w.letter) &&
        (state.absolute ? before[w.letter] === w.value : w.value === 0)
      )
        return false;
      if ("IJK".includes(w.letter) && w.value === 0 && nonzero) return false;
      return true;
    })
    .map((w) => w.letter + w.raw)
    .join("");
}

function roundArcCentre(a, b, centre, nominalSweep, scale, angleLimit = 0.02) {
  const idealX = centre.x * scale,
    idealY = centre.y * scale,
    x = Math.round(idealX),
    y = Math.round(idealY);
  const sign = Math.sign(nominalSweep);
  let best = null,
    bestShift = Infinity;
  function consider(ix, iy) {
    const shift = (ix - idealX) ** 2 + (iy - idealY) ** 2;
    if (shift > 2.25) return;
    const cx = ix / scale,
      cy = iy / scale;
    const ax = a.x - cx,
      ay = a.y - cy,
      bx = b.x - cx,
      by = b.y - cy;
    const r = Math.hypot(ax, ay),
      r2 = Math.hypot(bx, by);
    if (r < EPS || r2 < EPS) return;
    const error = Math.abs(r - r2);
    if (
      best &&
      (error > best.radiusError + 1e-12 ||
        (Math.abs(error - best.radiusError) < 1e-12 && shift >= bestShift))
    )
      return;
    const sw = sweep(Math.atan2(ay, ax), Math.atan2(by, bx), sign);
    if (Math.abs(sw - nominalSweep) > angleLimit) return;
    best = { centre: P(cx, cy), sw, radiusError: error };
    bestShift = shift;
  }
  consider(x, y);
  if (best && best.radiusError <= 0.5 / scale) return best;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (i || j) consider(x + i, y + j);
  return best;
}

function roundXYSegment(segment, c) {
  var _c$originX, _c$originY;
  const scale = c.decimal ? 1000 : c.coordScale,
    origin = P(
      (_c$originX = c.originX) !== null && _c$originX !== void 0 ? _c$originX : 0,
      (_c$originY = c.originY) !== null && _c$originY !== void 0 ? _c$originY : 0,
    );
  const round = (p) =>
    P(Math.round((p.x - origin.x) * scale) / scale, Math.round((p.y - origin.y) * scale) / scale);
  const a = round(segment.a),
    b = isFullArc(segment) ? { ...a } : round(segment.b);
  if (dist(a, b) < EPS && !isFullArc(segment)) return null;
  if (segment.type === "L")
    return { segment: line(add(a, origin), add(b, origin)), radiusError: 0 };
  const ideal = sub(segment.c, origin),
    nearest = round(segment.c),
    r = dist(a, nearest) || dist(segment.a, segment.c);
  const fit = roundArcCentre(
    a,
    b,
    ideal,
    segment.sw,
    scale,
    Math.min(PI / 4, Math.max(0.02, (c.tolerance * 4) / r)),
  );
  if (!fit) return null;
  return {
    segment: arc(add(a, origin), add(b, origin), add(fit.centre, origin), fit.sw),
    radiusError: fit.radiusError,
  };
}

function lastCorrector(command) {
  const d = command.match(/D[+-]?\d+(?:\.\d+)?/i);
  return d
    ? command.slice(0, d.index) + command.slice(d.index + d[0].length).trimEnd() + " " + d[0]
    : command;
}
export {
  fmt,
  feedFmt,
  arcFeed,
  feedPath,
  modalFeed,
  splitArcs,
  isFullArc,
  compactArcs,
  compactArcMoves,
  compactArcWords,
  roundArcCentre,
  roundXYSegment,
  lastCorrector,
};
