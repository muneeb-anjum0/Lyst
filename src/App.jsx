import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { initializeApp } from "firebase/app";

import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import {
  CACHE_SIZE_UNLIMITED,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
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

  try {
    db = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    console.warn(
      "Persistent Firestore cache could not be initialized. Using normal Firestore.",
      error,
    );

    db = getFirestore(firebaseApp);
  }
}

/* -------------------------------------------------------------------------- */
/* Offline access                                                             */
/* -------------------------------------------------------------------------- */

const OFFLINE_ACCESS_KEY = "lyst_offline_access_refreshed_at";
const OFFLINE_ACCESS_DURATION = 60 * 24 * 60 * 60 * 1000;

function getOfflineRefreshTime(user) {
  const storedValue = Number(localStorage.getItem(OFFLINE_ACCESS_KEY));

  if (Number.isFinite(storedValue) && storedValue > 0) {
    return storedValue;
  }

  const lastSignInTime = user?.metadata?.lastSignInTime;

  if (!lastSignInTime) return null;

  const timestamp = new Date(lastSignInTime).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

function offlineAccessExpired(user) {
  const refreshTime = getOfflineRefreshTime(user);

  if (!refreshTime) return false;

  return Date.now() - refreshTime > OFFLINE_ACCESS_DURATION;
}

async function sendServiceWorkerMessage(message) {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;

    registration.active?.postMessage(message);
  } catch (error) {
    console.warn("Could not contact the service worker:", error);
  }
}

async function refreshOfflineAccess() {
  localStorage.setItem(OFFLINE_ACCESS_KEY, String(Date.now()));

  await sendServiceWorkerMessage({
    type: "REFRESH_OFFLINE_CACHE",
  });
}

async function clearOfflineAccess() {
  localStorage.removeItem(OFFLINE_ACCESS_KEY);

  await sendServiceWorkerMessage({
    type: "CLEAR_OFFLINE_CACHE",
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getInitials(user) {
  const source = user?.displayName || user?.email || "L";

  return source
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function getAuthError(error) {
  const messages = {
    "auth/email-already-in-use": "That email already has an account.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/popup-blocked": "Your browser blocked the sign-in window.",
    "auth/network-request-failed": "Check your internet connection.",
    "auth/popup-closed-by-user": "",
  };

  return messages[error?.code] || "Something went wrong.";
}

/* -------------------------------------------------------------------------- */
/* App                                                                        */
/* -------------------------------------------------------------------------- */

export default function App() {
  const reduceMotion = useReducedMotion();

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(firebaseReady);
  const [offlineExpired, setOfflineExpired] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [selectedList, setSelectedList] = useState(null);

  const [newListOpen, setNewListOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  function showToast(message) {
    if (!message) return;

    setToast(message);
    window.clearTimeout(toastTimer.current);

    toastTimer.current = window.setTimeout(() => {
      setToast("");
    }, 2300);
  }

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!firebaseReady) {
      setAuthLoading(false);
      return undefined;
    }

    setPersistence(auth, browserLocalPersistence).catch(console.error);

    return onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setLists([]);
        setSelectedList(null);
        setOfflineExpired(false);
        setAuthLoading(false);
        return;
      }

      if (navigator.onLine) {
        try {
          await nextUser.getIdToken(true);
          await refreshOfflineAccess();

          setOfflineExpired(false);
          setUser(nextUser);
        } catch (error) {
          console.warn("Online session refresh failed:", error);

          const expired = offlineAccessExpired(nextUser);

          setOfflineExpired(expired);
          setUser(expired ? null : nextUser);
        }
      } else {
        const expired = offlineAccessExpired(nextUser);

        setOfflineExpired(expired);
        setUser(expired ? null : nextUser);
      }

      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!isOnline || !auth?.currentUser) return undefined;

    let cancelled = false;

    async function refreshOnlineSession() {
      try {
        await auth.currentUser.getIdToken(true);
        await refreshOfflineAccess();

        if (!cancelled) {
          setOfflineExpired(false);
          setUser(auth.currentUser);
        }
      } catch (error) {
        console.warn("Could not refresh the online session:", error);
      }
    }

    refreshOnlineSession();

    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  useEffect(() => {
    if (!user || !db || offlineExpired) return undefined;

    setListsLoading(true);

    const listsQuery = query(
      collection(db, "users", user.uid, "lists"),
      orderBy("createdAt", "desc"),
    );

    return onSnapshot(
      listsQuery,
      {
        includeMetadataChanges: true,
      },
      (snapshot) => {
        const nextLists = snapshot.docs.map((listDocument) => ({
          id: listDocument.id,
          ...listDocument.data(),
        }));

        setLists(nextLists);
        setListsLoading(false);

        setSelectedList((currentList) => {
          if (!currentList) return null;

          return (
            nextLists.find((list) => list.id === currentList.id) || null
          );
        });
      },
      (error) => {
        console.error(error);
        setListsLoading(false);
        showToast(
          navigator.onLine
            ? "Could not load your lists."
            : "No cached lists are available yet.",
        );
      },
    );
  }, [user, offlineExpired]);

  async function createList(title) {
    const cleanTitle = title.trim();

    if (!cleanTitle || !user || !db) return;

    try {
      const reference = await addDoc(
        collection(db, "users", user.uid, "lists"),
        {
          title: cleanTitle,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      );

      setNewListOpen(false);

      setSelectedList({
        id: reference.id,
        title: cleanTitle,
      });

      if (!navigator.onLine) {
        showToast("Saved offline. It will sync when you reconnect.");
      }
    } catch (error) {
      console.error(error);
      showToast("Could not create the list.");
    }
  }

  async function deleteList(list) {
    if (!user || !db) return;

    const confirmed = window.confirm(
      `Delete "${list.title}" and all of its items?`,
    );

    if (!confirmed) return;

    try {
      const itemsSnapshot = await getDocs(
        collection(
          db,
          "users",
          user.uid,
          "lists",
          list.id,
          "items",
        ),
      );

      const batch = writeBatch(db);

      itemsSnapshot.docs.forEach((itemDocument) => {
        batch.delete(itemDocument.ref);
      });

      batch.delete(doc(db, "users", user.uid, "lists", list.id));

      await batch.commit();

      setSelectedList(null);
      showToast(
        navigator.onLine
          ? "List deleted."
          : "Deleted offline. It will sync when you reconnect.",
      );
    } catch (error) {
      console.error(error);
      showToast("Could not delete the list.");
    }
  }

  async function handleSignOut() {
    await clearOfflineAccess();
    await signOut(auth);

    setAccountOpen(false);
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

  if (offlineExpired) {
    return (
      <>
        <GlobalStyles />

        <OfflineExpiredScreen
          isOnline={isOnline}
          onRetry={async () => {
            if (!navigator.onLine) return;

            try {
              if (auth.currentUser) {
                await auth.currentUser.getIdToken(true);
                await refreshOfflineAccess();

                setOfflineExpired(false);
                setUser(auth.currentUser);
              } else {
                setOfflineExpired(false);
              }
            } catch (error) {
              console.error(error);
              showToast("Sign in again to refresh offline access.");
            }
          }}
          onSignOut={async () => {
            await clearOfflineAccess();
            await signOut(auth);

            setOfflineExpired(false);
          }}
        />

        <Toast message={toast} />
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

      <div className="app">
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              className="offline-indicator"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              Offline
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {selectedList ? (
            <ListScreen
              key="list-screen"
              list={selectedList}
              user={user}
              reduceMotion={reduceMotion}
              onBack={() => setSelectedList(null)}
              onDelete={() => deleteList(selectedList)}
              showToast={showToast}
            />
          ) : (
            <HomeScreen
              key="home-screen"
              lists={lists}
              loading={listsLoading}
              user={user}
              reduceMotion={reduceMotion}
              onOpenList={setSelectedList}
              onCreate={() => setNewListOpen(true)}
              onAccount={() => setAccountOpen(true)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {newListOpen && (
            <NewListSheet
              onClose={() => setNewListOpen(false)}
              onCreate={createList}
            />
          )}

          {accountOpen && (
            <AccountSheet
              user={user}
              isOnline={isOnline}
              onClose={() => setAccountOpen(false)}
              onSignOut={handleSignOut}
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

  async function preparePersistence() {
    await setPersistence(auth, browserLocalPersistence);
  }

  async function finishOnlineLogin() {
    await refreshOfflineAccess();
  }

  async function handleGoogle() {
    if (!navigator.onLine) {
      showToast("Connect to the internet to sign in.");
      return;
    }

    try {
      setWorking(true);

      await preparePersistence();

      const provider = new GoogleAuthProvider();

      await signInWithPopup(auth, provider);
      await finishOnlineLogin();
    } catch (error) {
      console.error(error);
      showToast(getAuthError(error));
    } finally {
      setWorking(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!navigator.onLine) {
      showToast("Connect to the internet to sign in.");
      return;
    }

    const cleanEmail = email.trim();

    if (!cleanEmail || password.length < 6) {
      showToast("Use a valid email and a 6-character password.");
      return;
    }

    try {
      setWorking(true);

      await preparePersistence();

      if (mode === "signup") {
        await createUserWithEmailAndPassword(
          auth,
          cleanEmail,
          password,
        );
      } else {
        await signInWithEmailAndPassword(
          auth,
          cleanEmail,
          password,
        );
      }

      await finishOnlineLogin();
    } catch (error) {
      console.error(error);
      showToast(getAuthError(error));
    } finally {
      setWorking(false);
    }
  }

  async function handlePasswordReset() {
    if (!navigator.onLine) {
      showToast("Connect to the internet first.");
      return;
    }

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      showToast("Enter your email first.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      showToast("Password reset email sent.");
    } catch (error) {
      console.error(error);
      showToast(getAuthError(error));
    }
  }

  return (
    <main className="auth-page">
      <motion.section
        className="auth-panel"
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 28,
        }}
      >
        <motion.div
          className="auth-name"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          Lyst
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            className="auth-heading"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>

            <p>
              {mode === "signin"
                ? "Continue to your lists."
                : "Keep everything you need to remember."}
            </p>
          </motion.div>
        </AnimatePresence>

        <motion.button
          className="google-button"
          type="button"
          disabled={working}
          whileTap={{ scale: 0.975 }}
          onClick={handleGoogle}
        >
          <GoogleMark />
          Continue with Google
        </motion.button>

        <div className="divider">
          <span>or</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            autoComplete="email"
            placeholder="Email"
            aria-label="Email"
            onChange={(event) => setEmail(event.target.value)}
          />

          <input
            type="password"
            value={password}
            minLength={6}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            placeholder="Password"
            aria-label="Password"
            onChange={(event) => setPassword(event.target.value)}
          />

          {mode === "signin" && (
            <button
              className="forgot-button"
              type="button"
              onClick={handlePasswordReset}
            >
              Forgot password?
            </button>
          )}

          <motion.button
            className="primary-button"
            type="submit"
            disabled={working}
            whileTap={{ scale: 0.975 }}
          >
            {working
              ? "Please wait"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </motion.button>
        </form>

        <button
          className="switch-button"
          type="button"
          onClick={() => {
            setMode((currentMode) =>
              currentMode === "signin" ? "signup" : "signin",
            );
          }}
        >
          {mode === "signin"
            ? "Create an account"
            : "Already have an account?"}
        </button>
      </motion.section>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Home                                                                       */
/* -------------------------------------------------------------------------- */

function HomeScreen({
  lists,
  loading,
  user,
  reduceMotion,
  onOpenList,
  onCreate,
  onAccount,
}) {
  return (
    <motion.main
      className="screen"
      initial={{
        opacity: 0,
        x: reduceMotion ? 0 : -10,
      }}
      animate={{
        opacity: 1,
        x: 0,
      }}
      exit={{
        opacity: 0,
        x: reduceMotion ? 0 : -10,
      }}
      transition={{
        duration: reduceMotion ? 0 : 0.22,
      }}
    >
      <header className="home-header">
        <div>
          <span className="app-label">Lyst</span>
          <h1>Lists</h1>
        </div>

        <motion.button
          className="avatar-button"
          type="button"
          aria-label="Open account"
          whileTap={{ scale: 0.9 }}
          onClick={onAccount}
        >
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : (
            getInitials(user)
          )}
        </motion.button>
      </header>

      <div className="list-toolbar">
        <span>
          {lists.length} {lists.length === 1 ? "list" : "lists"}
        </span>

        <motion.button
          className="create-button"
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={onCreate}
        >
          New
        </motion.button>
      </div>

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
                className="list-row"
                type="button"
                initial={{ opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.985 }}
                transition={{
                  delay: Math.min(index * 0.025, 0.12),
                  type: "spring",
                  stiffness: 350,
                  damping: 30,
                }}
                whileTap={{ scale: 0.985 }}
                onClick={() => onOpenList(list)}
              >
                <span className="list-title-text">{list.title}</span>
                <span className="row-arrow">›</span>
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
        aria-label="Create list"
        whileTap={{ scale: 0.88 }}
        onClick={onCreate}
      >
        +
      </motion.button>
    </motion.main>
  );
}

function EmptyLists({ onCreate }) {
  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2>No lists yet</h2>
      <p>Create one and start adding items.</p>

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

/* -------------------------------------------------------------------------- */
/* List screen                                                                */
/* -------------------------------------------------------------------------- */

function ListScreen({
  list,
  user,
  reduceMotion,
  onBack,
  onDelete,
  showToast,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
      {
        includeMetadataChanges: true,
      },
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

        showToast(
          navigator.onLine
            ? "Could not load your items."
            : "No cached items are available yet.",
        );
      },
    );
  }, [list.id, user.uid]);

  const remainingItems = useMemo(
    () => items.filter((item) => !item.completed).length,
    [items],
  );

  const sortedItems = useMemo(
    () => [
      ...items.filter((item) => !item.completed),
      ...items.filter((item) => item.completed),
    ],
    [items],
  );

  async function addItem(event) {
    event.preventDefault();

    const cleanText = newItem.trim();

    if (!cleanText || adding) return;

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
          text: cleanText,
          completed: false,
          createdAt: serverTimestamp(),
          completedAt: null,
        },
      );

      await updateDoc(
        doc(db, "users", user.uid, "lists", list.id),
        {
          updatedAt: serverTimestamp(),
        },
      );

      inputRef.current?.focus();

      if (!navigator.onLine) {
        showToast("Saved offline. It will sync when you reconnect.");
      }
    } catch (error) {
      console.error(error);
      setNewItem(cleanText);
      showToast("Could not add the item.");
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

      if (!navigator.onLine) {
        showToast("Updated offline.");
      }
    } catch (error) {
      console.error(error);
      showToast("Could not update the item.");
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

      if (!navigator.onLine) {
        showToast("Deleted offline.");
      }
    } catch (error) {
      console.error(error);
      showToast("Could not delete the item.");
    }
  }

  async function clearCompleted() {
    const completedItems = items.filter((item) => item.completed);

    if (completedItems.length === 0) {
      showToast("There are no completed items.");
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

      setMenuOpen(false);

      showToast(
        navigator.onLine
          ? "Completed items cleared."
          : "Cleared offline. It will sync when you reconnect.",
      );
    } catch (error) {
      console.error(error);
      showToast("Could not clear completed items.");
    }
  }

  return (
    <motion.main
      className="screen list-screen"
      initial={{
        opacity: 0,
        x: reduceMotion ? 0 : 12,
      }}
      animate={{
        opacity: 1,
        x: 0,
      }}
      exit={{
        opacity: 0,
        x: reduceMotion ? 0 : 12,
      }}
      transition={{
        duration: reduceMotion ? 0 : 0.22,
      }}
    >
      <header className="list-header">
        <motion.button
          className="text-action"
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
            aria-label="Open menu"
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              setMenuOpen((currentValue) => !currentValue);
            }}
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
                transition={{ duration: 0.15 }}
              >
                <button type="button" onClick={clearCompleted}>
                  Clear completed
                </button>

                <button
                  className="danger-action"
                  type="button"
                  onClick={onDelete}
                >
                  Delete list
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <section className="list-heading">
        <h1>{list.title}</h1>

        <p>
          {remainingItems} {remainingItems === 1 ? "item" : "items"} left
        </p>
      </section>

      <section className="items">
        {loading ? (
          <>
            <ItemSkeleton />
            <ItemSkeleton />
            <ItemSkeleton />
          </>
        ) : sortedItems.length > 0 ? (
          <AnimatePresence initial={false}>
            {sortedItems.map((item) => (
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
                    stiffness: 420,
                    damping: 34,
                  },
                }}
              >
                <motion.button
                  className="check-button"
                  type="button"
                  aria-label={
                    item.completed
                      ? "Mark item incomplete"
                      : "Mark item complete"
                  }
                  animate={{
                    backgroundColor: item.completed
                      ? "#111111"
                      : "#ffffff",
                    borderColor: item.completed
                      ? "#111111"
                      : "#cfcfcf",
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
                        transition={{
                          type: "spring",
                          stiffness: 550,
                          damping: 23,
                        }}
                      >
                        ✓
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
                  whileTap={{ scale: 0.82 }}
                  onClick={() => removeItem(item)}
                >
                  ×
                </motion.button>
              </motion.article>
            ))}
          </AnimatePresence>
        ) : (
          <motion.div
            className="empty-items"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <h2>Nothing here</h2>
            <p>Add your first item below.</p>
          </motion.div>
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
          whileTap={{ scale: 0.84 }}
        >
          +
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

  return (
    <Sheet onClose={onClose}>
      <form
        className="sheet-content"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(title);
        }}
      >
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>New list</h2>

          <button type="button" onClick={onClose}>
            Done
          </button>
        </header>

        <input
          className="sheet-input"
          autoFocus
          value={title}
          maxLength={40}
          placeholder="List name"
          onChange={(event) => setTitle(event.target.value)}
        />

        <motion.button
          className="primary-button"
          type="submit"
          disabled={!title.trim()}
          whileTap={{ scale: 0.975 }}
        >
          Create list
        </motion.button>
      </form>
    </Sheet>
  );
}

function AccountSheet({
  user,
  isOnline,
  onClose,
  onSignOut,
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-content">
        <div className="sheet-handle" />

        <header className="sheet-header">
          <h2>Account</h2>

          <button type="button" onClick={onClose}>
            Done
          </button>
        </header>

        <div className="account-row">
          <div className="account-avatar">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : (
              getInitials(user)
            )}
          </div>

          <div>
            <strong>{user.displayName || "Lyst user"}</strong>
            <span>{user.email}</span>
          </div>
        </div>

        <div className="offline-access-note">
          <strong>{isOnline ? "Online" : "Offline"}</strong>
          <span>
            Offline access remains available for 60 days after the latest
            authenticated online session.
          </span>
        </div>

        <motion.button
          className="primary-button"
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

function Sheet({ children, onClose }) {
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
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{
          type: "spring",
          stiffness: 380,
          damping: 35,
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Supporting UI                                                              */
/* -------------------------------------------------------------------------- */

function OfflineExpiredScreen({
  isOnline,
  onRetry,
  onSignOut,
}) {
  return (
    <main className="offline-expired-page">
      <motion.section
        className="offline-expired-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1>Connect to continue</h1>

        <p>
          Your 60-day offline period has expired. Connect to the internet
          and refresh your authenticated session.
        </p>

        <motion.button
          className="primary-button"
          type="button"
          disabled={!isOnline}
          whileTap={{ scale: 0.975 }}
          onClick={onRetry}
        >
          {isOnline ? "Refresh access" : "Waiting for internet"}
        </motion.button>

        <button
          className="offline-sign-out"
          type="button"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </motion.section>
    </main>
  );
}

function LoadingScreen({ reduceMotion }) {
  return (
    <main className="loading-page">
      <motion.strong
        animate={
          reduceMotion
            ? {}
            : {
                opacity: [0.35, 1, 0.35],
              }
        }
        transition={{
          duration: 1.25,
          repeat: Infinity,
        }}
      >
        Lyst
      </motion.strong>
    </main>
  );
}

function SetupScreen() {
  return (
    <main className="setup-page">
      <section className="setup-card">
        <h1>Connect Firebase</h1>

        <p>
          Add your Firebase values to <code>.env.local</code>, then restart
          Vite.
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

function Toast({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="toast"
          initial={{ opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ListSkeleton() {
  return (
    <div className="list-row skeleton-row">
      <span className="skeleton skeleton-list-title" />
    </div>
  );
}

function ItemSkeleton() {
  return (
    <div className="item-row">
      <span className="skeleton skeleton-circle" />
      <span className="skeleton skeleton-item-text" />
    </div>
  );
}

function GoogleMark() {
  return (
    <span className="google-mark" aria-hidden="true">
      G
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* CSS                                                                        */
/* -------------------------------------------------------------------------- */

function GlobalStyles() {
  return <style>{styles}</style>;
}

const styles = `
  :root {
    font-family:
      "Avenir Next",
      Avenir,
      "SF Pro Display",
      "SF Pro Text",
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;

    color: #111111;
    background: #ffffff;
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
    min-height: 100%;
    background: #ffffff;
    touch-action: manipulation;
  }

  body {
    min-width: 320px;
    min-height: 100vh;
    min-height: 100dvh;
    margin: 0;
    overflow-x: hidden;
    overscroll-behavior: none;
    background: #ffffff;
  }

  body,
  button,
  input {
    font-family: inherit;
  }

  button,
  input {
    -webkit-tap-highlight-color: transparent;
  }

  button {
    color: inherit;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 2px solid #111111;
    outline-offset: 2px;
  }

  #root,
  .app {
    min-height: 100vh;
    min-height: 100dvh;
    background: #ffffff;
  }

  h1,
  h2,
  h3,
  p {
    margin-top: 0;
  }

  .screen {
    position: relative;
    width: min(100%, 620px);
    min-height: 100vh;
    min-height: 100dvh;
    margin: 0 auto;
    padding:
      max(19px, env(safe-area-inset-top))
      max(17px, env(safe-area-inset-right))
      max(86px, calc(env(safe-area-inset-bottom) + 68px))
      max(17px, env(safe-area-inset-left));
  }

  .offline-indicator {
    position: fixed;
    z-index: 80;
    top: max(8px, env(safe-area-inset-top));
    left: 50%;
    padding: 5px 10px;
    transform: translateX(-50%);
    border: 1px solid #dedede;
    border-radius: 999px;
    color: #555555;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 5px 18px rgba(0, 0, 0, 0.07);
    font-size: 0.68rem;
    font-weight: 700;
    backdrop-filter: blur(14px);
  }

  .home-header,
  .list-header,
  .list-toolbar,
  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .home-header {
    margin-bottom: 23px;
  }

  .app-label {
    display: block;
    margin-bottom: 4px;
    color: #777777;
    font-size: 0.71rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .home-header h1 {
    margin: 0;
    font-size: 2.15rem;
    font-weight: 730;
    line-height: 0.98;
    letter-spacing: -0.055em;
  }

  .avatar-button {
    display: grid;
    width: 38px;
    height: 38px;
    padding: 0;
    place-items: center;
    overflow: hidden;
    border: 1px solid #dddddd;
    border-radius: 50%;
    color: #111111;
    background: #ffffff;
    font-size: 0.72rem;
    font-weight: 750;
    cursor: pointer;
  }

  .avatar-button img,
  .account-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .list-toolbar {
    margin-bottom: 10px;
  }

  .list-toolbar > span {
    color: #777777;
    font-size: 0.81rem;
    font-weight: 560;
  }

  .create-button {
    min-height: 33px;
    padding: 0 13px;
    border: 0;
    border-radius: 11px;
    color: #ffffff;
    background: #111111;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  .lists {
    display: grid;
    gap: 0;
    border-top: 1px solid #eeeeee;
  }

  .list-row {
    display: flex;
    width: 100%;
    min-height: 58px;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px;
    text-align: left;
    border: 0;
    border-bottom: 1px solid #eeeeee;
    background: #ffffff;
    cursor: pointer;
  }

  .list-title-text {
    min-width: 0;
    overflow: hidden;
    font-size: 1rem;
    font-weight: 640;
    letter-spacing: -0.015em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-arrow {
    margin-left: 12px;
    color: #aaaaaa;
    font-size: 1.55rem;
    font-weight: 300;
    line-height: 1;
  }

  .floating-button {
    position: fixed;
    right: max(17px, calc((100vw - 620px) / 2 + 17px));
    bottom: max(16px, calc(env(safe-area-inset-bottom) + 10px));
    display: none;
    width: 48px;
    height: 48px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 16px;
    color: #ffffff;
    background: #111111;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
    font-size: 1.55rem;
    font-weight: 300;
    cursor: pointer;
  }

  .empty-state {
    display: flex;
    min-height: 300px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .empty-state h2,
  .empty-items h2 {
    margin-bottom: 6px;
    font-size: 1.08rem;
    font-weight: 680;
    letter-spacing: -0.025em;
  }

  .empty-state p,
  .empty-items p {
    margin-bottom: 18px;
    color: #777777;
    font-size: 0.85rem;
  }

  .primary-button {
    display: flex;
    width: 100%;
    min-height: 45px;
    align-items: center;
    justify-content: center;
    padding: 0 15px;
    border: 0;
    border-radius: 13px;
    color: #ffffff;
    background: #111111;
    font-size: 0.86rem;
    font-weight: 700;
    cursor: pointer;
  }

  .primary-button:disabled,
  .google-button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .small-button {
    width: auto;
    min-height: 41px;
  }

  .list-header {
    margin-bottom: 23px;
  }

  .text-action {
    padding: 7px 0;
    border: 0;
    color: #111111;
    background: transparent;
    font-size: 0.84rem;
    font-weight: 680;
    cursor: pointer;
  }

  .menu-container {
    position: relative;
  }

  .menu-button {
    width: 38px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: #f4f4f4;
    font-size: 0.82rem;
    font-weight: 760;
    letter-spacing: 0.04em;
    cursor: pointer;
  }

  .context-menu {
    position: absolute;
    z-index: 20;
    top: 40px;
    right: 0;
    width: 168px;
    padding: 5px;
    border: 1px solid #e4e4e4;
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 16px 42px rgba(0, 0, 0, 0.12);
    backdrop-filter: blur(18px);
  }

  .context-menu button {
    width: 100%;
    padding: 10px;
    text-align: left;
    border: 0;
    border-radius: 9px;
    background: transparent;
    font-size: 0.78rem;
    font-weight: 620;
    cursor: pointer;
  }

  .context-menu button:hover {
    background: #f3f3f3;
  }

  .context-menu .danger-action {
    color: #c92323;
  }

  .list-heading {
    margin-bottom: 20px;
  }

  .list-heading h1 {
    max-width: 100%;
    margin-bottom: 6px;
    overflow: hidden;
    font-size: 2.05rem;
    font-weight: 730;
    line-height: 1;
    letter-spacing: -0.055em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-heading p {
    margin: 0;
    color: #777777;
    font-size: 0.81rem;
  }

  .items {
    min-height: 280px;
    border-top: 1px solid #eeeeee;
  }

  .item-row {
    display: flex;
    min-height: 53px;
    gap: 11px;
    align-items: center;
    border-bottom: 1px solid #eeeeee;
  }

  .check-button {
    display: grid;
    width: 23px;
    height: 23px;
    flex: 0 0 auto;
    padding: 0;
    place-items: center;
    border: 1.5px solid #cfcfcf;
    border-radius: 50%;
    color: #ffffff;
    background: #ffffff;
    cursor: pointer;
  }

  .check-button span {
    display: grid;
    place-items: center;
    font-size: 0.72rem;
    font-weight: 800;
  }

  .item-text {
    min-width: 0;
    flex: 1;
    padding: 15px 0;
    overflow: hidden;
    text-align: left;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .item-text span {
    position: relative;
    display: inline;
    font-size: 0.98rem;
    font-weight: 540;
    line-height: 1.35;
    transition:
      color 180ms ease,
      opacity 180ms ease;
  }

  .item-text span::after {
    position: absolute;
    top: 51%;
    left: 0;
    width: 100%;
    height: 1px;
    content: "";
    transform: scaleX(0);
    transform-origin: left center;
    background: currentColor;
    transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .item-row.completed .item-text span {
    color: #999999;
    opacity: 0.72;
  }

  .item-row.completed .item-text span::after {
    transform: scaleX(1);
  }

  .delete-item-button {
    display: grid;
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 9px;
    color: #999999;
    background: transparent;
    font-size: 1.25rem;
    font-weight: 300;
    cursor: pointer;
  }

  .delete-item-button:hover {
    color: #111111;
    background: #f3f3f3;
  }

  .empty-items {
    display: flex;
    min-height: 280px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .add-item-bar {
    position: fixed;
    z-index: 10;
    right: max(13px, calc((100vw - 620px) / 2 + 13px));
    bottom: max(11px, env(safe-area-inset-bottom));
    left: max(13px, calc((100vw - 620px) / 2 + 13px));
    display: flex;
    max-width: 594px;
    min-height: 51px;
    gap: 8px;
    align-items: center;
    margin: auto;
    padding: 5px 5px 5px 14px;
    border: 1px solid #dddddd;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.97);
    box-shadow: 0 11px 32px rgba(0, 0, 0, 0.11);
    backdrop-filter: blur(18px);
  }

  .add-item-bar input {
    min-width: 0;
    flex: 1;
    padding: 0;
    border: 0;
    outline: 0;
    color: #111111;
    background: transparent;
    font-size: 0.94rem;
  }

  .add-item-bar input::placeholder {
    color: #999999;
  }

  .add-item-bar button {
    display: grid;
    width: 40px;
    height: 40px;
    flex: 0 0 auto;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 12px;
    color: #ffffff;
    background: #111111;
    font-size: 1.4rem;
    font-weight: 300;
    cursor: pointer;
  }

  .add-item-bar button:disabled {
    opacity: 0.25;
    cursor: default;
  }

  .sheet-backdrop {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding:
      8px
      8px
      max(8px, env(safe-area-inset-bottom));
    background: rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(5px);
  }

  .sheet {
    width: min(100%, 460px);
    border: 1px solid #e4e4e4;
    border-radius: 23px;
    background: #ffffff;
    box-shadow: 0 24px 65px rgba(0, 0, 0, 0.18);
  }

  .sheet-content {
    padding: 9px 17px 18px;
  }

  .sheet-handle {
    width: 34px;
    height: 4px;
    margin: 0 auto 17px;
    border-radius: 99px;
    background: #d4d4d4;
  }

  .sheet-header {
    margin-bottom: 17px;
  }

  .sheet-header h2 {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 720;
    letter-spacing: -0.04em;
  }

  .sheet-header button {
    padding: 7px 0 7px 12px;
    border: 0;
    background: transparent;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }

  .sheet-input,
  .auth-form input {
    width: 100%;
    min-height: 45px;
    padding: 0 13px;
    border: 1px solid #dddddd;
    border-radius: 12px;
    outline: 0;
    color: #111111;
    background: #ffffff;
    font-size: 0.88rem;
  }

  .sheet-input {
    margin-bottom: 12px;
  }

  .sheet-input:focus,
  .auth-form input:focus {
    border-color: #111111;
  }

  .account-row {
    display: flex;
    gap: 11px;
    align-items: center;
    margin-bottom: 12px;
    padding: 11px 0;
    border-top: 1px solid #eeeeee;
    border-bottom: 1px solid #eeeeee;
  }

  .account-avatar {
    display: grid;
    width: 41px;
    height: 41px;
    flex: 0 0 auto;
    place-items: center;
    overflow: hidden;
    border-radius: 50%;
    color: #ffffff;
    background: #111111;
    font-size: 0.7rem;
    font-weight: 750;
  }

  .account-row > div:last-child {
    min-width: 0;
  }

  .account-row strong,
  .account-row span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-row strong {
    margin-bottom: 3px;
    font-size: 0.88rem;
  }

  .account-row span {
    color: #777777;
    font-size: 0.74rem;
  }

  .offline-access-note {
    margin-bottom: 14px;
    padding: 11px 0;
    border-bottom: 1px solid #eeeeee;
  }

  .offline-access-note strong,
  .offline-access-note span {
    display: block;
  }

  .offline-access-note strong {
    margin-bottom: 4px;
    font-size: 0.82rem;
  }

  .offline-access-note span {
    color: #777777;
    font-size: 0.73rem;
    line-height: 1.45;
  }

  .auth-page,
  .setup-page,
  .loading-page,
  .offline-expired-page {
    min-height: 100vh;
    min-height: 100dvh;
    padding:
      max(16px, env(safe-area-inset-top))
      max(14px, env(safe-area-inset-right))
      max(16px, env(safe-area-inset-bottom))
      max(14px, env(safe-area-inset-left));
    background: #ffffff;
  }

  .auth-page,
  .setup-page,
  .offline-expired-page {
    display: grid;
    place-items: center;
  }

  .auth-panel,
  .offline-expired-panel {
    width: min(100%, 330px);
    padding: 22px 19px 19px;
    border: 1px solid #e6e6e6;
    border-radius: 20px;
    background: #ffffff;
    box-shadow: 0 18px 55px rgba(0, 0, 0, 0.07);
  }

  .offline-expired-panel {
    text-align: center;
  }

  .offline-expired-panel h1 {
    margin-bottom: 8px;
    font-size: 1.65rem;
    letter-spacing: -0.05em;
  }

  .offline-expired-panel p {
    margin-bottom: 18px;
    color: #777777;
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .offline-sign-out {
    margin-top: 13px;
    padding: 5px;
    border: 0;
    color: #777777;
    background: transparent;
    font-size: 0.72rem;
    font-weight: 650;
    cursor: pointer;
  }

  .auth-name {
    margin-bottom: 23px;
    font-size: 1.4rem;
    font-weight: 780;
    letter-spacing: -0.055em;
  }

  .auth-heading {
    margin-bottom: 18px;
  }

  .auth-heading h1 {
    margin-bottom: 5px;
    font-size: 1.65rem;
    font-weight: 730;
    line-height: 1;
    letter-spacing: -0.05em;
  }

  .auth-heading p {
    margin: 0;
    color: #777777;
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .google-button {
    display: flex;
    width: 100%;
    min-height: 44px;
    gap: 9px;
    align-items: center;
    justify-content: center;
    border: 1px solid #dddddd;
    border-radius: 12px;
    color: #111111;
    background: #ffffff;
    font-size: 0.8rem;
    font-weight: 670;
    cursor: pointer;
  }

  .google-mark {
    display: grid;
    width: 19px;
    height: 19px;
    place-items: center;
    border: 1px solid #d8d8d8;
    border-radius: 50%;
    font-size: 0.68rem;
    font-weight: 800;
  }

  .divider {
    display: flex;
    align-items: center;
    margin: 15px 0;
    color: #999999;
    font-size: 0.66rem;
  }

  .divider::before,
  .divider::after {
    height: 1px;
    flex: 1;
    content: "";
    background: #e8e8e8;
  }

  .divider span {
    padding: 0 9px;
  }

  .auth-form {
    display: grid;
    gap: 9px;
  }

  .forgot-button,
  .switch-button {
    padding: 0;
    border: 0;
    color: #666666;
    background: transparent;
    font-size: 0.71rem;
    font-weight: 650;
    cursor: pointer;
  }

  .forgot-button {
    margin-top: 1px;
    justify-self: end;
  }

  .switch-button {
    display: block;
    width: 100%;
    margin-top: 15px;
    text-align: center;
  }

  .loading-page {
    display: grid;
    place-items: center;
  }

  .loading-page strong {
    font-size: 1.35rem;
    letter-spacing: -0.05em;
  }

  .setup-card {
    width: min(100%, 420px);
    padding: 22px;
    border: 1px solid #e4e4e4;
    border-radius: 18px;
  }

  .setup-card h1 {
    margin-bottom: 7px;
    font-size: 1.6rem;
    letter-spacing: -0.045em;
  }

  .setup-card p {
    color: #777777;
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .setup-card code {
    padding: 2px 4px;
    border-radius: 4px;
    background: #f1f1f1;
  }

  .setup-card pre {
    margin: 17px 0 0;
    padding: 13px;
    overflow-x: auto;
    border-radius: 11px;
    color: #ffffff;
    background: #111111;
    font-size: 0.66rem;
    line-height: 1.65;
  }

  .toast {
    position: fixed;
    z-index: 300;
    right: 14px;
    bottom: max(16px, calc(env(safe-area-inset-bottom) + 8px));
    left: 14px;
    width: fit-content;
    max-width: calc(100vw - 28px);
    margin: auto;
    padding: 10px 13px;
    border-radius: 11px;
    color: #ffffff;
    background: rgba(17, 17, 17, 0.95);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
    font-size: 0.75rem;
    font-weight: 650;
    backdrop-filter: blur(14px);
  }

  .skeleton {
    display: block;
    overflow: hidden;
    border-radius: 99px;
    background:
      linear-gradient(
        90deg,
        #ededed 25%,
        #f8f8f8 45%,
        #ededed 65%
      );
    background-size: 250% 100%;
    animation: shimmer 1.2s infinite linear;
  }

  .skeleton-row {
    cursor: default;
  }

  .skeleton-list-title {
    width: 42%;
    height: 10px;
  }

  .skeleton-circle {
    width: 23px;
    height: 23px;
  }

  .skeleton-item-text {
    width: min(58%, 260px);
    height: 10px;
  }

  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }

    to {
      background-position: -100% 0;
    }
  }

  @media (max-width: 600px) {
    .screen {
      padding-top: max(17px, env(safe-area-inset-top));
      padding-right: 15px;
      padding-left: 15px;
    }

    .home-header {
      margin-bottom: 20px;
    }

    .home-header h1,
    .list-heading h1 {
      font-size: 2rem;
    }

    .create-button {
      display: none;
    }

    .floating-button {
      display: grid;
    }

    .auth-panel {
      width: min(100%, 315px);
      padding: 20px 17px 17px;
      border-radius: 18px;
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.065);
    }

    .auth-name {
      margin-bottom: 20px;
      font-size: 1.3rem;
    }

    .auth-heading h1 {
      font-size: 1.52rem;
    }
  }

  @media (min-width: 760px) {
    .screen {
      padding-top: 38px;
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