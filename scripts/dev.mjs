import http from "node:http";
import fs from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { build } from "./build.mjs";
import { resolve } from "./paths.mjs";

await build();
const dist = resolve("dist");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".json": "application/json",
};
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const file = path.resolve(
      dist,
      "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    const relative = path.relative(dist, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      response.writeHead(403).end();
      return;
    }
    const content = await fs.readFile(file);
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
const port = Number(process.env.PORT || 5173);
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Open http://127.0.0.1:${port} — rebuilds automatically; refresh the browser after edits.`,
  ),
);
let timer,
  building = false,
  dirty = false;
async function rebuild() {
  if (building) {
    dirty = true;
    return;
  }
  building = true;
  try {
    await build();
  } catch (error) {
    console.error(error);
  } finally {
    building = false;
    if (dirty) {
      dirty = false;
      await rebuild();
    }
  }
}
const watcher = watch(resolve("src"), { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 120);
});
function close() {
  watcher.close();
  clearTimeout(timer);
  server.close();
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
