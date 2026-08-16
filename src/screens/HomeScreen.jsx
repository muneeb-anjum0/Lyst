import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getEmailInitial } from "../lib/appUtils.js";
import { ListSkeleton } from "../components/SupportingUI.jsx";

export function HomeScreen({
  lists,
  archivedCount,
  loading,
  user,
  reduceMotion,
  onOpenList,
  onCreate,
  onAccount,
  onSearch,
  onArchive,
  onOptimize,
  onRename,
}) {
  const listLongPressTimer = useRef(null);
  const listLongPressTriggered = useRef(false);

  useEffect(() => {
    return () => {
      window.clearTimeout(listLongPressTimer.current);
    };
  }, []);

  function startListLongPress(event, list) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const target = event.currentTarget;

    listLongPressTriggered.current = false;
    window.clearTimeout(listLongPressTimer.current);

    target.classList.add("long-pressing");

    listLongPressTimer.current = window.setTimeout(() => {
      listLongPressTriggered.current = true;
      target.classList.remove("long-pressing");
      onRename(list);

      if ("vibrate" in navigator) {
        navigator.vibrate(12);
      }
    }, 500);
  }

  function cancelListLongPress(event) {
    window.clearTimeout(listLongPressTimer.current);
    event?.currentTarget?.classList?.remove("long-pressing");
  }

  function openListAfterPress(list) {
    if (listLongPressTriggered.current) {
      listLongPressTriggered.current = false;
      return;
    }

    onOpenList(list);
  }

  return (
    <motion.main
      className="screen"
      initial={{
        opacity: 0,
        x: reduceMotion ? 0 : -10,
      }}
      animate={{ opacity: 1, x: 0 }}
      exit={{
        opacity: 0,
        x: reduceMotion ? 0 : -14,
      }}
      transition={{
        type: "spring",
        stiffness: 820,
        damping: 22,
        mass: 0.55,
      }}
    >
      <header className="home-header">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -7 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 540,
            damping: 23,
          }}
        >
          <span className="app-label">Lyst</span>
          <h1>Lists</h1>
        </motion.div>

        <motion.button
          className="avatar-button"
          type="button"
          whileHover={reduceMotion ? {} : { y: -2, rotate: 2 }}
          whileTap={{ scale: 0.9, rotate: -3 }}
          transition={{
            type: "spring",
            stiffness: 750,
            damping: 21,
          }}
          onClick={onAccount}
          aria-label="Open account"
        >
          {getEmailInitial(user)}
        </motion.button>
      </header>

      <motion.div
        className="home-actions"
        initial={reduceMotion ? false : { opacity: 0, y: 7 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.035 }}
      >
        <motion.button
          className="search-action"
          type="button"
          whileHover={reduceMotion ? {} : { y: -2, scale: 1.015 }}
          whileTap={{ scale: 0.96 }}
          transition={{
            type: "spring",
            stiffness: 720,
            damping: 23,
          }}
          onClick={onSearch}
        >
          Search
        </motion.button>

        <motion.button
          className="archive-action"
          type="button"
          whileHover={reduceMotion ? {} : { y: -2, scale: 1.015 }}
          whileTap={{ scale: 0.96 }}
          transition={{
            type: "spring",
            stiffness: 720,
            damping: 23,
          }}
          onClick={onArchive}
        >
          Archived {archivedCount > 0 ? `(${archivedCount})` : ""}
        </motion.button>

        <motion.button
          className="optimize-action"
          type="button"
          disabled={lists.length < 2 || !navigator.onLine}
          whileHover={reduceMotion ? {} : { y: -2, scale: 1.015 }}
          whileTap={{ scale: 0.96 }}
          transition={{
            type: "spring",
            stiffness: 720,
            damping: 23,
          }}
          onClick={onOptimize}
        >
          Organize with AI
        </motion.button>
      </motion.div>

      <motion.div
        className="list-toolbar"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduceMotion ? 0 : 0.075 }}
      >
        <span>
          {lists.length} {lists.length === 1 ? "list" : "lists"}
        </span>

        <motion.button
          className="create-button"
          type="button"
          whileHover={reduceMotion ? {} : { y: -2, scale: 1.025 }}
          whileTap={{ scale: 0.93 }}
          transition={{
            type: "spring",
            stiffness: 780,
            damping: 23,
          }}
          onClick={onCreate}
        >
          New
        </motion.button>
      </motion.div>

      <section className="lists">
        {loading ? (
          <>
            <ListSkeleton />
            <ListSkeleton />
            <ListSkeleton />
          </>
        ) : lists.length > 0 ? (
          <AnimatePresence initial={false}>
            {lists.map((list, index) => (
              <motion.button
                layout
                key={list.id}
                className={`list-row pastel-row-${(index % 5) + 1}`}
                type="button"
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        y: 9,
                        scale: 0.992,
                      }
                }
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                }}
                exit={{
                  opacity: 0,
                  x: reduceMotion ? 0 : 12,
                  scale: 0.985,
                }}
                transition={{
                  delay: reduceMotion ? 0 : Math.min(index * 0.028, 0.14),
                  type: "spring",
                  stiffness: 585,
                  damping: 25,
                }}
                whileHover={
                  reduceMotion
                    ? {}
                    : {
                        x: 3,
                        scale: 1.004,
                      }
                }
                whileTap={{ scale: 0.982 }}
                onPointerDown={(event) =>
                  startListLongPress(event, list)
                }
                onPointerUp={cancelListLongPress}
                onPointerCancel={cancelListLongPress}
                onPointerLeave={cancelListLongPress}
                onContextMenu={(event) => {
                  event.preventDefault();
                  cancelListLongPress();
                  onRename(list);
                }}
                onClick={() => openListAfterPress(list)}
              >
                <span className="list-accent" aria-hidden="true" />

                <span className="list-row-copy">
                  <span className="list-title-text">{list.title}</span>
                  <small className="list-row-meta">
                    {Number(list.itemCount) === 1
                      ? "1 item"
                      : `${Math.max(0, Number(list.itemCount) || 0)} items`}
                  </small>
                </span>

                <motion.span
                  className="row-arrow"
                  aria-hidden="true"
                  whileHover={reduceMotion ? {} : { x: 2 }}
                >
                  ›
                </motion.span>
              </motion.button>
            ))}
          </AnimatePresence>
        ) : (
          <EmptyLists onCreate={onCreate} />
        )}
      </section>

      <motion.button
        className="floating-button"
        type="button"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.7, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        whileHover={reduceMotion ? {} : { y: -3, rotate: 2 }}
        whileTap={{ scale: 0.86, rotate: -3 }}
        transition={{
          type: "spring",
          stiffness: 690,
          damping: 22,
        }}
        onClick={onCreate}
      >
        +
      </motion.button>
    </motion.main>
  );
}

export function EmptyLists({ onCreate }) {
  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2>Start with one list</h2>
      <p>Create a list and keep everything you need in one calm place.</p>

      <motion.button
        className="primary-button small-button"
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={onCreate}
      >
        Create list
      </motion.button>
    </motion.div>
  );
}
