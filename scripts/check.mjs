import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "acorn";
import { analyze } from "eslint-scope";
import postcss from "postcss";
import { resolve, filesUnder } from "./paths.mjs";

const sourceRoot = resolve("src"),
  files = await filesUnder(sourceRoot),
  graph = new Map();
const standards = new Set(
  "Array ArrayBuffer BigInt Boolean Date Error EvalError Float32Array Float64Array Infinity Int8Array Int16Array Int32Array JSON Map Math NaN Number Object Promise RangeError ReferenceError RegExp Set String Symbol SyntaxError TypeError URIError Uint8Array Uint16Array Uint32Array Uint8ClampedArray WeakMap WeakSet decodeURI decodeURIComponent encodeURI encodeURIComponent escape globalThis isFinite isNaN parseFloat parseInt undefined unescape console structuredClone TextEncoder TextDecoder".split(
    " ",
  ),
);
const platform = new Set(
  "window self document navigator localStorage URL Blob File FileReader Worker Storage DOMException Image Path2D HTMLElement Element DocumentFragment Event CustomEvent MouseEvent PointerEvent KeyboardEvent ResizeObserver IntersectionObserver performance requestAnimationFrame cancelAnimationFrame setTimeout clearTimeout setInterval clearInterval alert confirm prompt getComputedStyle devicePixelRatio __APP_VERSION__".split(
    " ",
  ),
);
platform.add("Option");
let moduleCount = 0;
const globalErrors = new Set();
for (const file of files) {
  if (file.endsWith(".css")) {
    postcss.parse(await fs.readFile(file, "utf8"), { from: file });
    continue;
  }
  if (!file.endsWith(".js")) continue;
  moduleCount++;
  const relative = path.relative(sourceRoot, file).replaceAll("\\", "/");
  const ast = parse(await fs.readFile(file, "utf8"), {
    sourceType: "module",
    ecmaVersion: "latest",
    ranges: true,
  });
  const pure = /^(core|cam|nc|geometry|formats|operations|persistence|data)\//.test(relative);
  const dependencies = [];
  for (const node of ast.body) {
    if (
      !node.source ||
      !["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type)
    )
      continue;
    const specifier = node.source.value;
    if (specifier === "atlanta:worker" && relative === "workers/client.js") continue;
    assert(
      specifier.startsWith("."),
      `${relative}: unexpected external runtime dependency ${specifier}`,
    );
    const target = path.resolve(path.dirname(file), specifier);
    await fs.access(target);
    if (pure)
      assert(
        !/^(app|ui|platform|workers)\//.test(
          path.relative(sourceRoot, target).replaceAll("\\", "/"),
        ),
        `${relative}: domain module depends on browser code`,
      );
    if (/^(cam|nc|geometry|operations|persistence)\//.test(relative))
      assert(
        !specifier.endsWith("core/index.js"),
        `${relative}: import individual core functions instead of the compatibility facade`,
      );
    dependencies.push(target);
  }
  graph.set(file, dependencies);
  const manager = analyze(ast, { ecmaVersion: 2024, sourceType: "module", optimistic: true });
  for (const reference of manager.globalScope.through) {
    const name = reference.identifier.name;
    if (!(standards.has(name) || (!pure && platform.has(name))))
      globalErrors.add(`${relative}: unresolved or forbidden global ${name}`);
  }
}
assert.equal(globalErrors.size, 0, [...globalErrors].join("\n"));
const visited = new Set(),
  active = [];
function visit(file) {
  assert(
    !active.includes(file),
    "Import cycle: " + [...active, file].map((f) => path.relative(sourceRoot, f)).join(" -> "),
  );
  if (visited.has(file)) return;
  active.push(file);
  for (const dependency of graph.get(file) || []) visit(dependency);
  active.pop();
  visited.add(file);
}
for (const file of graph.keys()) visit(file);
console.log(
  `Architecture OK: ${moduleCount} ES modules, no import cycles, no implicit globals, no browser dependencies in the calculation engine.`,
);
