const LIMIT = 1e6;
const anchors = {
  tl: { x: 0, y: 1, label: "Сверху слева" },
  tc: { x: 0.5, y: 1, label: "Сверху по центру" },
  tr: { x: 1, y: 1, label: "Сверху справа" },
  cl: { x: 0, y: 0.5, label: "Слева по центру" },
  center: { x: 0.5, y: 0.5, label: "Центр плана" },
  cr: { x: 1, y: 0.5, label: "Справа по центру" },
  bl: { x: 0, y: 0, label: "Снизу слева" },
  bc: { x: 0.5, y: 0, label: "Снизу по центру" },
  br: { x: 1, y: 0, label: "Снизу справа" },
};
function parse(value, label = "координата") {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > LIMIT)
      throw Error("Поле «" + label + "»: допустимо число от −1000000 до 1000000 мм.");
    return value === 0 ? 0 : value;
  }
  if (typeof value !== "string") throw Error("Введи число в поле «" + label + "».");
  const text = String(value).trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))
    throw Error("Введи число в поле «" + label + "». Можно использовать точку или запятую.");
  const number = Number(text);
  if (!Number.isFinite(number) || Math.abs(number) > LIMIT)
    throw Error("Поле «" + label + "»: допустимо число от −1000000 до 1000000 мм.");
  return number === 0 ? 0 : number;
}
function validBounds(bounds) {
  if (
    !bounds ||
    !["minX", "minY", "maxX", "maxY"].every(
      (key) => Number.isFinite(bounds[key]) && Math.abs(bounds[key]) <= LIMIT,
    ) ||
    bounds.minX > bounds.maxX ||
    bounds.minY > bounds.maxY
  )
    throw Error("Не удалось определить габарит общего плана для нуля X/Y.");
  return bounds;
}
function resolve(bounds, preset, shiftX = 0, shiftY = 0, customPoint) {
  const dx = parse(shiftX, "ΔX"),
    dy = parse(shiftY, "ΔY");
  let base, label;
  if (Object.prototype.hasOwnProperty.call(anchors, preset)) {
    const box = validBounds(bounds),
      anchor = anchors[preset];
    base = {
      x: box.minX + (box.maxX - box.minX) * anchor.x,
      y: box.minY + (box.maxY - box.minY) * anchor.y,
    };
    label = anchor.label;
  } else if (preset === "drawing") {
    base = { x: 0, y: 0 };
    label = "Исходный X0 / Y0";
  } else if (preset === "custom") {
    if (!customPoint) throw Error("Укажи свою точку нуля X/Y.");
    base = {
      x: parse(customPoint.x, "X точки нуля"),
      y: parse(customPoint.y, "Y точки нуля"),
    };
    label = "Своя точка на плане";
  } else throw Error("Выбери положение нуля X/Y.");
  return {
    x: parse(base.x + dx, "X нуля"),
    y: parse(base.y + dy, "Y нуля"),
    base,
    shift: { x: dx, y: dy },
    preset,
    label,
  };
}

const api = { anchors, parse, resolve };
export default api;
