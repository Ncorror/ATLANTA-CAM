import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as app from "../../src/engine.js";
const C = app.CAM,
  M = app.MACHINES,
  A = app.ATLANTA_OPERATIONS;
const profile = M.profile("fanuc3000c"),
  base = JSON.parse(fs.readFileSync(new URL("../fixtures/config.json", import.meta.url)));
const near = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function parse(code, extra = {}) {
  const p = C.parseNC(code, { ...profile, corrections: { 0: 0 }, ...extra });
  assert.equal(p.errors.length, 0, p.errors.join("\n"));
  return p;
}

test("manual p41 G12 I40000 D05=5: radius 35, feed 20, 3piR length", () => {
  const p = parse("G92X0Y0Z30000\nG90G17G01F200\nG12I40000D05", { corrections: { 5: 5 } });
  assert.equal(p.motions.length, 3);
  near(p.motions[0].b.x, 35);
  near(p.motions[1].sw, -2 * Math.PI);
  near(p.minutes, (3 * Math.PI * 35) / 20);
  assert.deepEqual(JSON.parse(JSON.stringify(p.motions.at(-1).b)), { x: 0, y: 0, z: 30 });
});
test("G13 negative I, H shares correction table, modal F", () => {
  const p = parse("G17F500\nG13I-20000H03", { corrections: { 3: 4 } });
  near(p.motions[0].b.x, 16);
  near(p.motions[1].sw, 2 * Math.PI);
  near(p.motions[1].feed, 50);
});
test("G12 nonmodal, retains G01", () => {
  const p = parse("G90G17G01F100\nG12I20000D00\nX1000");
  assert.equal(p.motions.at(-1).type, "feed");
  near(p.motions.at(-1).b.x, 1);
});
test("G12 inside G25 replays every cycle", () => {
  const p = parse("N001G17F100\nN002G12I20000D00\nN003G25P2Q2R2");
  assert.equal(p.motions.length, 9);
  near(p.minutes, (9 * Math.PI * 20) / 10);
});
test("G12 inside M98 replays with location and feed", () => {
  const p = parse("G90G17F200\nM98P101R2\nM30\nN101G13I20000D00\nN102G91G01X10000\nN103M99");
  assert.equal(p.motions.filter((m) => m.circularCycle).length, 6);
  near(p.motions[4].a.x, 10);
  near(p.motions.at(-1).b.x, 20);
});
test("per-operation correction notes replace stale diameter", () => {
  const p = parse(
    "(ATLANTA D01=5.000 MM)\nG17F100\nG12I20000D01\nM00\n(ATLANTA D01=8.000 MM)\nG12I20000D01",
  );
  near(p.motions[0].b.x, 15);
  near(p.motions[3].b.x, 12);
});
test("explicit correction table overrides comments including zero", () => {
  const p = parse("(MILL DIA < 10 )\n(ATLANTA D01=5.000 MM)\nG17F100\nG12I20000D01", {
    corrections: { 1: 0 },
  });
  near(p.motions[0].b.x, 20);
});
test("legacy tool comment inferred with visible warning", () => {
  const p = parse("( MILL DIA < 10 )\nG17F100\nG12I20000D01");
  near(p.motions[0].b.x, 15);
  assert(p.warnings.some((x) => /комментария/.test(x)));
});
test("G12 rejects unknown correction, zero effective radius, XZ", () => {
  for (const [code, extra] of [
    ["G17F100\nG12I10000D01", {}],
    ["G17F100\nG12I10000D01", { corrections: { 1: 10 } }],
    ["G18F100\nG12I10000D00", {}],
  ])
    assert(C.parseNC(code, { ...profile, ...extra }).errors.length > 0);
});
test("G12 generation two tools and distinct plunge/cut feeds", () => {
  const parts = [10, 16].map((diameter, i) => {
    const config = {
      ...base,
      diameter,
      feedInHeader: false,
      feed: 20,
      plunge: 5,
      corrector: i + 1,
    };
    const part = { id: "p" + i, name: "MILL DIA < " + diameter, op: { kind: "profile" }, config };
    part.result = A.generateG12(part, part.op, config, [{ c: { x: 0, y: 0 }, r: 30 }], {
      diameter,
    });
    return part;
  });
  const r = A.assemble(parts, { ...base, feedInHeader: false });
  const arcs = r.motions.filter((m) => m.circularCycle);
  assert.equal(arcs.length, 6);
  near(arcs[0].b.x, 25);
  near(arcs[3].b.x, 22);
  arcs.forEach((m) => near(m.feed, 20));
  const plunges = r.motions.filter((m) => m.type === "feed" && m.b.z < m.a.z);
  assert.equal(plunges.length, 2);
  assert(plunges.every((m) => m.feed === 5));
});
test("manual p45 rejects G25 inside M98", () => {
  const p = C.parseNC("M98P101\nM30\nN101G91G01X1000F100\nN102G25P101Q101R2\nN103M99", profile);
  assert(p.errors.some((x) => /G25.*внутри/.test(x)));
});
test("manual p46 G25 search changes mode without moving", () => {
  const p = parse("N001G91G01X1000F100\nN002Y1000\nN003G90G00X10000\nN004G25P1Q2R2\nN005X20000");
  assert.equal(p.motions.length, 8);
  near(p.motions.at(-1).a.x, 12);
  near(p.motions.at(-1).b.x, 20);
  near(p.motions.at(-1).b.y, 3);
  assert.equal(p.motions.at(-1).type, "rapid");
  assert(p.records.some((r) => r.searchOnly));
});
test("manual p92 mixed G90/G91 per coordinate", () => {
  const p = parse("G92X10000Y20000Z30000\nG90G01X15000G91Y1000G90Z5000F100");
  const b = p.motions.at(-1).b;
  near(b.x, 15);
  near(b.y, 21);
  near(b.z, 5);
});
test("manual p93 G92 absolute under G91, omitted axes unchanged", () => {
  const p = parse("G92X10000Y20000Z30000\nG91\nG92Z5000\nG01X1000F100");
  const b = p.motions.at(-1).b;
  near(b.x, 11);
  near(b.y, 20);
  near(b.z, 5);
});
test("manual p44 plane does not remap linear axes", () => {
  for (const g of [17, 18, 19]) {
    const p = parse("G90G" + g + "G00X10000Y20000Z5000");
    const b = p.motions.at(-1).b;
    near(b.x, 10);
    near(b.y, 20);
    near(b.z, 5);
  }
});
test("manual p34 starts in incremental mode", () => {
  const p = parse("G01X1000F100\nX1000");
  near(p.motions.at(-1).b.x, 2);
});
test("manual p40 G04 P and F mean milliseconds without changing feed", () => {
  for (const a of ["P", "F", "X"]) {
    const p = parse("G01F200\nG04" + a + "2500\nX1000");
    near(p.motions[0].seconds, 2.5);
    near(p.motions[1].feed, 20);
  }
});
test("manual p79 G81 incremental R from initial Z and Z from R", () => {
  const p = parse("G92X0Y0Z30000\nG91G81G99X1000Z-10000R-25000F100\nG98X1000\nG80");
  near(Math.min(...p.motions.map((m) => m.b.z)), -5);
  near(p.motions.at(-1).b.z, 30);
  near(p.motions.at(-1).b.x, 2);
});
test("manual p84 G83 reentry 1 mm above previous bottom", () => {
  const p = parse("G90G83G99X0Y0Z-5000R1000Q2000F100\nG80");
  assert(p.motions.some((m) => m.type === "rapid" && m.a.z === 1 && m.b.z === 0));
  near(p.motions.at(-1).b.z, 1);
});
test("unsupported length corrections never silently removed", () => {
  for (const text of ["G45G00X1000D01", "M98P101\nM30\nN101G45G00X1000D01\nM99"])
    assert(C.parseNC(text, profile).errors.some((e) => /G45/.test(e)));
});
test("manual nonmodal group rejects G04 plus G92", () =>
  assert(C.parseNC("G04P100G92Z10000", profile).errors.some((x) => /немодальная/.test(x))));

test("G25 tool rejects changing contact radius", () => {
  const config = {
    ...base,
    compMode: "tool",
    toolShape: "ball_mill",
    toolWorkingLength: 16,
    depth: 2,
    g25R: 2,
    g25Shift: -0.2,
  };
  assert.throws(() => A.generateG25({ contours: [] }, {}, config), /радиус контакта/);
});
test("G25 tool rejects travel beyond working length", () => {
  const config = {
    ...base,
    compMode: "tool",
    toolShape: "ball_mill",
    toolWorkingLength: 16,
    depth: 8,
    g25R: 250,
    g25Shift: -0.2,
  };
  assert.throws(() => A.generateG25({ contours: [] }, {}, config), /рабочую длину/);
});
test("G25 tool permits constant radius region", () => {
  const config = {
    ...base,
    compMode: "tool",
    toolShape: "ball_mill",
    toolWorkingLength: 16,
    depth: 8,
    g25R: 2,
    g25Shift: -0.2,
  };
  const contours = app.SKETCH.toScene([
    { id: "c", type: "circle", c: { x: 0, y: 0 }, r: 30, machining: true },
  ]).machiningContours.map((c) => ({ ...c, enabled: true, side: "outside" }));
  assert(A.generateG25({ contours }, {}, config).g25);
});
test("G12 honours explicit correction input", () => {
  const c = { ...base, corrector: 3, correctionValue: 6000 };
  const r = A.generateG12({}, {}, c, [{ c: { x: 0, y: 0 }, r: 30 }], { diameter: 16 });
  assert.equal(r.compensation.number, 3);
  assert.equal(r.compensation.tableValue, 6);
});
test("G12 accepts four co-circular arcs, rejects retraced arc", () => {
  const points = [
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: -10, y: 0 },
      { x: 0, y: -10 },
    ],
    center = { x: 0, y: 0 };
  const segs = points.map((p, i) => C.arc(p, points[(i + 1) % 4], center, Math.PI / 2));
  assert.equal(A.getCircle({ closed: true, segs }).r, 10);
  assert.equal(A.getCircle({ closed: true, segs: [segs[0], C.rev(segs[0])] }), null);
});
test("G12 rejects zero depth and excessive pass count", () => {
  for (const c of [
    { ...base, depth: 0 },
    { ...base, stepDown: 0.001, depth: 8 },
  ])
    assert.throws(() => A.generateG12({}, {}, c, [{ c: { x: 0, y: 0 }, r: 30 }], { diameter: 16 }));
});
test("M98 and M99 preserve modal commands in their blocks", () => {
  const p = parse("G90G00X10000\nG91F200M98P101\nG01X5000\nM30\nN101G01X1000\nN102G90M99");
  near(p.motions[1].b.x, 11);
  near(p.motions[1].feed, 20);
  near(p.motions.at(-1).b.x, 5);
});
test("M98 rejects ambiguous target and out-of-range P", () => {
  for (const text of ["M98P101\nM30\nN101G01X1000F100\nN101M99", "M98P1001\nM30\nN1001M99"])
    assert(C.parseNC(text, profile).errors.length);
});
test("G12 generation supports M98 and high clearance", () => {
  const c = { ...base, corrector: 1, repeatMode: "m98", m98R: 2, safeZ: 40 };
  const part = { id: "primary", name: "MILL", op: { kind: "profile" }, config: c };
  part.result = A.generateG12(part, part.op, c, [{ c: { x: 10, y: 0 }, r: 30 }], { diameter: 16 });
  assert.equal(part.result.frames[0].command, "G00Z40000");
  const r = A.assemble([part], c);
  assert.equal(r.motions.filter((m) => m.circularCycle).length, 6);
});
