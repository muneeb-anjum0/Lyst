import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { callLystAi, getAiErrorMessage, isAiLimitError } from "../../services/ai.js";
import { formatQuantity } from "../itemFormatting.jsx";
import { AiLimitPopup, Sheet } from "./Sheet.jsx";

export function NewListSheet({ onClose, onCreate, showToast }) {
  const [title, setTitle] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiWorking, setAiWorking] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [limitPopupOpen, setLimitPopupOpen] = useState(false);

  async function generateList() {
    const prompt = aiPrompt.trim();

    if (!prompt || aiWorking) return;

    if (!navigator.onLine) {
      showToast("AI needs an internet connection.");
      return;
    }

    try {
      setAiWorking(true);

      const result = await callLystAi({
        action: "generate",
        prompt,
      });

      setGenerated(result);
      setTitle(result.title || title);
    } catch (error) {
      console.error(error);

      if (isAiLimitError(error)) {
        setLimitPopupOpen(true);
      } else {
        showToast(getAiErrorMessage(error));
      }
    } finally {
      setAiWorking(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <form
        className="sheet-content"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(title, generated?.items || []);
        }}
      >
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>New list</h2>

          <button type="button" onClick={onClose}>
            Done
          </button>
        </header>

        <input
          className="sheet-input"
          autoFocus
          value={title}
          maxLength={40}
          placeholder="List name"
          onChange={(event) => {
            setTitle(event.target.value);
            if (generated) setGenerated(null);
          }}
          onFocus={(event) => {
            window.setTimeout(
              () =>
                event.currentTarget?.scrollIntoView({
                  block: "center",
                  behavior: "smooth",
                }),
              120,
            );
          }}
        />

        <div className="ai-create-box">
          <div className="ai-section-title">
            <strong>Generate with AI</strong>
            <small>Optional</small>
          </div>

          <textarea
            value={aiPrompt}
            maxLength={350}
            rows={3}
            placeholder="e.g. Packing list for 5 winter days in Murree"
            onChange={(event) => {
              setAiPrompt(event.target.value);
              setGenerated(null);
            }}
          />

          <motion.button
            className="secondary-button ai-generate-button"
            type="button"
            disabled={!aiPrompt.trim() || aiWorking}
            whileTap={{ scale: 0.975 }}
            onClick={generateList}
          >
            {aiWorking ? "Generating..." : "Generate preview"}
          </motion.button>

          {generated?.items?.length > 0 && (
            <div className="ai-preview-card">
              <strong>{generated.title || title || "Generated list"}</strong>
              <small>{generated.items.length} suggested items</small>

              <div className="ai-preview-items">
                {generated.items.slice(0, 30).map((item, index) => (
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
              </div>
            </div>
          )}
        </div>

        <motion.button
          className="primary-button"
          type="submit"
          disabled={!title.trim()}
          whileTap={{ scale: 0.975 }}
        >
          {generated?.items?.length
            ? `Create with ${generated.items.length} items`
            : "Create list"}
        </motion.button>

        <AnimatePresence>
          {limitPopupOpen && (
            <AiLimitPopup
              onClose={() => setLimitPopupOpen(false)}
            />
          )}
        </AnimatePresence>
      </form>
    </Sheet>
  );
}

export function EditListSheet({ list, onClose, onSave }) {
  const [title, setTitle] = useState(list.title);

  return (
    <Sheet onClose={onClose}>
      <form
        className="sheet-content"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(title);
        }}
      >
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>Rename list</h2>

          <button
            className="danger-outline-action"
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();

              window.setTimeout(() => {
                onClose();
              }, 90);
            }}
          >
            Cancel
          </button>
        </header>

        <input
          className="sheet-input"
          autoFocus
          value={title}
          maxLength={40}
          onChange={(event) => setTitle(event.target.value)}
        />

        <motion.button
          className="primary-button"
          type="submit"
          disabled={!title.trim()}
          whileTap={{ scale: 0.975 }}
        >
          Save
        </motion.button>
      </form>
    </Sheet>
  );
}
