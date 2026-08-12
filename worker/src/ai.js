export const ACTIONS = {
  generate: { maxOutputTokens: 500 },
  suggest: { maxOutputTokens: 180 },
  complete: { maxOutputTokens: 260 },
  organize: { maxOutputTokens: 260 },
};

export { buildTask } from "./tasks.js";
export { countInputTokens, generate } from "./gemini.js";
export {
  extractGeminiText,
  formatResult,
  parseJsonResponse,
  sanitizeGeneratedItems,
} from "./results.js";
