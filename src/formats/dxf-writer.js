import { splitArcs } from "../nc/format.js";
function contoursToDXF(contours) {
  const p = [
    [0, "SECTION"],
    [2, "HEADER"],
    [9, "$INSUNITS"],
    [70, 4],
    [0, "ENDSEC"],
    [0, "SECTION"],
    [2, "ENTITIES"],
  ];
  for (const c of contours) {
    const ss = splitArcs(c.segs);
    p.push(
      [0, "LWPOLYLINE"],
      [8, c.layer || "CONTOUR"],
      [90, ss.length + (c.closed ? 0 : 1)],
      [70, c.closed ? 1 : 0],
    );
    for (const s of ss)
      p.push(
        [10, s.a.x.toFixed(6)],
        [20, s.a.y.toFixed(6)],
        [42, s.type === "A" ? Math.tan(s.sw / 4).toFixed(10) : 0],
      );
    if (!c.closed) p.push([10, ss.at(-1).b.x.toFixed(6)], [20, ss.at(-1).b.y.toFixed(6)], [42, 0]);
  }
  p.push([0, "ENDSEC"], [0, "EOF"]);
  return p.map(([k, v]) => k + "\r\n" + v + "\r\n").join("");
}
export { contoursToDXF };
