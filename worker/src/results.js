import { normalizeItemKey, normalizeText, safeNumber } from "./utils.js";

const BUILD_ID = "lyst-worker-v9-2026-08-16";

function incompleteResponse(message) {
  const error = new Error(message);
  error.code = "incomplete-response";
  return error;
}

export function extractGeminiText(
  response,
) {
  const parts =
    response
      ?.candidates?.[0]
      ?.content?.parts ||
    [];

  const text = parts
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

  if (!text) {
    const finishReason = String(response?.candidates?.[0]?.finishReason || "UNKNOWN");
    const error = new Error(`Gemini returned no text (${finishReason}).`);
    error.code = finishReason === "MAX_TOKENS"
      ? "incomplete-response"
      : "empty-response";
    throw error;
  }

  return text;
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

    const error = new Error("Gemini returned invalid JSON.");
    error.code = "incomplete-response";
    throw error;
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
    const items = sanitizeGeneratedItems(parsed?.items, 30);

    if (items.length === 0) {
      throw incompleteResponse("Gemini returned an empty generated list.");
    }

    return {
      title:
        normalizeText(
          parsed?.title,
          40,
        ) ||
        "Generated list",

      items,

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

      const reason = normalizeText(edit?.reason, 120);

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
        originalText: normalizeText(original?.text, 120),
        text,
        reason,
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

  if (action === "optimize_lists") {
    const sourceItems = Array.isArray(task.optimizationItems)
      ? task.optimizationItems
      : [];
    const proposedLists = Array.isArray(parsed?.lists) ? parsed.lists : [];
    const usedIndexes = new Set();
    const lists = [];

    for (const proposedList of proposedLists.slice(0, 12)) {
      const title = normalizeText(proposedList?.title, 40);
      const items = [];

      for (const proposedItem of Array.isArray(proposedList?.items)
        ? proposedList.items
        : []) {
        const index = Number(proposedItem?.index);
        const source = sourceItems[index];
        const text = normalizeText(proposedItem?.text, 120);

        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= sourceItems.length ||
          usedIndexes.has(index) ||
          !source ||
          !text
        ) {
          continue;
        }

        usedIndexes.add(index);
        items.push({ index, text });
      }

      if (title && items.length > 0) lists.push({ title, items });
    }

    if (lists.length === 0 || usedIndexes.size !== sourceItems.length) {
      throw incompleteResponse("Gemini did not place every source item exactly once.");
    }

    return {
      summary: normalizeText(parsed?.summary, 180),
      lists,
      coveredItems: usedIndexes.size,
      totalItems: sourceItems.length,
      usage,
    };
  }

  return {
    usage,
  };
}
