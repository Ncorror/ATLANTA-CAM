import * as engine from "../engine.js";
import CAM_JOB from "../workers/client.js";
/** Compatibility/debug surface only. Application modules never read these globals. */
export function exposeLegacyApi(target) {
  Object.assign(target, engine, { CAM_JOB });
}
