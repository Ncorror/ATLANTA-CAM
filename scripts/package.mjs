import fs from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import { verify } from "./verify.mjs";
import { root, resolve, version, filesUnder } from "./paths.mjs";

const args = process.argv.slice(2);
if (args.length && (args[0] !== "--output" || args.length !== 2))
  throw new Error("Usage: npm run package -- [--output path.zip]");
await verify({ installBrowser: process.env.ATLANTA_INSTALL_BROWSER === "1" });
const output = args.length
  ? path.resolve(process.cwd(), args[1])
  : resolve("releases", `ATLANTA-CAM-${version}.zip`);
const entries = {};
const directories = ["src", "scripts", "tests", "docs", "examples", "dist", "reports"];
const files = [
  "README.md",
  "CHANGELOG.md",
  "package.json",
  "package-lock.json",
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".prettierrc.json",
  ".prettierignore",
];
for (const directory of directories)
  files.push(...(await filesUnder(resolve(directory))).map((file) => path.relative(root, file)));
for (const file of files.sort()) {
  entries[`ATLANTA-CAM-${version}/${file.replaceAll("\\", "/")}`] = [
    new Uint8Array(await fs.readFile(resolve(file))),
    { mtime: new Date(2020, 0, 1) },
  ];
}
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, zipSync(entries, { level: 6 }));
console.log(`Packaged ${files.length} files: ${output}`);
