import { useState } from "react";
import { motion } from "framer-motion";
import { combineLocalDateAndTime, formatCompactDateInput, formatCompactTimeInput, formatDateForInput, formatDueDate, formatTimeForInput } from "../itemFormatting.jsx";
import { Sheet } from "./Sheet.jsx";

export function EditItemSheet({ item, onClose, onSave }) {
  const [text, setText] = useState(item.text || "");
  const [quantity, setQuantity] = useState(item.quantity ?? "");
  const [quantityUnit, setQuantityUnit] = useState(
    item.quantityUnit || "",
  );
  const [dateValue, setDateValue] = useState(
    formatDateForInput(item.dueAt),
  );
  const [timeValue, setTimeValue] = useState(
    formatTimeForInput(item.dueAt) || "12:00",
  );
  const [validationMessage, setValidationMessage] = useState("");

  const previewDueAt = combineLocalDateAndTime(
    dateValue,
    timeValue,
  );
  const dueLabel = formatDueDate(previewDueAt);

  function submitEdit(event) {
    event.preventDefault();

    const cleanText = text.trim();

    if (!cleanText) return;

    const numericQuantity =
      quantity === "" ? null : Number(quantity);

    if (
      numericQuantity !== null &&
      (!Number.isFinite(numericQuantity) || numericQuantity < 0)
    ) {
      setValidationMessage("Quantity must be zero or greater.");
      return;
    }

    const dueAt = combineLocalDateAndTime(
      dateValue,
      timeValue,
    );

    if (dateValue && !dueAt) {
      setValidationMessage("Choose a valid date and time.");
      return;
    }

    setValidationMessage("");

    onSave({
      text: cleanText,
      quantity: numericQuantity,
      quantityUnit,
      dueAt,
      rawInput: item.rawInput || cleanText,
    });
  }

  return (
    <Sheet onClose={onClose}>
      <form
        className="sheet-content edit-item-sheet"
        onSubmit={submitEdit}
      >
        <div className="sheet-handle" />

        <header className="sheet-header">
          <div>
            <h2>Edit item</h2>
            <p className="sheet-subtitle">
              Change the item, quantity, date or time.
            </p>
          </div>

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

        <label className="natural-field">
          <span>Item</span>

          <input
            className="sheet-input"
            autoFocus
            value={text}
            maxLength={160}
            onChange={(event) => setText(event.target.value)}
          />
        </label>

        <div className="natural-grid">
          <label className="natural-field">
            <span>Quantity</span>

            <input
              className="sheet-input"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={quantity}
              placeholder="None"
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>

          <label className="natural-field">
            <span>Unit</span>

            <input
              className="sheet-input"
              value={quantityUnit}
              placeholder="Optional"
              onChange={(event) =>
                setQuantityUnit(event.target.value)
              }
            />
          </label>
        </div>

        <div className="natural-grid edit-date-time-grid">
          <label className="natural-field">
            <span>Date</span>

            <div className="pretty-native-field">
              <span className="pretty-native-value">
                {formatCompactDateInput(dateValue)}
              </span>

              <span className="pretty-native-cue" aria-hidden="true">
                ▾
              </span>

              <input
                className="pretty-native-input"
                type="date"
                value={dateValue}
                aria-label="Due date"
                onChange={(event) => {
                  setDateValue(event.target.value);

                  if (!event.target.value) {
                    setValidationMessage("");
                  }
                }}
              />
            </div>
          </label>

          <label className="natural-field">
            <span>Time</span>

            <div
              className={`pretty-native-field ${
                !dateValue ? "disabled" : ""
              }`}
            >
              <span className="pretty-native-value">
                {dateValue
                  ? formatCompactTimeInput(timeValue)
                  : "Select date first"}
              </span>

              <span className="pretty-native-cue" aria-hidden="true">
                ▾
              </span>

              <input
                className="pretty-native-input"
                type="time"
                value={timeValue}
                disabled={!dateValue}
                aria-label="Due time"
                onChange={(event) => setTimeValue(event.target.value)}
              />
            </div>
          </label>
        </div>

        {dueLabel && (
          <div className="due-chip-row">
            <span className="due-chip">
              {dueLabel}
            </span>

            {dateValue && (
              <button
                className="remove-due-link"
                type="button"
                onClick={() => {
                  setDateValue("");
                  setTimeValue("12:00");
                  setValidationMessage("");
                }}
              >
                Remove due date
              </button>
            )}
          </div>
        )}

        {validationMessage && (
          <p className="natural-warning">{validationMessage}</p>
        )}

        <motion.button
          className="primary-button"
          type="submit"
          disabled={!text.trim()}
          whileTap={{ scale: 0.975 }}
        >
          Save changes
        </motion.button>
      </form>
    </Sheet>
  );
}
