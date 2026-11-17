/**
 * references controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.auxiliaryCache
 * @param {*} deps.B
 * @param {*} deps.C
 * @param {*} deps.model
 * @param {*} deps.S
 * @param {*} deps.updateSnapContext
 */
export function createReferences(deps) {
  function auxiliaryPoints(item) {
    var _model$items;
    const limit =
        ((_model$items = deps.model.items) === null || _model$items === void 0
          ? void 0
          : _model$items.length) > 2000
          ? Math.max(24, Math.floor(240000 / deps.model.items.length))
          : 255,
      cached = deps.auxiliaryCache.get(item);
    if (cached && cached.limit === limit) return cached.points;
    let points;
    if (item.type === "line") points = [item.a, item.b];
    else {
      points = [];
      const segments = deps.S.segments(item),
        quota = Math.floor(limit / segments.length);
      for (const segment of segments) {
        const radius = deps.C.dist(segment.a, segment.c),
          delta = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - 0.03 / (radius || 1)))),
          count = Math.min(
            quota,
            Math.max(
              2,
              Math.ceil(Math.abs(segment.sw) / Math.max(0.002, Math.min(Math.PI / 12, delta))),
            ),
          );
        for (let i = points.length ? 1 : 0; i <= count; i++)
          points.push(deps.C.point(segment, i / count));
      }
    }
    deps.auxiliaryCache.set(item, { limit, points });
    return points;
  }

  function rebuildIndex() {
    deps.updateSnapContext();
    deps.model.index = deps.model.snapContext
      ? deps.model.snapContext.index
      : deps.B.makeIndex(deps.model.items || []);
    deps.model.auxiliaryPaths = (deps.model.items || [])
      .filter((item) => item.construction === true)
      .map((item) => ({
        item,
        points: item.guide === true ? null : auxiliaryPoints(item),
      }));
    deps.model.planPaths = (deps.model.items || [])
      .filter((item) => item.construction !== true)
      .map((item) => ({ item, points: auxiliaryPoints(item) }));
  }

  function clearDraft() {
    deps.model.draft = {
      length: "",
      angle: "",
      radius: "",
      turn: "",
      width: "",
      height: "",
    };
  }
  return { auxiliaryPoints, rebuildIndex, clearDraft };
}
