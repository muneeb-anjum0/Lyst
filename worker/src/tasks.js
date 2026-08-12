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
        },

        required: [
          "index",
          "text",
        ],
      },
    },
  },

  required: [
    "edits",
  ],
};

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

        "Suggest at most 6 useful missing items. Never return an existing item.",
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

        "Return at most 10 obvious missing items. Avoid filler and existing items.",
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
        "TASK:clean_item_names",

        `DATA:${packed}`,

        "Return edits only for unclear, inconsistent, verbose, or badly formatted names. Preserve meaning. Use item index.",
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

