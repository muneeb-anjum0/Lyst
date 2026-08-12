import { AnimatePresence, motion } from "framer-motion";

export function UpdateBanner({ visible, updating, onUpdate }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="update-banner"
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 570, damping: 25 }}
        >
          <div>
            <strong>Lyst update ready</strong>
            <span>Refresh once to use the newest version.</span>
          </div>
          <motion.button type="button" disabled={updating} whileTap={{ scale: 0.95 }} onClick={onUpdate}>
            {updating ? "Updating..." : "Update"}
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function UndoBar({ undoAction, onUndo }) {
  return (
    <AnimatePresence>
      {undoAction && (
        <motion.div
          className="undo-bar"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
        >
          <span>{undoAction.message}</span>

          <button type="button" onClick={onUndo}>
            Undo
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function OfflineExpiredScreen({
  isOnline,
  onRetry,
  onSignOut,
}) {
  return (
    <main className="offline-expired-page">
      <section className="offline-expired-panel">
        <h1>Connect to continue</h1>

        <p>Your 60-day offline period has expired.</p>

        <button
          className="primary-button"
          type="button"
          disabled={!isOnline}
          onClick={onRetry}
        >
          {isOnline ? "Refresh access" : "Waiting for internet"}
        </button>

        <button
          className="offline-sign-out"
          type="button"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}

export function PastelLoader({ label = "Loading Lyst" }) {
  return (
    <main className="pastel-loader-page">
      <motion.div
        className="pastel-loader-wrap"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 480,
          damping: 23,
        }}
      >
        <div className="pastel-loader-ring" aria-hidden="true">
          <motion.span
            className="pastel-loader-orbit"
            animate={{ rotate: 360 }}
            transition={{
              duration: 0.55,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        </div>

        <motion.p
          className="pastel-loader-label"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {label}
        </motion.p>
      </motion.div>
    </main>
  );
}

export function LoadingScreen() {
  return <PastelLoader label="Getting your lists ready" />;
}

export function SetupScreen() {
  return (
    <main className="setup-page">
      <section className="setup-card">
        <h1>Connect Firebase</h1>

        <p>
          Add Firebase values to <code>.env.local</code>.
        </p>
      </section>
    </main>
  );
}

export function Toast({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="toast"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ListSkeleton() {
  return (
    <div className="list-row skeleton-row">
      <span className="skeleton skeleton-list-title" />
    </div>
  );
}

export function ItemSkeleton() {
  return (
    <div className="item-row">
      <span className="skeleton skeleton-circle" />
      <span className="skeleton skeleton-item-text" />
    </div>
  );
}
