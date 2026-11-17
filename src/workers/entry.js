import { installCompatibility } from "../platform/compatibility.js";
import { executeCalculation } from "./task.js";
installCompatibility(self);
self.onmessage = ({ data }) =>
  self.postMessage(executeCalculation(data, (phase) => self.postMessage({ phase })));
