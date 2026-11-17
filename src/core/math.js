const PI = Math.PI,
  TAU = 2 * PI,
  EPS = 1e-8,
  SKETCH_ITEM_LIMIT = 10000;

const P = (x, y) => ({ x: +x, y: +y });

const add = (a, b) => P(a.x + b.x, a.y + b.y),
  sub = (a, b) => P(a.x - b.x, a.y - b.y),
  mul = (a, k) => P(a.x * k, a.y * k);

const dot = (a, b) => a.x * b.x + a.y * b.y,
  cross = (a, b) => a.x * b.y - a.y * b.x;

const len = (a) => Math.hypot(a.x, a.y),
  dist = (a, b) => len(sub(a, b)),
  unit = (a) => mul(a, 1 / (len(a) || 1));

const left = (a) => P(-a.y, a.x),
  copy = (a) => P(a.x, a.y);

const angle = (c, p) => Math.atan2(p.y - c.y, p.x - c.x);
export {
  PI,
  TAU,
  EPS,
  SKETCH_ITEM_LIMIT,
  P,
  add,
  sub,
  mul,
  dot,
  cross,
  len,
  dist,
  unit,
  left,
  copy,
  angle,
};
