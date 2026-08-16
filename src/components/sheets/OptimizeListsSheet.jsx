import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { db } from "../../lib/firebase.js";
import {
  callLystAi,
  getAiErrorMessage,
  isAiLimitError,
} from "../../services/ai.js";
import { AiLimitPopup, Sheet } from "./Sheet.jsx";

const MAX_LISTS = 12;
const MAX_ITEMS = 120;

export function OptimizeListsSheet({
  lists,
  user,
  onClose,
  showToast,
}) {
  const [working, setWorking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState(null);
  const [limitPopupOpen, setLimitPopupOpen] = useState(false);

  async function createPlan() {
    if (working || !navigator.onLine) return;

    try {
      setWorking(true);
      setPlan(null);

      let remainingItems = MAX_ITEMS;
      const loadedLists = [];

      for (const list of lists.slice(0, MAX_LISTS)) {
        if (remainingItems <= 0) break;

        const snapshot = await getDocs(
          collection(db, "users", user.uid, "lists", list.id, "items"),
        );
        const items = snapshot.docs
          .map((itemDocument) => ({
            id: itemDocument.id,
            data: itemDocument.data(),
          }))
          .filter((item) => !item.data.completed)
          .slice(0, remainingItems);

        if (items.length === 0) continue;

        remainingItems -= items.length;
        loadedLists.push({ list, items });
      }

      if (loadedLists.length < 2) {
        showToast("Add active items to at least two lists first.");
        return;
      }

      const sourceItems = loadedLists.flatMap(({ list, items }) =>
        items.map((item) => ({ ...item, sourceList: list })),
      );

      const response = await callLystAi({
        action: "optimize_lists",
        lists: loadedLists.map(({ list, items }) => ({
          id: list.id,
          title: list.title,
          items: items.map((item) => ({
            id: item.id,
            text: item.data.text,
            quantity: item.data.quantity ?? null,
            quantityUnit: item.data.quantityUnit || "",
            completed: false,
          })),
        })),
      });

      const proposedLists = (response.lists || []).map((proposedList) => ({
        ...proposedList,
        items: (proposedList.items || [])
          .map((item) => ({
            ...item,
            source: sourceItems[item.index],
          }))
          .filter((item) => item.source),
      }));

      setPlan({
        ...response,
        lists: proposedLists,
        sourceLists: loadedLists,
      });
    } catch (error) {
      console.error(error);
      if (isAiLimitError(error)) setLimitPopupOpen(true);
      else showToast(getAiErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function applyPlan() {
    if (
      applying ||
      !plan?.lists?.length ||
      plan.coveredItems !== plan.totalItems
    ) {
      return;
    }

    try {
      setApplying(true);
      const batch = writeBatch(db);
      const listsCollection = collection(db, "users", user.uid, "lists");

      plan.lists.forEach((optimizedList) => {
        const listReference = doc(listsCollection);

        batch.set(listReference, {
          title: optimizedList.title,
          archived: false,
          itemCount: optimizedList.items.length,
          completedCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        optimizedList.items.forEach((item) => {
          const itemReference = doc(
            collection(listReference, "items"),
          );

          batch.set(itemReference, {
            ...item.source.data,
            text: item.text,
            rawInput: item.text,
            completed: false,
            completedAt: null,
            updatedAt: serverTimestamp(),
          });
        });
      });

      plan.sourceLists.forEach(({ list }) => {
        batch.update(doc(listsCollection, list.id), {
          archived: true,
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
      onClose();
      showToast(
        `Created ${plan.lists.length} optimized ${
          plan.lists.length === 1 ? "list" : "lists"
        }. Originals were archived.`,
      );
    } catch (error) {
      console.error(error);
      showToast("Could not apply the optimized lists.");
    } finally {
      setApplying(false);
    }
  }

  const completePlan =
    plan && plan.coveredItems === plan.totalItems && plan.totalItems > 0;

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content optimize-lists-sheet">
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>Organize lists with AI</h2>
          <button className="danger-outline-action" type="button" onClick={onClose}>
            Cancel
          </button>
        </header>

        {!plan && !working && (
          <div className="ai-organize-intro">
            <strong>Turn scattered lists into clearer groups</strong>
            <p>
              AI will regroup active items, improve list titles, and refine item
              names. Your current lists will be archived, not deleted.
            </p>
            <small>Uses one AI request. Up to 12 lists and 120 active items.</small>
            <motion.button
              className="primary-button"
              type="button"
              whileTap={{ scale: 0.975 }}
              onClick={createPlan}
            >
              Create organization preview
            </motion.button>
          </div>
        )}

        {working && (
          <div className="ai-working">
            <div className="mini-pastel-spinner" />
            <span>Finding better groups...</span>
          </div>
        )}

        {plan && (
          <div className="ai-result">
            <div className="ai-result-heading">
              <strong>{plan.sourceLists.length} lists → {plan.lists.length} lists</strong>
              <small>{plan.coveredItems}/{plan.totalItems} items placed</small>
            </div>

            {plan.summary && <p className="ai-plan-summary">{plan.summary}</p>}

            <div className="ai-list-plan">
              {plan.lists.map((optimizedList, listIndex) => (
                <section key={`${optimizedList.title}-${listIndex}`}>
                  <strong>{optimizedList.title}</strong>
                  <small>{optimizedList.items.length} items</small>
                  <div>
                    {optimizedList.items.map((item) => (
                      <span key={`${item.index}-${item.text}`}>{item.text}</span>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {!completePlan && (
              <p className="ai-plan-warning">
                This preview missed an item, so it cannot be applied safely. Try again.
              </p>
            )}

            <motion.button
              className="primary-button"
              type="button"
              disabled={!completePlan || applying}
              whileTap={{ scale: 0.975 }}
              onClick={applyPlan}
            >
              {applying ? "Applying..." : "Create optimized lists"}
            </motion.button>

            <button className="secondary-button" type="button" onClick={createPlan}>
              Generate another preview
            </button>
          </div>
        )}

        <AnimatePresence>
          {limitPopupOpen && (
            <AiLimitPopup onClose={() => setLimitPopupOpen(false)} />
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
