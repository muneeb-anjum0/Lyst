import {
  errorResponse,
  getAllowedOrigin,
  handleOptions,
  json,
} from "./http.js";
import { normalizeText } from "./utils.js";
import { LystBudget, budgetCall } from "./budget.js";
import { getBearerToken, verifyFirebaseIdToken } from "./auth.js";
import {
  ACTIONS,
  buildTask,
  countInputTokens,
  extractGeminiText,
  formatResult,
  generate,
  parseJsonResponse,
  sanitizeGeneratedItems,
} from "./ai.js";

export { LystBudget };
export { parseJsonResponse, sanitizeGeneratedItems };

const BUILD_ID = "lyst-worker-v8-2026-08-10";

const MAX_INPUT_TOKENS_PER_REQUEST = 1200;

export default {
  async fetch(
    request,
    env,
  ) {
    if (
      request.method ===
      "OPTIONS"
    ) {
      return handleOptions(
        request,
        env,
      );
    }

    const origin =
      getAllowedOrigin(
        request,
        env,
      );

    if (
      origin ===
      null
    ) {
      return errorResponse(
        "Origin not allowed.",
        "forbidden",
        403,
      );
    }

    const url =
      new URL(
        request.url,
      );

    if (
      request.method !==
        "POST" ||
      url.pathname !==
        "/ai"
    ) {
      return errorResponse(
        "Not found.",
        "not-found",
        404,
        origin || "",
      );
    }

    console.log(
      `[${BUILD_ID}] request received`,
    );

    if (
      !env.GEMINI_API_KEY
    ) {
      return errorResponse(
        "Gemini key is not configured.",
        "failed-precondition",
        503,
        origin || "",
      );
    }

    const token =
      getBearerToken(
        request,
      );

    if (!token) {
      return errorResponse(
        "Sign in before using AI.",
        "unauthenticated",
        401,
        origin || "",
      );
    }

    let authUser;

    try {
      authUser =
        await verifyFirebaseIdToken(
          token,
        );
    } catch (error) {
      console.error(
        `[${BUILD_ID}] Firebase auth failed:`,
        error?.message ||
          error,
      );

      return errorResponse(
        "Invalid or expired sign-in.",
        "unauthenticated",
        401,
        origin || "",
      );
    }

    let data;

    try {
      data =
        await request.json();
    } catch {
      return errorResponse(
        "Invalid JSON.",
        "invalid-argument",
        400,
        origin || "",
      );
    }

    const action =
      normalizeText(
        data?.action,
        20,
      );

    if (
      !Object.hasOwn(
        ACTIONS,
        action,
      )
    ) {
      return errorResponse(
        "Unsupported AI action.",
        "invalid-argument",
        400,
        origin || "",
      );
    }

    const task =
      buildTask(
        action,
        data,
      );

    if (
      task.error
    ) {
      return errorResponse(
        task.error,
        "invalid-argument",
        400,
        origin || "",
      );
    }

    const config =
      ACTIONS[
        action
      ];

    let inputTokens;

    try {
      inputTokens =
        await countInputTokens(
          env,
          task.contents,
        );

      console.log(
        `[${BUILD_ID}] inputTokens=${inputTokens}`,
      );
    } catch (error) {
      console.error(
        `[${BUILD_ID}] countTokens failed:`,
        error?.message ||
          error,
      );

      return errorResponse(
        "Could not count AI tokens.",
        "internal",
        502,
        origin || "",
      );
    }

    if (
      inputTokens >
      MAX_INPUT_TOKENS_PER_REQUEST
    ) {
      return errorResponse(
        `This request is too large for V2 testing (${inputTokens}/${MAX_INPUT_TOKENS_PER_REQUEST} input tokens).`,
        "resource-exhausted",
        429,
        origin || "",
      );
    }

    const reservation =
      inputTokens +
      config.maxOutputTokens;

    let reserveResponse;

    try {
      reserveResponse =
        await budgetCall(
          env,
          {
            op:
              "reserve",

            uid:
              authUser.uid,

            reservation,
          },
        );
    } catch (error) {
      console.error(
        `[${BUILD_ID}] budget reserve failed:`,
        error?.message ||
          error,
      );

      return errorResponse(
        "AI budget service is unavailable.",
        "internal",
        502,
        origin || "",
      );
    }

    if (
      !reserveResponse.ok
    ) {
      let limiterBody =
        {};

      try {
        limiterBody =
          await reserveResponse.json();
      } catch {
        // Ignore malformed limiter response.
      }

      console.warn(
        `[${BUILD_ID}] budget rejected request:`,
        JSON.stringify(
          limiterBody,
        ),
      );

      return errorResponse(
        "AI test limit reached.",
        "resource-exhausted",
        429,
        origin || "",
      );
    }

    try {
      const response =
        await generate(
          env,
          task,
          config,
        );

      const responseText =
        extractGeminiText(
          response,
        );

      const parsed =
        parseJsonResponse(
          responseText,
        );

      const result =
        formatResult(
          action,
          parsed,
          task,
          response
            ?.usageMetadata ||
            {},
        );

      const finalInputTokens =
        result.usage
          .inputTokens ||
        inputTokens;

      const finalOutputTokens =
        result.usage
          .outputTokens;

      const finalTotalTokens =
        result.usage
          .totalTokens ||
        finalInputTokens +
          finalOutputTokens;

      try {
        await budgetCall(
          env,
          {
            op:
              "commit",

            uid:
              authUser.uid,

            reservation,

            inputTokens:
              finalInputTokens,

            outputTokens:
              finalOutputTokens,

            totalTokens:
              finalTotalTokens,
          },
        );
      } catch (error) {
        console.error(
          `[${BUILD_ID}] budget commit failed:`,
          error?.message ||
            error,
        );
      }

      console.log(
        `[${BUILD_ID}] success`,
      );

      return json(
        {
          ...result,

          build:
            BUILD_ID,
        },
        200,
        origin || "",
      );
    } catch (error) {
      console.error(
        `[${BUILD_ID}] generation failed:`,
        error?.message ||
          error,
      );

      try {
        await budgetCall(
          env,
          {
            op:
              "release",

            uid:
              authUser.uid,

            reservation,
          },
        );
      } catch (
        releaseError
      ) {
        console.error(
          `[${BUILD_ID}] budget release failed:`,
          releaseError?.message ||
            releaseError,
        );
      }

      return errorResponse(
        "AI could not complete the request.",
        "internal",
        502,
        origin || "",
      );
    }
  },
};
