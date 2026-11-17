import { DEFAULT_HEADER_FEED } from "./tools.js";
function headerFeedWord(config) {
  var _config$headerFeed;
  const value =
    (_config$headerFeed = config.headerFeed) !== null && _config$headerFeed !== void 0
      ? _config$headerFeed
      : DEFAULT_HEADER_FEED;
  if (!Number.isInteger(value) || value < 1 || value > 36000) {
    throw Error("Для единой подачи FANUC задай целое F от 1 до 36000.");
  }
  return "F" + String(value).padStart(2, "0");
}
export { headerFeedWord };
