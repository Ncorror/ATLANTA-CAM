import { dist } from "../core/math.js";
import { planeToLocal } from "../core/planes.js";
function motionLength(m) {
  if (m.type === "arc" && m.c) {
    const a = planeToLocal(m.a, m.plane || 17),
      b = planeToLocal(m.b, m.plane || 17),
      c = planeToLocal({ ...m.a, ...m.c }, m.plane || 17);
    return Math.hypot(dist(a, c) * Math.abs(m.sw), b.z - a.z);
  }
  return Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y, m.b.z - m.a.z);
}

function feedLength(m) {
  if (m.type === "dwell") return 0;
  if (m.planarFeed && m.type === "arc" && m.c) {
    const a = planeToLocal(m.a, m.plane || 17);
    const c = planeToLocal({ ...m.a, ...m.c }, m.plane || 17);
    return dist(a, c) * Math.abs(m.sw);
  }
  return motionLength(m);
}

function motionMinutes(m) {
  return m.type === "dwell"
    ? m.seconds / 60
    : m.type === "rapid" || !(m.feed > 0)
      ? 0
      : feedLength(m) / m.feed;
}

function peckCount(r, z, q) {
  return Math.ceil((r - z) / q - 1e-10);
}

function cycleDepths(g, r, z, q, clearance, emit) {
  if (g !== 73 && g !== 83) {
    emit(false, z);
    return;
  }
  const count = peckCount(r, z, q);
  for (let step = 1; step <= count; step++) {
    const bottom = step === count ? z : r - step * q;
    emit(false, bottom);
    if (step === count) break;
    if (g === 83) emit(true, r);
    emit(true, Math.min(r, bottom + clearance));
  }
}
export { motionLength, feedLength, motionMinutes, peckCount, cycleDepths };
