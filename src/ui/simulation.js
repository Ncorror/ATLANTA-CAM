import CAM from "../core/index.js";
import SEEK_BAR from "./seek-bar.js";
function create(env) {
  const { state, $, win, draw, motionLength, toast } = env,
    slider = $("timeline"),
    Seek = SEEK_BAR;
  let frame = null,
    epoch = 0,
    boundaries = [0];
  const clamp = (value) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);
  const bar = Seek.attach({
    element: slider,
    win,
    onStart: pause,
    onSeek: seek,
  });
  function controls() {
    const available = state.sim.length > 0;
    for (const id of ["play", "prevBlock", "stepBlock", "resetSim", "endSim"]) {
      const el = $(id);
      if (el.disabled === available) el.disabled = !available;
    }
    bar.setEnabled(available);
    const button = $("play"),
      label = state.playing ? "Пауза" : "Воспроизвести",
      icon = state.playing ? "Ⅱ" : "▶";
    if (button.textContent !== icon) {
      button.textContent = icon;
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    bar.setValue(clamp(state.progress));
    const percent = (clamp(state.progress) * 100).toFixed(1) + "%";
    if ($("simProgress").textContent !== percent) $("simProgress").textContent = percent;
  }
  function pause() {
    epoch++;
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    state.playing = false;
    state.lastFrame = null;
    controls();
  }
  function seek(value) {
    pause();
    state.progress = state.sim.length ? clamp(Number(value)) : 0;
    controls();
    draw();
  }
  function schedule(token) {
    frame = win.requestAnimationFrame((ts) => tick(ts, token));
  }
  function tick(ts, token) {
    if (token !== epoch || !state.playing) return;
    frame = null;
    if (state.lastFrame !== null && ts - state.lastFrame < 50) {
      schedule(token);
      return;
    }
    if (state.lastFrame !== null) {
      const seconds = Math.max(0, Math.min(0.25, (ts - state.lastFrame) / 1000)),
        speed = Number($("playSpeed").value) || 1;
      state.progress = clamp(state.progress + (seconds * speed) / (state.simTotal || 1));
    }
    state.lastFrame = ts;
    controls();
    draw();
    if (state.progress >= 1) pause();
    else schedule(token);
  }
  function play() {
    if (!state.sim.length) {
      toast("Сначала рассчитай траекторию");
      return;
    }
    if (state.playing) {
      pause();
      return;
    }
    pause();
    if (state.progress >= 1) state.progress = 0;
    state.playing = true;
    state.lastFrame = null;
    controls();
    draw();
    schedule(epoch);
  }
  function setMotions(motions) {
    pause();
    let total = 0;
    state.sim = [];
    for (const m of motions) {
      const length = motionLength(m);
      if (!(length > 1e-8) && !(m.type === "dwell" && m.seconds > 0)) continue;
      const seconds =
          m.type === "dwell"
            ? m.seconds
            : ((m.type === "rapid" ? length : CAM.feedLength(m)) /
                (m.type === "rapid" ? 1500 : m.feed || 30)) *
              60,
        start = total;
      total += m.type === "dwell" ? seconds : Math.max(0.03, seconds);
      state.sim.push({ m, start, end: total });
    }
    state.simTotal = total;
    state.progress = 0;
    boundaries = [0];
    for (let i = 0; i < state.sim.length; i++) {
      const part = state.sim[i],
        next = state.sim[i + 1];
      if (
        next &&
        part.m.line != null &&
        next.m.line === part.m.line &&
        next.m.executionIndex === part.m.executionIndex
      )
        continue;
      boundaries.push(part.end);
    }
    controls();
    draw();
  }
  function currentPart() {
    if (!state.sim.length) return null;
    const time = state.progress * state.simTotal;
    let first = 0,
      last = state.sim.length - 1;
    while (first < last) {
      const middle = (first + last) >>> 1;
      if (state.sim[middle].end < time) first = middle + 1;
      else last = middle;
    }
    return state.sim[first];
  }
  function step(direction) {
    if (!state.sim.length) return;
    const time = state.progress * state.simTotal,
      epsilon = Math.max(1e-8, state.simTotal * 1e-12);
    let target = direction > 0 ? state.simTotal : 0;
    if (direction > 0) {
      for (const boundary of boundaries)
        if (boundary > time + epsilon) {
          target = boundary;
          break;
        }
    } else
      for (let i = boundaries.length - 1; i >= 0; i--)
        if (boundaries[i] < time - epsilon) {
          target = boundaries[i];
          break;
        }
    seek(target / state.simTotal);
  }
  $("play").onclick = play;
  $("prevBlock").onclick = () => step(-1);
  $("stepBlock").onclick = () => step(1);
  $("resetSim").onclick = () => seek(0);
  $("endSim").onclick = () => seek(1);
  win.addEventListener("blur", pause);
  controls();
  return { setMotions, currentPart, pause, seek, step, play };
}

const api = { create };
export default api;
