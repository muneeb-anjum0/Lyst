import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { callLystAi, getAiErrorMessage, isAiLimitError } from "../../services/ai.js";
import { formatQuantity } from "../itemFormatting.jsx";
import { AiLimitPopup, Sheet } from "./Sheet.jsx";

export function AiAssistSheet({
  list,
  items,
  onClose,
  onAddItems,
  onApplyEdits,
  showToast,
}) {
  const [workingAction, setWorkingAction] = useState("");
  const [result, setResult] = useState(null);
  const [limitPopupOpen, setLimitPopupOpen] = useState(false);

  async function run(action) {
    if (workingAction) return;

    try {
      setWorkingAction(action);
      setResult(null);

      const response = await callLystAi({
        action,
        listTitle: list.title,
        items: items.slice(0, 80).map((item) => ({
          id: item.id,
          text: item.text,
          quantity: item.quantity ?? null,
          quantityUnit: item.quantityUnit || "",
          completed: Boolean(item.completed),
        })),
      });

      setResult({
        action,
        ...response,
      });
    } catch (error) {
      console.error(error);

      if (isAiLimitError(error)) {
        setLimitPopupOpen(true);
      } else {
        showToast(getAiErrorMessage(error));
      }
    } finally {
      setWorkingAction("");
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content">
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>AI for {list.title}</h2>

          <button
            className="danger-outline-action"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
        </header>

        {!result && (
          <div className="ai-action-grid">
            <button
              type="button"
              disabled={Boolean(workingAction)}
              onClick={() => run("suggest")}
            >
              <strong>Suggest missing items</strong>
              <small>Useful additions based only on this list.</small>
            </button>

            <button
              type="button"
              disabled={Boolean(workingAction)}
              onClick={() => run("complete")}
            >
              <strong>Complete this list</strong>
              <small>Fill obvious gaps without repeating items.</small>
            </button>

            <button
              type="button"
              disabled={Boolean(workingAction)}
              onClick={() => run("organize")}
            >
              <strong>Optimize item names</strong>
              <small>Make names clearer, consistent, and easier to scan.</small>
            </button>
          </div>
        )}

        {workingAction && (
          <div className="ai-working">
            <div className="mini-pastel-spinner" />
            <span>Thinking lightly...</span>
          </div>
        )}

        {result && (
          <div className="ai-result">
            {result.action === "organize" ? (
              <>
                <div className="ai-result-heading">
                  <strong>Name optimization preview</strong>
                  <small>
                    {result.edits?.length || 0} suggested changes
                  </small>
                </div>

                <div className="ai-name-edits">
                  {(result.edits || []).map((edit) => (
                    <div className="ai-name-edit" key={edit.itemId}>
                      <span>{edit.originalText}</span>
                      <strong>{edit.text}</strong>
                      {edit.reason && <small>{edit.reason}</small>}
                    </div>
                  ))}
                </div>

                <motion.button
                  className="primary-button"
                  type="button"
                  disabled={!result.edits?.length}
                  whileTap={{ scale: 0.975 }}
                  onClick={() => onApplyEdits(result.edits || [])}
                >
                  Apply name changes
                </motion.button>
              </>
            ) : (
              <>
                <div className="ai-result-heading">
                  <strong>Suggestions</strong>
                  <small>
                    {result.items?.length || 0} items
                  </small>
                </div>

                <div className="ai-preview-items">
                  {(result.items || []).map((item, index) => (
                    <span key={`${item.text}-${index}`}>
                      {item.text}
                      {item.quantity
                        ? ` · ${formatQuantity(
                            item.quantity,
                            item.quantityUnit,
                          )}`
                        : ""}
                    </span>
                  ))}
                  {!result.items?.length && (
                    <span>This list already looks complete.</span>
                  )}
                </div>

                <motion.button
                  className="primary-button"
                  type="button"
                  disabled={!result.items?.length}
                  whileTap={{ scale: 0.975 }}
                  onClick={() => onAddItems(result.items || [])}
                >
                  Add suggestions
                </motion.button>
              </>
            )}

            <button
              className="secondary-button"
              type="button"
              onClick={() => setResult(null)}
            >
              Try another action
            </button>
          </div>
        )}

        <AnimatePresence>
          {limitPopupOpen && (
            <AiLimitPopup
              onClose={() => setLimitPopupOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
