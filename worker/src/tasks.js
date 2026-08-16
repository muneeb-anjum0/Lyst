import { normalizeText } from "./utils.js";

function compactItems(
  items,
) {
  return (
    Array.isArray(items)
      ? items
      : []
  )
    .filter(
      (item) =>
        !item?.completed,
    )
    .slice(
      0,
      80,
    )
    .map(
      (
        item,
        index,
      ) => {
        const text =
          normalizeText(
            item?.text,
            120,
          );

        if (!text) {
          return null;
        }

        const quantity =
          item?.quantity ===
            null ||
          item?.quantity ===
            undefined ||
          item?.quantity ===
            ""
            ? ""
            : String(
                item.quantity,
              ).slice(
                0,
                20,
              );

        const unit =
          normalizeText(
            item?.quantityUnit,
            20,
          );

        const id =
          normalizeText(
            item?.id,
            100,
          );

        return {
          i:
            index,

          id,

          t:
            text,

          ...(quantity
            ? {
                q:
                  quantity,
              }
            : {}),

          ...(unit
            ? {
                u:
                  unit,
              }
            : {}),
        };
      },
    )
    .filter(Boolean);
}

function resultItemSchema(
  maxItems,
) {
  return {
    type:
      "object",

    additionalProperties:
      false,

    properties: {
      items: {
        type:
          "array",

        minItems:
          0,

        maxItems,

        items: {
          type:
            "object",

          additionalProperties:
            false,

          properties: {
            text: {
              type:
                "string",
            },

            quantity: {
              type: [
                "number",
                "null",
              ],
            },

            quantityUnit: {
              type:
                "string",
            },
          },

          required: [
            "text",
            "quantity",
            "quantityUnit",
          ],
        },
      },
    },

    required: [
      "items",
    ],
  };
}

const GENERATE_SCHEMA = {
  type:
    "object",

  additionalProperties:
    false,

  properties: {
    title: {
      type:
        "string",
    },

    items: {
      type:
        "array",

      minItems:
        1,

      maxItems:
        30,

      items: {
        type:
          "object",

        additionalProperties:
          false,

        properties: {
          text: {
            type:
              "string",
          },

          quantity: {
            type: [
              "number",
              "null",
            ],
          },

          quantityUnit: {
            type:
              "string",
          },
        },

        required: [
          "text",
          "quantity",
          "quantityUnit",
        ],
      },
    },
  },

  required: [
    "title",
    "items",
  ],
};

const ORGANIZE_SCHEMA = {
  type:
    "object",

  additionalProperties:
    false,

  properties: {
    edits: {
      type:
        "array",

      minItems:
        0,

      maxItems:
        30,

      items: {
        type:
          "object",

        additionalProperties:
          false,

        properties: {
          index: {
            type:
              "integer",

            minimum:
              0,

            maximum:
              79,
          },

          text: {
            type:
              "string",
          },

          reason: {
            type:
              "string",
          },
        },

        required: [
          "index",
          "text",
          "reason",
        ],
      },
    },
  },

  required: [
    "edits",
  ],
};

const OPTIMIZE_LISTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    lists: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          items: {
            type: "array",
            minItems: 1,
            maxItems: 120,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                index: { type: "integer", minimum: 0, maximum: 119 },
                text: { type: "string" },
              },
              required: ["index", "text"],
            },
          },
        },
        required: ["title", "items"],
      },
    },
  },
  required: ["summary", "lists"],
};

function compactLists(lists) {
  const rawLists = Array.isArray(lists) ? lists.slice(0, 12) : [];
  const optimizationItems = [];
  const packedLists = [];

  rawLists.forEach((list, listIndex) => {
    const title = normalizeText(list?.title, 80);
    const packedItems = [];

    for (const item of Array.isArray(list?.items) ? list.items : []) {
      if (optimizationItems.length >= 120) break;
      if (item?.completed) continue;

      const text = normalizeText(item?.text, 120);
      const itemId = normalizeText(item?.id, 100);
      if (!text || !itemId) continue;

      const index = optimizationItems.length;
      const quantity = item?.quantity == null || item.quantity === ""
        ? ""
        : String(item.quantity).slice(0, 20);
      const unit = normalizeText(item?.quantityUnit, 20);

      optimizationItems.push({
        index,
        sourceListId: normalizeText(list?.id, 100),
        sourceListIndex: listIndex,
        sourceItemId: itemId,
        text,
      });

      packedItems.push({
        i: index,
        t: text,
        ...(quantity ? { q: quantity } : {}),
        ...(unit ? { u: unit } : {}),
      });
    }

    if (title && packedItems.length > 0) {
      packedLists.push({ i: listIndex, t: title, items: packedItems });
    }
  });

  return { rawLists, optimizationItems, packedLists };
}

export function buildTask(
  action,
  data,
) {
  if (
    action ===
    "generate"
  ) {
    const prompt =
      normalizeText(
        data?.prompt,
        350,
      );

    if (
      prompt.length <
      4
    ) {
      return {
        error:
          "Describe the list you want to generate.",
      };
    }

    return {
      contents: [
        "TASK:generate_list",

        `REQUEST:${JSON.stringify(
          prompt,
        )}`,

        "Create a practical concise list. Quantities only when useful.",
      ].join("\n"),

      schema:
        GENERATE_SCHEMA,

      rawItems:
        [],
    };
  }

  if (action === "optimize_lists") {
    const { rawLists, optimizationItems, packedLists } = compactLists(data?.lists);

    if (packedLists.length < 2 || optimizationItems.length < 2) {
      return {
        error: "Add active items to at least two lists before optimizing them.",
      };
    }

    return {
      contents: [
        "TASK:optimize_list_collection",
        `DATA:${JSON.stringify({ lists: packedLists })}`,
        "Regroup every indexed item exactly once into coherent practical lists.",
        "Use fewer lists only when their subjects genuinely belong together; never force unrelated items into a generic list.",
        "Give each list a specific 1-4 word title. Improve item wording for clarity and consistency while preserving meaning and details.",
        "Do not invent, remove, duplicate, or complete items. Return each original item index exactly once.",
      ].join("\n"),
      schema: OPTIMIZE_LISTS_SCHEMA,
      rawItems: [],
      rawLists,
      optimizationItems,
    };
  }

  const rawItems =
    Array.isArray(
      data?.items,
    )
      ? data.items.slice(
          0,
          80,
        )
      : [];

  const compactedItems =
    compactItems(
      rawItems,
    );

  if (
    compactedItems.length ===
    0
  ) {
    return {
      error:
        "Add at least one item before using this AI action.",
    };
  }

  const listTitle =
    normalizeText(
      data?.listTitle,
      80,
    );

  const packed =
    JSON.stringify({
      t:
        listTitle,

      i:
        compactedItems.map(
          ({
            i,
            t,
            q,
            u,
          }) => ({
            i,
            t,

            ...(q
              ? {
                  q,
                }
              : {}),

            ...(u
              ? {
                  u,
                }
              : {}),
          }),
        ),
    });

  if (
    action ===
    "suggest"
  ) {
    return {
      contents: [
        "TASK:suggest_missing",

        `DATA:${packed}`,

        "Suggest 3-6 genuinely useful optional additions that fit this list's context. Never return an existing item or generic filler.",
      ].join("\n"),

      schema:
        resultItemSchema(
          6,
        ),

      rawItems,
    };
  }

  if (
    action ===
    "complete"
  ) {
    return {
      contents: [
        "TASK:complete_list",

        `DATA:${packed}`,

        "Infer the list's intended goal and return up to 10 essential missing items needed to make it practically complete. Avoid optional filler and existing items.",
      ].join("\n"),

      schema:
        resultItemSchema(
          10,
        ),

      rawItems,
    };
  }

  if (
    action ===
    "organize"
  ) {
    return {
      contents: [
        "TASK:optimize_item_names",

        `DATA:${packed}`,

        "Improve only names that are unclear, inconsistent, redundant, or hard to scan.",
        "Preserve meaning, proper nouns, quantities, and important details. Use concise natural capitalization; do not turn names into vague categories.",
        "Return the original item index, improved text, and a short reason. Omit items that are already clear.",
      ].join("\n"),

      schema:
        ORGANIZE_SCHEMA,

      rawItems,
    };
  }

  return {
    error:
      "Unsupported AI action.",
  };
}
