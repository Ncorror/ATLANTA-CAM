import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import fs from "node:fs/promises";
import {
  launchBrowser,
  openApplication,
  circleProject,
  loadProject,
  calculate,
  fixture,
} from "../helpers/browser.js";
import { resolve } from "../../scripts/paths.mjs";
let browser;
before(async () => {
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
});

for (const plane of ["xy", "zx", "yz"])
  for (const mode of ["center", "tool", "g25"]) {
    test(`UI calculates ${plane} / ${mode}`, async (t) => {
      const page = await openApplication(browser, t);
      await loadProject(page, await circleProject(plane, mode));
      const code = await calculate(page);
      assert.match(code, /G92X0Y0Z30000/);
      assert.equal(await page.locator("#sketchExact").count(), 0);
      assert.equal(await page.locator("#toolShape").inputValue(), "ball_mill");
      if (plane === "zx" && mode === "g25") {
        await fs.mkdir(resolve("test-results"), { recursive: true });
        await page.screenshot({ path: resolve("test-results/xz-g25.png") });
      }
    });
  }
test("background worker and main-thread fallback give identical results", async (t) => {
  const page = await openApplication(browser, t),
    config = await fixture("config");
  const results = await page.evaluate(async (config) => {
    const contours = SKETCH.toScene([
      { id: "circle", type: "circle", c: { x: 0, y: 0 }, r: 30, machining: true },
    ]).machiningContours.map((c) => ({ ...c, enabled: true, side: "outside" }));
    const run = () =>
      new Promise((resolve) => {
        const progress = [];
        CAM_JOB.run(
          contours,
          {
            ...config,
            compMode: "tool",
            toolShape: "ball_mill",
            toolWorkingLength: 16,
            stepDown: 2,
            workPlane: "zx",
          },
          {
            progress: (phase) => progress.push(phase),
            complete: (message) => resolve({ ...message, progress }),
          },
        );
      });
    const worker = await run(),
      original = window.Worker;
    try {
      window.Worker = undefined;
      return { worker, fallback: await run() };
    } finally {
      window.Worker = original;
    }
  }, config);
  assert(!results.worker.error, JSON.stringify(results.worker.error));
  assert.equal(results.worker.result.passes, 4);
  assert(!results.worker.progress.some((p) => p.includes("текущем окне")));
  assert(results.fallback.progress.some((p) => p.includes("текущем окне")));
  assert.deepEqual(results.worker.result, results.fallback.result);
});
test("cancel prevents a pending fallback calculation from completing", async (t) => {
  const page = await openApplication(browser, t);
  const calls = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const original = window.Worker;
        window.Worker = undefined;
        let completed = 0;
        try {
          const job = CAM_JOB.run(
            [],
            {},
            {
              progress() {},
              complete() {
                completed++;
              },
            },
          );
          job.cancel();
        } finally {
          window.Worker = original;
        }
        setTimeout(() => resolve(completed), 100);
      }),
  );
  assert.equal(calls, 0);
});
