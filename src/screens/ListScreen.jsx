import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { adjustListSummary } from "../services/ai.js";
import { cloneFirestoreData } from "../lib/appUtils.js";
import { db } from "../lib/firebase.js";
import { mergeQuantities, normalizeItemKey } from "../lib/itemMerge.js";
import { parseNaturalInput } from "../lib/naturalInput.js";
import { formatDueDate, formatQuantity, getItemMetadata, getItemMetadataPills } from "../components/itemFormatting.jsx";
import { ItemSkeleton } from "../components/SupportingUI.jsx";
import { AiAssistSheet, DuplicateItemSheet, EditItemSheet, NaturalInputSheet } from "../components/Sheets.jsx";

export function ListScreen({
  list,
  user,
  reduceMotion,
  onBack,
  onRename,
  onArchive,
  onDelete,
  showToast,
  showUndo,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [naturalPreview, setNaturalPreview] = useState(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [itemsListenerVersion, setItemsListenerVersion] = useState(0);
  const lastItemsRefreshRef = useRef(0);

  const inputRef = useRef(null);
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);
  const backSwipeStartX = useRef(null);
  const backSwipeStartY = useRef(null);
  const backSwipeActive = useRef(false);
  const [backSwipeProgress, setBackSwipeProgress] = useState(0);

  useEffect(() => {
    let active = true;
    let receivedSnapshot = false;

    setLoading(true);

    const itemsQuery = query(
      collection(
        db,
        "users",
        user.uid,
        "lists",
        list.id,
        "items",
      ),
      orderBy("createdAt", "asc"),
    );

    function applySnapshot(snapshot) {
      if (!active) return;

      receivedSnapshot = true;

      setItems(
        snapshot.docs.map((itemDocument) => ({
          id: itemDocument.id,
          ...itemDocument.data(),
        })),
      );

      setLoading(false);
    }

    const unsubscribe = onSnapshot(
      itemsQuery,
      {
        includeMetadataChanges: true,
      },
      applySnapshot,
      (error) => {
        if (!active) return;

        console.error("Items listener failed:", error);

        // Do not leave the list permanently stuck. The recovery fetch below
        // can still succeed even if the live listener has a transient problem.
        setLoading(false);

        showToast(
          navigator.onLine
            ? "Refreshing your items..."
            : "No cached items are available yet.",
        );
      },
    );

    const recoveryTimer = window.setTimeout(async () => {
      if (!active || receivedSnapshot) return;

      try {
        const snapshot = await getDocs(itemsQuery);

        if (!active) return;

        applySnapshot(snapshot);
      } catch (error) {
        if (!active) return;

        console.warn("Items recovery fetch failed:", error);
        setLoading(false);
      }
    }, 1800);

    return () => {
      active = false;
      window.clearTimeout(recoveryTimer);
      unsubscribe();
    };
  // showToast is intentionally omitted: notification callback changes should
  // not tear down and recreate the Firestore subscription.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.id, user.uid, itemsListenerVersion]);

  useEffect(() => {
    function refreshItemsListener() {
      const now = Date.now();

      // Mobile Safari/PWAs can fire focus + visibilitychange together.
      // Throttle them so we recreate the listener only once.
      if (now - lastItemsRefreshRef.current < 700) return;

      lastItemsRefreshRef.current = now;
      setItemsListenerVersion((version) => version + 1);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshItemsListener();
      }
    }

    function handleOnline() {
      refreshItemsListener();
    }

    window.addEventListener("focus", refreshItemsListener);
    window.addEventListener("online", handleOnline);
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      window.removeEventListener("focus", refreshItemsListener);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [list.id]);

  useEffect(() => {
    return () => {
      window.clearTimeout(longPressTimer.current);
    };
  }, []);

  const activeItems = useMemo(
    () => items.filter((item) => !item.completed),
    [items],
  );

  const completedItems = useMemo(
    () => items.filter((item) => item.completed),
    [items],
  );

  const remainingItems = activeItems.length;

  const sortedItems = useMemo(
    () => [...activeItems, ...completedItems],
    [activeItems, completedItems],
  );


  const liveParserPreview = useMemo(() => {
    const cleanText = newItem.trim();

    if (!cleanText) return null;

    const parsed = parseNaturalInput(cleanText);

    return parsed.hasNaturalData ? parsed : null;
  }, [newItem]);

  function startLongPress(event, item) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const target = event.currentTarget;
    const row = target.closest(".item-row");

    longPressTriggered.current = false;
    window.clearTimeout(longPressTimer.current);

    row?.classList.add("long-pressing");

    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      row?.classList.remove("long-pressing");
      setEditingItem(item);

      if ("vibrate" in navigator) {
        navigator.vibrate(12);
      }
    }, 500);
  }

  function cancelLongPress(event) {
    window.clearTimeout(longPressTimer.current);

    const target = event?.currentTarget;
    target?.closest(".item-row")?.classList.remove("long-pressing");
  }

  function handleItemTap(item) {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }

    toggleItem(item);
  }

  function handleContextMenu(event, item) {
    event.preventDefault();
    cancelLongPress();
    setEditingItem(item);
  }

  async function createItem(parsedItem) {
    await addDoc(
      collection(
        db,
        "users",
        user.uid,
        "lists",
        list.id,
        "items",
      ),
      {
        text: parsedItem.text.trim(),
        quantity:
          parsedItem.quantity === null ||
          parsedItem.quantity === ""
            ? null
            : Number(parsedItem.quantity),
        quantityUnit: parsedItem.quantityUnit || "",
        dueAt: parsedItem.dueAt || null,
        rawInput: parsedItem.rawInput || parsedItem.text.trim(),
        timesAdded: 1,
        completed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        completedAt: null,
      },
    );

    await adjustListSummary(user.uid, list.id, 1, 0);
  }

  async function mergeDuplicate(existingItem, parsedItem) {
    const mergedQuantity = mergeQuantities(
      existingItem,
      parsedItem,
    );

    await updateDoc(
      doc(
        db,
        "users",
        user.uid,
        "lists",
        list.id,
        "items",
        existingItem.id,
      ),
      {
        quantity: mergedQuantity.quantity,
        quantityUnit: mergedQuantity.quantityUnit,
        dueAt: parsedItem.dueAt || existingItem.dueAt || null,
        rawInput: parsedItem.rawInput || existingItem.rawInput || "",
        timesAdded: (Number(existingItem.timesAdded) || 1) + 1,
        updatedAt: serverTimestamp(),
      },
    );

  }

  async function saveItem(parsedItem, options = {}) {
    const cleanText = parsedItem.text.trim();

    if (!cleanText || adding) return;

    const duplicate = activeItems.find(
      (item) =>
        normalizeItemKey(item.text) === normalizeItemKey(cleanText),
    );

    if (duplicate && !options.keepBoth && !options.mergeWith) {
      setNaturalPreview(null);
      setDuplicatePrompt({
        existingItem: duplicate,
        parsedItem: {
          ...parsedItem,
          text: cleanText,
        },
      });
      return;
    }

    try {
      setAdding(true);

      if (options.mergeWith) {
        await mergeDuplicate(options.mergeWith, parsedItem);
        showToast("Merged with the existing item.");
      } else {
        await createItem(parsedItem);

        if (options.keepBoth) {
          showToast("Added as a separate item.");
        } else if (!navigator.onLine) {
          showToast("Saved offline. It will sync later.");
        }
      }

      setDuplicatePrompt(null);
      setNaturalPreview(null);
      setNewItem("");
      inputRef.current?.focus();
    } catch (error) {
      console.error(error);
      showToast("Could not add the item.");
    } finally {
      setAdding(false);
    }
  }

  function handleAddItem(event) {
    event.preventDefault();

    const cleanText = newItem.trim();

    if (!cleanText || adding) return;

    const parsed = parseNaturalInput(cleanText);

    if (parsed.hasNaturalData) {
      setNaturalPreview(parsed);
      return;
    }

    saveItem(parsed);
  }

  async function toggleItem(item) {
    const nextCompleted = !item.completed;

    try {
      await updateDoc(
        doc(
          db,
          "users",
          user.uid,
          "lists",
          list.id,
          "items",
          item.id,
        ),
        {
          completed: nextCompleted,
          completedAt: nextCompleted ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        },
      );

      await adjustListSummary(
        user.uid,
        list.id,
        0,
        nextCompleted ? 1 : -1,
      );
    } catch (error) {
      console.error(error);
      showToast("Could not update the item.");
    }
  }

  async function editItem(item, changes) {
    const cleanText = changes.text.trim();

    if (!cleanText) return;

    const quantity =
      changes.quantity === "" ||
      changes.quantity === null ||
      changes.quantity === undefined
        ? null
        : Number(changes.quantity);

    if (
      quantity !== null &&
      (!Number.isFinite(quantity) || quantity < 0)
    ) {
      showToast("Quantity must be zero or greater.");
      return;
    }

    try {
      await updateDoc(
        doc(
          db,
          "users",
          user.uid,
          "lists",
          list.id,
          "items",
          item.id,
        ),
        {
          text: cleanText,
          quantity,
          quantityUnit: changes.quantityUnit.trim(),
          dueAt: changes.dueAt || null,
          rawInput: changes.rawInput || item.rawInput || cleanText,
          updatedAt: serverTimestamp(),
        },
      );

      setEditingItem(null);
      showToast("Item updated.");
    } catch (error) {
      console.error(error);
      showToast("Could not edit the item.");
    }
  }

  async function removeItem(item) {
    const itemReference = doc(
      db,
      "users",
      user.uid,
      "lists",
      list.id,
      "items",
      item.id,
    );

    const backup = cloneFirestoreData(item);

    try {
      await deleteDoc(itemReference);
      await adjustListSummary(
        user.uid,
        list.id,
        -1,
        item.completed ? -1 : 0,
      );

      showUndo("Item deleted.", async () => {
        await setDoc(itemReference, backup);
        await adjustListSummary(
          user.uid,
          list.id,
          1,
          item.completed ? 1 : 0,
        );
      });
    } catch (error) {
      console.error(error);
      showToast("Could not delete the item.");
    }
  }

  async function clearCompleted() {
    if (completedItems.length === 0) {
      showToast("There are no completed items.");
      return;
    }

    const backups = completedItems.map((item) => ({
      id: item.id,
      data: cloneFirestoreData(item),
    }));

    try {
      const batch = writeBatch(db);

      completedItems.forEach((item) => {
        batch.delete(
          doc(
            db,
            "users",
            user.uid,
            "lists",
            list.id,
            "items",
            item.id,
          ),
        );
      });

      await batch.commit();
      await adjustListSummary(
        user.uid,
        list.id,
        -completedItems.length,
        -completedItems.length,
      );

      setMenuOpen(false);

      showUndo("Completed items cleared.", async () => {
        const restoreBatch = writeBatch(db);

        backups.forEach((item) => {
          restoreBatch.set(
            doc(
              db,
              "users",
              user.uid,
              "lists",
              list.id,
              "items",
              item.id,
            ),
            item.data,
          );
        });

        await restoreBatch.commit();
        await adjustListSummary(
          user.uid,
          list.id,
          completedItems.length,
          completedItems.length,
        );
      });
    } catch (error) {
      console.error(error);
      showToast("Could not clear completed items.");
    }
  }


  async function addAiSuggestions(aiItems) {
    if (!Array.isArray(aiItems) || aiItems.length === 0) return;

    const existingKeys = new Set(
      items.map((item) => normalizeItemKey(item.text)),
    );

    const uniqueItems = aiItems
      .filter((item) => item?.text)
      .filter((item) => !existingKeys.has(normalizeItemKey(item.text)))
      .slice(0, 30);

    if (uniqueItems.length === 0) {
      showToast("Those items are already in this list.");
      return;
    }

    try {
      const batch = writeBatch(db);
      const itemsCollection = collection(
        db,
        "users",
        user.uid,
        "lists",
        list.id,
        "items",
      );

      uniqueItems.forEach((item) => {
        const itemReference = doc(itemsCollection);
        const cleanText = String(item.text).trim().slice(0, 200);

        batch.set(itemReference, {
          text: cleanText,
          quantity:
            item.quantity === null ||
            item.quantity === undefined ||
            item.quantity === ""
              ? null
              : Number(item.quantity),
          quantityUnit: String(item.quantityUnit || "").slice(0, 20),
          dueAt: null,
          rawInput: cleanText,
          timesAdded: 1,
          completed: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          completedAt: null,
        });
      });

      await batch.commit();
      await adjustListSummary(
        user.uid,
        list.id,
        uniqueItems.length,
        0,
      );
      setAiOpen(false);
      showToast(
        `${uniqueItems.length} ${
          uniqueItems.length === 1 ? "item" : "items"
        } added.`,
      );
    } catch (error) {
      console.error(error);
      showToast("Could not add the AI suggestions.");
    }
  }

  async function applyAiEdits(edits) {
    if (!Array.isArray(edits) || edits.length === 0) {
      showToast("Nothing needed cleaning up.");
      return;
    }

    try {
      const batch = writeBatch(db);

      edits.slice(0, 30).forEach((edit) => {
        if (!edit?.itemId || !edit?.text) return;

        batch.update(
          doc(
            db,
            "users",
            user.uid,
            "lists",
            list.id,
            "items",
            edit.itemId,
          ),
          {
            text: String(edit.text).trim().slice(0, 200),
            updatedAt: serverTimestamp(),
          },
        );
      });

      await batch.commit();
      setAiOpen(false);
      showToast("List cleaned up.");
    } catch (error) {
      console.error(error);
      showToast("Could not apply the AI cleanup.");
    }
  }

  function startBackSwipe(event) {
    if (event.pointerType === "mouse") return;
    if (event.clientX > 28) return;

    backSwipeStartX.current = event.clientX;
    backSwipeStartY.current = event.clientY;
    backSwipeActive.current = true;
    setBackSwipeProgress(0);
  }

  function moveBackSwipe(event) {
    if (!backSwipeActive.current) return;

    const deltaX = event.clientX - backSwipeStartX.current;
    const deltaY = event.clientY - backSwipeStartY.current;

    if (Math.abs(deltaY) > Math.abs(deltaX) * 0.9 && deltaX < 28) {
      cancelBackSwipe();
      return;
    }

    if (deltaX <= 0) {
      setBackSwipeProgress(0);
      return;
    }

    const targetDistance = Math.min(
      170,
      (window.innerWidth || 390) * 0.42,
    );

    setBackSwipeProgress(
      Math.min(deltaX / targetDistance, 1),
    );
  }

  function finishBackSwipe(event) {
    if (!backSwipeActive.current) return;

    const deltaX = event.clientX - backSwipeStartX.current;
    const deltaY = Math.abs(
      event.clientY - backSwipeStartY.current,
    );

    const shouldGoBack =
      deltaX >= 92 &&
      deltaX > deltaY * 1.35;

    backSwipeActive.current = false;
    backSwipeStartX.current = null;
    backSwipeStartY.current = null;

    if (shouldGoBack) {
      setBackSwipeProgress(1);

      if ("vibrate" in navigator) {
        navigator.vibrate(8);
      }

      window.setTimeout(() => {
        setBackSwipeProgress(0);
        onBack();
      }, 90);

      return;
    }

    setBackSwipeProgress(0);
  }

  function cancelBackSwipe() {
    backSwipeActive.current = false;
    backSwipeStartX.current = null;
    backSwipeStartY.current = null;
    setBackSwipeProgress(0);
  }

  return (
    <motion.main
      className="screen list-screen"
      initial={{
        opacity: 0,
        x: reduceMotion ? 0 : 12,
      }}
      animate={{ opacity: 1, x: 0 }}
      exit={{
        opacity: 0,
        x: reduceMotion ? 0 : 16,
      }}
      transition={{
        type: "spring",
        stiffness: 820,
        damping: 22,
        mass: 0.55,
      }}
    >
      <div
        className="mobile-back-swipe-zone"
        aria-hidden="true"
        onPointerDown={startBackSwipe}
        onPointerMove={moveBackSwipe}
        onPointerUp={finishBackSwipe}
        onPointerCancel={cancelBackSwipe}
      />

      <motion.div
        className="mobile-back-swipe-indicator"
        aria-hidden="true"
        animate={{
          opacity: backSwipeProgress > 0 ? 1 : 0,
          x: -12 + backSwipeProgress * 34,
          scale: 0.86 + backSwipeProgress * 0.14,
        }}
        transition={{
          type: "spring",
          stiffness: 780,
          damping: 30,
        }}
      >
        ‹
      </motion.div>

      <header className="list-header">
        <motion.button
          className="text-action danger-outline-action"
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={onBack}
        >
          Back
        </motion.button>

        <div className="menu-container">
          <motion.button
            className="menu-button"
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => setMenuOpen((value) => !value)}
          >
            •••
          </motion.button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="context-menu"
                initial={{ opacity: 0, y: -5, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, scale: 0.97 }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRename();
                  }}
                >
                  Rename
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onArchive();
                  }}
                >
                  {list.archived ? "Restore list" : "Archive list"}
                </button>

                <button type="button" onClick={clearCompleted}>
                  Clear completed
                </button>

                <button
                  className="danger-action"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                >
                  Delete list
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <section className="list-heading">
        <div className="list-heading-row">
          <div>
            <h1>{list.title}</h1>

            <p>
              {remainingItems} {remainingItems === 1 ? "item" : "items"} left
            </p>
          </div>

          <motion.button
            className="ai-assist-button"
            type="button"
            disabled={!navigator.onLine}
            whileHover={reduceMotion ? {} : { y: -1, scale: 1.04 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setAiOpen(true)}
            aria-label="Open Lyst AI"
            title="Lyst AI"
          >
            <svg
              className="ai-gemini-mark"
              viewBox="0 0 32 32"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id="lyst-gemini-gradient"
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
                fill="url(#lyst-gemini-gradient)"
              />
            </svg>
          </motion.button>
        </div>
      </section>

      <section className="items">
        {loading && sortedItems.length === 0 ? (
          <>
            <ItemSkeleton />
            <ItemSkeleton />
            <ItemSkeleton />
          </>
        ) : sortedItems.length > 0 ? (
          <AnimatePresence initial={false}>
            {sortedItems.map((item) => {
              const metadata = getItemMetadata(item);

              return (
                <motion.article
                  layout
                  key={item.id}
                  className={`item-row ${
                    item.completed ? "completed" : ""
                  }`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 18 }}
                  transition={{
                    layout: {
                      type: "spring",
                      stiffness: 630,
                      damping: 28,
                    },
                  }}
                >
                  <motion.button
                    className="check-button"
                    type="button"
                    animate={{
                      backgroundColor: item.completed
                        ? "#CFEADF"
                        : "#FFFFFF",
                      borderColor: item.completed
                        ? "#B6D7C7"
                        : "#D6CDDC",
                    }}
                    whileTap={{ scale: 0.8 }}
                    onClick={() => toggleItem(item)}
                  >
                    <AnimatePresence>
                      {item.completed && (
                        <motion.span
                          initial={{ scale: 0, rotate: -35 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0 }}
                        >
                          ✓
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>

                  <button
                    className="item-text"
                    type="button"
                    onPointerDown={(event) =>
                      startLongPress(event, item)
                    }
                    onPointerUp={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    onContextMenu={(event) =>
                      handleContextMenu(event, item)
                    }
                    onClick={() => handleItemTap(item)}
                    onDoubleClick={() => setEditingItem(item)}
                  >
                    <span className="item-main-text">{item.text}</span>

                    {metadata && (
                      <span className="metadata-pills">
                        {getItemMetadataPills(item).map((pill) => (
                          <small
                            key={pill.key}
                            className={`metadata-pill ${pill.tone}`}
                          >
                            {pill.label}
                          </small>
                        ))}
                      </span>
                    )}
                  </button>

                  <div className="item-actions">
                    <button
                      type="button"
                      onClick={() => setEditingItem(item)}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => removeItem(item)}
                    >
                      ×
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        ) : (
          <motion.div
            className="empty-items"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <h2>Nothing here yet</h2>
            <p>Add something below and Lyst will keep it tidy.</p>
          </motion.div>
        )}
      </section>

      <AnimatePresence>
        {liveParserPreview && (
          <motion.div
            className="live-parser-preview"
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.985 }}
            transition={{
              type: "spring",
              stiffness: 585,
              damping: 25,
            }}
          >
            <span className="live-parser-dot" />

            <span className="live-parser-copy">
              <strong>{liveParserPreview.text}</strong>
              <small>
                {[
                  formatQuantity(
                    liveParserPreview.quantity,
                    liveParserPreview.quantityUnit,
                  ),
                  formatDueDate(liveParserPreview.dueAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <form className="add-item-bar" onSubmit={handleAddItem}>
        <input
          ref={inputRef}
          value={newItem}
          maxLength={200}
          placeholder="Add an item, date or quantity"
          onChange={(event) => setNewItem(event.target.value)}
          onFocus={(event) => {
            window.setTimeout(() => event.currentTarget?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 120);
          }}
        />

        <motion.button
          type="submit"
          disabled={!newItem.trim() || adding}
          whileTap={{ scale: 0.84 }}
        >
          +
        </motion.button>
      </form>

      <AnimatePresence>
        {editingItem && (
          <EditItemSheet
            item={editingItem}
            onClose={() => setEditingItem(null)}
            onSave={(changes) => editItem(editingItem, changes)}
          />
        )}

        {naturalPreview && (
          <NaturalInputSheet
            parsedItem={naturalPreview}
            adding={adding}
            onClose={() => setNaturalPreview(null)}
            onConfirm={saveItem}
            onPlainText={() =>
              saveItem({
                ...naturalPreview,
                text: naturalPreview.rawInput,
                quantity: null,
                quantityUnit: "",
                dueAt: null,
              })
            }
          />
        )}

        {duplicatePrompt && (
          <DuplicateItemSheet
            duplicate={duplicatePrompt}
            adding={adding}
            onClose={() => setDuplicatePrompt(null)}
            onMerge={() =>
              saveItem(duplicatePrompt.parsedItem, {
                mergeWith: duplicatePrompt.existingItem,
              })
            }
            onKeepBoth={() =>
              saveItem(duplicatePrompt.parsedItem, {
                keepBoth: true,
              })
            }
          />
        )}

        {aiOpen && (
          <AiAssistSheet
            list={list}
            items={items}
            onClose={() => setAiOpen(false)}
            onAddItems={addAiSuggestions}
            onApplyEdits={applyAiEdits}
            showToast={showToast}
          />
        )}
      </AnimatePresence>
    </motion.main>
  );
}

