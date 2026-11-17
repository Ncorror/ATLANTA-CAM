import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { CAM, MACHINES } from "../../src/engine.js";
const original = fs.readFileSync(new URL("../fixtures/vlad-original.nc", import.meta.url), "utf8");
const revised = fs.readFileSync(
  new URL("../../examples/vlad-top-left-z35.nc", import.meta.url),
  "utf8",
);
const profile = MACHINES.profile("fanuc3000c");
const before = CAM.parseNC(original, profile),
  after = CAM.parseNC(revised, profile);
const near = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test("Vlad's setup: touch-off centre Z35, old lowered centre Z17.5 labelled Z30", () => {
  assert.equal(30 + 5, 35);
  assert.equal(35 - 12.5 - 5, 17.5);
  assert.equal(30 - 12.5 - 5, 12.5);
  assert.equal(17.5 - 30, -12.5);
  assert.match(revised, /N002G92X0Y0Z35000 \(Plitka = 30\)/);
});
test("rebasing the supplied program changes only G92 and the first positioning increment", () => {
  const differences = original
    .split(/\r?\n/)
    .map((line, i) => (line === revised.split(/\r?\n/)[i] ? null : i))
    .filter((i) => i !== null);
  assert.deepEqual(differences, [2, 4]);
  assert.match(revised, /N004G91G00X30000Z-2500/);
  assert.match(revised, /N016G25P6Q15R250/);
});
test("all 2514 executed moves preserve the physical contour after the described old workaround", () => {
  assert.deepEqual(before.errors, []);
  assert.deepEqual(after.errors, []);
  assert.equal(before.motions.length, 2514);
  assert.equal(after.motions.length, before.motions.length);
  before.motions.forEach((m, i) => {
    const n = after.motions[i];
    near(n.b.z, m.b.z - 12.5);
    near(n.b.x, m.b.x);
    near(n.b.y, m.b.y);
    if (i > 0) near(n.a.z, m.a.z - 12.5);
    if (m.c) {
      near(n.c.z, m.c.z - 12.5);
      near(n.c.x, m.c.x);
      near(n.sw, m.sw);
    }
  });
  near(after.motions[0].a.z, 35);
  near(after.motions[0].b.z, 32.5);
  near(after.minutes, before.minutes);
});
test("rebased program preserves the original physical final position and normal-axis repeat", () => {
  near(after.motions.at(-1).b.z, 57.5);
  near(after.motions.at(-1).b.y, 100);
  near(after.motions.at(-1).b.x, 0);
  const repeatedEnd = after.motions.filter((m) => m.line === 16).at(-1);
  near(repeatedEnd.b.y, 100.4);
  near(repeatedEnd.b.z, 27.945);
});
