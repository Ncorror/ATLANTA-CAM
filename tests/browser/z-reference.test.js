import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test, before, after } from "node:test";
import { CAM, MACHINES, SKETCH } from "../../src/engine.js";
import { resolve } from "../../scripts/paths.mjs";
import {
  launchBrowser,
  openApplication,
  fixture,
  loadProject,
  calculate,
  saveProject,
} from "../helpers/browser.js";
let browser;
before(async () => {
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
});

async function projectFor(plane = "zx", mode = "g91") {
  const p = await fixture("blank-project"),
    base = await fixture("config");
  const corners = [
    { x: 0, y: 0 },
    { x: 75, y: 0 },
    { x: 75, y: -25 },
    { x: 0, y: -25 },
  ];
  p.sketch.items = corners.map((a, i) => ({
    id: "edge" + i,
    type: "line",
    a,
    b: corners[(i + 1) % 4],
    machining: true,
  }));
  p.sketch.open = false;
  p.rawDxf = SKETCH.toScene(p.sketch.items).dxf;
  p.originSetup = { preset: "tl", shift: { x: 0, y: 0 }, customBase: { x: 0, y: 0 } };
  const values = {
    ...base,
    diameter: 10,
    depth: -1,
    stepDown: 1,
    workPlane: plane,
    coordinateMode: mode,
    compMode: "center",
    cutSide: "outside",
    repeatMode: "none",
    toolShape: "ball_mill",
    toolWorkingLength: 16,
    zReferenceEnabled: true,
    zReferencePlate: 30,
    zReferenceSurfaceMode: "top",
    zReferenceSurfaceZ: 0,
    originPreset: "tl",
  };
  Object.assign(p.values, values);
  Object.assign(p.operations[0].params, values);
  Object.assign(p.toolProfiles.mill, values);
  return p;
}
async function settings(page) {
  await page.locator('[data-work-pane="operations"]').click();
  await page.locator("#zReferenceSection").evaluate((element) => {
    element.open = true;
  });
}
function parse(code) {
  const result = CAM.parseNC(code, MACHINES.profile("fanuc3000c"));
  assert.deepEqual(result.errors, []);
  return result;
}
test("new drawings use the upper-left zero and plate reference by default", async (t) => {
  const page = await openApplication(browser, t);
  assert.equal(await page.locator("#originPreset").inputValue(), "tl");
  assert(await page.locator("#zReferenceEnabled").isChecked());
  assert.equal(await page.locator("#zReferencePlate").inputValue(), "30");
});
for (const plane of ["xy", "zx", "yz"])
  for (const mode of ["g90", "g91"]) {
    test(`plate G92 and return use physical Z35: ${plane}/${mode}`, async (t) => {
      const page = await openApplication(browser, t);
      await loadProject(page, await projectFor(plane, mode));
      const code = await calculate(page),
        parsed = parse(code);
      assert.match(code, /G92X0Y0Z35000 \(Plitka = 30\)/);
      assert.equal(parsed.motions.at(-1).b.z, 35);
      assert.equal(await page.locator("#droZ").textContent(), "35000");
      assert.equal(await page.locator("#droY").textContent(), "0");
      assert.match(await page.locator("#zReferenceReadout").textContent(), /R5/);
    });
  }
test("changing the chosen zero preserves the physical upper contact surface", async (t) => {
  const page = await openApplication(browser, t);
  await loadProject(page, await projectFor());
  await calculate(page);
  await settings(page);
  await page.locator("#originAnchorC").evaluate((element) => element.click());
  let code = await calculate(page);
  assert.match(code, /G92X0Y0Z47500 \(Plitka = 30\)/);
  await page.locator("#zReferenceTopLeft").click();
  code = await calculate(page);
  assert.match(code, /G92X0Y0Z35000 \(Plitka = 30\)/);
  const motions = parse(code).motions.filter((m) => m.type !== "rapid");
  const points = motions.flatMap((m) => [m.a.z, m.b.z]);
  assert(
    Math.abs(Math.max(...points) - 5) < 0.001,
    "Only the contour's cutter compensation adds R; datum must not add it again",
  );
  assert(
    motions.some(
      (m) =>
        Math.abs(m.a.z + 30) < 0.001 &&
        Math.abs(m.b.z + 30) < 0.001 &&
        Math.abs(m.b.x - m.a.x) > 20,
    ),
    "Bottom contour is Z-25 minus R5; lead-in may extend farther",
  );
  await fs.mkdir(resolve("test-results"), { recursive: true });
  await page.screenshot({ path: resolve("test-results/plate-z35.png") });
});
test("plate height and actual tool diameter update and survive a project round trip", async (t) => {
  const page = await openApplication(browser, t);
  await loadProject(page, await projectFor());
  await settings(page);
  await page.locator("#zReferencePlate").fill("25");
  await page.locator("#zReferencePlate").dispatchEvent("change");
  await page.locator("#diameter").fill("16");
  await page.locator("#diameter").dispatchEvent("change");
  const code = await calculate(page);
  assert.match(code, /G92X0Y0Z33000 \(Plitka = 25\)/);
  const saved = await saveProject(page);
  assert.equal(saved.operations[0].params.zReferenceEnabled, true);
  assert.equal(saved.operations[0].params.zReferencePlate, "25");
  await loadProject(page, saved);
  assert.equal(await calculate(page), code);
});
test("an explicit contact surface is applied once and persists", async (t) => {
  const page = await openApplication(browser, t);
  await loadProject(page, await projectFor());
  await settings(page);
  await page.locator("#zReferenceSurfaceMode").selectOption("manual");
  await page.locator("#zReferenceSurfaceZ").fill("3");
  await page.locator("#zReferenceSurfaceZ").dispatchEvent("change");
  const code = await calculate(page);
  assert.match(code, /G92X0Y0Z38000 \(Plitka = 30\)/);
  const saved = await saveProject(page);
  await loadProject(page, saved);
  assert.equal(await calculate(page), code);
});
test("legacy project does not inherit enabled plate settings from the previous project", async (t) => {
  const page = await openApplication(browser, t);
  const p = await projectFor();
  await loadProject(page, p);
  await calculate(page);
  for (const values of [p.values, p.operations[0].params])
    for (const key of Object.keys(values)) if (key.startsWith("zReference")) delete values[key];
  await loadProject(page, p);
  assert(!(await page.locator("#zReferenceEnabled").isChecked()));
  const code = await calculate(page);
  assert.match(code, /G92X0Y0Z30000/);
  assert(!code.includes("Plitka"));
});
test("G25 uses the same plate reference and includes both normal-axis shifts", async (t) => {
  const page = await openApplication(browser, t),
    p = await projectFor();
  for (const values of [p.values, p.operations[0].params])
    Object.assign(values, { repeatMode: "g25", g25Shift: -0.2, g25Reverse: true, g25R: 2 });
  await loadProject(page, p);
  const code = await calculate(page),
    parsed = parse(code);
  assert.match(code, /G92X0Y0Z35000 \(Plitka = 30\)/);
  assert.match(code, /G25P\d+Q\d+R2/);
  assert(parsed.motions.some((m) => Math.abs(m.b.y + 2.2) < 1e-8));
});

test("an invalid plate blocks export without crashing, and correcting it restores calculation", async (t) => {
  const page = await openApplication(browser, t);
  await loadProject(page, await projectFor());
  await calculate(page);
  await settings(page);
  await page.locator("#zReferencePlate").fill("0");
  await page.locator("#zReferencePlate").dispatchEvent("change");
  await page.evaluate(() => ATLANTA.calculate());
  assert(!(await page.evaluate(() => ATLANTA.getState())).ready);
  assert.match(await page.locator("#zReferenceReadout").textContent(), /положительным/);
  await page.locator("#zReferencePlate").fill("30");
  await page.locator("#zReferencePlate").dispatchEvent("change");
  assert.match(await calculate(page), /G92X0Y0Z35000/);
});

for (const kind of ["plate", "surface", "operation"]) {
  test(`invalid saved Z ${kind} leaves the current drawing and NC intact`, async (t) => {
    const page = await openApplication(browser, t),
      p = await projectFor();
    await loadProject(page, p);
    const code = await calculate(page),
      before = await saveProject(page);
    const bad = structuredClone(p);
    bad.sketch.items = [];
    if (kind === "plate") bad.values.zReferencePlate = "-30";
    if (kind === "surface") bad.values.zReferenceSurfaceMode = "broken";
    if (kind === "operation") bad.operations[0].params.zReferencePlate = "0";
    await loadProject(page, bad);
    assert.equal(await page.locator("#code").inputValue(), code);
    assert((await page.evaluate(() => ATLANTA.getState())).ready);
    const after = await saveProject(page);
    assert.deepEqual(after.sketch.items, before.sketch.items);
    assert.deepEqual(after.operations, before.operations);
  });
}
