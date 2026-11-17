import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { resolve, offlineName } from "../../scripts/paths.mjs";
import { SKETCH } from "../../src/engine.js";

export async function launchBrowser() {
  return chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
  });
}
export async function fixture(name) {
  return JSON.parse(
    await fs.readFile(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"),
  );
}
export async function openApplication(browser, t) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [],
    external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) external.push(request.url());
  });
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], "No uncaught browser errors");
    assert.deepEqual(external, [], "Offline app must not request external resources");
  });
  await page.goto(pathToFileURL(resolve("dist", offlineName)).href);
  await page.waitForFunction(() => !!window.ATLANTA);
  return page;
}
export async function loadProject(page, project) {
  await page.locator("#fileInput").setInputFiles({
    name: "test-project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  // FileReader resolves asynchronously; observe the read completion through the input reset.
  await page.waitForFunction(() => document.getElementById("fileInput").value === "");
}
export async function calculate(page) {
  await page.evaluate(() => window.ATLANTA.calculate());
  await page.waitForFunction(() => window.ATLANTA.getState().ready, { timeout: 10000 });
  return page.locator("#code").inputValue();
}
export async function saveProject(page) {
  const pending = page.waitForEvent("download");
  await page.locator("#saveProject").click();
  const download = await pending,
    stream = await download.createReadStream(),
    chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function circleProject(plane, mode) {
  const project = await fixture("blank-project"),
    config = await fixture("config");
  project.sketch.items = [{ id: "s1", type: "circle", c: { x: 0, y: 0 }, r: 30, machining: true }];
  project.sketch.open = false;
  project.rawDxf = SKETCH.toScene(project.sketch.items).dxf;
  const values = {
    ...config,
    depth: -8,
    stepDown: mode === "tool" ? 2 : 8,
    workPlane: plane,
    compMode: mode === "g25" ? "center" : mode,
    repeatMode: mode === "g25" ? "g25" : "none",
    toolShape: "ball_mill",
    toolWorkingLength: 16,
  };
  Object.assign(project.values, values);
  Object.assign(project.operations[0].params, values);
  Object.assign(project.toolProfiles.mill, values);
  return project;
}
