import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GoogleAuthProvider, browserLocalPersistence, createUserWithEmailAndPassword, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { getAuthError } from "../lib/appUtils.js";
import { auth } from "../lib/firebase.js";
import { refreshOfflineAccess } from "../services/offlineAccess.js";
import { PastelLoader } from "../components/SupportingUI.jsx";

export function AuthScreen({ showToast }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);

  async function preparePersistence() {
    await setPersistence(auth, browserLocalPersistence);
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
      await refreshOfflineAccess();

      // Keep the loader visible until App receives the authenticated user
      // and unmounts this screen. This prevents the login card flashing back.
    } catch (error) {
      console.error(error);
      showToast(getAuthError(error));
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

      await refreshOfflineAccess();

      // Keep the loader visible until App switches to the signed-in view.
    } catch (error) {
      console.error(error);
      showToast(getAuthError(error));
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

  if (working) {
    return (
      <PastelLoader
        label={mode === "signup" ? "Creating your Lyst" : "Opening your Lyst"}
      />
    );
  }

  return (
    <main className="auth-page auth-page-balanced">
      <div className="auth-decoration auth-decoration-one" aria-hidden="true" />
      <div className="auth-decoration auth-decoration-two" aria-hidden="true" />

      <motion.section
        className="auth-panel auth-panel-balanced"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 450,
          damping: 22,
        }}
      >
        <div className="auth-top-accent" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="auth-brand-balanced auth-brand-text-only">
          <div>
            <div className="auth-name">Lyst</div>
            <div className="auth-kicker">
              little lists, less brain clutter
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            className="auth-heading auth-heading-balanced"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{
              type: "spring",
              stiffness: 540,
              damping: 24,
            }}
          >
            <h1>
              {mode === "signin" ? "Welcome back" : "Make it yours"}
            </h1>

            <p>
              {mode === "signin"
                ? "Your lists are right where you left them."
                : "A calm little home for everything you want to remember."}
            </p>
          </motion.div>
        </AnimatePresence>

        <motion.button
          className="google-button google-button-balanced"
          type="button"
          disabled={working}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.975 }}
          onClick={handleGoogle}
        >
          <span className="google-mark">G</span>
          Continue with Google
        </motion.button>

        <div className="divider">
          <span>or use email</span>
        </div>

        <form className="auth-form auth-form-balanced" onSubmit={handleSubmit}>
          <label className="auth-field-balanced">
            <span>Email</span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="auth-field-balanced">
            <span className="auth-field-label-row">
              <span>Password</span>

              {mode === "signin" && (
                <button
                  className="forgot-button forgot-inline"
                  type="button"
                  onClick={handlePasswordReset}
                >
                  Forgot password?
                </button>
              )}
            </span>

            <input
              type="password"
              value={password}
              minLength={6}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              placeholder="Password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <motion.button
            className="primary-button auth-primary-button auth-primary-balanced"
            type="submit"
            disabled={working}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.975 }}
          >
            {working
              ? "Please wait..."
              : mode === "signup"
                ? "Create my Lyst"
                : "Open my Lyst"}
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
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </motion.section>
    </main>
  );
}
