/**
 * catalog-controller controller.
 * Dependencies are supplied by the application/editor composition root.
 * @param {object} deps - Shared state and callbacks; constructed before first use.
 * @param {*} deps.$
 * @param {*} deps.A
 * @param {*} deps.activeOperation
 * @param {*} deps.activeOperationId
 * @param {*} deps.addToolOptions
 * @param {*} deps.catalogEditing (read/write)
 * @param {*} deps.invalidate
 * @param {*} deps.operations
 * @param {*} deps.renderOperationPanel
 * @param {*} deps.requestDraw
 * @param {*} deps.scheduleAutosave
 * @param {*} deps.state
 * @param {*} deps.toast
 * @param {*} deps.toolCatalog (read/write)
 * @param {*} deps.toolStorage
 * @param {*} deps.UI_RENDER
 * @param {*} deps.updateParams
 */
export function createCatalogController(deps) {
  function persistTools() {
    try {
      localStorage.setItem(deps.toolStorage, JSON.stringify([...deps.toolCatalog.values()]));
    } catch (error) {}
  }

  function catalogueStatus(text, error = false) {
    deps.UI_RENDER.catalogueStatus(text, error);
  }

  function catalogueSelection(number) {
    var _select$options$;
    const select = deps.$("catalogChoice");
    select.replaceChildren();
    deps.addToolOptions(select, () => true);
    select.value =
      number != null && deps.toolCatalog.has(number)
        ? String(number)
        : ((_select$options$ = select.options[0]) === null || _select$options$ === void 0
            ? void 0
            : _select$options$.value) || "";
    editCatalogueTool(deps.toolCatalog.get(Number(select.value)));
  }

  function editCatalogueTool(tool) {
    var _tool$number;
    deps.catalogEditing =
      (_tool$number = tool === null || tool === void 0 ? void 0 : tool.number) !== null &&
      _tool$number !== void 0
        ? _tool$number
        : null;
    deps.UI_RENDER.editCatalogueTool({
      tool,
      toolCatalog: deps.toolCatalog,
      activeKind: deps.activeOperation().kind,
    });
  }

  function catalogueChanged() {
    persistTools();
    deps.renderOperationPanel();
    deps.updateParams();
    if (deps.state.mode === "dxf") deps.invalidate();
    deps.scheduleAutosave();
    deps.requestDraw();
  }

  function saveCatalogueTool() {
    try {
      const number = Number(deps.$("catalogNumber").value);
      const correction = deps.$("catalogRadius").value.trim();
      if (
        correction !== "" &&
        (!Number.isInteger(Number(correction)) ||
          Number(correction) < 0 ||
          Number(correction) > 999999)
      )
        throw Error("Значение корректора — целое число от 0 до 999999.");
      if (deps.catalogEditing === null && deps.toolCatalog.has(number))
        throw Error(
          "Этот номер уже занят. Выбери свободный номер или открой существующий инструмент.",
        );
      const previous = deps.toolCatalog.get(deps.catalogEditing),
        tool = {
          ...previous,
          number,
          type: deps.$("catalogType").value,
          name: deps.$("catalogName").value.trim(),
          diameter: Number(deps.$("catalogDiameter").value),
          flutes: Number(deps.$("catalogFlutes").value),
          workingLength: Number(deps.$("catalogWorkingLength").value),
          corrector: Number(deps.$("catalogCorrector").value),
          correctionRadius:
            deps.$("catalogRadius").value === ""
              ? null
              : Number(deps.$("catalogRadius").value) / 1000,
        };
      const next = new Map(deps.toolCatalog);
      next.set(number, tool);
      deps.toolCatalog = deps.A.checkTools([...next.values()]);
      for (const op of deps.operations)
        if (op.toolNumber === number) {
          var _tool$correctionRadiu2;
          op.params = {
            ...op.params,
            corrector: String(tool.corrector),
            correctionValue: String(
              Math.round(
                ((_tool$correctionRadiu2 = tool.correctionRadius) !== null &&
                _tool$correctionRadiu2 !== void 0
                  ? _tool$correctionRadiu2
                  : tool.diameter / 2) * 1000,
              ),
            ),
          };
          if (op.id === deps.activeOperationId) {
            deps.$("corrector").value = op.params.corrector;
            deps.$("correctionValue").value = op.params.correctionValue;
          }
        }
      catalogueChanged();
      catalogueSelection(number);
      catalogueStatus("Инструмент №" + number + " сохранён.");
    } catch (error) {
      catalogueStatus(error.message, true);
    }
  }

  function importCatalogue(data) {
    if (
      !["ATLANTA-workspace", "ATLANTA-tools"].includes(
        data === null || data === void 0 ? void 0 : data.format,
      )
    )
      throw Error("Нужен каталог ATLANTA в JSON.");
    const incoming = deps.A.checkTools(data.tools),
      next = new Map(deps.toolCatalog);
    for (const [id, tool] of incoming) next.set(id, tool);
    deps.toolCatalog = deps.A.checkTools([...next.values()]);
    catalogueChanged();
    if (deps.$("catalogDialog").open) {
      catalogueSelection(deps.activeOperation().toolNumber);
      catalogueStatus("Импортировано " + incoming.size + " · всего " + deps.toolCatalog.size + ".");
    }
    deps.toast("Инструментов в базе: " + deps.toolCatalog.size);
  }
  return {
    persistTools,
    catalogueStatus,
    catalogueSelection,
    editCatalogueTool,
    catalogueChanged,
    saveCatalogueTool,
    importCatalogue,
  };
}
