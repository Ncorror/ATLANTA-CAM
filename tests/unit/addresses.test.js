import assert from "node:assert/strict";
import { test } from "node:test";
import { ATLANTA_OPERATIONS as A, CAM as C, MACHINES as M } from "../../src/engine.js";
test("renumbering updates G25 P and Q", () => {
  const code = A.renumberNC("%\nN001G91G01X1000F100\nN002X-1000\nN003G25P1Q2R2\nN004M30\n%", {
    step: 10,
    start: 10,
  });
  assert.match(code, /G25P010Q020R2/);
  assert.deepEqual(C.parseNC(code, { machine: "fanuc3000c" }).errors, []);
});
test("renumbering updates adjacent M98 addresses", () => {
  const code = A.renumberNC("%\nN1G91\nN2M98P101R2\nN3M30\nN101G01X1000F100\nN102M99\n%", {
    step: 2,
    start: 2,
    subprogramStart: 200,
  });
  assert.match(code, /M98P200R2/);
  assert.deepEqual(C.parseNC(code, { machine: "fanuc3000c" }).errors, []);
});
test("end mill and corner radius profiles", () => {
  const config = { diameter: 16, toolWorkingLength: 20 };
  assert.equal(M.toolRadius({ ...config, toolShape: "end_mill" }, 2), 8);
  assert(
    Math.abs(
      M.toolRadius({ ...config, toolShape: "bull_mill", toolProfileRadius: 2 }, 1) -
        (6 + Math.sqrt(3)),
    ) < 1e-9,
  );
});
