import { motion } from "framer-motion";
import { getEmailInitial } from "../../lib/appUtils.js";
import { Sheet } from "./Sheet.jsx";

export function ArchiveSheet({
  lists,
  onClose,
  onRestore,
  onOpenList,
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content">
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>Archived</h2>

          <button type="button" onClick={onClose}>
            Done
          </button>
        </header>

        <div className="archive-list">
          {lists.length === 0 ? (
            <p className="search-message">No archived lists.</p>
          ) : (
            lists.map((list) => (
              <div className="archive-row" key={list.id}>
                <button
                  type="button"
                  onClick={() => onOpenList(list)}
                >
                  {list.title}
                </button>

                <button
                  type="button"
                  onClick={() => onRestore(list)}
                >
                  Restore
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Sheet>
  );
}

export function ConfirmationSheet({
  confirmation,
  onClose,
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content confirmation-content">
        <div className="sheet-handle" />

        <h2>{confirmation.title}</h2>
        <p>{confirmation.message}</p>

        <div className="confirmation-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>

          <button
            className={confirmation.danger ? "danger-confirm" : ""}
            type="button"
            onClick={confirmation.action}
          >
            {confirmation.confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function AccountSheet({
  user,
  isOnline,
  onClose,
  onSignOut,
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content account-sheet">
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>Account</h2>

          <button type="button" onClick={onClose}>
            Done
          </button>
        </header>

        <div className="account-row">
          <div className="account-avatar">
            {getEmailInitial(user)}
          </div>

          <div className="account-copy">
            <strong>{user.email}</strong>

            <span
              className={`account-status ${
                isOnline ? "online" : "offline"
              }`}
            >
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>

        <div className="offline-access-note">
          <strong>Offline access</strong>
          <span>Available for up to 60 days after an online refresh.</span>
        </div>

        <motion.button
          className="primary-button account-signout-button"
          type="button"
          whileTap={{ scale: 0.975 }}
          onClick={onSignOut}
        >
          Sign out
        </motion.button>
      </div>
    </Sheet>
  );
}

