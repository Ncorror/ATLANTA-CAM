function tokenizeNC(lineText) {
  const code = lineText
    .replace(/\([^)]*\)/g, "")
    .split(";")[0]
    .replace(/\*\s*$/, "");
  const words = [];
  let match;
  const re = /([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/gi;
  while ((match = re.exec(code)))
    words.push({
      letter: match[1].toUpperCase(),
      raw: match[2],
      value: +match[2],
      index: match.index,
    });
  return { code, words };
}
export { tokenizeNC };
