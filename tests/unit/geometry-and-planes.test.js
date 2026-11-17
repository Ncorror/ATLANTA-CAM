import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as app from "../../src/engine.js";
const C = app.CAM,
  M = app.MACHINES,
  A = app.ATLANTA_OPERATIONS,
  S = app.SKETCH,
  B = app.CONSTRUCTION;
const config = {
  ...M.profile("fanuc3000c"),
  machine: "fanuc3000c",
  toolKind: "mill",
  diameter: 16,
  depth: 8,
  stepDown: 8,
  feed: 10,
  plunge: 10,
  safeZ: 30,
  topZ: 0,
  initialZ: 30,
  initialX: 0,
  initialY: 0,
  approach: 1,
  endZ: 30,
  lead: 1,
  allowance: 0,
  stockAllowance: 0,
  stepOver: 1,
  originX: 0,
  originY: 0,
  tolerance: 0.02,
  rpm: 1000,
  flutes: 2,
  allowPlunge: true,
  autoLead: true,
  autoFit: true,
  stockShape: "none",
  direction: "climb",
  compMode: "center",
  returnXY: true,
  useG92: true,
  lineNumbers: true,
  endCode: "M30",
  feedInHeader: true,
  headerFeed: 100,
  entryMode: "auto",
  workPlane: "xy",
  workPlaneExplicit: true,
  g25R: 2,
  g25Shift: -0.2,
  g25Reverse: true,
};
const shape = [{ id: "circle", type: "circle", c: { x: 0, y: 0 }, r: 30, machining: true }];
const contours = S.toScene(shape).machiningContours.map((c) => ({
  ...c,
  enabled: true,
  side: "outside",
}));
function assemble(c, contoursOverride = contours) {
  let part = {
    id: "primary",
    name: "TEST MILL",
    op: { id: "primary", kind: "profile" },
    config: c,
    contours: contoursOverride,
  };
  part.result =
    c.repeatMode === "g25" ? A.generateG25(part, part.op, c) : M.generate(contoursOverride, c);
  return A.assemble([part], c);
}

for (const plane of ["xy", "zx", "yz"])
  for (const coordinateMode of ["g90", "g91"])
    test(plane + " " + coordinateMode, () => {
      const result = assemble({ ...config, workPlane: plane, coordinateMode });
      assert.match(result.code, /G92X0Y0Z30000/);
      assert(!/G92(?:Z|Y)/.test(result.code));
      const parsed = C.parseNC(result.code, M.profile("fanuc3000c"));
      assert.equal(parsed.errors.length, 0, parsed.errors.join("\n"));
      assert.deepEqual(JSON.parse(JSON.stringify(parsed.motions.at(-1).b)), { x: 0, y: 0, z: 30 });
    });
test("XZ mapping", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(C.planeToWorld({ x: 10, y: 20, z: -3 }, "zx"))), {
    x: 10,
    z: 20,
    y: -3,
  });
  assert.equal(C.planeCommand("G03X1Y2I3J4", "zx"), "G02X1Z2I3K4");
  assert.equal(C.planeCommand("G92X0Y0Z30000\nG01X10Y20Z-5", "yz"), "G92X0Y0Z30000\nG01Y10Z20X-5");
});
for (const plane of ["xy", "zx", "yz"])
  test("G25 " + plane, () => {
    let c = { ...config, workPlane: plane, repeatMode: "g25" };
    const result = assemble(c);
    const parsed = C.parseNC(result.code, M.profile(c.machine));
    assert.equal(parsed.errors.length, 0, parsed.errors.join("\n"));
    assert.match(result.code, /G25P\d+Q\d+R2/);
    assert(parsed.motions.filter((m) => m.type === "arc").length >= 6);
    const normal = C.planeInfo(plane).axes[2].toLowerCase();
    assert(parsed.motions.some((m) => Math.abs(m.b[normal] + 9.2) < 0.00001));
  });
test("tool sphere radius", () => {
  assert.equal(M.toolRadius({ ...config, toolShape: "ball_mill", toolWorkingLength: 16 }, 8), 8);
  assert(
    Math.abs(
      M.toolRadius({ ...config, toolShape: "ball_mill", toolWorkingLength: 16 }, 2) - Math.sqrt(28),
    ) < 1e-10,
  );
  assert.throws(() => M.toolRadius({ ...config, toolWorkingLength: 4 }, 8));
});
test("tool per-depth paths", () => {
  let c = {
    ...config,
    compMode: "tool",
    toolShape: "ball_mill",
    toolWorkingLength: 16,
    stepDown: 2,
  };
  const r = M.generate(contours, c);
  assert.equal(r.operations.length, 4);
  r.operations.forEach((op, i) =>
    assert(Math.abs(C.dist(op.path[0].a, op.path[0].c) - 30 - M.toolRadius(c, (i + 1) * 2)) < 0.01),
  );
  assert.equal(C.parseNC(assemble(c).code, M.profile(c.machine)).errors.length, 0);
});
test("heal divided line", () => {
  const items = [
    { id: "a", type: "line", a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, machining: true },
    { id: "b", type: "line", a: { x: 10, y: 0 }, b: { x: 20, y: 0 }, machining: true },
  ];
  assert.equal(B.heal(items).length, 1);
  let cross = { id: "c", type: "line", a: { x: 10, y: -5 }, b: { x: 10, y: 5 } };
  assert.equal(B.heal([...items, cross]).length, 3);
  assert.equal(
    B.heal([
      ...items,
      { ...items[1], id: "c", machining: false, a: { x: 20, y: 0 }, b: { x: 30, y: 0 } },
    ]).length,
    2,
  );
});
test("heal circle after crossing deletion", () => {
  let seq = 0;
  const line = { id: "cut", type: "line", a: { x: -40, y: 0 }, b: { x: 40, y: 0 } };
  const split = B.autoNode([...shape, line], () => "new" + seq++);
  assert(split.length > 2);
  const arcs = split.filter((i) => i.type === "arc");
  assert.equal(B.heal(arcs).length, 1);
  assert.equal(B.heal(arcs)[0].type, "circle");
});
