import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { DAILY_AI_REQUEST_LIMIT } from "../../services/ai.js";

export function Sheet({ children, onClose }) {
  const dragStartY = useRef(null);
  const dragStartX = useRef(null);
  const [dragY, setDragY] = useState(0);

  function beginSheetGesture(event) {
    if (event.pointerType === "mouse") return;

    dragStartY.current = event.clientY;
    dragStartX.current = event.clientX;
    setDragY(0);

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveSheetGesture(event) {
    if (dragStartY.current === null) return;

    const deltaY = event.clientY - dragStartY.current;
    const deltaX = Math.abs(event.clientX - dragStartX.current);

    if (deltaY <= 0 || deltaX > deltaY) {
      setDragY(0);
      return;
    }

    setDragY(Math.min(deltaY, 140));
  }

  function finishSheetGesture() {
    if (dragStartY.current === null) return;

    const shouldClose = dragY >= 72;

    dragStartY.current = null;
    dragStartX.current = null;

    if (shouldClose) {
      setDragY(0);

      if ("vibrate" in navigator) {
        navigator.vibrate(7);
      }

      onClose();
      return;
    }

    setDragY(0);
  }

  return (
    <motion.div
      className="sheet-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <motion.div
        className="sheet"
        initial={{ y: "100%", scale: 0.985 }}
        animate={{ y: dragY, scale: 1 }}
        exit={{ y: "100%", scale: 0.985 }}
        transition={{
          type: "spring",
          stiffness: 525,
          damping: 25,
          mass: 0.68,
        }}
      >
        <div
          className="sheet-gesture-zone"
          aria-hidden="true"
          onPointerDown={beginSheetGesture}
          onPointerMove={moveSheetGesture}
          onPointerUp={finishSheetGesture}
          onPointerCancel={() => {
            dragStartY.current = null;
            dragStartX.current = null;
            setDragY(0);
          }}
        />

        {children}
      </motion.div>
    </motion.div>
  );
}

export function AiLimitPopup({ onClose }) {
  return (
    <motion.div
      className="ai-limit-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <motion.div
        className="ai-limit-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-limit-title"
        initial={{ opacity: 0, y: 14, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.96 }}
        transition={{
          type: "spring",
          stiffness: 520,
          damping: 24,
        }}
      >
        <div className="ai-limit-icon" aria-hidden="true">
          <svg viewBox="0 0 32 32">
            <defs>
              <linearGradient
                id="lyst-limit-gradient"
                x1="4"
                y1="4"
                x2="28"
                y2="28"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0" stopColor="#A9C8F8" />
                <stop offset="0.34" stopColor="#C7B8F2" />
                <stop offset="0.67" stopColor="#F1BED7" />
                <stop offset="1" stopColor="#F6D7B7" />
              </linearGradient>
            </defs>
            <path
              d="M16 3.2C17.25 10.55 21.45 14.75 28.8 16C21.45 17.25 17.25 21.45 16 28.8C14.75 21.45 10.55 17.25 3.2 16C10.55 14.75 14.75 10.55 16 3.2Z"
              fill="url(#lyst-limit-gradient)"
            />
          </svg>
        </div>

        <span className="ai-limit-kicker">AI break</span>

        <h2 id="ai-limit-title">You’ve used today’s AI assists</h2>

        <p>
          You get {DAILY_AI_REQUEST_LIMIT} AI requests each day.
          Your limit will refresh tomorrow, and all your regular
          lists still work normally.
        </p>

        <motion.button
          className="ai-limit-button"
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onClose}
        >
          Got it
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
