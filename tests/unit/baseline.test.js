import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { ATLANTA_OPERATIONS as A, MACHINES as M } from "../../src/engine.js";
const baseline = JSON.parse(
  fs.readFileSync(new URL("../fixtures/baseline-3.87.json", import.meta.url), "utf8"),
);
for (const sample of baseline.cases) {
  test(`3.87 parity: ${sample.name}`, () => {
    const { config, contours } = structuredClone(sample);
    const part = {
      id: "primary",
      name: "TEST MILL",
      op: { id: "primary", kind: "profile" },
      config,
      contours,
    };
    part.result =
      config.repeatMode === "g25"
        ? A.generateG25(part, part.op, config)
        : M.generate(contours, config);
    const result = A.assemble([part], config);
    assert.equal(result.code, sample.code, "NC text must remain identical to 3.87");
    assert.equal(result.motions.length, sample.motionCount);
    assert.equal(
      createHash("sha256").update(JSON.stringify(result.motions)).digest("hex"),
      sample.motionsSha256,
      "All motion fields must remain identical to 3.87",
    );
  });
}
