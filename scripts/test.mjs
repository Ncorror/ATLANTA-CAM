import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve, root, filesUnder } from "./paths.mjs";

export async function testArguments(suite) {
  if (!["unit", "browser"].includes(suite)) throw new Error("Choose unit or browser");
  const files = (await filesUnder(resolve("tests", suite))).filter((file) =>
    file.endsWith(".test.js"),
  );
  if (!files.length) throw new Error(`No tests found in ${suite}`);
  const options =
    suite === "browser"
      ? [`--test-concurrency=${process.env.ATLANTA_BROWSER_CONCURRENCY ?? "1"}`]
      : [];
  return ["--test", ...options, ...files];
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = spawnSync(process.execPath, await testArguments(process.argv[2]), {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
