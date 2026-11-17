import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const resolve = (...parts) => path.join(root, ...parts);
export const metadata = JSON.parse(await fs.readFile(resolve("package.json"), "utf8"));
export const version = metadata.version.replace(/\.0$/, "");
export const offlineName = `ATLANTA-Contour-Offline-${version}.html`;

export async function filesUnder(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? filesUnder(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    ),
  );
  return nested.flat().sort();
}
