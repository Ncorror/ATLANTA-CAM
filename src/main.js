import { installCompatibility } from "./platform/compatibility.js";
import { exposeLegacyApi } from "./platform/legacy-api.js";
import { startApplication } from "./app/application.js";
installCompatibility(window);
exposeLegacyApi(window);
startApplication();
