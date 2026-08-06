import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CirclePlus,
  ListTodo,
  LogOut,
  MoreHorizontal,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

/* -------------------------------------------------------------------------- */
/* Firebase                                                                   */
/* -------------------------------------------------------------------------- */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseReady = Object.values(firebaseConfig).every(Boolean);

let auth = null;
let db = null;

if (firebaseReady) {
  const firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const listColors = [
  "#007AFF",
  "#5856D6",
  "#AF52DE",
  "#FF2D55",
  "#FF9500",
  "#34C759",
  "#00A7B5",
];

function getInitials(user) {
  const source = user?.displayName || user?.email || "L";
  return source
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function formatCount(count) {
  if (count === 0) return "No remaining items";
  if (count === 1) return "1 remaining item";
  return `${count} remaining items`;
}

/* -------------------------------------------------------------------------- */
/* App                                                                        */
/* -------------------------------------------------------------------------- */

export default function App() {
  const reduceMotion = useReducedMotion();

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(firebaseReady);

  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [selectedList, setSelectedList] = useState(null);

  const [showNewList, setShowNewList] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!firebaseReady) {
      setAuthLoading(false);
      return undefined;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);

      if (!nextUser) {
        setLists([]);
        setSelectedList(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!user || !db) return undefined;

    setListsLoading(true);

    const listsQuery = query(
      collection(db, "users", user.uid, "lists"),
      orderBy("createdAt", "desc"),
    );

    return onSnapshot(
      listsQuery,
      (snapshot) => {
        const nextLists = snapshot.docs.map((listDocument) => ({
          id: listDocument.id,
          ...listDocument.data(),
        }));

        setLists(nextLists);
        setListsLoading(false);

        setSelectedList((current) => {
          if (!current) return null;

          const refreshed = nextLists.find((list) => list.id === current.id);
          return refreshed || null;
        });
      },
      (error) => {
        console.error(error);
        setListsLoading(false);
        showToast("Could not load your lists");
      },
    );
  }, [user]);

  function showToast(message) {
    setToast(message);
    window.clearTimeout(showToast.timeout);

    showToast.timeout = window.setTimeout(() => {
      setToast("");
    }, 2600);
  }

  async function createList(title, color) {
    const cleanedTitle = title.trim();

    if (!cleanedTitle || !user || !db) return;

    try {
      const reference = await addDoc(
        collection(db, "users", user.uid, "lists"),
        {
          title: cleanedTitle,
          color,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      );

      setShowNewList(false);

      setSelectedList({
        id: reference.id,
        title: cleanedTitle,
        color,
      });
    } catch (error) {
      console.error(error);
      showToast("Could not create the list");
    }
  }

  async function removeList(list) {
    if (!user || !db) return;

    const confirmed = window.confirm(
      `Delete "${list.title}" and all of its items?`,
    );

    if (!confirmed) return;

    try {
      const itemsReference = collection(
        db,
        "users",
        user.uid,
        "lists",
        list.id,
        "items",
      );

      const unsubscribe = onSnapshot(itemsReference, async (snapshot) => {
        unsubscribe();

        const batch = writeBatch(db);

        snapshot.docs.forEach((itemDocument) => {
          batch.delete(itemDocument.ref);
        });

        batch.delete(doc(db, "users", user.uid, "lists", list.id));
        await batch.commit();

        setSelectedList(null);
        showToast("List deleted");
      });
    } catch (error) {
      console.error(error);
      showToast("Could not delete the list");
    }
  }

  if (authLoading) {
    return (
      <>
        <GlobalStyles />
        <LoadingScreen reduceMotion={reduceMotion} />
      </>
    );
  }

  if (!firebaseReady) {
    return (
      <>
        <GlobalStyles />
        <SetupScreen />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <GlobalStyles />
        <AuthScreen showToast={showToast} />
        <Toast message={toast} />
      </>
    );
  }

  return (
    <>
      <GlobalStyles />

      <div className="app-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        <LayoutGroup>
          <AnimatePresence mode="wait">
            {selectedList ? (
              <ListScreen
                key="list-screen"
                user={user}
                list={selectedList}
                reduceMotion={reduceMotion}
                onBack={() => setSelectedList(null)}
                onDelete={() => removeList(selectedList)}
                showToast={showToast}
              />
            ) : (
              <HomeScreen
                key="home-screen"
                user={user}
                lists={lists}
                loading={listsLoading}
                reduceMotion={reduceMotion}
                onOpenList={setSelectedList}
                onNewList={() => setShowNewList(true)}
                onAccount={() => setShowAccount(true)}
              />
            )}
          </AnimatePresence>
        </LayoutGroup>

        <AnimatePresence>
          {showNewList && (
            <NewListSheet
              onClose={() => setShowNewList(false)}
              onCreate={createList}
            />
          )}

          {showAccount && (
            <AccountSheet
              user={user}
              onClose={() => setShowAccount(false)}
              onSignOut={async () => {
                await signOut(auth);
                setShowAccount(false);
              }}
            />
          )}
        </AnimatePresence>

        <Toast message={toast} />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

function AuthScreen({ showToast }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);

  async function handleGoogle() {
    try {
      setWorking(true);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);

      if (error.code !== "auth/popup-closed-by-user") {
        showToast("Google sign-in failed");
      }
    } finally {
      setWorking(false);
    }
  }

  async function handleEmail(event) {
    event.preventDefault();

    if (!email.trim() || password.length < 6) {
      showToast("Enter a valid email and a 6-character password");
      return;
    }

    try {
      setWorking(true);

      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error) {
      console.error(error);

      const messages = {
        "auth/email-already-in-use": "An account already uses that email",
        "auth/invalid-credential": "Email or password is incorrect",
        "auth/invalid-email": "Enter a valid email address",
        "auth/too-many-requests": "Too many attempts. Try again later",
      };

      showToast(messages[error.code] || "Authentication failed");
    } finally {
      setWorking(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      showToast("Enter your email first");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());
      showToast("Password reset email sent");
    } catch (error) {
      console.error(error);
      showToast("Could not send reset email");
    }
  }

  return (
    <main className="auth-page">
      <motion.section
        className="auth-card"
        initial={{ opacity: 0, y: 20, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
      >
        <div className="brand-mark">
          <Check size={28} strokeWidth={3} />
        </div>

        <div className="auth-heading">
          <span className="eyebrow">Welcome to</span>
          <h1>Lyst</h1>
          <p>Everything you need to remember, beautifully organized.</p>
        </div>

        <button
          className="google-button"
          type="button"
          disabled={working}
          onClick={handleGoogle}
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="divider">
          <span>or</span>
        </div>

        <form className="auth-form" onSubmit={handleEmail}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              minLength={6}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              placeholder="At least 6 characters"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {mode === "signin" && (
            <button
              className="forgot-button"
              type="button"
              onClick={resetPassword}
            >
              Forgot password?
            </button>
          )}

          <motion.button
            className="primary-button"
            type="submit"
            disabled={working}
            whileTap={{ scale: 0.98 }}
          >
            {working
              ? "Please wait..."
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </motion.button>
        </form>

        <button
          className="mode-button"
          type="button"
          onClick={() =>
            setMode((current) => (current === "signin" ? "signup" : "signin"))
          }
        >
          {mode === "signin"
            ? "New to Lyst? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </motion.section>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Home                                                                       */
/* -------------------------------------------------------------------------- */

function HomeScreen({
  user,
  lists,
  loading,
  reduceMotion,
  onOpenList,
  onNewList,
  onAccount,
}) {
  return (
    <motion.main
      className="screen home-screen"
      initial={{ opacity: 0, x: reduceMotion ? 0 : -18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: reduceMotion ? 0 : -18 }}
      transition={{ duration: reduceMotion ? 0 : 0.28 }}
    >
      <header className="top-bar">
        <div>
          <span className="eyebrow">Your space</span>
          <h1>My Lists</h1>
        </div>

        <button
          className="avatar-button"
          type="button"
          aria-label="Open account"
          onClick={onAccount}
        >
          {user.photoURL ? (
            <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
          ) : (
            getInitials(user)
          )}
        </button>
      </header>

      <section className="hero-card">
        <div className="hero-icon">
          <Sparkles size={23} />
        </div>

        <div>
          <span>Stay effortlessly organized</span>
          <p>Add what matters. Lyst keeps the rest out of your way.</p>
        </div>
      </section>

      <div className="section-heading">
        <div>
          <h2>Lists</h2>
          <span>{lists.length}</span>
        </div>

        <motion.button
          className="add-list-button"
          type="button"
          onClick={onNewList}
          whileTap={{ scale: 0.94 }}
        >
          <Plus size={19} strokeWidth={2.4} />
          New list
        </motion.button>
      </div>

      <section className="lists-grid">
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
                className="list-card"
                type="button"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{
                  delay: Math.min(index * 0.035, 0.18),
                  type: "spring",
                  stiffness: 260,
                  damping: 25,
                }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => onOpenList(list)}
              >
                <span
                  className="list-icon"
                  style={{
                    "--list-color": list.color || listColors[0],
                  }}
                >
                  <ListTodo size={21} />
                </span>

                <span className="list-card-copy">
                  <strong>{list.title}</strong>
                  <small>Open list</small>
                </span>

                <ChevronRight className="list-chevron" size={20} />
              </motion.button>
            ))}
          </AnimatePresence>
        ) : (
          <EmptyLists onCreate={onNewList} />
        )}
      </section>

      <button className="mobile-fab" type="button" onClick={onNewList}>
        <Plus size={25} />
      </button>
    </motion.main>
  );
}

function EmptyLists({ onCreate }) {
  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="empty-illustration">
        <div className="empty-card empty-card-back" />
        <div className="empty-card empty-card-front">
          <ShoppingBag size={32} />
        </div>
      </div>

      <h3>Your first list starts here</h3>
      <p>Create a shopping list, a personal checklist, or anything else.</p>

      <button className="primary-button compact" type="button" onClick={onCreate}>
        <CirclePlus size={19} />
        Create a list
      </button>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Individual list                                                            */
/* -------------------------------------------------------------------------- */

function ListScreen({
  user,
  list,
  reduceMotion,
  onBack,
  onDelete,
  showToast,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const inputRef = useRef(null);

  useEffect(() => {
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

    return onSnapshot(
      itemsQuery,
      (snapshot) => {
        setItems(
          snapshot.docs.map((itemDocument) => ({
            id: itemDocument.id,
            ...itemDocument.data(),
          })),
        );

        setLoading(false);
      },
      (error) => {
        console.error(error);
        setLoading(false);
        showToast("Could not load the items");
      },
    );
  }, [list.id, showToast, user.uid]);

  const remaining = useMemo(
    () => items.filter((item) => !item.completed).length,
    [items],
  );

  const orderedItems = useMemo(
    () => [
      ...items.filter((item) => !item.completed),
      ...items.filter((item) => item.completed),
    ],
    [items],
  );

  async function addItem(event) {
    event.preventDefault();

    const text = newItem.trim();

    if (!text || adding) return;

    try {
      setAdding(true);
      setNewItem("");

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
          text,
          completed: false,
          createdAt: serverTimestamp(),
          completedAt: null,
        },
      );

      await updateDoc(doc(db, "users", user.uid, "lists", list.id), {
        updatedAt: serverTimestamp(),
      });

      inputRef.current?.focus();
    } catch (error) {
      console.error(error);
      setNewItem(text);
      showToast("Could not add the item");
    } finally {
      setAdding(false);
    }
  }

  async function toggleItem(item) {
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
          completed: !item.completed,
          completedAt: !item.completed ? serverTimestamp() : null,
        },
      );
    } catch (error) {
      console.error(error);
      showToast("Could not update the item");
    }
  }

  async function removeItem(item) {
    try {
      await deleteDoc(
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
    } catch (error) {
      console.error(error);
      showToast("Could not delete the item");
    }
  }

  async function clearCompleted() {
    const completedItems = items.filter((item) => item.completed);

    if (completedItems.length === 0) {
      showToast("There are no completed items");
      return;
    }

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
      setShowMenu(false);
      showToast("Completed items cleared");
    } catch (error) {
      console.error(error);
      showToast("Could not clear completed items");
    }
  }

  return (
    <motion.main
      className="screen list-screen"
      initial={{ opacity: 0, x: reduceMotion ? 0 : 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: reduceMotion ? 0 : 24 }}
      transition={{ duration: reduceMotion ? 0 : 0.28 }}
    >
      <header className="list-top-bar">
        <motion.button
          className="icon-button"
          type="button"
          aria-label="Go back"
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
        >
          <ArrowLeft size={22} />
        </motion.button>

        <div className="menu-wrap">
          <motion.button
            className="icon-button"
            type="button"
            aria-label="List menu"
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowMenu((current) => !current)}
          >
            <MoreHorizontal size={23} />
          </motion.button>

          <AnimatePresence>
            {showMenu && (
              <motion.div
                className="context-menu"
                initial={{ opacity: 0, y: -7, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -7, scale: 0.96 }}
              >
                <button type="button" onClick={clearCompleted}>
                  <Check size={17} />
                  Clear completed
                </button>

                <button className="danger-row" type="button" onClick={onDelete}>
                  <Trash2 size={17} />
                  Delete list
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <section className="list-heading">
        <span
          className="large-list-icon"
          style={{ "--list-color": list.color || listColors[0] }}
        >
          <ListTodo size={27} />
        </span>

        <div>
          <h1>{list.title}</h1>
          <p>{formatCount(remaining)}</p>
        </div>
      </section>

      <section className="items-panel">
        {loading ? (
          <div className="item-skeletons">
            <ItemSkeleton />
            <ItemSkeleton />
            <ItemSkeleton />
          </div>
        ) : orderedItems.length > 0 ? (
          <AnimatePresence initial={false}>
            {orderedItems.map((item) => (
              <motion.article
                layout
                key={item.id}
                className={`item-row ${item.completed ? "completed" : ""}`}
                initial={{ opacity: 0, y: 10, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 30, scale: 0.96 }}
                transition={{
                  layout: {
                    type: "spring",
                    stiffness: 350,
                    damping: 30,
                  },
                }}
              >
                <motion.button
                  className="check-button"
                  type="button"
                  aria-label={
                    item.completed ? "Mark as incomplete" : "Mark as complete"
                  }
                  animate={{
                    backgroundColor: item.completed
                      ? list.color || listColors[0]
                      : "rgba(255,255,255,0)",
                    borderColor: item.completed
                      ? list.color || listColors[0]
                      : "#d5d5dc",
                  }}
                  whileTap={{ scale: 0.82 }}
                  onClick={() => toggleItem(item)}
                >
                  <AnimatePresence>
                    {item.completed && (
                      <motion.span
                        initial={{ scale: 0, rotate: -40 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 24,
                        }}
                      >
                        <Check size={15} strokeWidth={3.4} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>

                <button
                  className="item-text"
                  type="button"
                  onClick={() => toggleItem(item)}
                >
                  <span>{item.text}</span>
                </button>

                <motion.button
                  className="delete-item-button"
                  type="button"
                  aria-label={`Delete ${item.text}`}
                  whileTap={{ scale: 0.86 }}
                  onClick={() => removeItem(item)}
                >
                  <X size={18} />
                </motion.button>
              </motion.article>
            ))}
          </AnimatePresence>
        ) : (
          <div className="list-empty">
            <div className="list-empty-icon">
              <Check size={31} />
            </div>

            <h3>Nothing here yet</h3>
            <p>Add your first item below.</p>
          </div>
        )}
      </section>

      <form className="add-item-bar" onSubmit={addItem}>
        <input
          ref={inputRef}
          value={newItem}
          maxLength={160}
          placeholder="Add an item"
          aria-label="New item"
          onChange={(event) => setNewItem(event.target.value)}
        />

        <motion.button
          type="submit"
          disabled={!newItem.trim() || adding}
          whileTap={{ scale: 0.88 }}
          style={{
            "--list-color": list.color || listColors[0],
          }}
        >
          <Plus size={22} strokeWidth={2.6} />
        </motion.button>
      </form>
    </motion.main>
  );
}

/* -------------------------------------------------------------------------- */
/* Sheets                                                                     */
/* -------------------------------------------------------------------------- */

function NewListSheet({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(listColors[0]);

  return (
    <Sheet onClose={onClose}>
      <form
        className="sheet-content"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(title, color);
        }}
      >
        <div className="sheet-handle" />

        <div className="sheet-heading">
          <div>
            <span className="eyebrow">Create</span>
            <h2>New List</h2>
          </div>

          <button
            className="sheet-close"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        <label className="sheet-field">
          <span>List name</span>
          <input
            autoFocus
            value={title}
            maxLength={40}
            placeholder="Groceries"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <div className="color-section">
          <span>Color</span>

          <div className="color-grid">
            {listColors.map((option) => (
              <motion.button
                key={option}
                className={`color-option ${
                  color === option ? "selected" : ""
                }`}
                type="button"
                aria-label={`Select ${option}`}
                style={{ "--option-color": option }}
                whileTap={{ scale: 0.88 }}
                onClick={() => setColor(option)}
              >
                {color === option && <Check size={18} strokeWidth={3} />}
              </motion.button>
            ))}
          </div>
        </div>

        <button
          className="primary-button"
          type="submit"
          disabled={!title.trim()}
        >
          Create list
        </button>
      </form>
    </Sheet>
  );
}

function AccountSheet({ user, onClose, onSignOut }) {
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content">
        <div className="sheet-handle" />

        <div className="sheet-heading">
          <div>
            <span className="eyebrow">Account</span>
            <h2>Your Profile</h2>
          </div>

          <button
            className="sheet-close"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        <div className="profile-card">
          <div className="profile-avatar">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : (
              <UserRound size={28} />
            )}
          </div>

          <div>
            <strong>{user.displayName || "Lyst User"}</strong>
            <span>{user.email}</span>
          </div>
        </div>

        <button className="sign-out-button" type="button" onClick={onSignOut}>
          <LogOut size={19} />
          Sign out
        </button>
      </div>
    </Sheet>
  );
}

function Sheet({ children, onClose }) {
  return (
    <motion.div
      className="sheet-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        className="sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 330, damping: 32 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Supporting components                                                      */
/* -------------------------------------------------------------------------- */

function SetupScreen() {
  return (
    <main className="setup-page">
      <section className="setup-card">
        <div className="brand-mark">
          <Check size={28} strokeWidth={3} />
        </div>

        <h1>Connect Firebase</h1>

        <p>
          Add the Firebase configuration values to your
          <code>.env.local</code> file, then restart the development server.
        </p>

        <pre>{`VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=`}</pre>
      </section>
    </main>
  );
}

function LoadingScreen({ reduceMotion }) {
  return (
    <main className="loading-screen">
      <motion.div
        className="brand-mark loading-mark"
        animate={reduceMotion ? {} : { scale: [1, 1.07, 1] }}
        transition={{ duration: 1.3, repeat: Infinity }}
      >
        <Check size={28} strokeWidth={3} />
      </motion.div>

      <strong>Lyst</strong>
    </main>
  );
}

function Toast({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="toast"
          initial={{ opacity: 0, y: 22, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ListSkeleton() {
  return (
    <div className="list-card skeleton-card">
      <span className="skeleton skeleton-square" />

      <span className="list-card-copy">
        <span className="skeleton skeleton-title" />
        <span className="skeleton skeleton-caption" />
      </span>
    </div>
  );
}

function ItemSkeleton() {
  return (
    <div className="item-row">
      <span className="skeleton skeleton-check" />
      <span className="skeleton skeleton-item-text" />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.94A6 6 0 0 1 6.1 12c0-.67.11-1.33.31-1.94V7.44H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.56l3.34-2.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.93 5.44l3.34 2.62C7.2 7.7 9.4 5.94 12 5.94Z"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Styling                                                                    */
/* -------------------------------------------------------------------------- */

function GlobalStyles() {
  return <style>{styles}</style>;
}

const styles = `
  :root {
    font-family:
      Inter,
      ui-rounded,
      "SF Pro Display",
      "SF Pro Text",
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;

    color: #111114;
    background: #f5f5f7;
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  * {
    box-sizing: border-box;
  }

  html {
    min-width: 320px;
    background: #f5f5f7;
  }

  body {
    min-width: 320px;
    min-height: 100vh;
    min-height: 100dvh;
    margin: 0;
    overflow-x: hidden;
    overscroll-behavior-y: none;
  }

  button,
  input {
    font: inherit;
  }

  button {
    -webkit-tap-highlight-color: transparent;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 3px solid rgba(0, 122, 255, 0.25);
    outline-offset: 2px;
  }

  #root {
    min-height: 100vh;
    min-height: 100dvh;
  }

  .app-shell {
    position: relative;
    min-height: 100vh;
    min-height: 100dvh;
    overflow: hidden;
    background:
      radial-gradient(circle at 10% 0%, rgba(0, 122, 255, 0.08), transparent 31rem),
      radial-gradient(circle at 100% 20%, rgba(175, 82, 222, 0.07), transparent 27rem),
      #f5f5f7;
  }

  .ambient {
    position: fixed;
    z-index: 0;
    width: 30rem;
    height: 30rem;
    border-radius: 999px;
    filter: blur(90px);
    pointer-events: none;
    opacity: 0.42;
  }

  .ambient-one {
    top: -18rem;
    left: -12rem;
    background: rgba(0, 122, 255, 0.18);
  }

  .ambient-two {
    right: -18rem;
    bottom: -19rem;
    background: rgba(175, 82, 222, 0.14);
  }

  .screen {
    position: relative;
    z-index: 1;
    width: min(100%, 760px);
    min-height: 100vh;
    min-height: 100dvh;
    margin: 0 auto;
    padding:
      max(30px, env(safe-area-inset-top))
      max(22px, env(safe-area-inset-right))
      max(110px, calc(env(safe-area-inset-bottom) + 90px))
      max(22px, env(safe-area-inset-left));
  }

  h1,
  h2,
  h3,
  p {
    margin-top: 0;
  }

  .eyebrow {
    display: block;
    margin-bottom: 5px;
    color: #777780;
    font-size: 0.76rem;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .top-bar,
  .list-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .top-bar {
    margin-bottom: 28px;
  }

  .top-bar h1 {
    margin: 0;
    font-size: clamp(2.25rem, 8vw, 3.6rem);
    line-height: 0.98;
    letter-spacing: -0.055em;
  }

  .avatar-button {
    display: grid;
    width: 48px;
    height: 48px;
    padding: 0;
    place-items: center;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.86);
    border-radius: 50%;
    color: #303036;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(241, 241, 245, 0.88));
    box-shadow:
      0 10px 30px rgba(42, 42, 50, 0.09),
      inset 0 1px 0 #fff;
    font-size: 0.86rem;
    font-weight: 800;
    cursor: pointer;
  }

  .avatar-button img,
  .profile-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .hero-card {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 34px;
    padding: 19px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.88);
    border-radius: 26px;
    background:
      linear-gradient(120deg, rgba(255, 255, 255, 0.96), rgba(249, 249, 252, 0.86));
    box-shadow:
      0 16px 45px rgba(31, 35, 48, 0.07),
      inset 0 1px 0 rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(22px);
  }

  .hero-icon {
    display: grid;
    flex: 0 0 auto;
    width: 50px;
    height: 50px;
    place-items: center;
    border-radius: 17px;
    color: white;
    background: linear-gradient(145deg, #16171b, #3b3d45);
    box-shadow:
      0 12px 28px rgba(20, 20, 24, 0.19),
      inset 0 1px 0 rgba(255, 255, 255, 0.22);
  }

  .hero-card span {
    display: block;
    margin-bottom: 4px;
    font-size: 0.97rem;
    font-weight: 780;
  }

  .hero-card p {
    margin: 0;
    color: #74747d;
    font-size: 0.87rem;
    line-height: 1.45;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .section-heading > div {
    display: flex;
    gap: 9px;
    align-items: center;
  }

  .section-heading h2 {
    margin: 0;
    font-size: 1.15rem;
    letter-spacing: -0.025em;
  }

  .section-heading > div > span {
    display: grid;
    min-width: 24px;
    height: 24px;
    padding: 0 7px;
    place-items: center;
    border-radius: 999px;
    color: #707078;
    background: rgba(225, 225, 230, 0.8);
    font-size: 0.72rem;
    font-weight: 800;
  }

  .add-list-button,
  .primary-button,
  .google-button,
  .sign-out-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    cursor: pointer;
  }

  .add-list-button {
    gap: 5px;
    padding: 9px 13px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    border-radius: 14px;
    color: #26262b;
    background: rgba(255, 255, 255, 0.75);
    box-shadow: 0 6px 18px rgba(40, 40, 47, 0.055);
    backdrop-filter: blur(16px);
    font-size: 0.82rem;
    font-weight: 760;
  }

  .lists-grid {
    display: grid;
    gap: 11px;
  }

  .list-card {
    display: flex;
    width: 100%;
    min-height: 84px;
    gap: 15px;
    align-items: center;
    padding: 15px 16px;
    text-align: left;
    border: 1px solid rgba(255, 255, 255, 0.9);
    border-radius: 22px;
    color: inherit;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(249, 249, 251, 0.9));
    box-shadow:
      0 12px 35px rgba(43, 45, 55, 0.055),
      inset 0 1px 0 rgba(255, 255, 255, 0.95);
    cursor: pointer;
  }

  .list-icon,
  .large-list-icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    color: white;
    background:
      linear-gradient(145deg, color-mix(in srgb, var(--list-color), white 12%), var(--list-color));
    box-shadow:
      0 10px 23px color-mix(in srgb, var(--list-color), transparent 68%),
      inset 0 1px 0 rgba(255, 255, 255, 0.28);
  }

  .list-icon {
    width: 49px;
    height: 49px;
    border-radius: 16px;
  }

  .list-card-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 4px;
  }

  .list-card-copy strong {
    overflow: hidden;
    font-size: 0.97rem;
    font-weight: 760;
    letter-spacing: -0.015em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-card-copy small {
    color: #85858d;
    font-size: 0.76rem;
  }

  .list-chevron {
    color: #b0b0b7;
  }

  .mobile-fab {
    position: fixed;
    z-index: 5;
    right: max(22px, calc((100vw - 760px) / 2 + 22px));
    bottom: max(22px, calc(env(safe-area-inset-bottom) + 15px));
    display: none;
    width: 58px;
    height: 58px;
    place-items: center;
    border: 0;
    border-radius: 20px;
    color: white;
    background: #111114;
    box-shadow:
      0 17px 35px rgba(18, 18, 22, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
  }

  .empty-state {
    display: flex;
    min-height: 390px;
    padding: 50px 26px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    border: 1px dashed rgba(173, 173, 182, 0.45);
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.45);
  }

  .empty-illustration {
    position: relative;
    width: 112px;
    height: 100px;
    margin-bottom: 20px;
  }

  .empty-card {
    position: absolute;
    width: 76px;
    height: 82px;
    border-radius: 22px;
  }

  .empty-card-back {
    top: 2px;
    left: 15px;
    transform: rotate(-9deg);
    background: linear-gradient(145deg, #dfeafe, #c8dafe);
    box-shadow: 0 14px 30px rgba(60, 101, 179, 0.14);
  }

  .empty-card-front {
    right: 8px;
    bottom: 0;
    display: grid;
    place-items: center;
    transform: rotate(7deg);
    color: #fff;
    background: linear-gradient(145deg, #0d7fff, #5965eb);
    box-shadow: 0 17px 35px rgba(51, 95, 210, 0.24);
  }

  .empty-state h3,
  .list-empty h3 {
    margin-bottom: 7px;
    font-size: 1.08rem;
  }

  .empty-state p,
  .list-empty p {
    max-width: 310px;
    margin-bottom: 20px;
    color: #7b7b84;
    font-size: 0.87rem;
    line-height: 1.52;
  }

  .primary-button {
    width: 100%;
    min-height: 52px;
    gap: 8px;
    padding: 0 18px;
    border-radius: 17px;
    color: #fff;
    background:
      linear-gradient(145deg, #151519, #2c2d34);
    box-shadow:
      0 13px 28px rgba(23, 23, 28, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    font-size: 0.9rem;
    font-weight: 760;
  }

  .primary-button.compact {
    width: auto;
  }

  .primary-button:disabled,
  .google-button:disabled {
    opacity: 0.48;
    cursor: default;
  }

  .list-top-bar {
    margin-bottom: 38px;
  }

  .icon-button,
  .sheet-close {
    display: grid;
    width: 43px;
    height: 43px;
    padding: 0;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.92);
    border-radius: 15px;
    color: #28282e;
    background: rgba(255, 255, 255, 0.76);
    box-shadow: 0 7px 20px rgba(39, 39, 47, 0.06);
    backdrop-filter: blur(18px);
    cursor: pointer;
  }

  .menu-wrap {
    position: relative;
  }

  .context-menu {
    position: absolute;
    z-index: 20;
    top: 50px;
    right: 0;
    width: 200px;
    padding: 7px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    border-radius: 17px;
    background: rgba(253, 253, 254, 0.93);
    box-shadow: 0 20px 55px rgba(30, 30, 38, 0.16);
    backdrop-filter: blur(26px);
  }

  .context-menu button {
    display: flex;
    width: 100%;
    gap: 10px;
    align-items: center;
    padding: 11px;
    border: 0;
    border-radius: 11px;
    color: #313138;
    background: transparent;
    font-size: 0.82rem;
    font-weight: 670;
    cursor: pointer;
  }

  .context-menu button:hover {
    background: #f1f1f4;
  }

  .context-menu .danger-row {
    color: #e3363f;
  }

  .list-heading {
    display: flex;
    gap: 17px;
    align-items: center;
    margin-bottom: 27px;
  }

  .large-list-icon {
    width: 64px;
    height: 64px;
    border-radius: 21px;
  }

  .list-heading h1 {
    max-width: 510px;
    margin-bottom: 5px;
    overflow: hidden;
    font-size: clamp(2rem, 7vw, 3rem);
    line-height: 1;
    letter-spacing: -0.052em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-heading p {
    margin: 0;
    color: #797981;
    font-size: 0.84rem;
  }

  .items-panel {
    min-height: 320px;
  }

  .item-row {
    display: flex;
    min-height: 61px;
    gap: 13px;
    align-items: center;
    padding: 8px 4px;
    border-bottom: 1px solid rgba(212, 212, 218, 0.66);
  }

  .item-row:last-child {
    border-bottom: 0;
  }

  .check-button {
    display: grid;
    width: 27px;
    height: 27px;
    flex: 0 0 auto;
    padding: 0;
    place-items: center;
    border: 1.7px solid #d5d5dc;
    border-radius: 50%;
    color: white;
    cursor: pointer;
  }

  .check-button span {
    display: grid;
    place-items: center;
  }

  .item-text {
    position: relative;
    min-width: 0;
    flex: 1;
    padding: 10px 0;
    overflow: hidden;
    text-align: left;
    border: 0;
    color: #1d1d22;
    background: transparent;
    cursor: pointer;
  }

  .item-text span {
    position: relative;
    display: inline;
    font-size: 0.96rem;
    font-weight: 580;
    line-height: 1.4;
    transition:
      color 220ms ease,
      opacity 220ms ease;
  }

  .item-text span::after {
    position: absolute;
    top: 52%;
    left: 0;
    width: 100%;
    height: 1.5px;
    content: "";
    transform: scaleX(0);
    transform-origin: left center;
    background: currentColor;
    transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .item-row.completed .item-text span {
    color: #9898a0;
    opacity: 0.72;
  }

  .item-row.completed .item-text span::after {
    transform: scaleX(1);
  }

  .delete-item-button {
    display: grid;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    place-items: center;
    border: 0;
    border-radius: 12px;
    color: #b0b0b7;
    background: transparent;
    opacity: 0;
    cursor: pointer;
    transition:
      opacity 170ms ease,
      color 170ms ease,
      background 170ms ease;
  }

  .item-row:hover .delete-item-button,
  .delete-item-button:focus-visible {
    opacity: 1;
  }

  .delete-item-button:hover {
    color: #e43c45;
    background: rgba(255, 59, 48, 0.08);
  }

  .list-empty {
    display: flex;
    min-height: 350px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .list-empty-icon {
    display: grid;
    width: 70px;
    height: 70px;
    margin-bottom: 18px;
    place-items: center;
    border-radius: 24px;
    color: #767680;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(235, 235, 240, 0.78));
    box-shadow:
      0 17px 40px rgba(38, 38, 46, 0.08),
      inset 0 1px 0 #fff;
  }

  .add-item-bar {
    position: fixed;
    z-index: 10;
    right: max(18px, calc((100vw - 760px) / 2 + 18px));
    bottom: max(17px, env(safe-area-inset-bottom));
    left: max(18px, calc((100vw - 760px) / 2 + 18px));
    display: flex;
    max-width: 724px;
    min-height: 62px;
    gap: 10px;
    align-items: center;
    margin: auto;
    padding: 8px 8px 8px 18px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    border-radius: 21px;
    background: rgba(253, 253, 254, 0.88);
    box-shadow:
      0 20px 55px rgba(28, 28, 35, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(28px) saturate(150%);
  }

  .add-item-bar input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    color: #1a1a1f;
    background: transparent;
    font-size: 0.95rem;
  }

  .add-item-bar input::placeholder {
    color: #96969d;
  }

  .add-item-bar button {
    display: grid;
    width: 46px;
    height: 46px;
    flex: 0 0 auto;
    place-items: center;
    border: 0;
    border-radius: 15px;
    color: white;
    background:
      linear-gradient(145deg, color-mix(in srgb, var(--list-color), white 9%), var(--list-color));
    box-shadow:
      0 10px 24px color-mix(in srgb, var(--list-color), transparent 66%),
      inset 0 1px 0 rgba(255, 255, 255, 0.28);
    cursor: pointer;
  }

  .add-item-bar button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .sheet-backdrop {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 18px 18px max(18px, env(safe-area-inset-bottom));
    background: rgba(18, 18, 23, 0.28);
    backdrop-filter: blur(8px);
  }

  .sheet {
    width: min(100%, 540px);
    max-height: calc(100dvh - 30px);
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.95);
    border-radius: 30px;
    background: rgba(251, 251, 253, 0.96);
    box-shadow: 0 30px 90px rgba(15, 15, 20, 0.25);
    backdrop-filter: blur(30px) saturate(155%);
  }

  .sheet-content {
    padding: 11px 22px 24px;
  }

  .sheet-handle {
    width: 40px;
    height: 5px;
    margin: 0 auto 22px;
    border-radius: 99px;
    background: #d1d1d6;
  }

  .sheet-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 25px;
  }

  .sheet-heading h2 {
    margin: 0;
    font-size: 1.65rem;
    letter-spacing: -0.04em;
  }

  .sheet-close {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #ebebef;
    box-shadow: none;
  }

  .sheet-field {
    display: block;
    margin-bottom: 22px;
  }

  .sheet-field > span,
  .color-section > span,
  .auth-form label > span {
    display: block;
    margin: 0 0 8px 3px;
    color: #6f6f77;
    font-size: 0.75rem;
    font-weight: 720;
  }

  .sheet-field input,
  .auth-form input {
    width: 100%;
    min-height: 53px;
    padding: 0 15px;
    border: 1px solid rgba(218, 218, 224, 0.9);
    border-radius: 16px;
    outline: 0;
    color: #1b1b20;
    background: rgba(255, 255, 255, 0.8);
    box-shadow: inset 0 1px 2px rgba(30, 30, 35, 0.03);
  }

  .sheet-field input:focus,
  .auth-form input:focus {
    border-color: rgba(0, 122, 255, 0.55);
    box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.09);
  }

  .color-section {
    margin-bottom: 27px;
  }

  .color-grid {
    display: flex;
    gap: 11px;
    flex-wrap: wrap;
  }

  .color-option {
    display: grid;
    width: 42px;
    height: 42px;
    padding: 0;
    place-items: center;
    border: 3px solid transparent;
    border-radius: 50%;
    color: white;
    background:
      linear-gradient(145deg, color-mix(in srgb, var(--option-color), white 15%), var(--option-color));
    box-shadow: 0 9px 19px color-mix(in srgb, var(--option-color), transparent 73%);
    cursor: pointer;
  }

  .color-option.selected {
    border-color: rgba(255, 255, 255, 0.95);
    outline: 2px solid var(--option-color);
  }

  .profile-card {
    display: flex;
    gap: 14px;
    align-items: center;
    margin-bottom: 17px;
    padding: 15px;
    border: 1px solid rgba(255, 255, 255, 0.95);
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.68);
    box-shadow: 0 10px 26px rgba(40, 40, 48, 0.05);
  }

  .profile-avatar {
    display: grid;
    width: 52px;
    height: 52px;
    place-items: center;
    overflow: hidden;
    border-radius: 17px;
    color: #74747d;
    background: #ececf0;
  }

  .profile-card > div:last-child {
    min-width: 0;
  }

  .profile-card strong,
  .profile-card span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-card strong {
    margin-bottom: 4px;
    font-size: 0.94rem;
  }

  .profile-card span {
    color: #7e7e86;
    font-size: 0.78rem;
  }

  .sign-out-button {
    width: 100%;
    min-height: 51px;
    gap: 9px;
    border-radius: 16px;
    color: #e0343f;
    background: rgba(255, 59, 48, 0.08);
    font-size: 0.88rem;
    font-weight: 740;
  }

  .auth-page,
  .setup-page,
  .loading-screen {
    min-height: 100vh;
    min-height: 100dvh;
    padding:
      max(24px, env(safe-area-inset-top))
      max(18px, env(safe-area-inset-right))
      max(24px, env(safe-area-inset-bottom))
      max(18px, env(safe-area-inset-left));
    background:
      radial-gradient(circle at 15% 10%, rgba(0, 122, 255, 0.12), transparent 28rem),
      radial-gradient(circle at 90% 80%, rgba(175, 82, 222, 0.11), transparent 27rem),
      #f5f5f7;
  }

  .auth-page,
  .setup-page {
    display: grid;
    place-items: center;
  }

  .auth-card,
  .setup-card {
    width: min(100%, 430px);
    padding: 30px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    border-radius: 32px;
    background: rgba(252, 252, 253, 0.85);
    box-shadow:
      0 35px 90px rgba(38, 38, 48, 0.13),
      inset 0 1px 0 #fff;
    backdrop-filter: blur(30px) saturate(150%);
  }

  .brand-mark {
    display: grid;
    width: 58px;
    height: 58px;
    place-items: center;
    border-radius: 19px;
    color: white;
    background: linear-gradient(145deg, #111216, #363840);
    box-shadow:
      0 15px 32px rgba(20, 20, 26, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.22);
  }

  .auth-heading {
    margin: 27px 0 24px;
  }

  .auth-heading h1,
  .setup-card h1 {
    margin-bottom: 10px;
    font-size: 2.7rem;
    line-height: 0.95;
    letter-spacing: -0.06em;
  }

  .auth-heading p,
  .setup-card p {
    margin: 0;
    color: #74747d;
    font-size: 0.9rem;
    line-height: 1.55;
  }

  .google-button {
    width: 100%;
    min-height: 52px;
    gap: 11px;
    border: 1px solid #dedee3;
    border-radius: 17px;
    color: #28282e;
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 7px 19px rgba(30, 30, 36, 0.045);
    font-size: 0.88rem;
    font-weight: 720;
  }

  .divider {
    display: flex;
    align-items: center;
    margin: 21px 0;
    color: #9a9aa2;
    font-size: 0.72rem;
  }

  .divider::before,
  .divider::after {
    height: 1px;
    flex: 1;
    content: "";
    background: #dedee3;
  }

  .divider span {
    padding: 0 12px;
  }

  .auth-form {
    display: grid;
    gap: 14px;
  }

  .forgot-button,
  .mode-button {
    border: 0;
    color: #62626b;
    background: transparent;
    cursor: pointer;
  }

  .forgot-button {
    margin-top: -3px;
    justify-self: end;
    font-size: 0.75rem;
    font-weight: 680;
  }

  .mode-button {
    display: block;
    width: 100%;
    margin-top: 20px;
    font-size: 0.78rem;
    font-weight: 680;
  }

  .loading-screen {
    display: flex;
    gap: 13px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .loading-screen strong {
    font-size: 1rem;
    letter-spacing: 0.03em;
  }

  .setup-card code {
    margin-left: 5px;
    padding: 2px 5px;
    border-radius: 5px;
    background: #ebebef;
  }

  .setup-card pre {
    margin: 23px 0 0;
    padding: 16px;
    overflow-x: auto;
    border-radius: 16px;
    color: #dfe7ff;
    background: #15161a;
    font-size: 0.71rem;
    line-height: 1.7;
  }

  .toast {
    position: fixed;
    z-index: 300;
    right: 20px;
    bottom: max(22px, calc(env(safe-area-inset-bottom) + 12px));
    left: 20px;
    width: fit-content;
    max-width: calc(100vw - 40px);
    margin: auto;
    padding: 12px 17px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 15px;
    color: white;
    background: rgba(26, 26, 31, 0.92);
    box-shadow: 0 15px 40px rgba(20, 20, 25, 0.24);
    backdrop-filter: blur(22px);
    font-size: 0.82rem;
    font-weight: 680;
  }

  .skeleton {
    display: block;
    overflow: hidden;
    border-radius: 9px;
    background:
      linear-gradient(
        90deg,
        #ececf0 25%,
        #f7f7f9 45%,
        #ececf0 65%
      );
    background-size: 250% 100%;
    animation: skeleton-shimmer 1.35s infinite linear;
  }

  .skeleton-card {
    cursor: default;
  }

  .skeleton-square {
    width: 49px;
    height: 49px;
    border-radius: 16px;
  }

  .skeleton-title {
    width: 42%;
    height: 12px;
  }

  .skeleton-caption {
    width: 25%;
    height: 9px;
  }

  .skeleton-check {
    width: 27px;
    height: 27px;
    border-radius: 50%;
  }

  .skeleton-item-text {
    width: min(62%, 320px);
    height: 12px;
  }

  .item-skeletons {
    display: grid;
  }

  @keyframes skeleton-shimmer {
    from {
      background-position: 100% 0;
    }

    to {
      background-position: -100% 0;
    }
  }

  @media (max-width: 620px) {
    .screen {
      padding-right: 18px;
      padding-left: 18px;
    }

    .top-bar h1 {
      font-size: 2.6rem;
    }

    .hero-card {
      border-radius: 23px;
    }

    .add-list-button {
      display: none;
    }

    .mobile-fab {
      display: grid;
    }

    .list-card {
      min-height: 78px;
      border-radius: 20px;
    }

    .list-icon {
      width: 46px;
      height: 46px;
    }

    .delete-item-button {
      opacity: 1;
    }

    .auth-card,
    .setup-card {
      padding: 25px 20px;
      border-radius: 27px;
    }

    .auth-heading h1,
    .setup-card h1 {
      font-size: 2.4rem;
    }
  }

  @media (min-width: 760px) {
    .screen {
      padding-top: 52px;
    }

    .lists-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .empty-state {
      grid-column: 1 / -1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;