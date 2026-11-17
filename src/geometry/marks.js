function isConstruction(item) {
  if (
    item &&
    Object.prototype.hasOwnProperty.call(item, "construction") &&
    typeof item.construction !== "boolean"
  )
    throw Error("Повреждён статус вспомогательного элемента.");
  if (
    item &&
    Object.prototype.hasOwnProperty.call(item, "guide") &&
    typeof item.guide !== "boolean"
  )
    throw Error("Повреждён статус бесконечной направляющей.");
  if (
    item &&
    Object.prototype.hasOwnProperty.call(item, "machining") &&
    typeof item.machining !== "boolean"
  )
    throw Error("Повреждена отметка обработки элемента.");
  if (item)
    for (const key of ["millOps", "drillOps"]) {
      const ids = item[key];
      if (ids === undefined) continue;
      if (
        !Array.isArray(ids) ||
        ids.length > 32 ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => typeof id !== "string" || !/^o[1-9]\d{0,7}$/.test(id))
      )
        throw Error("Повреждены отметки операций эскиза.");
      if (
        ids.length &&
        (item.construction === true || (key === "drillOps" && item.type !== "circle"))
      )
        throw Error("Недопустимое назначение операции элементу эскиза.");
    }
  if (item && item.guide === true && (item.construction !== true || item.type !== "line"))
    throw Error("Бесконечная направляющая должна быть вспомогательной прямой.");
  if (item && item.machining === true && item.construction === true)
    throw Error("Вспомогательная геометрия не может быть отмечена для обработки.");
  return !!item && item.construction === true;
}

function isGuide(item) {
  isConstruction(item);
  return !!item && item.guide === true;
}

function isMachining(item) {
  isConstruction(item);
  return !!item && item.machining === true;
}
export { isConstruction, isGuide, isMachining };
