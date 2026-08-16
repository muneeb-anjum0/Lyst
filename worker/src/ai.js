export const ACTIONS = {
  generate: { maxOutputTokens: 1200 },
  suggest: { maxOutputTokens: 500 },
  complete: { maxOutputTokens: 800 },
  organize: { maxOutputTokens: 650 },
  optimize_lists: { maxOutputTokens: 2200 },
};

export { buildTask } from "./tasks.js";
export { countInputTokens, generate } from "./gemini.js";
export {
  extractGeminiText,
  formatResult,
  parseJsonResponse,
  sanitizeGeneratedItems,
} from "./results.js";
