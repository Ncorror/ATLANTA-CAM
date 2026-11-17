import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateZReference, referenceSurfaceZ, zReference } from "../../src/nc/z-reference.js";
import COMPENSATION from "../../src/nc/compensation.js";
import fs from "node:fs";
import { CAM, SKETCH, MACHINES, ATLANTA_OPERATIONS as A } from "../../src/engine.js";

const base = JSON.parse(fs.readFileSync(new URL("../fixtures/config.json", import.meta.url)));
const contours = SKETCH.toScene([
  { id: "circle", type: "circle", c: { x: 0, y: 0 }, r: 30, machining: true },
]).machiningContours.map((c) => ({ ...c, enabled: true, side: "outside" }));
function part(config, id = "primary") {
  const p = { id, name: "MILL", op: { id, kind: "profile" }, config, contours };
  p.result =
    config.repeatMode === "g25"
      ? A.generateG25(p, p.op, config)
      : MACHINES.generate(contours, config);
  return p;
}
const withPlate = (extra = {}) => ({
  ...base,
  diameter: 10,
  zReferenceEnabled: true,
  zReferencePlate: 30,
  zReferenceSurfaceZ: 0,
  ...extra,
});
function assertReference(result, height) {
  const parsed = CAM.parseNC(result.code, MACHINES.profile("fanuc3000c"));
  assert.deepEqual(parsed.errors, []);
  assert.match(result.code, new RegExp(`G92X0Y0Z${height * 1000} \\(Plitka = 30\\)`));
  const last = parsed.motions.at(-1).b;
  assert(Math.abs(last.x) < 1e-8 && Math.abs(last.y) < 1e-8 && Math.abs(last.z - height) < 1e-8);
  return parsed;
}

test("30 mm plate and 5 mm radius at Z0 give the requested physical Z35", () => {
  assert.equal(calculateZReference({ plate: 30, radius: 5, surfaceZ: 0 }), 35);
  const frame = zReference({
    zReferenceEnabled: true,
    zReferencePlate: 30,
    diameter: 10,
    zReferenceSurfaceZ: 0,
    coordScale: 1000,
  });
  assert.equal(frame.command, "G92X0Y0Z35000");
  const code = COMPENSATION.frameCode([frame], { lineNumbers: true });
  assert.match(code, /N001G92X0Y0Z35000 \(Plitka = 30\)/);
});
test("reference calculation adds the contact surface coordinate exactly once", () => {
  assert.equal(calculateZReference({ plate: 30, radius: 5, surfaceZ: 12.5 }), 47.5);
  assert.equal(calculateZReference({ plate: 30, radius: 8, surfaceZ: 0 }), 38);
});
test("reference validation rejects missing, non-finite and impossible dimensions", () => {
  for (const plate of [0, -1, NaN, Infinity])
    assert.throws(() => calculateZReference({ plate, radius: 5 }));
  assert.throws(() => calculateZReference({ plate: 30, radius: -5 }));
  assert.throws(() => calculateZReference({ plate: 30, radius: 5, surfaceZ: Infinity }));
  assert.throws(() => calculateZReference({ plate: 900, radius: 100 }));
});
test("old project reference remains unchanged when the new mode is absent", () => {
  assert.deepEqual(zReference({}), { z: 30, command: "G92X0Y0Z30000" });
});

test("the contact surface follows the selected part zero and work plane", () => {
  const bounds = { maxY: 25 };
  assert.equal(referenceSurfaceZ({ workPlane: "zx", originY: 25 }, bounds), 0);
  assert.equal(referenceSurfaceZ({ workPlane: "yz", originY: 12.5 }, bounds), 12.5);
  assert.equal(referenceSurfaceZ({ workPlane: "xy", topZ: -3 }, bounds), -3);
  assert.equal(referenceSurfaceZ({ workPlane: "zx" }, bounds, false), 0);
  assert.equal(
    referenceSurfaceZ({ zReferenceSurfaceMode: "manual", zReferenceSurfaceZ: 8 }, bounds),
    8,
  );
  assert.throws(() => referenceSurfaceZ({ zReferenceSurfaceMode: "invalid" }, bounds));
});

for (const coordinateMode of ["g90", "g91"]) {
  test(`G12 uses the new reference without changing its cutting depth: ${coordinateMode}`, () => {
    const config = withPlate({ coordinateMode, corrector: 3, correctionValue: 5000 });
    const p = { id: "primary", name: "CIRCLE", op: {}, config };
    p.result = A.generateG12(p, p.op, config, [{ c: { x: 0, y: 0 }, r: 30 }], { diameter: 10 });
    const parsed = assertReference(A.assemble([p], config), 35);
    assert(parsed.motions.some((m) => m.type === "arc" && Math.abs(m.b.z + 8) < 1e-8));
  });
}

test("ball contact radius at partial depth does not replace the physical touch-off radius", () => {
  const config = withPlate({
    diameter: 16,
    depth: 2,
    stepDown: 2,
    compMode: "tool",
    toolShape: "ball_mill",
    toolWorkingLength: 16,
  });
  assert(Math.abs(MACHINES.toolRadius(config, 2) - Math.sqrt(28)) < 1e-8);
  assertReference(A.assemble([part(config)], config), 38);
});

for (const workPlane of ["xy", "zx", "yz"])
  for (const coordinateMode of ["g90", "g91"]) {
    test(`plate reference and return in ${workPlane} / ${coordinateMode}`, () => {
      const config = withPlate({ workPlane, coordinateMode });
      assertReference(A.assemble([part(config)], config), 35);
    });
  }
for (const workPlane of ["xy", "zx", "yz"]) {
  test(`G25 uses the plate reference without adding the radius on each repeat: ${workPlane}`, () => {
    const config = withPlate({ workPlane, repeatMode: "g25" });
    const result = A.assemble([part(config)], config),
      parsed = assertReference(result, 35);
    assert.match(result.code, /G25P\d+Q\d+R2/);
    const normal = CAM.planeInfo(workPlane).axes[2].toLowerCase();
    assert(parsed.motions.some((m) => Math.abs(m.b[normal] + 9.2) < 1e-8));
  });
  test(`M98 returns to its reference between repeats without accumulating clearance: ${workPlane}`, () => {
    const config = withPlate({
      workPlane,
      repeatMode: "m98",
      m98R: 3,
      m98StepX: 0,
      m98StepY: 0,
      safeZ: 40,
      initialZ: 40,
      endZ: 40,
    });
    const result = A.assemble([part(config)], config),
      parsed = assertReference(result, 35);
    const arcGroups = parsed.motions.filter((m) => m.type === "arc");
    assert(arcGroups.length >= 3);
    assert.equal(arcGroups.length % 3, 0);
    const size = arcGroups.length / 3;
    for (let i = 0; i < size; i++)
      for (const axis of ["x", "y", "z"]) {
        assert(Math.abs(arcGroups[i].b[axis] - arcGroups[i + size].b[axis]) < 1e-8);
        assert(Math.abs(arcGroups[i].b[axis] - arcGroups[i + 2 * size].b[axis]) < 1e-8);
      }
  });
}
test("each tool receives its own physical radius in the reference", () => {
  const first = withPlate({ diameter: 10 }),
    second = withPlate({ diameter: 16 });
  const result = A.assemble([part(first), part(second, "o1")], first);
  assert.match(result.code, /G92X0Y0Z35000 \(Plitka = 30\)/);
  assertReference(result, 38);
});
test("explicit contact surface Z12.5 is included once in the physical reference", () => {
  const config = withPlate({ zReferenceSurfaceZ: 12.5, workPlane: "zx", coordinateMode: "g91" });
  assertReference(A.assemble([part(config)], config), 47.5);
});
