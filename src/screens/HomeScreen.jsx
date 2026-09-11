import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, ArrowUpRight, ListTodo, Plus, Sparkles } from "lucide-react";
import { getEmailInitial } from "../lib/appUtils.js";
import { ListSkeleton } from "../components/SupportingUI.jsx";
import { AppDock } from "../components/AppDock.jsx";

export function HomeScreen({ lists, archivedCount, loading, user, reduceMotion, onOpenList, onCreate, onAccount, onSearch, onArchive, onOptimize, onToday, onRename }) {
  const [filter, setFilter] = useState("all");
  const listLongPressTimer = useRef(null);
  const listLongPressTriggered = useRef(false);
  useEffect(() => () => window.clearTimeout(listLongPressTimer.current), []);

  const visibleLists = useMemo(() => lists.filter((list) => {
    const count = Math.max(0, Number(list.itemCount) || 0);
    const done = Math.max(0, Number(list.completedCount) || 0);
    return filter === "active" ? count > done : filter === "done" ? count > 0 && done >= count : true;
  }), [filter, lists]);
  const totals = useMemo(() => lists.reduce((sum, list) => ({
    items: sum.items + Math.max(0, Number(list.itemCount) || 0),
    done: sum.done + Math.max(0, Number(list.completedCount) || 0),
  }), { items: 0, done: 0 }), [lists]);
  const progress = totals.items ? Math.round((totals.done / totals.items) * 100) : 0;
  const firstName = user?.displayName?.split(" ")?.[0] || "there";

  function startLongPress(event, list) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    listLongPressTriggered.current = false;
    window.clearTimeout(listLongPressTimer.current);
    listLongPressTimer.current = window.setTimeout(() => {
      listLongPressTriggered.current = true;
      onRename(list);
      navigator.vibrate?.(12);
    }, 520);
  }

  function openList(list) {
    if (listLongPressTriggered.current) { listLongPressTriggered.current = false; return; }
    onOpenList(list);
  }

  return (
    <motion.main className="screen home-screen-v2" initial={{ opacity: 0, filter: reduceMotion ? "none" : "blur(10px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.985 }}>
      <header className="command-header">
        <div><span className="brand-wordmark">LYST<span>.</span></span><p>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {firstName}</p></div>
        <motion.button className="profile-orb" type="button" whileTap={{ scale: 0.9 }} onClick={onAccount} aria-label="Account">
          {user?.photoURL ? <img src={user.photoURL} alt="" /> : getEmailInitial(user)}<span aria-hidden="true" />
        </motion.button>
      </header>

      <motion.section className="focus-card" initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 320, damping: 27 }}>
        <div className="focus-glow" aria-hidden="true" />
        <div className="focus-copy"><span className="eyebrow">YOUR HEADSPACE</span><h1>{totals.items - totals.done}<br /><em>things left.</em></h1><p>{lists.length ? `${progress}% of everything is handled.` : "Start small. Get it out of your head."}</p></div>
        <button type="button" onClick={onToday} className="focus-progress" aria-label="Open Today">
          <svg viewBox="0 0 92 92" aria-hidden="true"><circle cx="46" cy="46" r="38" /><circle cx="46" cy="46" r="38" style={{ "--progress": progress }} /></svg><strong>{progress}%</strong>
        </button>
      </motion.section>

      <section className="quick-lane" aria-label="Quick actions">
        <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onCreate}><span><Plus size={18} /></span><strong>Create</strong><small>New list</small></motion.button>
        <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onToday}><span><ListTodo size={18} /></span><strong>Focus</strong><small>Today</small></motion.button>
        <motion.button type="button" disabled={lists.length < 2 || !navigator.onLine} whileTap={{ scale: 0.98 }} onClick={onOptimize}><span><Sparkles size={18} /></span><strong>Reframe</strong><small>With AI</small></motion.button>
      </section>

      <section className="collection-section">
        <div className="section-title-row"><div><span className="eyebrow">COLLECTION</span><h2>Your lists</h2></div><button type="button" onClick={onArchive}><Archive size={15} /> {archivedCount || "Archive"}</button></div>
        <div className="filter-rail" role="tablist" aria-label="Filter lists">
          {[["all", "All"], ["active", "In motion"], ["done", "Complete"]].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        <div className="list-card-grid">
          {loading ? <><ListSkeleton /><ListSkeleton /><ListSkeleton /><ListSkeleton /></> : visibleLists.length ? (
            <AnimatePresence mode="popLayout">
              {visibleLists.map((list, index) => {
                const count = Math.max(0, Number(list.itemCount) || 0);
                const done = Math.max(0, Number(list.completedCount) || 0);
                const percentage = count ? Math.min(100, Math.round((done / count) * 100)) : 0;
                return <motion.button layout key={list.id} className="lyst-card" type="button" initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.2), type: "spring", stiffness: 420, damping: 30 }} whileHover={reduceMotion ? {} : { x: 4 }} whileTap={{ scale: 0.99 }} onPointerDown={(event) => startLongPress(event, list)} onPointerUp={() => window.clearTimeout(listLongPressTimer.current)} onPointerCancel={() => window.clearTimeout(listLongPressTimer.current)} onPointerLeave={() => window.clearTimeout(listLongPressTimer.current)} onContextMenu={(event) => { event.preventDefault(); onRename(list); }} onClick={() => openList(list)}>
                  <span className="card-number">{String(index + 1).padStart(2, "0")}</span><ArrowUpRight className="card-arrow" size={20} /><span className="card-copy"><strong>{list.title}</strong><small>{count - done} open · {count} total</small></span><span className="card-progress"><i style={{ width: `${percentage}%` }} /></span>
                </motion.button>;
              })}
            </AnimatePresence>
          ) : <EmptyLists filtered={lists.length > 0} onCreate={onCreate} />}
        </div>
      </section>
      <AppDock active="lists" onLists={() => {}} onToday={onToday} onSearch={onSearch} onCreate={onCreate} onAccount={onAccount} />
    </motion.main>
  );
}

export function EmptyLists({ filtered = false, onCreate }) {
  return <motion.div className="empty-state-v2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><div aria-hidden="true"><span /><span /><span /></div><span className="eyebrow">CLEAR SPACE</span><h2>{filtered ? "Nothing in this view" : "Your mind can let go now."}</h2><p>{filtered ? "Try another filter." : "Make the first list. Lyst will hold the details."}</p>{!filtered && <button type="button" onClick={onCreate}><Plus size={17} /> Create your first list</button>}</motion.div>;
}
