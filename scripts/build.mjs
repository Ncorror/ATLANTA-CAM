import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
import { resolve, version, offlineName } from "./paths.mjs";

const templateRoot = resolve("src/ui/templates");
async function template(name, chain = []) {
  const file = path.resolve(templateRoot, name);
  const relative = path.relative(templateRoot, file);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error(`Invalid template path: ${name}`);
  if (chain.includes(file)) throw new Error(`Template include cycle: ${name}`);
  const source = await fs.readFile(file, "utf8");
  const pattern = /<!-- include: ([^>]+?) -->/g;
  const parts = [];
  let start = 0;
  for (const match of source.matchAll(pattern)) {
    parts.push(source.slice(start, match.index), await template(match[1], [...chain, file]));
    start = match.index + match[0].length;
  }
  return [...parts, source.slice(start)].join("");
}

/** Emit a readable development build and a self-contained offline release. */
export async function build() {
  const dist = resolve("dist");
  await fs.mkdir(dist, { recursive: true });
  const shared = {
    absWorkingDir: resolve(),
    bundle: true,
    write: false,
    target: ["firefox55", "chrome109"],
    logLevel: "warning",
    charset: "utf8",
    legalComments: "inline",
  };
  const worker = await esbuild.build({
    ...shared,
    entryPoints: [resolve("src/workers/entry.js")],
    format: "iife",
  });
  const workerText = worker.outputFiles[0].text;
  const app = await esbuild.build({
    ...shared,
    entryPoints: [resolve("src/main.js")],
    outfile: path.join(dist, "app.js"),
    format: "iife",
    sourcemap: "external",
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [
      {
        name: "embedded-worker",
        setup(builder) {
          builder.onResolve({ filter: /^atlanta:worker$/ }, () => ({
            path: "worker",
            namespace: "atlanta",
          }));
          builder.onLoad({ filter: /.*/, namespace: "atlanta" }, () => ({
            contents: `export default ${JSON.stringify(workerText)};`,
            loader: "js",
          }));
        },
      },
    ],
  });
  const styles = await esbuild.build({
    ...shared,
    entryPoints: [resolve("src/styles/index.css")],
    outfile: path.join(dist, "style.css"),
  });
  const script = app.outputFiles.find((file) => file.path.endsWith("app.js")).text;
  const css = styles.outputFiles[0].text;
  const html = (await template("index.html")).replaceAll("{{APP_VERSION}}", version);
  if (
    html.includes("<!-- include:") ||
    !html.includes("<!-- APP_SCRIPT -->") ||
    !html.includes("<!-- APP_STYLES -->")
  )
    throw new Error("Unresolved or missing template placeholders");
  const offline = html
    .replace("<!-- APP_STYLES -->", `<style>\n${css.replace(/<\/style/gi, "<\\/style")}\n</style>`)
    .replace(
      "<!-- APP_SCRIPT -->",
      `<script>\n${script.replace(/<\/script/gi, "<\\/script")}\n</script>`,
    );
  // Only the development page permits same-origin assets. The offline CSP stays restrictive.
  const dev = html
    .replace("script-src 'unsafe-inline'", "script-src 'self' 'unsafe-inline'")
    .replace("style-src 'unsafe-inline'", "style-src 'self' 'unsafe-inline'")
    .replace("<!-- APP_STYLES -->", '<link rel="stylesheet" href="./style.css">')
    .replace("<!-- APP_SCRIPT -->", '<script src="./app.js"></script>');
  await Promise.all(
    [...app.outputFiles, ...styles.outputFiles].map((file) =>
      fs.writeFile(file.path, file.contents),
    ),
  );
  await Promise.all([
    fs.writeFile(path.join(dist, offlineName), offline),
    fs.writeFile(path.join(dist, "index.html"), dev),
    fs.writeFile(path.join(dist, "worker.js"), workerText),
    fs.writeFile(
      path.join(dist, "manifest.json"),
      JSON.stringify(
        {
          version,
          offline: offlineName,
          sha256: createHash("sha256").update(offline).digest("hex"),
        },
        null,
        2,
      ) + "\n",
    ),
  ]);
  console.log(`Built ${offlineName} (${Buffer.byteLength(offline)} bytes)`);
  return { offline, file: path.join(dist, offlineName) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await build();
