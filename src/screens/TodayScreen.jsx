import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { CalendarCheck, ChevronRight, SunMedium } from "lucide-react";
import { db } from "../lib/firebase.js";
import { adjustListSummary } from "../services/ai.js";
import { formatDueDate, formatQuantity } from "../components/itemFormatting.jsx";
import { AppDock } from "../components/AppDock.jsx";
import { ItemSkeleton } from "../components/SupportingUI.jsx";

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function TodayScreen({ lists, user, reduceMotion, onLists, onOpenList, onSearch, onCreate, onAccount, showToast }) {
  const [itemsByList, setItemsByList] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lists.length) {
      setItemsByList({});
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const loaded = new Set();
    const unsubscribers = lists.map((list) => onSnapshot(
      collection(db, "users", user.uid, "lists", list.id, "items"),
      { includeMetadataChanges: true },
      (snapshot) => {
        loaded.add(list.id);
        setItemsByList((current) => ({ ...current, [list.id]: snapshot.docs.map((item) => ({ id: item.id, list, ...item.data() })) }));
        if (loaded.size === lists.length) setLoading(false);
      },
      () => {
        loaded.add(list.id);
        if (loaded.size === lists.length) setLoading(false);
      },
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [lists, user.uid]);

  const dueItems = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return Object.values(itemsByList).flat()
      .filter((item) => !item.completed && toDate(item.dueAt)?.getTime() <= end.getTime())
      .sort((a, b) => toDate(a.dueAt) - toDate(b.dueAt));
  }, [itemsByList]);

  async function completeItem(item) {
    try {
      await updateDoc(doc(db, "users", user.uid, "lists", item.list.id, "items", item.id), { completed: true, completedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await adjustListSummary(user.uid, item.list.id, 0, 1);
      navigator.vibrate?.(8);
    } catch (error) {
      console.error(error);
      showToast("Could not complete that item.");
    }
  }

  const now = new Date();
  return (
    <motion.main className="screen today-screen" initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <header className="today-header"><span className="brand-wordmark">LYST<span>.</span></span><button type="button" onClick={onAccount} aria-label="Account"><SunMedium size={22} /></button></header>
      <section className="today-intro"><span className="eyebrow">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}</span><h1>Make today<br /><em>feel lighter.</em></h1><p>{dueItems.length ? `${dueItems.length} ${dueItems.length === 1 ? "thing needs" : "things need"} your attention.` : "Nothing urgent. That is a beautiful thing."}</p></section>
      <section className="today-stack">
        <div className="section-title-row"><div><span className="eyebrow">FOCUS QUEUE</span><h2>Due now</h2></div><CalendarCheck size={21} /></div>
        {loading ? <><ItemSkeleton /><ItemSkeleton /><ItemSkeleton /></> : dueItems.length ? dueItems.map((item, index) => (
          <motion.article key={`${item.list.id}-${item.id}`} className="today-item" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduceMotion ? 0 : index * 0.04 }}>
            <button className="today-check" type="button" onClick={() => completeItem(item)} aria-label={`Complete ${item.text}`}><span /></button>
            <button className="today-item-copy" type="button" onClick={() => onOpenList(item.list)}><strong>{item.text}</strong><small>{item.list.title} · {[formatQuantity(item.quantity, item.quantityUnit), formatDueDate(item.dueAt)].filter(Boolean).join(" · ")}</small></button>
            <ChevronRight size={17} />
          </motion.article>
        )) : <div className="today-clear"><span>✓</span><h2>All clear.</h2><p>Anything with a due date will land here automatically.</p></div>}
      </section>
      <AppDock active="today" onLists={onLists} onToday={() => {}} onSearch={onSearch} onCreate={onCreate} onAccount={onAccount} />
    </motion.main>
  );
}
