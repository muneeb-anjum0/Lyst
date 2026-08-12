import { useState } from "react";
import { motion } from "framer-motion";
import { quantitiesCanMerge } from "../../lib/itemMerge.js";
import {
  combineLocalDateAndTime,
  formatDateForInput,
  formatDueDate,
  formatTimeForInput,
  getItemMetadata,
} from "../itemFormatting.jsx";
import { Sheet } from "./Sheet.jsx";

export function DuplicateItemSheet({
  duplicate,
  adding,
  onClose,
  onMerge,
  onKeepBoth,
}) {
  const existingMetadata = getItemMetadata(
    duplicate.existingItem,
  );
  const incomingMetadata = getItemMetadata(
    duplicate.parsedItem,
  );
  const canMergeQuantity = quantitiesCanMerge(
    duplicate.existingItem,
    duplicate.parsedItem,
  );

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content duplicate-sheet">
        <div className="sheet-handle" />

        <header className="sheet-header">
          <div>
            <h2>Already on your list</h2>
            <p className="sheet-subtitle">
              Lyst found a matching active item.
            </p>
          </div>

          <button
            className="danger-outline-action"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
        </header>

        <div className="duplicate-comparison">
          <div>
            <span>Existing</span>
            <strong>{duplicate.existingItem.text}</strong>
            {existingMetadata && <small>{existingMetadata}</small>}
          </div>

          <div>
            <span>New entry</span>
            <strong>{duplicate.parsedItem.text}</strong>
            {incomingMetadata && <small>{incomingMetadata}</small>}
          </div>
        </div>

        {!canMergeQuantity && (
          <p className="duplicate-note">
            The units differ, so merging keeps the newest quantity and
            unit instead of adding them together.
          </p>
        )}

        <div className="duplicate-actions">
          <motion.button
            className="primary-button"
            type="button"
            disabled={adding}
            whileTap={{ scale: 0.975 }}
            onClick={onMerge}
          >
            {adding ? "Merging..." : "Merge details"}
          </motion.button>

          <button
            type="button"
            disabled={adding}
            onClick={onKeepBoth}
          >
            Keep both
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function NaturalInputSheet({
  parsedItem,
  adding,
  onClose,
  onConfirm,
  onPlainText,
}) {
  const [text, setText] = useState(parsedItem.text);
  const [quantity, setQuantity] = useState(
    parsedItem.quantity ?? "",
  );
  const [quantityUnit, setQuantityUnit] = useState(
    parsedItem.quantityUnit || "",
  );
  const [dateValue, setDateValue] = useState(
    formatDateForInput(parsedItem.dueAt),
  );
  const [timeValue, setTimeValue] = useState(
    formatTimeForInput(parsedItem.dueAt) || "12:00",
  );
  const [validationMessage, setValidationMessage] = useState(
    parsedItem.warning || "",
  );

  const previewDueAt = combineLocalDateAndTime(
    dateValue,
    timeValue,
  );
  const dueLabel = formatDueDate(previewDueAt);

  function submitParsedItem(event) {
    event.preventDefault();

    const dueAt = combineLocalDateAndTime(
      dateValue,
      timeValue,
    );

    if (dateValue && !dueAt) {
      setValidationMessage("Choose a valid date and time.");
      return;
    }

    const numericQuantity =
      quantity === "" ? null : Number(quantity);

    if (
      numericQuantity !== null &&
      (!Number.isFinite(numericQuantity) || numericQuantity < 0)
    ) {
      setValidationMessage("Quantity must be zero or greater.");
      return;
    }

    setValidationMessage("");

    onConfirm({
      ...parsedItem,
      text,
      quantity: numericQuantity,
      quantityUnit: quantityUnit.trim(),
      dueAt,
    });
  }

  return (
    <Sheet onClose={onClose}>
      <form
        className="sheet-content natural-sheet"
        onSubmit={submitParsedItem}
      >
        <div className="sheet-handle" />

        <header className="sheet-header">
          <div>
            <h2>Confirm item</h2>
            <p className="sheet-subtitle">
              Review what Lyst understood before saving.
            </p>
          </div>

          <button
            className="danger-outline-action"
            type="button"
            onClick={onClose}
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

        <div className="natural-grid">
          <label className="natural-field">
            <span>Date</span>

            <input
              className="sheet-input"
              type="date"
              value={dateValue}
              onChange={(event) => {
                setDateValue(event.target.value);

                if (!event.target.value) {
                  setValidationMessage("");
                }
              }}
            />
          </label>

          <label className="natural-field">
            <span>Time</span>

            <input
              className="sheet-input"
              type="time"
              value={timeValue}
              disabled={!dateValue}
              onChange={(event) => setTimeValue(event.target.value)}
            />
          </label>
        </div>

        {dueLabel && (
          <div className="parsed-date">
            <span>Due</span>
            <strong>{dueLabel}</strong>
          </div>
        )}

        {validationMessage && (
          <p className="natural-warning">{validationMessage}</p>
        )}

        <motion.button
          className="primary-button"
          type="submit"
          disabled={!text.trim() || adding}
          whileTap={{ scale: 0.975 }}
        >
          {adding ? "Adding..." : "Add item"}
        </motion.button>

        <button
          className="plain-text-button"
          type="button"
          disabled={adding}
          onClick={onPlainText}
        >
          Add original text without parsing
        </button>
      </form>
    </Sheet>
  );
}
