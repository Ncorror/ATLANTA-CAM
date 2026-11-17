import { isFullArc as camIsFullArc } from "../nc/format.js";
import {
  dist as camDist,
  left as camLeft,
  add as camAdd,
  mul as camMul,
  sub as camSub,
  len as camLen,
} from "../core/math.js";
import {
  point as camPoint,
  pSegDist as camPSegDist,
  tangent as camTangent,
} from "../core/segments.js";

import B from "./construction.js";
const EPS = 1e-7;
function primitive(s) {
  return s.type === "L"
    ? { type: "line", a: s.a, b: s.b }
    : camIsFullArc(s)
      ? { type: "circle", c: s.c, r: camDist(s.a, s.c) }
      : { type: "arc", a: s.a, m: camPoint(s, 0.5), b: s.b };
}
function onArc(p, s) {
  return camPSegDist(p, s) < 1e-6;
}
function distance(a, b, pa, pb) {
  let result = Math.min(
    camPSegDist(a.a, b),
    camPSegDist(a.b, b),
    camPSegDist(b.a, a),
    camPSegDist(b.b, a),
  );
  if (result < EPS || B.intersections(pa, pb).length) return 0;
  if (a.type === "L" && b.type === "L") return result;
  if (a.type === "L" || b.type === "L") {
    const l = a.type === "L" ? a : b,
      s = a.type === "A" ? a : b,
      n = camLeft(camTangent(l)),
      r = camDist(s.a, s.c);
    for (const sign of [-1, 1]) {
      const p = camAdd(s.c, camMul(n, sign * r));
      if (onArc(p, s)) result = Math.min(result, camPSegDist(p, l));
    }
  } else {
    const centres = camSub(b.c, a.c),
      length = camLen(centres);
    if (length > EPS) {
      const u = camMul(centres, 1 / length),
        ra = camDist(a.a, a.c),
        rb = camDist(b.a, b.c);
      for (const sa of [-1, 1])
        for (const sb of [-1, 1]) {
          const p = camAdd(a.c, camMul(u, sa * ra)),
            q = camAdd(b.c, camMul(u, sb * rb));
          if (onArc(p, a) && onArc(q, b)) result = Math.min(result, camDist(p, q));
        }
    }
  }
  return result;
}
export { primitive, distance };
