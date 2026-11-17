function extractRepeatsToM98(contours, tolerance) {
  const tol = typeof tolerance === "number" ? tolerance : 0.05;
  if (!Array.isArray(contours) || contours.length < 2) return null;
  const base = contours[0];
  function matchesShift(c1, c2, dx, dy) {
    if (c1.type === "circle" && c2.type === "circle") {
      return (
        Math.abs(c1.r - c2.r) < tol &&
        Math.abs(c2.c.x - c1.c.x - dx) < tol &&
        Math.abs(c2.c.y - c1.c.y - dy) < tol
      );
    }
    if (!Array.isArray(c1.segs) || !Array.isArray(c2.segs) || c1.segs.length !== c2.segs.length)
      return false;
    for (let i = 0; i < c1.segs.length; i++) {
      const s1 = c1.segs[i],
        s2 = c2.segs[i];
      if (s1.type !== s2.type) return false;
      if (Math.abs(s2.a.x - s1.a.x - dx) > tol || Math.abs(s2.a.y - s1.a.y - dy) > tol)
        return false;
      if (Math.abs(s2.b.x - s1.b.x - dx) > tol || Math.abs(s2.b.y - s1.b.y - dy) > tol)
        return false;
      if (
        s1.type === "A" &&
        (Math.abs(s2.c.x - s1.c.x - dx) > tol ||
          Math.abs(s2.c.y - s1.c.y - dy) > tol ||
          Math.abs(s2.sw - s1.sw) > 1e-4)
      )
        return false;
    }
    return true;
  }
  const second = contours[1];
  let stepX = 0,
    stepY = 0;
  if (base.type === "circle" && second.type === "circle") {
    stepX = second.c.x - base.c.x;
    stepY = second.c.y - base.c.y;
  } else if (
    Array.isArray(base.segs) &&
    Array.isArray(second.segs) &&
    base.segs.length &&
    second.segs.length
  ) {
    stepX = second.segs[0].a.x - base.segs[0].a.x;
    stepY = second.segs[0].a.y - base.segs[0].a.y;
  } else return null;
  if (Math.abs(stepX) < 1e-4 && Math.abs(stepY) < 1e-4) return null;
  let count = 1;
  for (let k = 1; k < contours.length; k++) {
    if (matchesShift(base, contours[k], k * stepX, k * stepY)) count++;
    else break;
  }
  if (count < 2) return null;
  return {
    count: count,
    stepX: Math.round(stepX * 1000) / 1000,
    stepY: Math.round(stepY * 1000) / 1000,
    baseContour: base,
    repeatedContours: contours.slice(1, count),
  };
}
export { extractRepeatsToM98 };
