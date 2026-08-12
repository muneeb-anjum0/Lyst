import { normalizeItemKey, normalizeText, safeNumber } from "./utils.js";

const BUILD_ID = "lyst-worker-v8-2026-08-10";

export function extractGeminiText(
  response,
) {
  const parts =
    response
      ?.candidates?.[0]
      ?.content?.parts ||
    [];

  return parts
    .filter(
      (part) =>
        typeof part?.text ===
          "string" &&
        part?.thought !==
          true,
    )
    .map(
      (part) =>
        part.text,
    )
    .join("")
    .trim();
}

export function parseJsonResponse(
  text,
) {
  const raw =
    String(
      text || "",
    ).trim();

  if (!raw) {
    throw new Error(
      "Gemini returned no response text.",
    );
  }

  try {
    return JSON.parse(
      raw,
    );
  } catch {
    const fenced =
      raw.match(
        /^```(?:json)?\s*([\s\S]*?)\s*```$/i,
      );

    if (fenced) {
      try {
        return JSON.parse(
          fenced[1],
        );
      } catch {
        // Continue to diagnostic logging below.
      }
    }

    console.error(
      `[${BUILD_ID}] invalid JSON response:`,
      raw.slice(
        0,
        2000,
      ),
    );

    throw new Error(
      "Gemini returned invalid JSON.",
    );
  }
}

export function sanitizeGeneratedItems(
  items,
  maxItems,
) {
  const seen =
    new Set();

  return (
    Array.isArray(items)
      ? items
      : []
  )
    .map(
      (item) => {
        const text =
          normalizeText(
            item?.text,
            120,
          );

        let quantity =
          null;

        if (
          item?.quantity !==
            null &&
          item?.quantity !==
            undefined &&
          item?.quantity !==
            ""
        ) {
          const parsed =
            Number(
              item.quantity,
            );

          if (
            Number.isFinite(
              parsed,
            )
          ) {
            quantity =
              parsed;
          }
        }

        return {
          text,

          quantity,

          quantityUnit:
            normalizeText(
              item?.quantityUnit,
              20,
            ),
        };
      },
    )
    .filter(
      (item) => {
        if (!item.text) {
          return false;
        }

        const key =
          normalizeItemKey(
            item.text,
          );

        if (
          !key ||
          seen.has(
            key,
          )
        ) {
          return false;
        }

        seen.add(
          key,
        );

        return true;
      },
    )
    .slice(
      0,
      maxItems,
    );
}

export function formatResult(
  action,
  parsed,
  task,
  usageMetadata,
) {
  const inputTokens =
    safeNumber(
      usageMetadata
        ?.promptTokenCount,
    );

  const outputTokens =
    safeNumber(
      usageMetadata
        ?.candidatesTokenCount,
    );

  const totalTokens =
    safeNumber(
      usageMetadata
        ?.totalTokenCount,
    ) ||
    inputTokens +
      outputTokens;

  const usage = {
    inputTokens,
    outputTokens,
    totalTokens,
  };

  if (
    action ===
    "generate"
  ) {
    return {
      title:
        normalizeText(
          parsed?.title,
          40,
        ) ||
        "Generated list",

      items:
        sanitizeGeneratedItems(
          parsed?.items,
          30,
        ),

      usage,
    };
  }

  if (
    action ===
      "suggest" ||
    action ===
      "complete"
  ) {
    const existing =
      new Set(
        task.rawItems.map(
          (item) =>
            normalizeItemKey(
              item?.text,
            ),
        ),
      );

    const maxItems =
      action ===
      "suggest"
        ? 6
        : 10;

    const items =
      sanitizeGeneratedItems(
        parsed?.items,
        maxItems,
      ).filter(
        (item) =>
          !existing.has(
            normalizeItemKey(
              item.text,
            ),
          ),
      );

    return {
      items,
      usage,
    };
  }

  if (
    action ===
    "organize"
  ) {
    const activeItems =
      task.rawItems.filter(
        (item) =>
          !item?.completed,
      );

    const usedIds =
      new Set();

    const edits =
      [];

    const proposed =
      Array.isArray(
        parsed?.edits,
      )
        ? parsed.edits
        : [];

    for (
      const edit of
      proposed
    ) {
      const index =
        Number(
          edit?.index,
        );

      const text =
        normalizeText(
          edit?.text,
          120,
        );

      if (
        !Number.isInteger(
          index,
        ) ||
        index < 0 ||
        index >=
          activeItems.length ||
        !text
      ) {
        continue;
      }

      const original =
        activeItems[
          index
        ];

      const itemId =
        normalizeText(
          original?.id,
          100,
        );

      if (
        !itemId ||
        usedIds.has(
          itemId,
        )
      ) {
        continue;
      }

      if (
        normalizeItemKey(
          original?.text,
        ) ===
        normalizeItemKey(
          text,
        )
      ) {
        continue;
      }

      usedIds.add(
        itemId,
      );

      edits.push({
        itemId,
        text,
      });

      if (
        edits.length >=
        30
      ) {
        break;
      }
    }

    return {
      edits,
      usage,
    };
  }

  return {
    usage,
  };
}

