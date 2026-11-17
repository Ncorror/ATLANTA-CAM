const PARK_Z = 30,
  MAX_OPERATIONS = 32,
  MAX_TOOLS = 1000,
  DEFAULT_HEADER_FEED = 100;

const DEFAULT_TOOL_NAME_SPACES = 15;

const colors = { profile: "#d52b3e", drill: "#168343" };

const toolTypes = {
  center_drill: "Центровка",
  drill: "Сверло",
  end_mill: "Фреза концевая",
  ball_mill: "Фреза сферическая",
  chamfer_45: "Фаска 45°",
  scribe: "Разметочный конус",
};

const drills = ["center_drill", "drill", "chamfer_45"];

const mills = ["end_mill", "ball_mill", "chamfer_45"];

const cycles = {
  81: "G81 · обычное сверление",
  82: "G82 · сверление с выдержкой",
  83: "G83 · полный отвод",
  73: "G73 · дробление стружки",
};

const operationId = (id) => typeof id === "string" && /^(primary|o[1-9]\d{0,7})$/.test(id);

const validColor = (value) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);

const toolName = (name) =>
  typeof name === "string" && /^[a-zA-Z][a-zA-Z0-9 .<>=+/_-]{0,47}$/.test(name);

const isMark = (item, op) => {
  var _item$drillOps, _item$millOps;
  return op.kind === "drill"
    ? ((_item$drillOps = item.drillOps) === null || _item$drillOps === void 0
        ? void 0
        : _item$drillOps.includes(op.id)) === true
    : op.id === "primary"
      ? item.machining === true
      : ((_item$millOps = item.millOps) === null || _item$millOps === void 0
          ? void 0
          : _item$millOps.includes(op.id)) === true;
};

const canMark = (item, op) =>
  item.construction !== true && (op.kind !== "drill" || item.type === "circle");

function mark(item, op, on) {
  if (!canMark(item, op)) return item;
  if (op.id === "primary") return { ...item, machining: on };
  const key = op.kind === "drill" ? "drillOps" : "millOps",
    ids = (item[key] || []).filter((id) => id !== op.id);
  if (on) ids.push(op.id);
  return { ...item, [key]: ids };
}

function name(tool, config) {
  if (!tool)
    return config.toolKind === "scribe" ? "scribe" : "mill <" + diameterText(config.diameter);
  const d = diameterText(tool.diameter);
  const names = {
    center_drill: "center drill",
    drill: "drill <" + d,
    end_mill: "mill <" + d,
    ball_mill: "ball mill <" + d,
    chamfer_45: "chamfer 45 deg",
    scribe: "scribe",
  };
  return tool.name || names[tool.type];
}

function diameterText(diameter) {
  return Number.isInteger(diameter) ? diameter.toFixed(1) : String(diameter);
}

function allowed(tool, kind) {
  return (kind === "drill" ? drills : kind === "scribe" ? ["scribe"] : mills).includes(tool.type);
}

function checkTools(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_TOOLS)
    throw Error("В базе должно быть от 0 до " + MAX_TOOLS + " инструментов.");
  const map = new Map();
  for (const tool of rows) {
    var _tool$flutes, _tool$workingLength, _tool$corrector, _tool$correctionRadiu, _tool$name;
    if (
      !tool ||
      !Number.isInteger(tool.number) ||
      tool.number < 1 ||
      tool.number > 9999 ||
      map.has(tool.number)
    )
      throw Error("Номера инструментов должны быть уникальными числами от 1 до 9999.");
    if (!Object.prototype.hasOwnProperty.call(toolTypes, tool.type))
      throw Error("Инструмент №" + tool.number + ": неизвестный тип.");
    const d = tool.diameter,
      f = (_tool$flutes = tool.flutes) !== null && _tool$flutes !== void 0 ? _tool$flutes : 1,
      w =
        (_tool$workingLength = tool.workingLength) !== null && _tool$workingLength !== void 0
          ? _tool$workingLength
          : 0,
      n =
        (_tool$corrector = tool.corrector) !== null && _tool$corrector !== void 0
          ? _tool$corrector
          : 1,
      r =
        (_tool$correctionRadiu = tool.correctionRadius) !== null && _tool$correctionRadiu !== void 0
          ? _tool$correctionRadiu
          : null,
      label = (_tool$name = tool.name) !== null && _tool$name !== void 0 ? _tool$name : "";
    if (
      !Number.isFinite(d) ||
      d < 0.001 ||
      d > 10000 ||
      !Number.isInteger(f) ||
      f < 1 ||
      f > 100 ||
      !Number.isFinite(w) ||
      w < 0 ||
      w > 10000
    )
      throw Error(
        "Инструмент №" + tool.number + ": проверь диаметр, число зубьев и рабочую длину.",
      );
    if (
      !Number.isInteger(n) ||
      n < 0 ||
      n > 99 ||
      (r !== null && (!Number.isFinite(r) || r < 0 || r > 999.999))
    )
      throw Error("Инструмент №" + tool.number + ": проверь номер D и радиус коррекции.");
    if (label && !toolName(label))
      throw Error("Инструмент №" + tool.number + ": имя до 48 символов латиницей, без скобок.");
    map.set(tool.number, {
      ...tool,
      diameter: d,
      flutes: f,
      workingLength: w,
      corrector: n,
      correctionRadius: r,
      name: label,
    });
  }
  return map;
}

function effectiveDiameter(tool) {
  return tool.diameter;
}
export {
  PARK_Z,
  MAX_OPERATIONS,
  MAX_TOOLS,
  DEFAULT_HEADER_FEED,
  DEFAULT_TOOL_NAME_SPACES,
  colors,
  toolTypes,
  drills,
  mills,
  cycles,
  operationId,
  validColor,
  toolName,
  isMark,
  canMark,
  mark,
  name,
  diameterText,
  allowed,
  checkTools,
  effectiveDiameter,
};
