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
  OAuthProvider,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  multiFactor,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
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
    // --- Two-factor (TOTP) ---
    // "auth/multi-factor-auth-required" is NOT really an error: it signals the
    // sign-in needs a 6-digit code. Login pages catch it specially (see
    // resolveMfaSignIn) rather than showing this text, but we map it anyway so a
    // stray path still reads sensibly.
    "auth/multi-factor-auth-required": "Enter the 6-digit code from your authenticator app to finish signing in.",
    "auth/invalid-verification-code":  "That 6-digit code was wrong or expired.",
    "auth/totp-challenge-timeout":     "That code timed out. Grab a fresh one from your authenticator app and try again.",
    "auth/second-factor-already-in-use":"That authenticator is already set up on this account.",
    "auth/requires-recent-login":      "For your security, please log out and log back in, then try again.",
  };
  return map[code] || (err && err.message) || "Something went wrong. Please try again.";
}

/* ==========================================================================
   3) AUTH ACTIONS (used by login.html / account.html)
   Each returns a Promise; callers await + catch to show friendlyError().
   ========================================================================== */
export async function signUpEmail(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  // Send a "confirm your email" verification link right after sign-up.
  try { await sendEmailVerification(cred.user); } catch (e) { /* non-fatal */ }
  return cred;
}

/** Re-send the email-verification link to the currently signed-in user. */
export async function resendVerification() {
  if (auth.currentUser) { await sendEmailVerification(auth.currentUser); }
}
export function loginEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
/** Send a password-reset email. For a Google-only account this lets the user SET a
 *  password for the first time, so they can then also sign in with email + password. */
export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}
export function loginGoogle() {
  return signInWithPopup(auth, googleProvider);
}
/** Sign in with Apple via a popup. Requests the user's email + name scopes.
 *  Returns auth/operation-not-allowed until the Apple provider is enabled in
 *  the Firebase Console (Authentication → Sign-in method → Apple). */
export function loginApple() {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return signInWithPopup(auth, provider);
}
export function logout() {
  return signOut(auth);
}

/* ==========================================================================
   3b) TWO-FACTOR AUTHENTICATION (TOTP / authenticator apps)
   --------------------------------------------------------------------------
   Enrollment happens on the account page; the sign-in challenge is handled by
   the login + app-login pages. These wrap Firebase's multi-factor APIs.

   IMPORTANT: TOTP multi-factor requires the project to be on Google Cloud
   Identity Platform with TOTP enabled. Until the owner upgrades + enables it,
   these calls return errors (typically auth/operation-not-allowed or an
   admin-restricted-operation). The UI degrades gracefully — nothing else on
   the site breaks.
   ========================================================================== */

/** Begin TOTP enrollment for a signed-in user.
 *  Returns { secret, qrUrl, secretKey }:
 *    • secret    — the TotpSecret object; pass it back to enrollTotpFinish.
 *    • qrUrl     — an otpauth:// URL to render as a QR code.
 *    • secretKey — the base32 key, for manual entry when a camera isn't handy.
 *  Can throw auth/requires-recent-login — the caller should ask the user to
 *  re-authenticate (log out + back in) and retry. */
export async function enrollTotpStart(user) {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  return {
    secret,
    qrUrl: secret.generateQrCodeUrl(user.email || "Wander", "Wander"),
    secretKey: secret.secretKey,
  };
}

/** Finish TOTP enrollment: verify the first code and register the factor.
 *  `secret` is the object returned by enrollTotpStart; `code` is the 6-digit
 *  code from the authenticator app; `displayName` labels the factor. */
export async function enrollTotpFinish(user, secret, code, displayName) {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim());
  await multiFactor(user).enroll(assertion, displayName || "Authenticator app");
}

/** List the user's enrolled second factors: [{ uid, displayName, factorId }]. */
export function listFactors(user) {
  return multiFactor(user).enrolledFactors;
}

/** Remove one enrolled factor by its uid. */
export async function unenrollFactor(user, uid) {
  await multiFactor(user).unenroll(uid);
}

/** Complete a sign-in that was interrupted by auth/multi-factor-auth-required.
 *  Pass the original error and the 6-digit code; resolves to a UserCredential
 *  on success (the user is now signed in). Uses the first enrolled hint. */
export function resolveMfaSignIn(error, code) {
  const resolver = getMultiFactorResolver(auth, error);
  const hint = resolver.hints[0];
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim());
  return resolver.resolveSignIn(assertion);
}

/* Expose the raw pieces + helper so page scripts can import them. */
export {
  auth,
  onAuthStateChanged,
  friendlyError,
  // Re-export the raw MFA primitives so pages (e.g. app-login) can build their
  // own resolver flow when they aren't importing the whole friendly wrapper.
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
};

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
      // Signed in — show a simple "Account" entry (not the raw email).
      el.textContent = "Account";
      el.title = user.email || "Account";
      el.setAttribute("href", "/account/");
      el.classList.add("nav-auth-in");
    } else {
      el.textContent = "Log in";
      el.removeAttribute("title");
      el.setAttribute("href", "/login/");
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
