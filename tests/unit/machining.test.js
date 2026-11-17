import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as app from "../../src/engine.js";
const C = app.CAM,
  M = app.MACHINES,
  A = app.ATLANTA_OPERATIONS,
  S = app.SKETCH,
  B = app.CONSTRUCTION;
const config = JSON.parse(fs.readFileSync(new URL("../fixtures/config.json", import.meta.url)));
const circle = S.toScene([
  { id: "circle", type: "circle", c: { x: 0, y: 0 }, r: 30, machining: true },
]).machiningContours.map((c) => ({ ...c, side: "outside", enabled: true }));

function part(id, c, contours = circle) {
  const p = { id, name: "TEST MILL", config: c, op: { id, kind: "profile" }, contours };
  p.result = c.repeatMode === "g25" ? A.generateG25(p, p.op, c) : M.generate(contours, c);
  return p;
}
for (const workPlane of ["xy", "zx", "yz"])
  for (const compMode of ["control", "wear"])
    test(workPlane + " " + compMode, () => {
      let c = { ...config, workPlane, compMode, correctionValue: 8000, corrector: 1 };
      let p = part("primary", c);
      const r = A.assemble([p], c);
      const arcs = r.motions
        .filter((m) => m.type === "arc")
        .map((m) => C.motionToLocal(m, workPlane));
      assert(arcs.some((m) => Math.abs(C.dist(m.a, m.c) - 38) < 0.02));
    });
for (const side of ["inside", "outside"])
  for (const direction of ["climb", "conventional"])
    test("tool " + side + " " + direction, () => {
      let c = {
        ...config,
        compMode: "tool",
        toolShape: "ball_mill",
        toolWorkingLength: 16,
        depth: 2,
        stepDown: 1,
        direction,
      };
      const r = M.generate(
        circle.map((item) => ({ ...item, side })),
        c,
      );
      r.operations.forEach((op, index) => {
        const radius = M.toolRadius(c, index + 1);
        assert(
          Math.abs(
            C.dist(op.path[0].a, op.path[0].c) - (30 + (side === "inside" ? -1 : 1) * radius),
          ) < 0.01,
        );
        assert.equal(
          Math.sign(op.path[0].sw),
          (side === "outside" ? 1 : -1) * (direction === "climb" ? 1 : -1),
        );
      });
    });
const path = [
  C.line(C.P(0, 0), C.P(20, 0)),
  C.arc(C.P(20, 0), C.P(30, 10), C.P(20, 10), Math.PI / 2),
];
const open = [{ id: "open", enabled: true, closed: false, segs: path, side: "on" }];
for (const workPlane of ["xy", "zx", "yz"])
  test("G25 open " + workPlane, () => {
    const c = { ...config, workPlane, repeatMode: "g25", g25Shift: 0.2, g25R: 250 };
    const r = A.assemble([part("primary", c, open)], c);
    const parsed = C.parseNC(r.code, M.profile(c.machine));
    assert.equal(parsed.errors.length, 0);
    const normal = C.planeInfo(workPlane).axes[2].toLowerCase();
    assert(parsed.motions.some((m) => Math.abs(m.b[normal] - 92.4) < 0.00001));
    const moves = parsed.motions.filter((m) => m.cycleReplay && m.type === "arc");
    assert.equal(moves.length, 500);
    assert.equal(Math.sign(moves[0].sw), -Math.sign(moves[1].sw));
  });
test("G25 multiple operations", () => {
  const c = { ...config, repeatMode: "g25" };
  const r = A.assemble([part("primary", c), part("o1", c)], c);
  const matches = [...r.code.matchAll(/G25P(\d+)Q(\d+)R/g)];
  assert.equal(matches.length, 2);
  assert.notEqual(matches[0][1], matches[1][1]);
  assert.equal(C.parseNC(r.code, M.profile(c.machine)).errors.length, 0);
});
test("M98 with G25", () => {
  const c = { ...config, repeatMode: "g25" },
    sub = { ...config, repeatMode: "m98", m98R: 2, m98StepX: 0, m98StepY: 0 };
  const r = A.assemble([part("primary", c), part("o1", sub)], config);
  assert.equal(C.parseNC(r.code, M.profile(config.machine)).errors.length, 0);
});
test("junction retained in NC", () => {
  const items = [
    { id: "a", type: "line", a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, machining: true },
    { id: "b", type: "line", a: { x: 10, y: 0 }, b: { x: 20, y: 0 }, machining: true },
    { id: "c", type: "line", a: { x: 10, y: -5 }, b: { x: 10, y: 0 } },
    { id: "d", type: "line", a: { x: 10, y: 0 }, b: { x: 10, y: 5 } },
  ];
  const contours = S.toScene(items).machiningContours.map((c) => ({
    ...c,
    enabled: true,
    side: "on",
  }));
  assert(contours[0].preserveJunctions);
  const r = M.generate(contours, { ...config, depth: 1, stepDown: 1 });
  assert(r.motions.filter((m) => m.stage === "cut").some((m) => Math.abs(m.b.x - 10) < 0.00001));
  const healed = S.toScene(B.heal(items.slice(0, 2))).machiningContours.map((c) => ({
    ...c,
    enabled: true,
    side: "on",
  }));
  assert.equal(
    M.generate(healed, { ...config, depth: 1, stepDown: 1 }).motions.filter(
      (m) => m.stage === "cut",
    ).length,
    1,
  );
});
test("G18 reference arc", () => {
  const r = C.parseNC(
    "%\nN1G92X0Y0Z30000\nN2G90G18G00X0Z10000\nN3G03X10000Z0I0K-10000F100\nN4M30\n%",
    M.profile("fanuc3000c"),
  );
  assert.equal(r.errors.length, 0);
  const arc = r.motions.find((m) => m.type === "arc");
  assert(Math.abs(arc.sw + Math.PI / 2) < 1e-9);
  const mid = C.motionPoint(arc, 0.5);
  assert(Math.abs(mid.x - Math.sqrt(50)) < 1e-9);
  assert(Math.abs(mid.z - Math.sqrt(50)) < 1e-9);
});
