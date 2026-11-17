import { P, dist } from "./math.js";
const workPlanes = {
  xy: { id: "xy", code: 17, axes: ["X", "Y", "Z"], offsets: ["I", "J", "K"] },
  zx: {
    id: "zx",
    code: 18,
    axes: ["X", "Z", "Y"],
    offsets: ["I", "K", "J"],
    orientation: -1,
  },
  yz: { id: "yz", code: 19, axes: ["Y", "Z", "X"], offsets: ["J", "K", "I"] },
};

function planeInfo(value = "xy") {
  if (value === "xz") value = "zx";
  const plane =
    typeof value === "number"
      ? Object.values(workPlanes).find((p) => p.code === value)
      : workPlanes[value];
  if (!plane) throw Error("Выбери рабочую плоскость XY, ZX или YZ.");
  return plane;
}

function planeToWorld(p, value) {
  var _p$x, _p$y, _p$z;
  const axes = planeInfo(value).axes;
  return {
    [axes[0].toLowerCase()]: (_p$x = p.x) !== null && _p$x !== void 0 ? _p$x : 0,
    [axes[1].toLowerCase()]: (_p$y = p.y) !== null && _p$y !== void 0 ? _p$y : 0,
    [axes[2].toLowerCase()]: (_p$z = p.z) !== null && _p$z !== void 0 ? _p$z : 0,
  };
}

function planeToLocal(p, value) {
  var _p$axes$0$toLowerCase, _p$axes$1$toLowerCase, _p$axes$2$toLowerCase;
  const axes = planeInfo(value).axes;
  return {
    x:
      (_p$axes$0$toLowerCase = p[axes[0].toLowerCase()]) !== null &&
      _p$axes$0$toLowerCase !== void 0
        ? _p$axes$0$toLowerCase
        : 0,
    y:
      (_p$axes$1$toLowerCase = p[axes[1].toLowerCase()]) !== null &&
      _p$axes$1$toLowerCase !== void 0
        ? _p$axes$1$toLowerCase
        : 0,
    z:
      (_p$axes$2$toLowerCase = p[axes[2].toLowerCase()]) !== null &&
      _p$axes$2$toLowerCase !== void 0
        ? _p$axes$2$toLowerCase
        : 0,
  };
}

function planeCommand(command, value, inverse = false) {
  const plane = planeInfo(value);
  if (plane.code === 17) return command;
  if (/[\r\n]/.test(command))
    return command
      .split(/(\r?\n)/)
      .map((line, index) => (index % 2 ? line : planeCommand(line, value, inverse)))
      .join("");
  if (/G\s*0*(25|92)(?![\d.])/i.test(command)) return command;
  const letters = {};
  for (let i = 0; i < 3; i++) {
    letters[inverse ? plane.axes[i] : "XYZ"[i]] = inverse ? "XYZ"[i] : plane.axes[i];
    letters[inverse ? plane.offsets[i] : "IJK"[i]] = inverse ? "IJK"[i] : plane.offsets[i];
  }
  return command.replace(
    /\([^)]*\)|;[^\r\n]*|([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/gi,
    (text, letter, raw) => {
      if (!letter) return text;
      letter = letter.toUpperCase();
      if (letter === "G" && plane.orientation === -1 && [2, 3, 41, 42].includes(Number(raw))) {
        const opposite = { 2: 3, 3: 2, 41: 42, 42: 41 };
        return "G" + String(opposite[Number(raw)]).padStart(2, "0");
      }
      if (letter === "G" && Number(raw) === (inverse ? plane.code : 17))
        return "G" + (inverse ? 17 : plane.code);
      return (letters[letter] || letter) + raw;
    },
  );
}

function motionToWorld(m, value) {
  const plane = planeInfo(value);
  if (plane.code === 17) return m;
  const out = {
    ...m,
    a: planeToWorld(m.a, value),
    b: planeToWorld(m.b, value),
    plane: plane.code,
  };
  if (m.c) out.c = planeToWorld({ ...m.a, ...m.c }, value);
  return out;
}

function motionToLocal(m, value) {
  const plane = planeInfo(value);
  if (plane.code === 17) return m;
  const out = {
    ...m,
    a: planeToLocal(m.a, value),
    b: planeToLocal(m.b, value),
  };
  if (m.c) {
    out.c = planeToLocal({ ...m.a, ...m.c }, value);
    const u = planeInfo(m.plane || 17).axes[0],
      index = plane.axes.indexOf(u);
    out.plane = [17, 19, 18][index];
    if (out.plane === 17) {
      out.c = P(out.c.x, out.c.y);
      delete out.plane;
    }
  } else delete out.plane;
  return out;
}

function motionPoint(m, t) {
  if (m.type === "arc" && m.c) {
    const plane = m.plane || 17,
      a = planeToLocal(m.a, plane),
      b = planeToLocal(m.b, plane),
      c = planeToLocal({ ...m.a, ...m.c }, plane),
      r = dist(a, c),
      angle = Math.atan2(a.y - c.y, a.x - c.x) + m.sw * t;
    return planeToWorld(
      {
        x: c.x + r * Math.cos(angle),
        y: c.y + r * Math.sin(angle),
        z: a.z + (b.z - a.z) * t,
      },
      plane,
    );
  }
  return {
    x: m.a.x + (m.b.x - m.a.x) * t,
    y: m.a.y + (m.b.y - m.a.y) * t,
    z: m.a.z + (m.b.z - m.a.z) * t,
  };
}
export {
  workPlanes,
  planeInfo,
  planeToWorld,
  planeToLocal,
  planeCommand,
  motionToWorld,
  motionToLocal,
  motionPoint,
};
