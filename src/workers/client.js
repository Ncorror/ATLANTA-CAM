import workerSource from "atlanta:worker";
import { executeCalculation } from "./task.js";
const root = globalThis;
function run(contours, config, callbacks) {
  let worker = null,
    timer = null,
    workerURL = null,
    active = true,
    started = false;
  function releaseURL() {
    if (workerURL) {
      root.URL.revokeObjectURL(workerURL);
      workerURL = null;
    }
  }
  function cancel() {
    active = false;
    if (worker) {
      worker.terminate();
      worker = null;
    }
    if (timer !== null) {
      root.clearTimeout(timer);
      timer = null;
    }
    releaseURL();
  }
  function finish(message) {
    if (!active) return;
    cancel();
    callbacks.complete(message);
  }
  function fallback() {
    callbacks.progress("Расчёт в текущем окне…");
    timer = root.setTimeout(() => {
      timer = null;
      if (!active) return;
      finish(executeCalculation({ contours, config }, callbacks.progress));
    }, 40);
  }
  if (typeof root.Worker !== "function") {
    fallback();
    return { cancel };
  }
  try {
    workerURL = root.URL.createObjectURL(
      new root.Blob([workerSource], { type: "text/javascript" }),
    );
    worker = new root.Worker(workerURL);
    worker.onmessage = (event) => {
      if (!active) return;
      started = true;
      releaseURL();
      if (event.data.phase) callbacks.progress(event.data.phase);
      else finish(event.data);
    };
    worker.onerror = (event) => {
      if (event.preventDefault) event.preventDefault();
      if (!active) return;
      if (!started) {
        worker.terminate();
        worker = null;
        releaseURL();
        fallback();
      } else
        finish({
          error: {
            message: "Фоновый расчёт остановлен. Повтори расчёт или уменьши сложность контура.",
          },
        });
    };
    worker.postMessage({ contours, config });
  } catch (error) {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    releaseURL();
    fallback();
  }
  return { cancel };
}

export default { run };
