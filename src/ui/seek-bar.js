function attach(env) {
  const { element: el, win, onStart, onSeek } = env,
    fill = el.querySelector(".seekFill"),
    thumb = el.querySelector(".seekThumb");
  let enabled = false,
    value = 0,
    drag = null,
    touchId = null;
  const clamp = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
  function setValue(next) {
    value = clamp(Number(next));
    const n = Math.round(value * 10000),
      percent = n / 100;
    if (el.getAttribute("aria-valuenow") !== String(n)) {
      el.setAttribute("aria-valuenow", String(n));
      fill.style.width = percent + "%";
      thumb.style.left = percent + "%";
    }
    const text = percent.toFixed(1) + "%";
    if (el.getAttribute("aria-valuetext") !== text) el.setAttribute("aria-valuetext", text);
  }
  function setEnabled(next) {
    enabled = !!next;
    const text = String(!enabled);
    if (el.getAttribute("aria-disabled") !== text) el.setAttribute("aria-disabled", text);
    if (!enabled) {
      drag = null;
      touchId = null;
    }
  }
  function select(clientX) {
    const box = el.getBoundingClientRect();
    if (!Number.isFinite(clientX) || !(box.width > 0)) return;
    const next = clamp((clientX - box.left) / box.width);
    onSeek(next);
  }
  function start(kind, x, e) {
    if (!enabled) return;
    e.preventDefault();
    drag = kind;
    el.focus();
    onStart();
    select(x);
  }
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    start("mouse", e.clientX, e);
  });
  win.addEventListener("mousemove", (e) => {
    if (drag !== "mouse") return;
    if (typeof e.buttons === "number" && e.buttons === 0) {
      drag = null;
      return;
    }
    e.preventDefault();
    select(e.clientX);
  });
  win.addEventListener("mouseup", (e) => {
    if (drag !== "mouse" || e.button !== 0) return;
    drag = null;
    select(e.clientX);
  });
  el.addEventListener("keydown", (e) => {
    if (!enabled) return;
    let next = value;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next -= 0.001;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next += 0.001;
        break;
      case "PageDown":
        next -= 0.1;
        break;
      case "PageUp":
        next += 0.1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    onStart();
    onSeek(clamp(next));
  });
  el.addEventListener(
    "touchstart",
    (e) => {
      if (!enabled || !e.changedTouches.length) return;
      const t = e.changedTouches[0];
      touchId = t.identifier;
      start("touch", t.clientX, e);
    },
    { passive: false },
  );
  function touch(event, end) {
    if (drag !== "touch") return;
    for (const t of event.changedTouches)
      if (t.identifier === touchId) {
        event.preventDefault();
        if (end) {
          drag = null;
          touchId = null;
        }
        select(t.clientX);
        return;
      }
  }
  win.addEventListener("touchmove", (e) => touch(e, false), {
    passive: false,
  });
  win.addEventListener("touchend", (e) => touch(e, true), { passive: false });
  win.addEventListener("touchcancel", () => {
    drag = null;
    touchId = null;
  });
  win.addEventListener("blur", () => {
    drag = null;
    touchId = null;
  });
  setValue(0);
  setEnabled(false);
  return { setValue, setEnabled };
}

const api = { attach };
export default api;
