/**
 * history controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.B
 * @param {*} deps.C
 * @param {*} deps.cancelPaint
 * @param {*} deps.checkpoint
 * @param {*} deps.cleanDimensions
 * @param {*} deps.closeDimEditor
 * @param {*} deps.closeScale
 * @param {*} deps.env
 * @param {*} deps.finiteReferenceIds
 * @param {*} deps.G
 * @param {*} deps.historyEncoder
 * @param {*} deps.id
 * @param {*} deps.model
 * @param {*} deps.rebuildIndex
 * @param {*} deps.render
 * @param {*} deps.S
 * @param {*} deps.selectionIds
 * @param {*} deps.setSelection
 */
export function createHistory(deps) {
  function sync(fit = false, prepared) {
    const scene = prepared || deps.S.toScene(deps.model.items || [], deps.env.activeOperation().id);
    deps.rebuildIndex();
    deps.env.onScene(scene, fit);
    deps.render();
    deps.env.save();
  }

  function historyFrame(frame) {
    return deps.historyEncoder.encode(JSON.stringify(frame));
  }

  function trimHistory(list) {
    let count = deps.model.undo.length + deps.model.redo.length,
      bytes =
        deps.model.undo.reduce((n, f) => n + f.byteLength, 0) +
        deps.model.redo.reduce((n, f) => n + f.byteLength, 0);
    while (count > 10 || bytes > 2000000) {
      const source = list.length
          ? list
          : list === deps.model.undo
            ? deps.model.redo
            : deps.model.undo,
        removed = source.shift();
      if (!removed) break;
      bytes -= removed.byteLength;
      count--;
    }
  }

  function commit(next, fit = false, options = {}) {
    deps.cancelPaint();
    const before = options.before || deps.checkpoint(),
      beforePlan = (before.items || []).filter((item) => !deps.C.isConstruction(item)),
      nextPlan = next.filter((item) => !deps.C.isConstruction(item)),
      hasGuides =
        (before.items || []).some((item) => deps.C.isGuide(item)) ||
        next.some((item) => deps.C.isGuide(item));
    const isFirstShape =
      beforePlan.length === 0 && nextPlan.length > 0 && !hasGuides && options.autoGuides !== false;
    if (isFirstShape) {
      let cx = null,
        cy = null;
      if (
        nextPlan.length === 1 &&
        nextPlan[0].type === "circle" &&
        nextPlan[0].c &&
        Number.isFinite(nextPlan[0].c.x) &&
        Number.isFinite(nextPlan[0].c.y)
      ) {
        cx = nextPlan[0].c.x;
        cy = nextPlan[0].c.y;
      } else {
        try {
          const segs = nextPlan.flatMap((item) => {
            try {
              return deps.S.segments(item);
            } catch (e) {
              return [];
            }
          });
          if (segs.length > 0) {
            const b = deps.C.bounds([{ segs }]);
            if (Number.isFinite(b.cx) && Number.isFinite(b.cy)) {
              cx = b.cx;
              cy = b.cy;
            }
          }
        } catch (e) {}
      }
      if (Number.isFinite(cx) && Number.isFinite(cy)) {
        const clean = (n) => (Math.abs(n) < 1e-9 ? 0 : +n.toFixed(6));
        cx = clean(cx);
        cy = clean(cy);
        const gid1 = deps.id(next),
          gid2 = deps.id(next);
        next = [
          ...next,
          {
            id: gid1,
            type: "line",
            construction: true,
            guide: true,
            a: deps.C.P(cx, cy),
            b: deps.C.P(cx + 10, cy),
          },
          {
            id: gid2,
            type: "line",
            construction: true,
            guide: true,
            a: deps.C.P(cx, cy),
            b: deps.C.P(cx, cy + 10),
          },
        ];
      }
    }
    const oldIds = new Set((before.items || []).map((item) => item.id)),
      added = next.filter((item) => !oldIds.has(item.id)).map((item) => item.id);
    if (fit || isFirstShape) before.fitOnRestore = true;
    const changedIds = next
      .filter((item) => {
        const old = (before.items || []).find((previous) => previous.id === item.id);
        return (
          !old ||
          JSON.stringify([old.type, old.a, old.b, old.m, old.c, old.r]) !==
            JSON.stringify([item.type, item.a, item.b, item.m, item.c, item.r])
        );
      })
      .map((item) => item.id);
    if (options.node !== false && changedIds.length && deps.B.autoNode)
      next = deps.B.autoNode(next, deps.id, { changedIds });
    next = deps.B.heal(next);
    let dims = options.dimensions === undefined ? deps.model.dimensions : options.dimensions;
    const nextById = new Map(next.map((item) => [item.id, item])),
      sourceMap = next.sourceMap;
    if (sourceMap)
      dims = dims.map((d) => {
        const out = { ...d };
        for (const key of ["a", "b"]) {
          const old = d[key + "Item"],
            ids = old && sourceMap.get(old);
          if (ids && ids.length) {
            const found = ids.find((id) => {
              const item = nextById.get(id);
              return item && deps.G.contains(item, d[key], 0.001);
            });
            out[key + "Item"] = found || null;
          }
        }
        return out;
      });
    const scene = deps.S.toScene(next, deps.env.activeOperation().id),
      chosen = options.selectedIds === undefined ? deps.selectionIds() : options.selectedIds,
      map = next.sourceMap;
    const nextSelection = map ? chosen.flatMap((value) => map.get(value) || [value]) : chosen;
    deps.model.referenceIds = deps.finiteReferenceIds(
      map
        ? deps.model.referenceIds.flatMap((value) => map.get(value) || [value])
        : deps.model.referenceIds,
      next,
    );
    deps.closeScale();
    deps.model.redo = [];
    deps.model.undo.push(historyFrame(before));
    trimHistory(deps.model.undo);
    deps.model.items = next;
    deps.model.dimensions = deps.cleanDimensions(dims);
    deps.closeDimEditor();
    deps.setSelection(
      nextSelection.filter((value) => nextById.has(value)),
      (options.selectedDims || deps.model.selectedDims).filter((value) =>
        deps.model.dimensions.some((d) => d.id === value),
      ),
    );
    sync(isFirstShape ? "firstShape" : fit, scene);
  }
  return { sync, historyFrame, trimHistory, commit };
}
