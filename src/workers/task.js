import MACHINES from "../cam/machines.js";
import MATERIAL_VIEW from "../cam/material-view.js";
/** Shared execution path for the worker and the main-thread fallback. */
export function executeCalculation({ contours, config }, progress) {
  try {
    progress("Расчёт траектории…");
    const result = MACHINES.generate(contours, config);
    progress("Оценка остатка у стенки…");
    result.material = MATERIAL_VIEW.analyze(contours, result, config);
    result.warnings.push(...result.material.warnings);
    return { result };
  } catch (error) {
    const material = error.wallNetworkInfo
      ? MATERIAL_VIEW.analyzeNetwork(error.wallNetworkInfo, {}, config)
      : error.openWallClearance
        ? MATERIAL_VIEW.diagnoseOpen(contours, config, error.openWallClearance)
        : null;
    return {
      error: {
        message: error.message,
        openWallClearance: error.openWallClearance,
        wallNetworkInfo: error.wallNetworkInfo,
        entryPoint: error.entryPoint,
        ncDiagnostic: error.ncDiagnostic,
      },
      material,
    };
  }
}
