import { json } from "./http.js";
import {
  dayKey,
  monthKey,
  normalizeText,
  safeNumber,
} from "./utils.js";

const MAX_REQUESTS_PER_USER_PER_DAY = 20;
const MAX_TOKENS_PER_USER_PER_MONTH = 10_000;
const MAX_TOKENS_GLOBAL_PER_MONTH = 250_000;
const LIMITER_VERSION = "v8";

export class LystBudget {
  constructor(ctx) {
    this.ctx =
      ctx;
  }

  async fetch(
    request,
  ) {
    let body;

    try {
      body =
        await request.json();
    } catch {
      return json(
        {
          error:
            "Invalid budget request.",
        },
        400,
      );
    }

    if (
      body?.op ===
      "reserve"
    ) {
      return this.reserve(
        body,
      );
    }

    if (
      body?.op ===
      "commit"
    ) {
      return this.commit(
        body,
      );
    }

    if (
      body?.op ===
      "release"
    ) {
      return this.release(
        body,
      );
    }

    return json(
      {
        error:
          "Unknown budget operation.",
      },
      400,
    );
  }

  reserve(
    body,
  ) {
    const uid =
      normalizeText(
        body?.uid,
        128,
      );

    const reservation =
      Math.floor(
        safeNumber(
          body?.reservation,
        ),
      );

    if (
      !uid ||
      reservation <=
        0
    ) {
      return json(
        {
          ok:
            false,
        },
        400,
      );
    }

    const month =
      monthKey();

    const day =
      dayKey();

    const globalKey =
      `g:${LIMITER_VERSION}:${month}`;

    const userMonthKey =
      `u:${LIMITER_VERSION}:${uid}:${month}`;

    const userDayKey =
      `d:${LIMITER_VERSION}:${uid}:${day}`;

    const global =
      this.ctx.storage.kv.get(
        globalKey,
      ) || {};

    const userMonth =
      this.ctx.storage.kv.get(
        userMonthKey,
      ) || {};

    const userDay =
      this.ctx.storage.kv.get(
        userDayKey,
      ) || {};

    const globalUsed =
      safeNumber(
        global.totalTokens,
      ) +
      safeNumber(
        global.reservedTokens,
      );

    const userUsed =
      safeNumber(
        userMonth.totalTokens,
      ) +
      safeNumber(
        userMonth.reservedTokens,
      );

    const successfulRequests =
      safeNumber(
        userDay.requests,
      );

    const reservedRequests =
      safeNumber(
        userDay.reservedRequests,
      );

    if (
      globalUsed +
        reservation >
      MAX_TOKENS_GLOBAL_PER_MONTH
    ) {
      return json(
        {
          ok:
            false,

          code:
            "global-month-limit",
        },
        429,
      );
    }

    if (
      userUsed +
        reservation >
      MAX_TOKENS_PER_USER_PER_MONTH
    ) {
      return json(
        {
          ok:
            false,

          code:
            "user-month-limit",
        },
        429,
      );
    }

    if (
      successfulRequests +
        reservedRequests >=
      MAX_REQUESTS_PER_USER_PER_DAY
    ) {
      return json(
        {
          ok:
            false,

          code:
            "user-day-limit",
        },
        429,
      );
    }

    this.ctx.storage.kv.put(
      globalKey,
      {
        ...global,

        reservedTokens:
          safeNumber(
            global.reservedTokens,
          ) +
          reservation,
      },
    );

    this.ctx.storage.kv.put(
      userMonthKey,
      {
        ...userMonth,

        reservedTokens:
          safeNumber(
            userMonth.reservedTokens,
          ) +
          reservation,
      },
    );

    this.ctx.storage.kv.put(
      userDayKey,
      {
        ...userDay,

        reservedRequests:
          reservedRequests +
          1,
      },
    );

    return json({
      ok:
        true,
    });
  }

  commit(
    body,
  ) {
    const uid =
      normalizeText(
        body?.uid,
        128,
      );

    if (!uid) {
      return json(
        {
          ok:
            false,
        },
        400,
      );
    }

    const reservation =
      safeNumber(
        body?.reservation,
      );

    const inputTokens =
      safeNumber(
        body?.inputTokens,
      );

    const outputTokens =
      safeNumber(
        body?.outputTokens,
      );

    const totalTokens =
      safeNumber(
        body?.totalTokens,
      );

    const month =
      monthKey();

    const day =
      dayKey();

    const globalKey =
      `g:${LIMITER_VERSION}:${month}`;

    const userMonthKey =
      `u:${LIMITER_VERSION}:${uid}:${month}`;

    const userDayKey =
      `d:${LIMITER_VERSION}:${uid}:${day}`;

    const global =
      this.ctx.storage.kv.get(
        globalKey,
      ) || {};

    const userMonth =
      this.ctx.storage.kv.get(
        userMonthKey,
      ) || {};

    const userDay =
      this.ctx.storage.kv.get(
        userDayKey,
      ) || {};

    this.ctx.storage.kv.put(
      globalKey,
      {
        ...global,

        reservedTokens:
          Math.max(
            0,
            safeNumber(
              global.reservedTokens,
            ) -
              reservation,
          ),

        inputTokens:
          safeNumber(
            global.inputTokens,
          ) +
          inputTokens,

        outputTokens:
          safeNumber(
            global.outputTokens,
          ) +
          outputTokens,

        totalTokens:
          safeNumber(
            global.totalTokens,
          ) +
          totalTokens,

        requests:
          safeNumber(
            global.requests,
          ) +
          1,
      },
    );

    this.ctx.storage.kv.put(
      userMonthKey,
      {
        ...userMonth,

        reservedTokens:
          Math.max(
            0,
            safeNumber(
              userMonth.reservedTokens,
            ) -
              reservation,
          ),

        inputTokens:
          safeNumber(
            userMonth.inputTokens,
          ) +
          inputTokens,

        outputTokens:
          safeNumber(
            userMonth.outputTokens,
          ) +
          outputTokens,

        totalTokens:
          safeNumber(
            userMonth.totalTokens,
          ) +
          totalTokens,

        requests:
          safeNumber(
            userMonth.requests,
          ) +
          1,
      },
    );

    this.ctx.storage.kv.put(
      userDayKey,
      {
        ...userDay,

        reservedRequests:
          Math.max(
            0,
            safeNumber(
              userDay.reservedRequests,
            ) -
              1,
          ),

        requests:
          safeNumber(
            userDay.requests,
          ) +
          1,
      },
    );

    return json({
      ok:
        true,
    });
  }

  release(
    body,
  ) {
    const uid =
      normalizeText(
        body?.uid,
        128,
      );

    if (!uid) {
      return json(
        {
          ok:
            false,
        },
        400,
      );
    }

    const reservation =
      safeNumber(
        body?.reservation,
      );

    const month =
      monthKey();

    const day =
      dayKey();

    const globalKey =
      `g:${LIMITER_VERSION}:${month}`;

    const userMonthKey =
      `u:${LIMITER_VERSION}:${uid}:${month}`;

    const userDayKey =
      `d:${LIMITER_VERSION}:${uid}:${day}`;

    const global =
      this.ctx.storage.kv.get(
        globalKey,
      ) || {};

    const userMonth =
      this.ctx.storage.kv.get(
        userMonthKey,
      ) || {};

    const userDay =
      this.ctx.storage.kv.get(
        userDayKey,
      ) || {};

    this.ctx.storage.kv.put(
      globalKey,
      {
        ...global,

        reservedTokens:
          Math.max(
            0,
            safeNumber(
              global.reservedTokens,
            ) -
              reservation,
          ),
      },
    );

    this.ctx.storage.kv.put(
      userMonthKey,
      {
        ...userMonth,

        reservedTokens:
          Math.max(
            0,
            safeNumber(
              userMonth.reservedTokens,
            ) -
              reservation,
          ),
      },
    );

    this.ctx.storage.kv.put(
      userDayKey,
      {
        ...userDay,

        reservedRequests:
          Math.max(
            0,
            safeNumber(
              userDay.reservedRequests,
            ) -
              1,
          ),
      },
    );

    return json({
      ok:
        true,
    });
  }
}

export async function budgetCall(
  env,
  payload,
) {
  const id =
    env.LYST_BUDGET.idFromName(
      "global",
    );

  const stub =
    env.LYST_BUDGET.get(
      id,
    );

  return stub.fetch(
    "https://budget.internal/",
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify(
          payload,
        ),
    },
  );
}

