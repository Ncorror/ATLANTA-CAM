function attach(canvas, win, handlers) {
  let mouseDown = false,
    pointerId = null,
    lastTouch = 0;
  const removers = [];
  function on(target, name, fn, options) {
    target.addEventListener(name, fn, options);
    removers.push(() => target.removeEventListener(name, fn, options));
  }
  function local(e) {
    const r = canvas.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top;
    return {
      x,
      y,
      shiftKey: !!e.shiftKey,
      altKey: !!e.altKey,
      ctrlKey: !!e.ctrlKey,
      inside: x >= 0 && y >= 0 && x <= r.width && y <= r.height,
    };
  }
  function focus() {
    try {
      canvas.focus({ preventScroll: true });
    } catch (e) {
      canvas.focus();
    }
  }
  function cancel() {
    mouseDown = false;
    pointerId = null;
    if (handlers.cancel) handlers.cancel();
  }
  on(canvas, "mousedown", (e) => {
    if (e.button !== 0 || Date.now() - lastTouch < 800) return;
    e.preventDefault();
    mouseDown = true;
    focus();
    handlers.down(local(e));
  });
  on(canvas, "dblclick", (e) => {
    if (e.button === 0 && handlers.dblclick) handlers.dblclick(local(e));
  });
  on(canvas, "mousemove", (e) => {
    if (!mouseDown && pointerId === null) handlers.move(local(e));
  });
  on(win, "mousemove", (e) => {
    if (mouseDown) handlers.move(local(e));
  });
  on(win, "mouseup", (e) => {
    if (!mouseDown || e.button !== 0) return;
    mouseDown = false;
    handlers.up(local(e));
  });
  on(win, "blur", cancel);
  if (typeof win.PointerEvent === "function") {
    on(canvas, "pointerdown", (e) => {
      if (e.pointerType === "mouse" || pointerId !== null) return;
      e.preventDefault();
      lastTouch = Date.now();
      pointerId = e.pointerId;
      focus();
      try {
        if (canvas.setPointerCapture) canvas.setPointerCapture(pointerId);
      } catch (error) {}
      handlers.down(local(e));
    });
    on(win, "pointermove", (e) => {
      if (e.pointerId === pointerId) handlers.move(local(e));
    });
    on(win, "pointerup", (e) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      lastTouch = Date.now();
      handlers.up(local(e));
    });
    on(win, "pointercancel", (e) => {
      if (e.pointerId === pointerId) cancel();
    });
  }
  return {
    detach: () => {
      for (const remove of removers) remove();
      cancel();
    },
  };
}

const api = { attach };
export default api;
