import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { CAM, MACHINES, SKETCH, CONSTRUCTION } from "../../src/engine.js";
import {
  launchBrowser,
  openApplication,
  circleProject,
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

test("restore a v5 project and rebuild a stale DXF cache", async (t) => {
  const page = await openApplication(browser, t),
    project = await fixture("operation-project");
  project.rawDxf = "";
  await loadProject(page, project);
  assert.match(await calculate(page), /G25P\d+Q\d+R2/);
});
test("project round trip preserves plane, tool and G25 parameters", async (t) => {
  const page = await openApplication(browser, t);
  await loadProject(page, await circleProject("yz", "g25"));
  const firstCode = await calculate(page),
    saved = await saveProject(page);
  assert.equal(saved.operations[0].params.g25Shift, "-0.2");
  assert.equal(saved.operations[0].params.g25Reverse, true);
  assert.equal(saved.operations[0].params.workPlane, "yz");
  assert.equal(saved.operations[0].params.toolShape, "ball_mill");
  await loadProject(page, saved);
  assert.equal(await calculate(page), firstCode);
});
async function splitCircle(page) {
  let sequence = 0;
  const split = CONSTRUCTION.autoNode(
    [
      { id: "circle", type: "circle", c: { x: 0, y: 0 }, r: 30, machining: true },
      { id: "cut", type: "line", a: { x: -40, y: 0 }, b: { x: 40, y: 0 } },
    ],
    () => `s${++sequence}`,
  );
  const project = await fixture("blank-project");
  Object.assign(project.sketch, {
    items: split,
    open: true,
    tool: "select",
    selectedIds: split.filter((item) => item.type === "line").map((item) => item.id),
  });
  project.rawDxf = SKETCH.toScene(split).dxf;
  await loadProject(page, project);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Delete");
  return split;
}
test("deleting an intersection restores the original circle", async (t) => {
  const page = await openApplication(browser, t);
  await splitCircle(page);
  const saved = await saveProject(page),
    items = saved.sketch.items.filter((item) => !item.construction);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "circle");
  assert(items[0].machining);
});
test("undo restores a deleted intersection", async (t) => {
  const page = await openApplication(browser, t),
    split = await splitCircle(page);
  await page.keyboard.press("Control+z");
  assert.equal((await saveProject(page)).sketch.items.length, split.length);
});
test("legacy G25 tool alias remains usable", async (t) => {
  const page = await openApplication(browser, t);
  await loadProject(page, await circleProject("xy", "center"));
  await page.locator('[data-work-pane="operations"]').click();
  await page.locator("#toolKind").selectOption("g25");
  assert.equal(await page.locator("#repeatMode").inputValue(), "g25");
});
for (const kind of ["origin", "dimension", "number", "operation"]) {
  test(`invalid ${kind} preserves the current project and NC`, async (t) => {
    const page = await openApplication(browser, t),
      project = await circleProject("xy", "center");
    await loadProject(page, project);
    const initialCode = await calculate(page),
      before = await saveProject(page),
      bad = structuredClone(project);
    bad.sketch.items = [];
    if (kind === "origin")
      bad.originSetup = {
        preset: "custom",
        customBase: { x: "broken", y: 0 },
        shift: { x: 0, y: 0 },
      };
    if (kind === "dimension")
      bad.sketch.dimensions = [{ id: "bad", a: null, b: { x: 0, y: 0 }, h: 1, length: 1 }];
    if (kind === "number") bad.values.depth = "not a number";
    if (kind === "operation") bad.operations[0].params.depth = "not a number";
    await loadProject(page, bad);
    assert.equal(await page.locator("#code").inputValue(), initialCode);
    assert((await page.evaluate(() => ATLANTA.getState())).ready);
    const after = await saveProject(page);
    assert.deepEqual(after.sketch.items, before.sketch.items);
    assert.deepEqual(after.operations, before.operations);
  });
}
test("autosave displays success, quota failure and recovery", async (t) => {
  const page = await openApplication(browser, t);
  await loadProject(page, await circleProject("xy", "center"));
  await calculate(page);
  await page.waitForFunction(() =>
    /Автосохранено/.test(document.getElementById("autosaveStatus").textContent),
  );
  assert(await page.locator("#autosaveStatus").isVisible());
  await page.evaluate(() => {
    window.originalStorageSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "atlanta-cam-v5") throw new DOMException("Quota", "QuotaExceededError");
      return originalStorageSet.call(this, key, value);
    };
  });
  await page.locator("#depth").fill("-7");
  await page.locator("#depth").dispatchEvent("change");
  await page.waitForFunction(() =>
    /недоступно.*JSON/.test(document.getElementById("autosaveStatus").textContent),
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = window.originalStorageSet;
  });
  await page.locator("#depth").fill("-8");
  await page.locator("#depth").dispatchEvent("change");
  await page.waitForFunction(() =>
    /Автосохранено/.test(document.getElementById("autosaveStatus").textContent),
  );
});
test("G12 browser generation preserves correction, entry and cutting feed", async (t) => {
  const page = await openApplication(browser, t),
    project = await circleProject("xy", "center");
  Object.assign(project.values, {
    depth: -8,
    workPlane: "xy",
    compMode: "center",
    cutSide: "g12",
    g12Cycle: true,
    repeatMode: "none",
    corrector: 3,
    correctionValue: 8000,
    feedInHeader: false,
    feed: 20,
    plunge: 5,
  });
  Object.assign(project.operations[0].params, project.values);
  await loadProject(page, project);
  const code = await calculate(page);
  assert.match(code, /G1[23]I\d+(?:F\d+)?D03/);
  assert.match(await page.locator("#compReadout").innerText(), /D03 = 8000/);
  const entry = await page.evaluate(() => ATLANTA.getState().entry);
  assert.deepEqual(entry.point, { x: 0, y: 0 });
  assert.deepEqual(entry.exit, { x: 0, y: 0 });
  const parsed = CAM.parseNC(code, MACHINES.profile("fanuc3000c"));
  assert.deepEqual(parsed.errors, []);
  assert(parsed.motions.some((motion) => motion.circularCycle && motion.feed === 20));
});
