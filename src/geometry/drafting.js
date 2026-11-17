import {
  dist as camDist,
  add as camAdd,
  P as camP,
  mul as camMul,
  left as camLeft,
} from "../core/math.js";
import { arc as camArc, point as camPoint, tangent as camTangent } from "../core/segments.js";
import { parseMath } from "./expression.js";

import SKETCH from "./sketch.js";
const DEG = Math.PI / 180;
function number(value, label) {
  if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e6) return value;
  const text = String(value).trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))
    throw Error("Введи число в поле «" + label + "». Можно использовать точку или запятую.");
  const n = Number(text);
  if (!Number.isFinite(n) || Math.abs(n) > 1e6) throw Error("Проверь поле «" + label + "».");
  return n;
}
function circleRadius(value, mode) {
  const diameter = mode === "diameter",
    label = diameter ? "Диаметр" : "Радиус",
    text = String(value).trim().replace(/−/g, "-");
  const invalid = () => Error("Введи число или выражение в поле «" + label + "», например 35/2.");
  if (!text || text.length > 64) throw invalid();
  const tokens = text.match(/(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?|[()+*/×÷-]/gi) || [];
  if (tokens.join("") !== text.replace(/\s/g, "")) throw invalid();
  let index = 0;
  function operand() {
    const token = tokens[index++];
    if (token === "+") return operand();
    if (token === "-") return -operand();
    if (token === "(") {
      const result = sum();
      if (tokens[index++] !== ")") throw invalid();
      return result;
    }
    if (!token || !/[\d.,]/.test(token[0])) throw invalid();
    const result = Number(token.replace(",", "."));
    if (!Number.isFinite(result)) throw invalid();
    return result;
  }
  function product() {
    let result = operand();
    while (tokens[index] && "*/×÷".includes(tokens[index])) {
      const operator = tokens[index++],
        right = operand();
      if (operator === "*" || operator === "×") result *= right;
      else {
        if (right === 0) throw Error("Деление на ноль.");
        result /= right;
      }
    }
    return result;
  }
  function sum() {
    let result = product();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++],
        right = product();
      result += operator === "+" ? right : -right;
    }
    return result;
  }
  const size = sum(),
    radius = diameter ? size / 2 : size;
  if (index !== tokens.length || !Number.isFinite(radius) || radius >= 1e6) throw invalid();
  if (radius <= 0) throw Error(label + " должен быть больше нуля.");
  return radius;
}
function direction(a, b, fallback = 0) {
  return camDist(a, b) > 0.000001 ? Math.atan2(b.y - a.y, b.x - a.x) / DEG : fallback;
}
function line(a, guide, lengthText = "", angleText = "", fallback = 0, snapAxis = false) {
  const fixedLength = String(lengthText).trim() !== "",
    fixedAngle = String(angleText).trim() !== "",
    length = fixedLength ? number(lengthText, "Длина") : camDist(a, guide);
  let angle = fixedAngle ? number(angleText, "Угол") : direction(a, guide, fallback);
  if (snapAxis && fixedLength && !fixedAngle && Math.abs(angle - Math.round(angle / 90) * 90) <= 3)
    angle = Math.round(angle / 90) * 90;
  if (length <= 0.001) throw Error("Длина должна быть больше 0,001 мм.");
  const b =
    fixedLength || fixedAngle
      ? camAdd(a, camP(length * Math.cos(angle * DEG), length * Math.sin(angle * DEG)))
      : { ...guide };
  return {
    item: { type: "line", a: { ...a }, b },
    length,
    angle,
    dx: b.x - a.x,
    dy: b.y - a.y,
  };
}
function arc(a, radiusText, turnText, tangentAngle) {
  const radius = number(radiusText, "Радиус"),
    turn = number(turnText, "Поворот дуги"),
    angle = number(tangentAngle, "Касательная");
  if (radius <= 0.001) throw Error("Радиус должен быть больше 0,001 мм.");
  if (Math.abs(turn) < 0.01 || Math.abs(turn) >= 360)
    throw Error(
      "Поворот дуги: от −359,99° до 359,99°, кроме нуля. Плюс — против часовой, минус — по часовой.",
    );
  const tangent = camP(Math.cos(angle * DEG), Math.sin(angle * DEG)),
    c = camAdd(a, camMul(camLeft(tangent), radius * Math.sign(turn))),
    s = camArc(a, a, c, turn * DEG),
    m = camPoint(s, 0.5),
    b = camPoint(s, 1);
  return {
    item: { type: "arc", a: { ...a }, m, b },
    radius,
    turn,
    angle,
    dx: b.x - a.x,
    dy: b.y - a.y,
  };
}
function rectangle(a, guide, widthText = "", heightText = "") {
  const width = String(widthText).trim() ? number(widthText, "Ширина") : Math.abs(guide.x - a.x),
    height = String(heightText).trim() ? number(heightText, "Высота") : Math.abs(guide.y - a.y);
  if (width <= 0.001 || height <= 0.001)
    throw Error(
      "Ширина и высота должны быть больше 0,001 мм. Введи оба размера или укажи противоположный угол мышью.",
    );
  const dx = width * (guide.x < a.x - 1e-8 ? -1 : 1),
    dy = height * (guide.y < a.y - 1e-8 ? -1 : 1);
  return { a: { ...a }, b: camAdd(a, camP(dx, dy)), width, height, dx, dy };
}
function endDirection(item) {
  if (item.type === "line") return direction(item.a, item.b);
  if (item.type === "arc") {
    const Csk = SKETCH,
      v = camTangent(Csk.segments(item)[0], true);
    return Math.atan2(v.y, v.x) / DEG;
  }
  return 0;
}

const api = { parseMath, number, circleRadius, direction, line, arc, rectangle, endDirection };
export default api;
