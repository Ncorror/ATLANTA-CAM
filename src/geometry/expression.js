export function parseMath(value, label) {
  const field = label || "Значение";
  if (typeof value === "number") {
    if (Number.isFinite(value) && Math.abs(value) <= 1e6) return value;
    throw Error("Проверь поле «" + field + "».");
  }
  const text = String(value == null ? "" : value)
    .trim()
    .replace(/−/g, "-");
  if (!text)
    throw Error("Введи число в поле «" + field + "». Можно использовать точку или запятую.");
  const invalid = function () {
    return Error("Введи число или выражение в поле «" + field + "», например 15+30-4.");
  };
  if (text.length > 128) throw invalid();
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
  const res = sum();
  if (index !== tokens.length || !Number.isFinite(res) || Math.abs(res) > 1e6) throw invalid();
  return res;
}
