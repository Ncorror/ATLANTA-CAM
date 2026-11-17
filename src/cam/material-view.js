import {
  sub as camSub,
  dot as camDot,
  add as camAdd,
  mul as camMul,
  dist as camDist,
  cross as camCross,
  SKETCH_ITEM_LIMIT as camSKETCH_ITEM_LIMIT,
  left as camLeft,
  unit as camUnit,
  len as camLen,
} from "../core/math.js";
import {
  bounds as camBounds,
  area as camArea,
  line as camLine,
  rev as camRev,
  slen as camSlen,
  point as camPoint,
  tangent as camTangent,
} from "../core/segments.js";
import { oriented as camOriented, offsetContour as camOffsetContour } from "../core/contours.js";

import OPEN_WALL from "./open-wall.js";
const TAU = 2 * Math.PI;
const OW = OPEN_WALL;
const openWallOf = (contour) => !contour.closed && OW.isRequested(contour);
function closest(p, s) {
  if (s.type === "L") {
    const v = camSub(s.b, s.a),
      t = Math.max(0, Math.min(1, camDot(camSub(p, s.a), v) / (camDot(v, v) || 1)));
    return camAdd(s.a, camMul(v, t));
  }
  const a = Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x),
    b = Math.atan2(p.y - s.c.y, p.x - s.c.x),
    sign = Math.sign(s.sw),
    travel = ((((b - a) * sign) % TAU) + TAU) % TAU;
  if (travel <= Math.abs(s.sw) + 1e-8 || Math.abs(s.sw) >= TAU - 1e-8) {
    const r = camDist(s.a, s.c),
      d = camDist(p, s.c);
    return d > 1e-10 ? camAdd(s.c, camMul(camSub(p, s.c), r / d)) : s.a;
  }
  return camDist(p, s.a) <= camDist(p, s.b) ? s.a : s.b;
}
function boxDistance(p, b) {
  const x = Math.max(b.minX - p.x, 0, p.x - b.maxX),
    y = Math.max(b.minY - p.y, 0, p.y - b.maxY);
  return x * x + y * y;
}
function tree(segs) {
  function build(items) {
    const b = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    for (const item of items) {
      b.minX = Math.min(b.minX, item.b.minX);
      b.minY = Math.min(b.minY, item.b.minY);
      b.maxX = Math.max(b.maxX, item.b.maxX);
      b.maxY = Math.max(b.maxY, item.b.maxY);
    }
    if (items.length <= 8) return { b, items };
    const key = b.maxX - b.minX >= b.maxY - b.minY ? "cx" : "cy";
    items.sort((a, b) => a.b[key] - b.b[key]);
    const mid = items.length >> 1;
    return {
      b,
      left: build(items.slice(0, mid)),
      right: build(items.slice(mid)),
    };
  }
  const top = build(segs.map((s) => ({ s, b: camBounds([s]) })));
  return (p) => {
    let best = null,
      d2 = Infinity;
    function visit(n) {
      if (boxDistance(p, n.b) > d2) return;
      if (n.items) {
        for (const item of n.items) {
          if (boxDistance(p, item.b) > d2) continue;
          const q = closest(p, item.s),
            v = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
          if (v < d2) {
            d2 = v;
            best = q;
          }
        }
      } else {
        const a = boxDistance(p, n.left.b),
          b = boxDistance(p, n.right.b);
        if (a <= b) {
          visit(n.left);
          visit(n.right);
        } else {
          visit(n.right);
          visit(n.left);
        }
      }
    }
    visit(top);
    return { q: best, d: Math.sqrt(d2) };
  };
}
function polygonArea(points) {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++)
    a += camCross(points[j], points[i]);
  return a / 2;
}
function appendResidual(polygons, run) {
  if (run.length < 2) return;
  const poly = run.map((q) => q.p).concat(run.map((q) => q.cut).reverse()),
    area = polygonArea(poly);
  if (Math.abs(area) > 1e-8) polygons.push(area > 0 ? poly : poly.reverse());
}
function traceSweep(ctx, segments, joined) {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (!joined || !i) ctx.moveTo(s.a.x, s.a.y);
    if (s.type === "L") ctx.lineTo(s.b.x, s.b.y);
    else {
      const angle = Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x);
      ctx.arc(s.c.x, s.c.y, camDist(s.a, s.c), angle, angle + s.sw, s.sw < 0);
    }
  }
}
function drawSweep(ctx, sweep) {
  ctx.save();
  const rings = sweep.rings || [sweep.boundary],
    allowance = sweep.allowance || 0;
  ctx.beginPath();
  if (sweep.exterior) {
    const b = sweep.clipBox;
    ctx.rect(b.minX, b.minY, b.w, b.h);
  }
  for (const ring of rings) {
    traceSweep(ctx, ring, true);
    ctx.closePath();
  }
  ctx.clip(sweep.exterior ? "evenodd" : "nonzero");
  ctx.beginPath();
  for (const ring of rings) {
    traceSweep(ctx, ring, true);
    ctx.closePath();
  }
  ctx.strokeStyle = "#dc2530";
  ctx.lineWidth = (sweep.radius + allowance) * 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineWidth = sweep.radius * 2;
  ctx.beginPath();
  traceSweep(ctx, sweep.cuts, false);
  ctx.stroke();
  if (allowance > 0) {
    ctx.lineWidth = allowance * 2;
    ctx.beginPath();
    for (const ring of rings) traceSweep(ctx, ring, true);
    ctx.stroke();
  }
  ctx.restore();
}
function analyze(contours, result, cfg) {
  if (result.toolProfile)
    cfg = {
      ...cfg,
      diameter: 2 * result.toolProfile.radii[result.toolProfile.radii.length - 1],
      allowance: 0,
    };
  if (result.wallNetworkInfo) return analyzeNetwork(result.wallNetworkInfo, result, cfg);
  const view = {
    groups: [],
    warnings: [],
    complete: true,
    samples: 0,
    estimated: false,
  };
  if (cfg.toolKind !== "mill") return view;
  const radius = cfg.diameter / 2,
    tolerance = Math.max(0.02, Math.min(0.1, cfg.tolerance || 0.02));
  let remaining = 24000,
    remainingSweep = 24000;
  for (const contour of contours) {
    const openWall = openWallOf(contour),
      side = openWall
        ? OW.normalizeSide(contour.side)
        : contour.side === "auto"
          ? contour.autoSide
          : contour.side;
    if (!contour.enabled || (!contour.closed && !openWall) || !["inside", "outside"].includes(side))
      continue;
    try {
      const operations = (result.operations || []).filter((o) => o.contour === contour.id);
      if (!operations.length) {
        var _result$fitReport;
        if (
          (_result$fitReport = result.fitReport) !== null &&
          _result$fitReport !== void 0 &&
          _result$fitReport.some((report) => report.contour === contour.id && report.blocked)
        )
          view.groups.push({
            contour: contour.id,
            side,
            sweep: { boundary: contour.segs, cuts: [], radius },
          });
        continue;
      }
      const report = (result.fitReport || []).find((r) => r.contour === contour.id),
        allowance = report ? report.appliedAllowance : cfg.allowance || 0,
        sign = side === "inside" ? 1 : -1,
        virtualArea = openWall
          ? camArea([...contour.segs, camLine(contour.segs.at(-1).b, contour.segs[0].a)])
          : 0,
        base = openWall
          ? virtualArea >= 0
            ? contour.segs
            : contour.segs.slice().reverse().map(camRev)
          : camOriented(contour, side, "ccw");
      let paths = operations.filter((o) => o.path && o.path.length),
        estimated = false;
      if (paths.length) {
        const extra = Math.min(...paths.map((o) => o.radialExtra || 0));
        paths = paths.filter((o) => Math.abs((o.radialExtra || 0) - extra) < 1e-6);
        const z = Math.min(...paths.map((o) => o.z));
        paths = paths.filter((o) => Math.abs(o.z - z) < 1e-6);
        if (
          report !== null &&
          report !== void 0 &&
          report.partial &&
          side === "inside" &&
          !openWall
        ) {
          const boundary =
              allowance > 1e-8 ? camOffsetContour(base, allowance, cfg.tolerance) : base,
            cuts = [];
          for (const op of paths) {
            const first = op.path[0].a,
              last = op.path.at(-1).b;
            if (op.leadIn) cuts.push(...op.leadIn);
            else if (op.entry && camDist(op.entry, first) > 1e-8)
              cuts.push(camLine(op.entry, first));
            for (const segment of op.path) cuts.push(segment);
            if (op.leadOut) cuts.push(...op.leadOut);
            else if (op.exit && camDist(last, op.exit) > 1e-8) cuts.push(camLine(last, op.exit));
            if (cuts.length > 12000 || cuts.length + boundary.length > remainingSweep)
              throw Error("превышен лимит сложности отображения");
          }
          remainingSweep -= cuts.length + boundary.length;
          view.groups.push({
            contour: contour.id,
            side,
            sweep: { boundary, cuts, radius },
          });
          continue;
        }
        paths = paths.map((o) => [...(o.leadIn || []), ...o.path, ...(o.leadOut || [])]);
      } else if (result.compensation && result.compensation.kind === "full") {
        paths = [camOffsetContour(base, sign * (radius + allowance), cfg.tolerance)];
        estimated = true;
        view.estimated = true;
      } else continue;
      const boundary =
          allowance > 1e-8
            ? camOffsetContour(base, sign * allowance, cfg.tolerance, !openWall)
            : base,
        segs = paths.flat();
      if (
        segs.length > 12000 ||
        boundary.length > camSKETCH_ITEM_LIMIT ||
        remaining < boundary.length * 2
      )
        throw Error("превышен лимит сложности отображения");
      const length = boundary.reduce((n, s) => n + camSlen(s), 0),
        budget = Math.min(Math.max(6000, boundary.length * 2), remaining),
        step = Math.max(
          0.04,
          Math.min(0.2, radius / 36),
          length / Math.max(1, budget - boundary.length * 2),
        ),
        nearest = tree(segs),
        polygons = [],
        boundaryPoints = [];
      let maxGap = 0,
        used = 0;
      function probe(s, t) {
        const p = camPoint(s, t),
          hit = nearest(p),
          gap = Math.max(0, hit.d - radius);
        maxGap = Math.max(maxGap, gap);
        used++;
        return {
          p,
          gap,
          cut: gap > tolerance ? camAdd(hit.q, camMul(camSub(p, hit.q), radius / hit.d)) : p,
        };
      }
      for (const s of boundary) {
        const count = Math.max(1, Math.ceil(camSlen(s) / step));
        let run = [],
          previous = null;
        for (let i = 0; i <= count; i++) {
          const q = probe(s, i / count);
          boundaryPoints.push(q.p);
          if (q.gap > tolerance) {
            if (!run.length && previous) run.push(previous);
            run.push(q);
          } else if (run.length) {
            run.push(q);
            appendResidual(polygons, run);
            run = [];
          }
          previous = q;
        }
        appendResidual(polygons, run);
      }
      remaining -= used;
      view.samples += used;
      if (polygons.length)
        view.groups.push({
          contour: contour.id,
          side,
          boundaryPoints,
          polygons,
          maxGap,
          estimated,
        });
    } catch (e) {
      view.complete = false;
      view.warnings.push(
        "Контур " + contour.id + ": заливка недореза не построена (" + e.message + ").",
      );
    }
  }
  if (view.estimated)
    view.warnings.push(
      "Красный недорез при полном D — геометрическая оценка по заданному радиусу. Фактическую коррекцию выполняет стойка.",
    );
  return view;
}
function analyzeNetwork(info, result, cfg) {
  const view = {
    groups: [],
    warnings: [],
    complete: true,
    samples: 0,
    diagnostic: !(result.operations || []).length,
  };
  const operations = (result.operations || []).filter((o) => o.wallNetwork && o.path),
    cuts = [];
  const z = operations.reduce((lowest, o) => Math.min(lowest, o.z), Infinity);
  for (const operation of operations)
    if (Math.abs(operation.z - z) < 1e-6)
      for (const segment of [
        ...(operation.leadIn || []),
        ...operation.path,
        ...(operation.leadOut || []),
      ])
        cuts.push(segment);
  if (info.rings.reduce((sum, ring) => sum + ring.length, 0) + cuts.length > 40000) {
    view.complete = false;
    view.warnings.push(
      "Заливка недореза сети стенок превышает бюджет отображения. Раздели обработку.",
    );
    return view;
  }
  if (info.rings.length) {
    const side = info.side || "inside",
      b = camBounds(info.rings.flat()),
      margin = cfg.diameter / 2 + info.allowance + 1,
      clipBox = {
        minX: b.minX - margin,
        minY: b.minY - margin,
        w: b.w + 2 * margin,
        h: b.h + 2 * margin,
      };
    view.groups.push({
      contour: "network",
      side,
      sweep: {
        rings: info.rings,
        cuts,
        radius: cfg.diameter / 2,
        allowance: info.allowance,
        exterior: side === "outside",
        clipBox,
      },
    });
  }
  return view;
}
function diagnoseOpen(contours, cfg, failedId) {
  const view = {
    groups: [],
    warnings: [],
    complete: true,
    samples: 0,
    diagnostic: true,
  };
  const radius = cfg.diameter / 2,
    allowance = cfg.allowance || 0;
  if (
    cfg.toolKind !== "mill" ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(allowance) ||
    allowance < 0
  )
    return view;
  const walls = contours.filter((c) => c.enabled && openWallOf(c)),
    segments = walls.flatMap((c) => c.segs),
    contour = walls.find((c) => c.id === failedId);
  if (!contour || !segments.length || segments.length > 700) return view;
  const clearance = radius + allowance,
    closestWall = tree(segments),
    clear = (p) => closestWall(p).d >= clearance - 0.000002,
    tolerance = Math.max(0.02, Math.min(0.1, cfg.tolerance || 0.02));
  try {
    const area = camArea([...contour.segs, camLine(contour.segs.at(-1).b, contour.segs[0].a)]);
    const wall = area > 0 ? contour.segs : contour.segs.slice().reverse().map(camRev);
    const side = OW.normalizeSide(contour.side),
      sign = side === "outside" ? -1 : 1,
      boundary =
        allowance > 1e-8 ? camOffsetContour(wall, sign * allowance, cfg.tolerance, false) : wall;
    if (boundary.length > 2000) throw Error("превышен лимит сложности отображения");
    const length = boundary.reduce((n, s) => n + camSlen(s), 0),
      budget = 4000;
    const step = Math.max(
      0.04,
      Math.min(0.2, radius / 36),
      length / Math.max(1, budget - boundary.length * 2),
    );
    const boundaryPoints = [],
      spans = [],
      centres = [],
      polygons = [];
    function candidate(p) {
      if (!clear(p)) return false;
      centres.push({ type: "L", a: p, b: p });
      return true;
    }
    for (const s of boundary) {
      const count = Math.max(1, Math.ceil(camSlen(s) / step)),
        span = [];
      const lineNormal = s.type === "L" ? camLeft(camTangent(s)) : null;
      for (let i = 0; i <= count; i++) {
        const p = camPoint(s, i / count),
          normal = camMul(lineNormal || camMul(camUnit(camSub(s.c, p)), Math.sign(s.sw)), sign);
        const fits = candidate(camAdd(p, camMul(normal, radius)));
        boundaryPoints.push(p);
        span.push({ p, normal, fits });
      }
      spans.push(span);
    }
    const a = wall[0].a,
      b = wall.at(-1).b,
      mouth = camSub(b, a),
      out = camLeft(camUnit(mouth));
    const across = Math.max(1, Math.min(100, Math.ceil(camLen(mouth) / step)));
    for (let j = 0; j <= 8; j++) {
      const start = camAdd(a, camMul(out, (clearance * j) / 8));
      for (let i = 0; i <= across; i++) candidate(camAdd(start, camMul(mouth, i / across)));
    }
    const nearest = centres.length ? tree(centres) : null;
    let maxGap = 0;
    for (const span of spans) {
      let run = [],
        previous = null;
      for (const { p, normal, fits } of span) {
        const hit = !fits && nearest ? nearest(p) : null,
          gap = fits ? 0 : hit ? Math.max(0, hit.d - radius) : Infinity;
        const depth = Math.min(radius, gap),
          toward = hit && hit.d > 1e-10 ? camMul(camSub(hit.q, p), 1 / hit.d) : normal;
        const q = {
          p,
          cut:
            gap > tolerance
              ? camAdd(p, camMul(camDot(toward, normal) > 0.05 ? toward : normal, depth))
              : p,
        };
        if (gap > tolerance) {
          maxGap = Math.max(maxGap, depth);
          if (!run.length && previous) run.push(previous);
          run.push(q);
        } else if (run.length) {
          run.push(q);
          appendResidual(polygons, run);
          run = [];
        }
        previous = q;
      }
      appendResidual(polygons, run);
    }
    view.samples = boundaryPoints.length;
    if (polygons.length)
      view.groups.push({
        contour: contour.id,
        side,
        boundaryPoints,
        polygons,
        maxGap,
        estimated: true,
      });
  } catch (e) {
    view.complete = false;
    view.warnings.push(
      "Контур " + contour.id + ": оценка недоступных участков не построена (" + e.message + ").",
    );
  }
  return view;
}

const api = {
  analyze,
  analyzeNetwork,
  diagnoseOpen,
  closest,
  drawSweep,
};
export default api;
