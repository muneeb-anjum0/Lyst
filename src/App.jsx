import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import "./styles.css";
import {
  clearOfflineAccess,
  offlineAccessExpired,
  refreshOfflineAccess,
} from "./services/offlineAccess.js";
import { useVisualViewportBridge } from "./hooks/useVisualViewportBridge.js";
import {
  LoadingScreen,
  OfflineExpiredScreen,
  SetupScreen,
  Toast,
  UndoBar,
  UpdateBanner,
} from "./components/SupportingUI.jsx";
import {
  AccountSheet,
  ArchiveSheet,
  ConfirmationSheet,
  EditListSheet,
  NewListSheet,
  OptimizeListsSheet,
  SearchSheet,
} from "./components/Sheets.jsx";

import {
  cloneFirestoreData,
} from "./lib/appUtils.js";

import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signOut,
} from "firebase/auth";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { auth, db, firebaseReady } from "./lib/firebase.js";
import { AuthScreen } from "./screens/AuthScreen.jsx";
import { HomeScreen } from "./screens/HomeScreen.jsx";
import { ListScreen } from "./screens/ListScreen.jsx";

export default function App() {
  const reduceMotion = useReducedMotion();
  useVisualViewportBridge();

  const [updateAvailable, setUpdateAvailable] = useState(Boolean(window.__LYST_UPDATE_AVAILABLE__));
  const [updatingApp, setUpdatingApp] = useState(false);

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(firebaseReady);
  const [offlineExpired, setOfflineExpired] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [selectedList, setSelectedList] = useState(null);

  const [newListOpen, setNewListOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [optimizeListsOpen, setOptimizeListsOpen] = useState(false);

  const [editList, setEditList] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  const [toast, setToast] = useState("");
  const [undoAction, setUndoAction] = useState(null);

  const toastTimer = useRef(null);
  const undoTimer = useRef(null);

  useEffect(() => {
    function handleUpdateAvailable() { setUpdateAvailable(true); }
    window.addEventListener("lyst:update-available", handleUpdateAvailable);
    if (window.__LYST_UPDATE_AVAILABLE__) setUpdateAvailable(true);
    return () => window.removeEventListener("lyst:update-available", handleUpdateAvailable);
  }, []);

  async function applyAppUpdate() {
    if (updatingApp) return;
    try {
      setUpdatingApp(true);
      if (typeof window.__LYST_APPLY_UPDATE__ === "function") {
        await window.__LYST_APPLY_UPDATE__();
        return;
      }
      window.location.reload();
    } catch (error) {
      console.error("Could not apply Lyst update:", error);
      setUpdatingApp(false);
      showToast("Could not update Lyst. Try reopening the app.");
    }
  }

  function showToast(message) {
    if (!message) return;

    setToast(message);
    window.clearTimeout(toastTimer.current);

    toastTimer.current = window.setTimeout(() => {
      setToast("");
    }, 2300);
  }

  function showUndo(message, action) {
    window.clearTimeout(undoTimer.current);

    setUndoAction({
      message,
      action,
    });

    undoTimer.current = window.setTimeout(() => {
      setUndoAction(null);
    }, 6000);
  }

  async function performUndo() {
    if (!undoAction?.action) return;

    const action = undoAction.action;

    setUndoAction(null);
    window.clearTimeout(undoTimer.current);

    try {
      await action();
      showToast("Restored.");
    } catch (error) {
      console.error(error);
      showToast("Could not restore it.");
    }
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

    async function refreshSession() {
      try {
        await auth.currentUser.getIdToken(true);
        await refreshOfflineAccess();

        if (!cancelled) {
          setOfflineExpired(false);
          setUser(auth.currentUser);
        }
      } catch (error) {
        console.warn("Could not refresh session:", error);
      }
    }

    refreshSession();

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


  useEffect(() => {
    if (!user || !db || !isOnline || listsLoading) return;

    const missingCounts = lists.filter(
      (list) => !Number.isFinite(Number(list.itemCount)),
    );

    if (missingCounts.length === 0) return;

    let cancelled = false;

    async function backfillListCounts() {
      for (const list of missingCounts.slice(0, 100)) {
        if (cancelled) return;

        try {
          const snapshot = await getDocs(
            collection(
              db,
              "users",
              user.uid,
              "lists",
              list.id,
              "items",
            ),
          );

          let completedCount = 0;

          snapshot.forEach((itemDocument) => {
            if (itemDocument.data()?.completed) {
              completedCount += 1;
            }
          });

          await updateDoc(
            doc(db, "users", user.uid, "lists", list.id),
            {
              itemCount: snapshot.size,
              completedCount,
            },
          );
        } catch (error) {
          console.warn(
            `Could not backfill counts for list ${list.id}:`,
            error,
          );
        }
      }
    }

    backfillListCounts();

    return () => {
      cancelled = true;
    };
  }, [user, isOnline, lists, listsLoading]);

  async function createList(title, initialItems = []) {
    const cleanTitle = title.trim();

    if (!cleanTitle || !user || !db) return;

    try {
      const reference = await addDoc(
        collection(db, "users", user.uid, "lists"),
        {
          title: cleanTitle,
          archived: false,
          itemCount: Array.isArray(initialItems)
            ? Math.min(
                30,
                initialItems.filter((item) =>
                  String(item?.text || "").trim(),
                ).length,
              )
            : 0,
          completedCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      );

      if (Array.isArray(initialItems) && initialItems.length > 0) {
        const batch = writeBatch(db);
        const itemsCollection = collection(
          db,
          "users",
          user.uid,
          "lists",
          reference.id,
          "items",
        );

        initialItems.slice(0, 30).forEach((item) => {
          const cleanText = String(item?.text || "").trim();

          if (!cleanText) return;

          const itemReference = doc(itemsCollection);

          batch.set(itemReference, {
            text: cleanText.slice(0, 200),
            quantity:
              item?.quantity === null ||
              item?.quantity === undefined ||
              item?.quantity === ""
                ? null
                : Number(item.quantity),
            quantityUnit: String(item?.quantityUnit || "").slice(0, 20),
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
      }

      setNewListOpen(false);

      setSelectedList({
        id: reference.id,
        title: cleanTitle,
        archived: false,
      });

      if (!navigator.onLine) {
        showToast("Saved offline. It will sync later.");
      }
    } catch (error) {
      console.error(error);
      showToast("Could not create the list.");
    }
  }

  async function renameList(list, title) {
    const cleanTitle = title.trim();

    if (!cleanTitle || !user || !db) return;

    try {
      await updateDoc(
        doc(db, "users", user.uid, "lists", list.id),
        {
          title: cleanTitle,
          updatedAt: serverTimestamp(),
        },
      );

      setEditList(null);
      showToast("List renamed.");
    } catch (error) {
      console.error(error);
      showToast("Could not rename the list.");
    }
  }

  async function toggleArchive(list) {
    if (!user || !db) return;

    const nextArchived = !list.archived;

    try {
      await updateDoc(
        doc(db, "users", user.uid, "lists", list.id),
        {
          archived: nextArchived,
          updatedAt: serverTimestamp(),
        },
      );

      if (selectedList?.id === list.id) {
        setSelectedList(null);
      }

      showToast(nextArchived ? "List archived." : "List restored.");
    } catch (error) {
      console.error(error);
      showToast("Could not update the archive.");
    }
  }

  function requestDeleteList(list) {
    setConfirmation({
      title: "Delete list?",
      message: `"${list.title}" and all of its items will be removed.`,
      confirmLabel: "Delete",
      danger: true,
      action: () => deleteList(list),
    });
  }

  async function deleteList(list) {
    if (!user || !db) return;

    const listReference = doc(
      db,
      "users",
      user.uid,
      "lists",
      list.id,
    );

    const itemsReference = collection(
      db,
      "users",
      user.uid,
      "lists",
      list.id,
      "items",
    );

    let deletedItems = [];

    try {
      const itemSnapshot = await new Promise((resolve, reject) => {
        let unsubscribe = () => {};

        unsubscribe = onSnapshot(
          itemsReference,
          (snapshot) => {
            unsubscribe();
            resolve(snapshot);
          },
          reject,
        );
      });

      deletedItems = itemSnapshot.docs.map((itemDocument) => ({
        id: itemDocument.id,
        data: cloneFirestoreData(itemDocument.data()),
      }));

      const batch = writeBatch(db);

      deletedItems.forEach((item) => {
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

      batch.delete(listReference);

      await batch.commit();

      setConfirmation(null);
      setSelectedList(null);

      showUndo("List deleted.", async () => {
        await setDoc(listReference, {
          title: list.title,
          archived: Boolean(list.archived),
          itemCount: deletedItems.length,
          completedCount: deletedItems.filter(
            (item) => Boolean(item.data?.completed),
          ).length,
          createdAt: list.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const restoreBatch = writeBatch(db);

        deletedItems.forEach((item) => {
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
      });
    } catch (error) {
      console.error(error);
      setConfirmation(null);
      showToast("Could not delete the list.");
    }
  }

  async function handleSignOut() {
    await clearOfflineAccess();
    await signOut(auth);

    setAccountOpen(false);
  }

  const activeLists = useMemo(
    () => lists.filter((list) => !list.archived),
    [lists],
  );

  const archivedLists = useMemo(
    () => lists.filter((list) => list.archived),
    [lists],
  );

  if (authLoading) {
    return (
      <>
        <LoadingScreen reduceMotion={reduceMotion} />
      </>
    );
  }

  if (!firebaseReady) {
    return (
      <>
        <SetupScreen />
      </>
    );
  }

  if (offlineExpired) {
    return (
      <>

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

        <AuthScreen showToast={showToast} />

        <Toast message={toast} />
      </>
    );
  }

  return (
    <>

      <div className="app">
        <UpdateBanner
          visible={updateAvailable}
          updating={updatingApp}
          onUpdate={applyAppUpdate}
        />

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
              onRename={() => setEditList(selectedList)}
              onArchive={() => toggleArchive(selectedList)}
              onDelete={() => requestDeleteList(selectedList)}
              showToast={showToast}
              showUndo={showUndo}
            />
          ) : (
            <HomeScreen
              key="home-screen"
              lists={activeLists}
              archivedCount={archivedLists.length}
              loading={listsLoading}
              user={user}
              reduceMotion={reduceMotion}
              onOpenList={setSelectedList}
              onCreate={() => setNewListOpen(true)}
              onAccount={() => setAccountOpen(true)}
              onSearch={() => setSearchOpen(true)}
              onArchive={() => setArchiveOpen(true)}
              onOptimize={() => setOptimizeListsOpen(true)}
              onRename={setEditList}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {newListOpen && (
            <NewListSheet
              onClose={() => setNewListOpen(false)}
              onCreate={createList}
              showToast={showToast}
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

          {editList && (
            <EditListSheet
              list={editList}
              onClose={() => setEditList(null)}
              onSave={(title) => renameList(editList, title)}
            />
          )}

          {searchOpen && (
            <SearchSheet
              user={user}
              lists={activeLists}
              onClose={() => setSearchOpen(false)}
              onOpenList={(list) => {
                setSearchOpen(false);
                setSelectedList(list);
              }}
            />
          )}

          {archiveOpen && (
            <ArchiveSheet
              lists={archivedLists}
              onClose={() => setArchiveOpen(false)}
              onRestore={toggleArchive}
              onOpenList={(list) => {
                setArchiveOpen(false);
                setSelectedList(list);
              }}
            />
          )}

          {optimizeListsOpen && (
            <OptimizeListsSheet
              lists={activeLists}
              user={user}
              onClose={() => setOptimizeListsOpen(false)}
              showToast={showToast}
            />
          )}

          {confirmation && (
            <ConfirmationSheet
              confirmation={confirmation}
              onClose={() => setConfirmation(null)}
            />
          )}
        </AnimatePresence>

        <Toast message={toast} />

        <UndoBar
          undoAction={undoAction}
          onUndo={performUndo}
        />
      </div>
    </>
  );
}
