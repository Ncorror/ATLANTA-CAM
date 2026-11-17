import { planeInfo as camPlaneInfo } from "../core/planes.js";

import ORIGIN from "../geometry/origin.js";
import { MAX_OPERATIONS, checkTools, operationId, validColor } from "../operations/tools.js";
function restoreOperations(p, operationKeys, drillKeys, defaultDrill, originModule) {
  if (!Array.isArray(p.operations) || !p.operations.length || p.operations.length > MAX_OPERATIONS)
    throw Error("Повреждён список операций проекта.");
  const origin = originModule || ORIGIN;
  const ids = new Set(),
    list = p.operations.map((op) => {
      var _op$toolNumber;
      if (
        !op ||
        !operationId(op.id) ||
        ids.has(op.id) ||
        !["profile", "drill"].includes(op.kind) ||
        (op.id === "primary" && op.kind !== "profile") ||
        !validColor(op.color)
      )
        throw Error("Повреждены параметры операции проекта.");
      if (
        op.toolNumber != null &&
        (!Number.isInteger(op.toolNumber) || op.toolNumber < 1 || op.toolNumber > 9999)
      )
        throw Error("Повреждён номер инструмента операции.");
      ids.add(op.id);
      let params =
        op.params && typeof op.params === "object" && Array.isArray(operationKeys)
          ? Object.fromEntries(
              operationKeys
                .filter((key) => ["string", "number", "boolean"].includes(typeof op.params[key]))
                .map((key) => [key, op.params[key]]),
            )
          : null;
      // Loading an older operation must not silently enable a different touch-off.
      params = { ...(params || {}), zReferenceEnabled: params?.zReferenceEnabled === true };
      if ((params === null || params === void 0 ? void 0 : params.workPlane) != null)
        camPlaneInfo(params.workPlane);
      const sides = Array.isArray(op.sides)
        ? op.sides.filter(
            (pair) =>
              Array.isArray(pair) &&
              typeof pair[0] === "string" &&
              ["auto", "inside", "outside", "on", "wall", "network"].includes(pair[1]),
          )
        : [];
      const entry =
        op.entry &&
        Number.isFinite(op.entry.x) &&
        Number.isFinite(op.entry.y) &&
        typeof op.entry.signature === "string"
          ? op.entry
          : null;
      const entryStart =
        op.entryStart &&
        Number.isFinite(op.entryStart.x) &&
        Number.isFinite(op.entryStart.y) &&
        Math.abs(op.entryStart.x) <= 1e6 &&
        Math.abs(op.entryStart.y) <= 1e6 &&
        typeof op.entryStart.signature === "string"
          ? op.entryStart
          : null;
      const exitPoint =
        op.exitPoint &&
        Number.isFinite(op.exitPoint.x) &&
        Number.isFinite(op.exitPoint.y) &&
        Math.abs(op.exitPoint.x) <= 1e6 &&
        Math.abs(op.exitPoint.y) <= 1e6 &&
        typeof op.exitPoint.signature === "string"
          ? op.exitPoint
          : null;
      const restored = {
        id: op.id,
        kind: op.kind,
        color: op.color,
        toolNumber:
          (_op$toolNumber = op.toolNumber) !== null && _op$toolNumber !== void 0
            ? _op$toolNumber
            : null,
        params,
        sides,
        entry,
        entryStart,
        exitPoint,
      };
      if (op.originSetup && origin) {
        var _value$shift$x, _value$shift, _value$shift$y, _value$shift2;
        const value = op.originSetup;
        origin.resolve(
          { minX: 0, minY: 0, maxX: 0, maxY: 0 },
          value.preset,
          (_value$shift$x =
            (_value$shift = value.shift) === null || _value$shift === void 0
              ? void 0
              : _value$shift.x) !== null && _value$shift$x !== void 0
            ? _value$shift$x
            : 0,
          (_value$shift$y =
            (_value$shift2 = value.shift) === null || _value$shift2 === void 0
              ? void 0
              : _value$shift2.y) !== null && _value$shift$y !== void 0
            ? _value$shift$y
            : 0,
          value.customBase,
        );
        restored.originSetup = JSON.parse(JSON.stringify(value));
      }
      if (op.kind === "drill" && drillKeys && defaultDrill)
        restored.drill = Object.fromEntries(
          Object.keys(drillKeys).map((key) => {
            var _op$drill;
            return [
              key,
              typeof ((_op$drill = op.drill) === null || _op$drill === void 0
                ? void 0
                : _op$drill[key]) === "string"
                ? op.drill[key]
                : defaultDrill[key],
            ];
          }),
        );
      return restored;
    });
  if (!ids.has(p.activeOperationId)) throw Error("Повреждён выбор операции проекта.");
  const maxId = Math.max(
    0,
    ...list.filter((op) => op.id !== "primary").map((op) => Number(op.id.slice(1))),
  );
  return {
    list,
    next: Math.max(
      maxId + 1,
      Number.isInteger(p.nextOperation) && p.nextOperation > 0 && p.nextOperation < 1e8
        ? p.nextOperation
        : 1,
    ),
    tools: checkTools(p.tools),
  };
}

export { restoreOperations };
