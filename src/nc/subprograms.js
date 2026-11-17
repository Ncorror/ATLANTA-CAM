import { tokenizeNC } from "./tokenizer.js";
function lastWord(words, letter) {
  for (let i = words.length - 1; i >= 0; i--) if (words[i].letter === letter) return words[i];
  return null;
}

function expandM98Program(lines, profile) {
  const errors = [],
    warnings = [];
  const toks = lines.map(function (l) {
    const s = profile && profile.machine === "fanuc3000c" ? l.replace(/\*\s*$/, "") : l;
    return tokenizeNC(s);
  });
  const blockMap = new Map();
  for (let i = 0; i < toks.length; i++) {
    const nWord = lastWord(toks[i].words, "N");
    if (nWord) blockMap.set(nWord.value, blockMap.has(nWord.value) ? -1 : i);
  }
  let minSubLine = Infinity;
  for (let i = 0; i < toks.length; i++) {
    const f = toks[i];
    if (
      f.words.some(function (w) {
        return w.letter === "M" && w.value === 98;
      })
    ) {
      const pWord = lastWord(f.words, "P"),
        rWord = lastWord(f.words, "R");
      if (!pWord) {
        errors.push("Строка " + (i + 1) + ": M98 — отсутствует адрес P");
        continue;
      }
      if (!Number.isInteger(pWord.value) || pWord.value < 0 || pWord.value > 999) {
        errors.push("Строка " + (i + 1) + ": M98 — P должен быть номером кадра 000–999.");
        continue;
      }
      const targetIdx = blockMap.get(pWord.value);
      if (targetIdx === undefined || targetIdx < 0) {
        errors.push(
          "Строка " + (i + 1) + ": M98 — целевой кадр P" + pWord.raw + " не найден в программе",
        );
        continue;
      }
      if (targetIdx < minSubLine) minSubLine = targetIdx;
      if (rWord && (!Number.isInteger(rWord.value) || rWord.value < 1 || rWord.value > 9999)) {
        errors.push("Строка " + (i + 1) + ": M98 — R должен быть положительным целым от 1 до 9999");
      }
    }
  }
  if (errors.length) return { errors: errors, warnings: warnings, steps: [] };
  if (minSubLine < Infinity) {
    let hasM02 = false;
    for (let i = 0; i < minSubLine; i++) {
      if (
        toks[i].words.some(function (w) {
          return w.letter === "M" && (w.value === 2 || w.value === 30);
        })
      ) {
        hasM02 = true;
        break;
      }
    }
    if (!hasM02) {
      const nw = lastWord(toks[minSubLine].words, "N");
      const nName = nw ? "N" + nw.raw : "строка " + (minSubLine + 1);
      errors.push(
        "Строка " +
          (minSubLine + 1) +
          ": Вход в диапазон вспомогательной программы без вызова M98: перед " +
          nName +
          " отсутствует M02/M30",
      );
      return { errors: errors, warnings: warnings, steps: [] };
    }
  }
  for (let i = 0; i < toks.length; i++) {
    for (const w of toks[i].words) {
      if (w.letter === "G" && (w.value === 45 || w.value === 46 || w.value === 47)) {
        warnings.push(
          "Строка " +
            (i + 1) +
            ": G" +
            w.value +
            " — коррекция положения инструмента принята по запрограммированным координатам без смещения из таблицы D",
        );
      }
    }
  }
  const callStack = [],
    steps = [];
  let currIdx = 0,
    stepCount = 0,
    activeCycle = null;
  while (currIdx < lines.length) {
    if (++stepCount > 200000) {
      errors.push(
        "Строка " +
          (currIdx + 1) +
          ": M98 — превышен предел 200000 исполняемых кадров; разделите программу",
      );
      break;
    }
    const f = toks[currIdx],
      lineText = lines[currIdx];
    if (callStack.length && f.words.some((w) => w.letter === "G" && w.value === 25)) {
      errors.push(
        "Строка " +
          (currIdx + 1) +
          ": G25 внутри вспомогательной программы M98 запрещена (§3.12.8, с. 45).",
      );
      break;
    }
    for (const w of f.words) {
      if (w.letter === "G") {
        if ([73, 81, 82, 83, 85, 89].includes(w.value)) activeCycle = w.value;
        if (w.value === 80) activeCycle = null;
      }
    }
    if (
      f.words.some(function (w) {
        return w.letter === "M" && (w.value === 2 || w.value === 30);
      })
    ) {
      steps.push({ origLineIdx: currIdx, lineText: lineText, meta: null });
      break;
    }
    if (
      f.words.some(function (w) {
        return w.letter === "M" && w.value === 98;
      })
    ) {
      if (f.words.some((w) => "XYZIJK".includes(w.letter))) {
        errors.push(
          "Строка " +
            (currIdx + 1) +
            ": перемещение в одном кадре с M98 не моделируется. Вынеси перемещение в отдельный кадр.",
        );
        break;
      }
      if (activeCycle) {
        errors.push(
          "Строка " +
            (currIdx + 1) +
            ": M98 — активен цикл сверления G" +
            activeCycle +
            "; снимите G80 перед вызовом",
        );
        break;
      }
      if (callStack.length >= 4) {
        errors.push(
          "Строка " + (currIdx + 1) + ": M98 — глубина вложенности вызовов превышает 4 уровня",
        );
        break;
      }
      if (callStack.length === 3)
        warnings.push(
          "Строка " +
            (currIdx + 1) +
            ": M98 — достигнут 4-й уровень вложенности вспомогательных программ",
        );
      const pWord = lastWord(f.words, "P"),
        rWord = lastWord(f.words, "R");
      const targetIdx = blockMap.get(pWord.value);
      if (targetIdx === undefined || targetIdx < 0) {
        errors.push(
          "Строка " +
            (currIdx + 1) +
            ": M98 — целевой кадр P" +
            pWord.raw +
            " не найден в программе",
        );
        break;
      }
      const modalWords = f.words.filter(
        (w) => !["N", "P", "R"].includes(w.letter) && !(w.letter === "M" && w.value === 98),
      );
      if (modalWords.length)
        steps.push({
          origLineIdx: currIdx,
          lineText: modalWords.map((w) => w.letter + w.raw).join(""),
          meta: null,
        });
      const nw = lastWord(f.words, "N");
      callStack.push({
        targetIdx: targetIdx,
        returnIdx: currIdx + 1,
        repeat: 1,
        repeatCount: rWord ? rWord.value : 1,
        triggerBlock: nw ? "N" + nw.raw : "Кадр " + (currIdx + 1),
      });
      currIdx = targetIdx;
      continue;
    }
    if (
      f.words.some(function (w) {
        return w.letter === "M" && w.value === 99;
      })
    ) {
      if (!callStack.length) {
        errors.push("Строка " + (currIdx + 1) + ": M99 — возврат без вызова M98");
        break;
      }
      const returnWords = f.words.filter(
        (w) => !["N", "P"].includes(w.letter) && !(w.letter === "M" && w.value === 99),
      );
      const hasMotion = returnWords.length > 0;
      const top = callStack[callStack.length - 1];
      if (hasMotion) {
        steps.push({
          origLineIdx: currIdx,
          lineText: returnWords.map((w) => w.letter + w.raw).join(""),
          meta: {
            subprogramReplay: true,
            subTriggerBlock: top.triggerBlock,
            subRepeat: top.repeat,
            subRepeatCount: top.repeatCount,
            subDepth: callStack.length,
          },
        });
      }
      const pWord = lastWord(f.words, "P");
      if (pWord) {
        const retTarget = blockMap.get(pWord.value);
        if (retTarget === undefined || retTarget < 0) {
          errors.push(
            "Строка " +
              (currIdx + 1) +
              ": M99 — целевой кадр возврата P" +
              pWord.raw +
              " не найден в программе",
          );
          break;
        }
        callStack.pop();
        currIdx = retTarget;
        continue;
      }
      if (top.repeat < top.repeatCount) {
        top.repeat++;
        currIdx = top.targetIdx;
        continue;
      }
      const retIdx = top.returnIdx;
      callStack.pop();
      currIdx = retIdx;
      continue;
    }
    const top = callStack.length ? callStack[callStack.length - 1] : null;
    steps.push({
      origLineIdx: currIdx,
      lineText: lineText,
      meta: top
        ? {
            subprogramReplay: true,
            subTriggerBlock: top.triggerBlock,
            subRepeat: top.repeat,
            subRepeatCount: top.repeatCount,
            subDepth: callStack.length,
          }
        : null,
    });
    currIdx++;
  }
  return { errors: errors, warnings: warnings, steps: steps };
}

function renumberNC(text, options) {
  const opts = options || {},
    step = opts.step || 1,
    start = opts.start || 1,
    subStart = opts.subprogramStart || 101;
  const lines = text.replace(/\r/g, "").split("\n");
  let curN = start,
    inSub = false;
  const oldToNew = new Map();
  const analyzed = lines.map(function (line) {
    const toks = tokenizeNC(line.replace(/\*\s*$/, ""));
    const isEnd = toks.words.some(function (w) {
      return w.letter === "M" && (w.value === 2 || w.value === 30);
    });
    const nWord = lastWord(toks.words, "N");
    let newVal = null;
    if (nWord) {
      if (inSub && curN < subStart) curN = subStart;
      newVal = curN;
      oldToNew.set(nWord.value, newVal);
      curN += step;
    }
    if (isEnd) inSub = true;
    return { line: line, toks: toks, newVal: newVal };
  });
  return analyzed
    .map(function (item) {
      let l = item.line;
      if (item.newVal != null)
        l = l.replace(/\bN\s*\d+/i, "N" + String(item.newVal).padStart(3, "0"));
      if (
        item.toks.words.some(function (w) {
          return (
            (w.letter === "M" && (w.value === 98 || w.value === 99)) ||
            (w.letter === "G" && w.value === 25)
          );
        })
      ) {
        const repeatG25 = item.toks.words.some((w) => w.letter === "G" && w.value === 25);
        const addresses = repeatG25 ? ["P", "Q"] : ["P"];
        l = l.replace(/\([^)]*\)|([PQ])\s*(\d+)/gi, (word, letter, raw) => {
          if (!letter || !addresses.includes(letter.toUpperCase()) || !oldToNew.has(Number(raw)))
            return word;
          return letter.toUpperCase() + String(oldToNew.get(Number(raw))).padStart(3, "0");
        });
      }
      return l;
    })
    .join("\r\n");
}
export { expandM98Program, renumberNC };
