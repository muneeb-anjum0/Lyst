import { initializeApp } from "firebase/app";
import { Capacitor } from "@capacitor/core";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Object.values(firebaseConfig).every(Boolean);

let auth = null;
let db = null;

if (firebaseReady) {
  const firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);

  try {
    db = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        cacheSizeBytes: 20 * 1024 * 1024,
        tabManager: Capacitor.isNativePlatform()
          ? persistentSingleTabManager()
          : persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    console.warn("Persistent Firestore cache unavailable:", error);
    db = getFirestore(firebaseApp);
  }
}

export { auth, db };
