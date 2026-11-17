import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { parse } from "parse5";
import postcss from "postcss";
import { resolve, version, offlineName } from "../../scripts/paths.mjs";

const html = await fs.readFile(resolve("dist", offlineName), "utf8");
const doc = parse(html),
  body = doc.childNodes
    .find((node) => node.tagName === "html")
    .childNodes.find((node) => node.tagName === "body");
function snapshot(node) {
  if (node.nodeName === "#text")
    return node.value.replaceAll(version, "VERSION").replace(/\s+/g, " ").trim() || null;
  if (
    !node.tagName ||
    node.tagName === "script" ||
    node.attrs?.some((attr) => attr.name === "id" && attr.value === "zReferenceSection")
  )
    return null;
  return {
    tag: node.tagName,
    attrs: node.attrs
      .map((attr) => [attr.name, attr.value.replaceAll(version, "VERSION")])
      .sort(([a], [b]) => a.localeCompare(b)),
    children: (node.content?.childNodes || node.childNodes || []).map(snapshot).filter(Boolean),
  };
}
function compareNodes(actual, expected, location = "body") {
  if (typeof expected === "string") {
    assert.equal(actual, expected, location);
    return;
  }
  const attributes = (node) =>
    node.attrs.map(([name, value]) => [
      name,
      name === "style"
        ? postcss
            .parse(`x { ${value} }`)
            .first.nodes.map((declaration) => [
              declaration.prop,
              declaration.value,
              !!declaration.important,
            ])
        : value,
    ]);
  assert.equal(actual.tag, expected.tag, location);
  assert.deepEqual(attributes(actual), attributes(expected), `${location}: attributes`);
  assert.equal(actual.children.length, expected.children.length, `${location}: children`);
  expected.children.forEach((child, index) =>
    compareNodes(actual.children[index], child, `${location}/${child.tag || "text"}[${index}]`),
  );
}
test("existing interface is preserved outside the new Z setup and top-left origin default", async () => {
  const expected = JSON.parse(
    await fs.readFile(new URL("../fixtures/baseline-dom-3.87.json", import.meta.url), "utf8"),
  );
  function updateOriginDefault(node) {
    if (node?.attrs?.some(([name, value]) => name === "id" && value === "originPreset")) {
      for (const option of node.children.filter((child) => child.tag === "option")) {
        option.attrs = option.attrs.filter(([name]) => name !== "selected");
        if (option.attrs.some(([name, value]) => name === "value" && value === "tl"))
          option.attrs.push(["selected", ""]);
        option.attrs.sort(([a], [b]) => a.localeCompare(b));
      }
    }
    if (node?.children)
      node.children = node.children.map((child) =>
        child === "Каждая операция возвращается в X0 Y0 Z30."
          ? "Каждая операция возвращается в X0 Y0 и Z своей привязки."
          : child,
      );
    for (const child of node?.children || []) updateOriginDefault(child);
  }
  updateOriginDefault(expected);
  compareNodes(snapshot(body), expected);
});
test("offline artifact contains one executable bundle and no external assets", () => {
  const scripts = [];
  function visit(node) {
    if (node.tagName === "script") scripts.push(node);
    if (["script", "link", "img", "iframe", "source"].includes(node.tagName)) {
      for (const attr of node.attrs.filter((attr) => ["src", "href"].includes(attr.name)))
        assert(!/^(?:https?:|\/\/)/i.test(attr.value));
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(doc);
  assert.equal(scripts.length, 1);
  assert(!scripts[0].attrs.some((attr) => attr.name === "src"));
  new vm.Script(scripts[0].childNodes[0].value);
  assert.equal((html.match(/<\/html>/g) || []).length, 1);
  assert(!html.includes("<!-- include:"));
  assert(!html.includes("{{APP_VERSION}}"));
});
test("build manifest identifies the exact standalone artifact", async () => {
  const manifest = JSON.parse(await fs.readFile(resolve("dist/manifest.json"), "utf8"));
  assert.equal(manifest.offline, offlineName);
  assert.equal(manifest.sha256, createHash("sha256").update(html).digest("hex"));
});
