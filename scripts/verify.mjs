import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { testArguments } from "./test.mjs";
import { resolve, root, version } from "./paths.mjs";

/** Complete, repeatable release verification; does not require npm on PATH. */
export async function verify({ installBrowser = false } = {}) {
  await fs.mkdir(resolve("reports"), { recursive: true });
  const report = {
    version,
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    browser: process.env.BROWSER_CHANNEL || "playwright-chromium",
    status: "running",
    checks: [],
  };
  const steps = [
    ["format", [resolve("node_modules/prettier/bin/prettier.cjs"), "--check", "."]],
    ["architecture", [resolve("scripts/check.mjs")]],
    ["unit"],
    ["build", [resolve("scripts/build.mjs")]],
  ];
  if (installBrowser) {
    steps.push([
      "browser-install",
      [
        resolve("node_modules/playwright/cli.js"),
        "install",
        "--with-deps",
        "--only-shell",
        "chromium",
      ],
    ]);
  }
  steps.push(["browser"]);
  try {
    for (const [name, command] of steps) {
      console.log(`Checking ${name}…`);
      const log = resolve("reports", name + ".txt");
      const isTest = command === undefined;
      const reporters = isTest
        ? [
            "--test-reporter=dot",
            "--test-reporter-destination=stdout",
            "--test-reporter=tap",
            `--test-reporter-destination=${log}`,
          ]
        : [];
      const startedAt = performance.now();
      const entry = { name, passed: false };
      report.checks.push(entry);
      try {
        if (isTest) await fs.writeFile(log, "");
        const args = command ?? (await testArguments(name));
        const result = spawnSync(process.execPath, [...reporters, ...args], {
          cwd: root,
          encoding: "utf8",
          timeout: name === "browser-install" ? 360000 : 180000,
          maxBuffer: 16 * 1024 * 1024,
        });
        const output = (result.stdout || "") + (result.stderr || "");
        const tap = isTest ? await fs.readFile(log, "utf8") : "";
        await fs.writeFile(log, tap ? tap + (result.stderr || "") : output);
        if (isTest) {
          entry.tests = Number(tap.match(/^# tests (\d+)/m)?.[1] || 0);
          entry.failures = Number(tap.match(/^# fail (\d+)/m)?.[1] || 0);
        }
        if (result.error || result.status !== 0) {
          console.error(output);
          throw result.error || new Error(`${name} failed`);
        }
        entry.passed = true;
      } finally {
        entry.durationMs = Math.round(performance.now() - startedAt);
      }
    }
    report.artifact = JSON.parse(await fs.readFile(resolve("dist/manifest.json"), "utf8"));
    report.tests = report.checks.reduce((sum, check) => sum + (check.tests || 0), 0);
    report.status = "passed";
    console.log(`Verification passed: ${report.tests} tests.`);
    return report;
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    throw error;
  } finally {
    await fs.writeFile(
      resolve("reports/verification.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await verify();
