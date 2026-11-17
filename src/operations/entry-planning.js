import { oriented as camOriented, offsetContour as camOffsetContour } from "../core/contours.js";
import {
  area as camArea,
  inside as camInside,
  pSegDist as camPSegDist,
  point as camPoint,
  slen as camSlen,
  line as camLine,
  arc as camArc,
} from "../core/segments.js";
import {
  dist as camDist,
  unit as camUnit,
  sub as camSub,
  mul as camMul,
  left as camLeft,
  P as camP,
  add as camAdd,
  len as camLen,
  dot as camDot,
} from "../core/math.js";
import { flattenBounded as camFlattenBounded } from "../core/spatial.js";

import E from "../cam/entry.js";
import ENTRY from "../cam/entry.js";

function solveLeadIn(contour, side, direction, params) {
  if (!contour || !contour.segs || !contour.segs.length) {
    return {
      ok: false,
      reason: "Контур не содержит геометрических элементов.",
    };
  }
  params = params || {};
  const diameter = Number(params.diameter || 8);
  const physRadius = diameter / 2;
  const safetyGap = Number(
    params.safetyGap !== undefined && params.safetyGap !== "" ? params.safetyGap : 0.1,
  );
  const checkRadius = physRadius + safetyGap;
  const exitOffset = Number(
    params.exitOffset !== undefined && params.exitOffset !== "" ? params.exitOffset : 0.1,
  );
  const allowPlunge = !!params.allowPlunge;
  const autoLead = params.autoLead !== false;
  const requestedLead = Number(params.lead !== undefined && params.lead !== "" ? params.lead : 0.1);
  const minLead = Math.max(0.1, safetyGap);
  const baseLead = Math.max(minLead, requestedLead);
  const requestedRun = Number(
    params.entryRun !== undefined && params.entryRun !== "" ? params.entryRun : 0.1,
  );
  const baseRun = Math.max(0.1, requestedRun);
  const plungeOffset = Number(params.plungeOffset || physRadius + 5.0);
  const compMode = params.compMode || "center";
  const isControl =
    params.machine === "fanuc3000c" && params.toolKind === "mill" && compMode === "control";
  const correctionValue = isControl ? Number(params.correctionValue || 0) / 1000 : 0;
  const effD = isControl ? (correctionValue > 0 ? correctionValue : physRadius) : physRadius;
  const effSide = side === "auto" ? contour.autoSide || "outside" : side || "outside";
  const effDir = direction || "climb";
  const orientedSegs =
    camOriented && typeof camOriented === "function"
      ? camOriented(contour, effSide, effDir)
      : contour.segs;
  const area = camArea(orientedSegs);
  const areaSign = Math.sign(area) || 1;
  const freeSideSign = contour.closed
    ? (effSide === "outside" ? -1 : 1) * areaSign
    : effDir === "climb" ||
        (effDir === "ccw" && effSide === "outside") ||
        (effDir === "cw" && effSide === "inside")
      ? -1
      : 1;
  const obstacles = collectObstacles(params.allSketchItems, params.otherContours, contour);
  const stock = params.stock || {};
  const stockShape = stock.shape || params.stockShape || "none";
  const stockDia = Number(stock.dia !== undefined ? stock.dia : params.stockDia || 0);
  const stockCenter = {
    x: Number(stock.x !== undefined ? stock.x : params.stockX || 0),
    y: Number(stock.y !== undefined ? stock.y : params.stockY || 0),
  };
  const stockRadius = stockDia / 2;
  function isInsideStock(pt) {
    if (stockShape === "circle" && stockDia > 0) {
      return camDist(pt, stockCenter) < stockRadius + physRadius + safetyGap - 0.0001;
    }
    return false;
  }
  const flatPts =
    contour.closed && typeof camFlattenBounded === "function"
      ? camFlattenBounded(contour.segs, 0.05)
      : null;
  function isInsidePartBody(pt) {
    if (!flatPts || !contour.closed) return false;
    const insidePoly = camInside(pt, flatPts);
    if (effSide === "outside") return insidePoly;
    if (effSide === "inside") return !insidePoly;
    return false;
  }
  function isSameSeg(s1, s2) {
    if (!s1 || !s2) return false;
    if (s1 === s2) return true;
    if (s1.type !== s2.type) return false;
    if (s1.type === "L") {
      return (
        (camDist(s1.a, s2.a) < 0.001 && camDist(s1.b, s2.b) < 0.001) ||
        (camDist(s1.a, s2.b) < 0.001 && camDist(s1.b, s2.a) < 0.001)
      );
    }
    if (s1.type === "A") {
      return (
        camDist(s1.c, s2.c) < 0.001 &&
        ((camDist(s1.a, s2.a) < 0.001 && camDist(s1.b, s2.b) < 0.001) ||
          (camDist(s1.a, s2.b) < 0.001 && camDist(s1.b, s2.a) < 0.001))
      );
    }
    return false;
  }
  function collidesWithOtherSegments(pt, radius, currentSeg) {
    if (!contour.segs) return false;
    for (let i = 0; i < contour.segs.length; i++) {
      const seg = contour.segs[i];
      if (isSameSeg(seg, currentSeg)) continue;
      if (camPSegDist(pt, seg) < radius - 0.0001) return true;
    }
    return false;
  }
  function collidesWithObstacles(pt, radius) {
    for (let i = 0; i < obstacles.length; i++) {
      if (camPSegDist(pt, obstacles[i]) < radius - 0.0001) return true;
    }
    return false;
  }
  function segSweptCollides(seg, radius, currentSeg, isArc) {
    const len = isArc ? Math.abs(seg.sw) * camDist(seg.a, seg.c) : camDist(seg.a, seg.b);
    const steps = Math.max(isArc ? 4 : 2, Math.ceil(len / 0.04));
    for (let i = 0; i <= steps; i++) {
      const q = camPoint(seg, i / steps);
      if (
        collidesWithObstacles(q, radius) ||
        (currentSeg && collidesWithOtherSegments(q, radius, currentSeg))
      )
        return true;
    }
    return false;
  }
  function getSegmentTangent(seg, t) {
    if (seg.type === "L") {
      return camUnit(camSub(seg.b, seg.a));
    }
    const pt = camPoint(seg, t);
    const radVec = camUnit(camSub(pt, seg.c));
    return camMul(camLeft(radVec), Math.sign(seg.sw));
  }
  function rotateVec(v, rad) {
    const cos = Math.cos(rad),
      sin = Math.sin(rad);
    return camP(v.x * cos - v.y * sin, v.x * sin + v.y * cos);
  }
  const tCandidates = [];
  if (params.manualT) {
    let bestT = null,
      bestDist = Infinity,
      bestSeg = null,
      bestTVal = 0;
    for (let i = 0; i < orientedSegs.length; i++) {
      const s = orientedSegs[i];
      for (let k = 0; k <= 8; k++) {
        const q = camPoint(s, k / 8);
        const d = camDist(q, params.manualT);
        if (d < bestDist) {
          bestDist = d;
          bestT = q;
          bestSeg = s;
          bestTVal = k / 8;
        }
      }
    }
    tCandidates.push({
      T: bestT || params.manualT,
      seg: bestSeg || orientedSegs[0],
      tVal: bestTVal,
    });
  } else {
    for (let sIdx = 0; sIdx < orientedSegs.length; sIdx++) {
      const seg = orientedSegs[sIdx],
        segLen = camSlen(seg);
      if (segLen < 0.001) continue;
      tCandidates.push({ T: seg.a, seg, tVal: 0 });
      if (seg.type === "A") tCandidates.push({ T: camPoint(seg, 0.5), seg, tVal: 0.5 });
      const numSteps = Math.max(2, Math.min(8, Math.ceil(segLen / 6.0)));
      for (let k = 1; k < numSteps; k++)
        tCandidates.push({
          T: camPoint(seg, k / numSteps),
          seg,
          tVal: k / numSteps,
        });
    }
  }
  const candidateRadii = autoLead
    ? [baseLead, 0.2, 0.5, 1.0, 2.0, 5.0, physRadius].filter((r) => r >= baseLead - 1e-5)
    : [baseLead, baseLead * 1.5, baseLead * 2.0, 2.0, 5.0].filter(
        (r, idx, arr) => r >= baseLead - 1e-5 && arr.indexOf(r) === idx,
      );
  let bestSolution = null;
  let bestScore = Infinity;
  let lastErrorReason = null;
  let candidateAutoFix = null;
  let autoSubstituteWarning = null;
  function makeLeadSol(T, P, B, C_arc, R_arc, L, omega, rotSign, seg, normal, tangent, warn) {
    const leadInLine = camLine(P, B),
      leadInArc = camArc(B, T, C_arc, rotSign * omega);
    return {
      ok: true,
      T,
      P,
      B,
      C_arc,
      R_arc,
      L,
      omega,
      omegaDeg: (omega * 180) / Math.PI,
      leadInLine,
      leadInArc,
      leadIn: [leadInLine, leadInArc],
      normal,
      tangent,
      seg,
      warning: warn || null,
    };
  }
  for (let ri = 0; ri < candidateRadii.length; ri++) {
    const currentR = candidateRadii[ri];
    const isSubstituted = !autoLead && currentR > baseLead + 1e-5;
    for (let ti = 0; ti < tCandidates.length; ti++) {
      const candT = tCandidates[ti];
      const T = candT.T,
        seg = candT.seg;
      const tangent = getSegmentTangent(seg, candT.tVal);
      const normal = camMul(camLeft(tangent), freeSideSign);
      const curvSigns = [1, -1];
      for (let csi = 0; csi < curvSigns.length; csi++) {
        const curvSign = curvSigns[csi];
        const C_arc = camAdd(T, camMul(normal, curvSign * currentR));
        const vT = camSub(T, C_arc);
        const rotSign = -(normal.x * tangent.y - normal.y * tangent.x) * curvSign > 0 ? 1 : -1;
        if (params.manualP) {
          const P = params.manualP;
          const delta = camSub(P, C_arc);
          const d2 = delta.x * delta.x + delta.y * delta.y;
          if (d2 <= currentR * currentR) {
            lastErrorReason =
              "Точка погружения находится внутри дуги захода (R=" + currentR.toFixed(2) + " мм).";
            continue;
          }
          const d = Math.sqrt(d2);
          const bx = C_arc.x + delta.x * ((currentR * currentR) / d2);
          const by = C_arc.y + delta.y * ((currentR * currentR) / d2);
          const h = (currentR * Math.sqrt(d2 - currentR * currentR)) / d2;
          const B_candidates = [
            camP(bx - delta.y * h, by + delta.x * h),
            camP(bx + delta.y * h, by - delta.x * h),
          ];
          const theta_T = Math.atan2(vT.y, vT.x);
          for (let bi = 0; bi < B_candidates.length; bi++) {
            const B = B_candidates[bi];
            const vB = camSub(B, C_arc);
            let sw = (rotSign * (theta_T - Math.atan2(vB.y, vB.x))) % (2 * Math.PI);
            if (sw < 1e-8) sw += 2 * Math.PI;
            const tB = camP((-vB.y * rotSign) / currentR, (vB.x * rotSign) / currentR);
            const dirPB = camSub(B, P),
              L = camLen(dirPB);
            if (L < 0.001 || camDot(camMul(dirPB, 1 / L), tB) < 0.999) continue;
            if (sw > Math.PI + 1e-5) {
              lastErrorReason =
                "Заход требует разворота больше 180° (ω=" +
                Math.round((sw * 180) / Math.PI) +
                "°).";
              continue;
            }
            if (!allowPlunge && (isInsideStock(P) || isInsidePartBody(P))) {
              lastErrorReason = "Точка погружения находится в материале заготовки.";
              continue;
            }
            if (
              collidesWithObstacles(P, physRadius) ||
              collidesWithOtherSegments(P, physRadius, seg)
            ) {
              lastErrorReason = "Точка погружения задевает заготовку или деталь.";
              continue;
            }
            const sol = makeLeadSol(T, P, B, C_arc, currentR, L, sw, rotSign, seg, normal, tangent);
            if (
              segSweptCollides(sol.leadInLine, checkRadius, seg, false) ||
              segSweptCollides(sol.leadInArc, checkRadius, seg, true)
            ) {
              lastErrorReason = "Дуга захода задевает контур или деталь.";
              continue;
            }
            const score = (sw <= Math.PI / 2 + 0.01 ? 0 : 10000) + camDist(P, T) * 10 + currentR;
            if (score < bestScore - 0.001) {
              bestScore = score;
              bestSolution = sol;
            }
          }
        } else {
          const omegas = [
            Math.PI / 2,
            Math.PI / 4,
            Math.PI / 3,
            Math.PI / 6,
            (2 * Math.PI) / 3,
            Math.PI,
          ];
          for (let oi = 0; oi < omegas.length; oi++) {
            const omega = omegas[oi];
            const vB = rotateVec(vT, -rotSign * omega);
            const B = camAdd(C_arc, vB),
              tB = rotateVec(tangent, -rotSign * omega);
            const targetDist = plungeOffset + 0.01;
            const hB = camDot(camSub(B, T), normal),
              kn = -camDot(tB, normal);
            let L = baseRun;
            if (kn > 0.05) {
              const lNeeded = (targetDist - hB) / kn;
              if (lNeeded > L) L = lNeeded;
            }
            let P = camSub(B, camMul(tB, L)),
              guard = 0;
            while (camDist(P, T) < targetDist && guard++ < 80) {
              L += 0.5;
              P = camSub(B, camMul(tB, L));
            }
            if (!allowPlunge && (isInsideStock(P) || isInsidePartBody(P))) continue;
            if (
              collidesWithObstacles(P, physRadius) ||
              collidesWithOtherSegments(P, physRadius, seg)
            )
              continue;
            const sol = makeLeadSol(
              T,
              P,
              B,
              C_arc,
              currentR,
              L,
              omega,
              rotSign,
              seg,
              normal,
              tangent,
            );
            if (
              segSweptCollides(sol.leadInLine, checkRadius, seg, false) ||
              segSweptCollides(sol.leadInArc, checkRadius, seg, true)
            )
              continue;
            if (!candidateAutoFix) candidateAutoFix = sol;
            const score = (omega <= Math.PI / 2 + 0.01 ? 0 : 10000) + camDist(P, T) * 10 + currentR;
            if (score < bestScore - 0.001) {
              bestScore = score;
              if (isSubstituted && !autoSubstituteWarning) {
                autoSubstituteWarning =
                  "R захода увеличен с " +
                  baseLead.toFixed(2) +
                  " до " +
                  currentR.toFixed(2) +
                  " мм (причина: задевание контура при меньшем радиусе).";
              }
              sol.warning = autoSubstituteWarning;
              bestSolution = sol;
            }
          }
        }
      }
    }
    if (bestSolution) break;
  }
  if (!bestSolution) {
    if (params.manualP && !candidateAutoFix) {
      const autoFixParams = Object.assign({}, params, {
        manualP: null,
        manualT: null,
        autoLead: true,
      });
      const fixRes = solveLeadIn(contour, side, direction, autoFixParams);
      if (fixRes && fixRes.ok) candidateAutoFix = fixRes;
    }
    let reason = lastErrorReason;
    if (!reason) {
      if (!allowPlunge && stockShape === "circle" && stockDia > 0) {
        reason =
          "Точка погружения находится в материале заготовки. Для врезания в материал включи «Разрешить осевое врезание фрезой» или задай заготовку больше детали.";
      } else {
        reason =
          "Не найден безопасный заход без столкновения фрезы с заготовкой или деталью. Измените параметры или нажмите «Исправить автоматически».";
      }
    }
    return {
      ok: false,
      reason: reason,
      autoFix: candidateAutoFix,
      T: tCandidates[0] ? tCandidates[0].T : contour.segs[0].a,
      P: params.manualP || null,
      R_arc: baseLead,
      L: baseRun,
    };
  }
  const exitDist = effD + exitOffset;
  let exitPoint = camAdd(bestSolution.T, camMul(bestSolution.normal, exitDist));
  if (segSweptCollides(camLine(bestSolution.T, exitPoint), checkRadius, bestSolution.seg, false)) {
    const altExit = camAdd(bestSolution.T, camMul(bestSolution.tangent, exitDist));
    if (!segSweptCollides(camLine(bestSolution.T, altExit), checkRadius, bestSolution.seg, false)) {
      exitPoint = altExit;
    } else {
      bestSolution.retractZFirst = true;
    }
  }
  bestSolution.exitPoint = exitPoint;
  bestSolution.exitOffset = exitOffset;
  return bestSolution;
}

function planAutoEntryAndExit(contours, config, allSketchItems, stock) {
  if (!contours || !contours.length) return null;
  const contour = contours.find((c) => c.enabled) || contours[0];
  if (!contour || !contour.segs || !contour.segs.length) return null;
  const side = contour.side === "auto" ? contour.autoSide || "outside" : contour.side || "outside";
  const dir = config.direction || "climb";
  if (!contour.closed) {
    return solveOpenWallLead(contours, contour, side, dir, config, allSketchItems, stock);
  }
  const solveParams = Object.assign({}, config, {
    allSketchItems: allSketchItems,
    stock: stock,
    otherContours: contours,
  });
  const sol = solveLeadIn(contour, side, dir, solveParams);
  if (!sol || !sol.ok) {
    const err = new Error(sol ? sol.reason : "Не найден безопасный заход.");
    err.entryPoint = (sol && sol.T) || contour.segs[0].a;
    throw err;
  }
  const isControl =
    config.machine === "fanuc3000c" && config.toolKind === "mill" && config.compMode === "control";
  const effD = isControl
    ? Number(config.correctionValue || 0) / 1000 || Number(config.diameter || 8) / 2
    : Number(config.diameter || 8) / 2;
  const programPlunge = isControl
    ? {
        x: sol.P.x,
        y: sol.P.y,
        space: side === "inside" ? "tool" : "program",
      }
    : sol.P;
  const res = {
    startPoint: sol.T,
    entryStart: programPlunge,
    plungePoint: sol.P,
    exitPoint: sol.exitPoint,
    lead: sol.R_arc,
    entryRun: sol.L,
    normal: sol.normal,
    tangent: sol.tangent,
    side: side,
    retractZFirst: sol.retractZFirst,
    warning: sol.warning,
    leadIn: sol.leadIn,
  };
  if (
    res.plungePoint &&
    config.repeatMode === "m98" &&
    Number(config.m98R) > 1 &&
    !config.allowPlunge
  ) {
    const reps = Math.max(1, Math.min(9999, Math.round(Number(config.m98R) || 1))),
      sx = Number(config.m98StepX || 0),
      sy = Number(config.m98StepY || 0);
    const pr = Number(config.diameter || 8) / 2,
      sg = Number(config.safetyGap || 0.1);
    const sh = (stock && stock.shape) || config.stockShape,
      sd = Number((stock && (stock.dia || stock.diameter)) || config.stockDia || 0);
    const sc = {
      x: Number((stock && stock.x) || config.stockX || 0),
      y: Number((stock && stock.y) || config.stockY || 0),
    };
    if (sh === "circle" && sd > 0) {
      for (let r = 1; r < reps; r++) {
        if (
          camDist({ x: res.plungePoint.x + sx * r, y: res.plungePoint.y + sy * r }, sc) <
          sd / 2 + pr + sg - 1e-4
        ) {
          throw new Error("Коллизия на повторе " + (r + 1) + "/" + reps + " (M98)");
        }
      }
    }
  }
  return res;
}

function solveOpenWallLead(contours, contour, side, dir, config, allSketchItems, stock) {
  if (side === "on") return null;
  const entryMod = E || ENTRY;
  const boundary =
    entryMod && typeof entryMod.boundaryRoute === "function"
      ? entryMod.boundaryRoute(contour, config, side)
      : null;
  if (!boundary) return null;
  const diameter = Number(config.diameter || 8);
  const physRadius = diameter / 2;
  const safetyGap = Number(
    config.safetyGap !== undefined && config.safetyGap !== "" ? config.safetyGap : 0.1,
  );
  const checkRadius = physRadius + safetyGap;
  const exitOffset = Number(
    config.exitOffset !== undefined && config.exitOffset !== "" ? config.exitOffset : 0.1,
  );
  const allowPlunge = !!config.allowPlunge;
  const isControl =
    config.machine === "fanuc3000c" && config.toolKind === "mill" && config.compMode === "control";
  const correctionValue = isControl ? Number(config.correctionValue || 0) / 1000 : 0;
  const effRadius = isControl ? (correctionValue > 0 ? correctionValue : physRadius) : physRadius;
  const offset = boundary.offsetSign * effRadius;
  let physical;
  try {
    physical = camOffsetContour(boundary.path, offset, 1e-7, false).filter(
      (s) => camSlen(s) > 1e-7,
    );
  } catch (err) {
    return null;
  }
  if (!physical || !physical.length) return null;
  const boundaryClear =
    entryMod && typeof entryMod.clearance === "function"
      ? entryMod.clearance(contour.segs)
      : () => true;
  const minLead = Math.max(0.05, safetyGap),
    minRun = Math.max(0.05, exitOffset);
  const candidateLeads = [minLead, 0.2, 0.5, 1.0, 2.0, 5.0].filter((r) => r >= minLead - 1e-5);
  const candidateRuns = [minRun, 0.2, 0.5, 1.0].filter((r) => r >= minRun - 1e-5);
  const wallJunctions = [
    boundary.path[0].a,
    boundary.path[boundary.path.length - 1].b,
    physical[0].a,
    physical[physical.length - 1].b,
  ];
  const connectedPoints = [];
  if (contour && contour.segs) {
    for (let i = 0; i < contour.segs.length; i++) {
      connectedPoints.push(contour.segs[i].a, contour.segs[i].b);
    }
  }
  const connectedIds = new Set();
  if (Array.isArray(allSketchItems)) {
    let added = true;
    while (added) {
      added = false;
      for (let i = 0; i < allSketchItems.length; i++) {
        const it = allSketchItems[i];
        if (connectedIds.has(it.id)) continue;
        const pts = [];
        if (it.a) pts.push(it.a);
        if (it.b) pts.push(it.b);
        if (it.c) pts.push(it.c);
        const isConn = pts.some((p) => connectedPoints.some((cp) => camDist(p, cp) < 0.01));
        if (isConn) {
          connectedIds.add(it.id);
          for (let j = 0; j < pts.length; j++) connectedPoints.push(pts[j]);
          added = true;
        }
      }
    }
  }
  const unattachedItems = Array.isArray(allSketchItems)
    ? allSketchItems.filter((it) => !connectedIds.has(it.id))
    : allSketchItems;
  const obstacles = collectObstacles(unattachedItems, contours, contour);
  function collidesWithObstacles(pt, radius) {
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      let req = radius;
      for (let j = 0; j < wallJunctions.length; j++) {
        if (camDist(obs.a, wallJunctions[j]) < 0.01 || camDist(obs.b, wallJunctions[j]) < 0.01) {
          req = physRadius;
          break;
        }
      }
      if (camPSegDist(pt, obs) < req - 0.0001) return true;
    }
    return false;
  }
  let bestOpenPlan = null,
    fallbackOpenPlan = null,
    openFailReason = null;
  for (let li = 0; li < candidateLeads.length; li++) {
    const leadR = candidateLeads[li];
    for (let ri = 0; ri < candidateRuns.length; ri++) {
      const runL = candidateRuns[ri];
      try {
        const bPlan = entryMod.boundaryPlan(
          physical,
          Object.assign({}, config, {
            autoLead: false,
            lead: leadR,
            entryRun: runL,
            diameter: diameter,
          }),
          boundaryClear,
          Math.max(0, Math.min(Math.abs(offset), physRadius) - 0.004),
          boundary.offsetSign,
        );
        if (!bPlan) continue;
        const plungePt = bPlan.entry;
        if (collidesWithObstacles(plungePt, checkRadius)) continue;
        if (
          bPlan.leadIn &&
          bPlan.leadIn.some((s) =>
            [0, 0.25, 0.5, 0.75, 1].some((t) => collidesWithObstacles(camPoint(s, t), checkRadius)),
          )
        )
          continue;
        const stockShape = stock && stock.shape ? stock.shape : config.stockShape || "none";
        const stockDia = Number(
          stock && stock.dia !== undefined ? stock.dia : config.stockDia || 0,
        );
        const stockCenter = {
          x: Number(stock && stock.x !== undefined ? stock.x : config.stockX || 0),
          y: Number(stock && stock.y !== undefined ? stock.y : config.stockY || 0),
        };
        if (!allowPlunge && stockShape === "circle" && stockDia > 0) {
          if (camDist(plungePt, stockCenter) < stockDia / 2 + physRadius + safetyGap - 0.0001) {
            openFailReason =
              "Точка погружения находится в материале заготовки. Для врезания в материал включи «Разрешить осевое врезание фрезой» или задай заготовку больше детали.";
            continue;
          }
        }
        const planCand = {
          startPoint: boundary.path[0].a,
          entryStart: plungePt,
          plungePoint: plungePt,
          exitPoint: bPlan.exit,
          lead: leadR,
          entryRun: runL,
          isOpen: true,
          side: side,
        };
        bestOpenPlan = planCand;
        break;
      } catch (err) {
        if (!openFailReason) openFailReason = err.message;
      }
    }
    if (bestOpenPlan) break;
  }
  const chosenOpenPlan = bestOpenPlan || fallbackOpenPlan;
  if (!chosenOpenPlan) {
    if (openFailReason) {
      const err = Error(openFailReason);
      err.entryPoint = boundary.path[0].a;
      throw err;
    }
    const err = Error(
      "Не найден безопасный заход для открытой стенки без столкновения фрезы с заготовкой или деталью. Измени сторону обработки или зазор безопасности.",
    );
    err.entryPoint = boundary.path[0].a;
    throw err;
  }
  return chosenOpenPlan;
}
export { solveLeadIn, planAutoEntryAndExit, solveOpenWallLead };

function collectObstacles(items, otherContours, contour) {
  function isContourSeg(s) {
    if (!contour || !contour.segs) return false;
    for (let j = 0; j < contour.segs.length; j++) {
      const cs = contour.segs[j];
      if (cs.type === s.type) {
        if (
          s.type === "L" &&
          ((camDist(cs.a, s.a) < 0.001 && camDist(cs.b, s.b) < 0.001) ||
            (camDist(cs.a, s.b) < 0.001 && camDist(cs.b, s.a) < 0.001))
        )
          return true;
        if (
          s.type === "A" &&
          camDist(cs.c, s.c) < 0.001 &&
          Math.abs(camDist(cs.a, cs.c) - camDist(s.a, s.c)) < 0.001
        )
          return true;
      }
    }
    return false;
  }
  const obstacles = [];
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.construction || it.guide) continue;
      if (it.type === "line" && it.a && it.b) {
        const l = camLine(it.a, it.b);
        if (!isContourSeg(l)) obstacles.push(l);
      } else if (it.type === "arc" && it.a && it.b && it.c) {
        const a = camArc(it.a, it.b, it.c, it.sw);
        if (!isContourSeg(a)) obstacles.push(a);
      } else if (it.type === "circle" && it.c && it.r) {
        const a = camAdd(it.c, camP(it.r, 0)),
          b = camAdd(it.c, camP(-it.r, 0));
        const s1 = camArc(a, b, it.c, Math.PI),
          s2 = camArc(b, a, it.c, Math.PI);
        if (!isContourSeg(s1) && !isContourSeg(s2)) obstacles.push(s1, s2);
      }
    }
  }
  if (Array.isArray(otherContours)) {
    for (let i = 0; i < otherContours.length; i++) {
      const other = otherContours[i];
      if (other === contour || !other.segs) continue;
      for (let j = 0; j < other.segs.length; j++) obstacles.push(other.segs[j]);
    }
  }
  return obstacles;
}
