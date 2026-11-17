import assert from "node:assert/strict";
import { test } from "node:test";
import { createApplicationState } from "../../src/app/state.js";
import DRAFTING from "../../src/geometry/drafting.js";
import { executeCalculation } from "../../src/workers/task.js";

test("application instances never share mutable state or tool defaults", () => {
  const first = createApplicationState(),
    second = createApplicationState();
  first.pan.x = 100;
  first.contours.push({ id: "test" });
  first.toolProfiles.mill.diameter = "99";
  assert.equal(second.pan.x, 0);
  assert.equal(second.contours.length, 0);
  assert.equal(second.toolProfiles.mill.diameter, "8");
  assert.equal(createApplicationState().toolProfiles.mill.diameter, "8");
});
test("arithmetic parsing is available before creating any editor", () => {
  assert.equal(DRAFTING.parseMath("2*(3+4)"), 14);
  assert.equal(DRAFTING.parseMath("12,5+0,5"), 13);
  assert.throws(() => DRAFTING.parseMath("alert(1)"));
});
test("calculation failure crosses the worker boundary as structured data", () => {
  const phases = [],
    message = executeCalculation({ contours: [], config: {} }, (phase) => phases.push(phase));
  assert(message.error?.message);
  assert.equal(typeof message.error.message, "string");
  assert(phases.length > 0);
  assert.deepEqual(JSON.parse(JSON.stringify(message)).error.message, message.error.message);
});
