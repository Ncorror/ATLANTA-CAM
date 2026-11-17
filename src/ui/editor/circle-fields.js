/**
 * circle-fields controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.calcCircleValue
 * @param {*} deps.circleDraft (read/write)
 * @param {*} deps.circleFieldLabel
 * @param {*} deps.circleMode (read/write)
 * @param {*} deps.circleText
 * @param {*} deps.D
 * @param {*} deps.env
 * @param {*} deps.model
 * @param {*} deps.render
 */
export function createCircleFields(deps) {
  function circleLabel() {
    return deps.circleMode === "diameter" ? "Диаметр" : "Радиус";
  }

  function circleValue(radius, mode = deps.circleMode) {
    return deps.calcCircleValue(radius, mode);
  }

  function circleCaption(radius) {
    return (
      (deps.circleMode === "diameter" ? "Ø" : "R ") +
      deps.circleText(+circleValue(radius).toPrecision(10)) +
      " мм"
    );
  }

  function updateCircleInputs() {
    deps.$("sketchCircleMode").value = deps.circleMode;
    deps.$("draftCircleMode").value = deps.circleMode;
    deps.circleFieldLabel.textContent = circleLabel() + ", мм";
  }

  function fillCircleFields(item) {
    deps.$("sketch_cx").value = +item.c.x.toFixed(6);
    deps.$("sketch_cy").value = +item.c.y.toFixed(6);
    deps.$("sketch_dia").value = deps.circleText(circleValue(item.r));
  }

  function changeCircleMode(next) {
    if (next === deps.circleMode || !["radius", "diameter"].includes(next)) return;
    const input = deps.$("sketch_dia");
    try {
      input.value = deps.circleText(
        circleValue(deps.D.circleRadius(input.value, deps.circleMode), next),
      );
    } catch (error) {}
    if (deps.model.tool === "circle" && deps.model.draft.radius.trim()) {
      try {
        deps.model.draft.radius = deps.circleText(
          circleValue(deps.D.circleRadius(deps.model.draft.radius, deps.circleMode), next),
        );
      } catch (error) {}
    }
    deps.circleMode = next;
    updateCircleInputs();
    deps.render();
    deps.env.save();
  }

  function readCircleDraft(value) {
    if (
      !deps.circleDraft ||
      deps.circleDraft.value !== value ||
      deps.circleDraft.mode !== deps.circleMode
    ) {
      deps.circleDraft = { value, mode: deps.circleMode };
      try {
        deps.circleDraft.radius = deps.D.circleRadius(value, deps.circleMode);
      } catch (error) {
        deps.circleDraft.error = error;
      }
    }
    if (deps.circleDraft.error) throw deps.circleDraft.error;
    return deps.circleDraft.radius;
  }
  return {
    circleLabel,
    circleValue,
    circleCaption,
    updateCircleInputs,
    fillCircleFields,
    changeCircleMode,
    readCircleDraft,
  };
}
