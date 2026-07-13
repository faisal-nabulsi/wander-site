/* ==========================================================================
   Wander — Firebase Authentication (static site, CDN modular SDK v10)
   --------------------------------------------------------------------------
   Loaded on every page as: <script type="module" src="auth.js"></script>

   This file:
     • initialises Firebase with your web config (see PLACEHOLDER below)
     • exposes helpers used by login.html / account.html
     • keeps the nav in sync with auth state on every page (site-wide):
         signed out → shows a "Log in" link
         signed in  → swaps it for the user's email → account.html

   NOTE ON SAFETY: the firebaseConfig values below (apiKey, etc.) are PUBLIC
   and safe to commit to a public repo. That is normal and expected for
   Firebase web apps — the apiKey only identifies your project, it is not a
   secret. Access is controlled by Firebase Auth + your security rules.
   (Never share your Firebase *account* password, though.)
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* ==========================================================================
   1) PASTE YOUR FIREBASE CONFIG HERE
   --------------------------------------------------------------------------
   Get this from: Firebase Console → Project settings → "Your apps" → Web app
   → "SDK setup and configuration" → Config. Replace every "PASTE_YOURS"
   value. See ACCOUNT-SETUP.md for step-by-step instructions.
   ========================================================================== */
const firebaseConfig = {
  apiKey:            "AIzaSyDm9w7mIq0AinaCAj1mDGPqxpkyfkxHCEs",
  authDomain:        "wanderspoofer.firebaseapp.com",
  projectId:         "wanderspoofer",
  storageBucket:     "wanderspoofer.firebasestorage.app",
  messagingSenderId: "537670730528",
  appId:             "1:537670730528:web:aef337867163d701984d45",
};

/* ==========================================================================
   2) INIT
   ========================================================================== */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

/* Human-friendly messages for the Firebase error codes we expect. */
function friendlyError(err) {
  const code = (err && err.code) || "";
  const map = {
    "auth/invalid-email":          "That email address doesn't look right.",
    "auth/user-disabled":          "This account has been disabled.",
    "auth/user-not-found":         "No account found with that email.",
    "auth/wrong-password":         "Wrong email or password.",
    "auth/invalid-credential":     "Wrong email or password.",
    "auth/email-already-in-use":   "An account already exists for that email. Try logging in.",
    "auth/weak-password":          "Password should be at least 6 characters.",
    "auth/missing-password":       "Please enter a password.",
    "auth/popup-closed-by-user":   "Sign-in was cancelled.",
    "auth/popup-blocked":          "Your browser blocked the popup. Allow popups and try again.",
    "auth/too-many-requests":      "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/operation-not-allowed":  "This sign-in method isn't enabled in Firebase yet.",
    "auth/invalid-api-key":        "Firebase isn't configured yet — paste your config into auth.js.",
    "auth/configuration-not-found":"Firebase isn't configured yet — see ACCOUNT-SETUP.md.",
  };
  return map[code] || (err && err.message) || "Something went wrong. Please try again.";
}

/* ==========================================================================
   3) AUTH ACTIONS (used by login.html / account.html)
   Each returns a Promise; callers await + catch to show friendlyError().
   ========================================================================== */
export function signUpEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}
export function loginEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
export function loginGoogle() {
  return signInWithPopup(auth, googleProvider);
}
export function logout() {
  return signOut(auth);
}

/* Expose the raw pieces + helper so page scripts can import them. */
export { auth, onAuthStateChanged, friendlyError };

/* ==========================================================================
   4) SITE-WIDE NAV: reflect auth state on every page
   --------------------------------------------------------------------------
   Every page's nav includes a "Log in" link with id="navAuthLink" (desktop)
   and id="navAuthLinkMobile" (mobile). When signed in we relabel them to the
   user's email and point them at account.html; when signed out they read
   "Log in" and point at login.html.
   ========================================================================== */
function paintNav(user) {
  const links = [
    document.getElementById("navAuthLink"),
    document.getElementById("navAuthLinkMobile"),
  ];
  links.forEach((el) => {
    if (!el) return;
    if (user) {
      // Signed in — show the account entry (email, truncated if very long).
      const label = user.email || "Account";
      el.textContent = label;
      el.title = label;
      el.setAttribute("href", "account.html");
      el.classList.add("nav-auth-in");
    } else {
      el.textContent = "Log in";
      el.removeAttribute("title");
      el.setAttribute("href", "login.html");
      el.classList.remove("nav-auth-in");
    }
  });
}

/* Run once the DOM is ready (module scripts are deferred, but be safe). */
function ready(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn);
  } else {
    fn();
  }
}

ready(() => {
  // Paint immediately in the signed-out state so the link is never blank,
  // then let onAuthStateChanged correct it once Firebase resolves.
  paintNav(null);
  onAuthStateChanged(auth, (user) => paintNav(user));
});
