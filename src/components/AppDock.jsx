import { motion } from "framer-motion";
import { CalendarDays, List, Plus, Search, UserRound } from "lucide-react";

export function AppDock({ active, onLists, onToday, onSearch, onCreate, onAccount }) {
  const tabs = [
    { id: "lists", label: "Lists", icon: List, action: onLists },
    { id: "today", label: "Today", icon: CalendarDays, action: onToday },
  ];

  return (
    <nav className="app-dock" aria-label="Primary navigation">
      {tabs.map(({ id, label, icon: Icon, action }) => (
        <button key={id} type="button" className={active === id ? "active" : ""} onClick={action}>
          <Icon size={20} strokeWidth={active === id ? 2.5 : 2} />
          <span>{label}</span>
          {active === id && <motion.i layoutId="dock-active" />}
        </button>
      ))}
      <motion.button className="dock-create" type="button" whileTap={{ scale: 0.88 }} onClick={onCreate} aria-label="Create list"><Plus size={25} /></motion.button>
      <button type="button" onClick={onSearch}><Search size={20} /><span>Search</span></button>
      <button type="button" onClick={onAccount}><UserRound size={20} /><span>You</span></button>
    </nav>
  );
}
