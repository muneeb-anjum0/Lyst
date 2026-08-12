export function getEmailInitial(user) {
  return (user?.email?.trim()?.charAt(0) || "L").toUpperCase();
}

export function getAuthError(error) {
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

export function normalize(value) {
  return value.trim().toLowerCase();
}

export function cloneFirestoreData({ id, ...data }) {
  void id;
  return data;
}
