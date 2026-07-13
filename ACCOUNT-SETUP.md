# Wander — Account System Setup (Firebase Auth)

The site now has a user account system: **login.html**, **account.html**, and a
"Log in" link in the nav on every page. It uses **Firebase Authentication**
(email/password + Google sign-in) loaded straight from Google's CDN — no build
step, no npm, nothing to install.

Right now it is **not live yet** because `auth.js` still has placeholder config.
Follow the 5 steps below to turn it on. Takes about 5 minutes and is 100% free.

---

## Before you start — is this safe to commit?

**Yes.** The Firebase web config you'll paste into `auth.js` (`apiKey`,
`authDomain`, `projectId`, etc.) is **public and safe to commit** to your public
GitHub repo. That is normal and expected for every Firebase web app — the
`apiKey` only *identifies* your project; it is **not a password or secret**.
Access is controlled by Firebase Authentication and (later) your security rules,
not by hiding the key.

> **Never share your Firebase _account_ password** (the Google account you use
> to log into the Firebase Console) with anyone. That is the thing that must
> stay private — not the config in `auth.js`.

---

## The 5 steps

### 1. Create a free Firebase project
1. Go to **https://console.firebase.google.com** and sign in with your Google
   account.
2. Click **Add project** (or **Create a project**).
3. Give it a name (e.g. `wander`), accept the terms, and click through.
   You can **disable Google Analytics** — it's not needed. Click **Create
   project** and wait for it to finish.

### 2. Add a Web App
1. On the project overview page, click the **`</>` (Web)** icon — "Add an app to
   get started".
2. Give it a nickname (e.g. `Wander Web`).
3. **Do NOT** check "Also set up Firebase Hosting" (your site is on GitHub
   Pages). Click **Register app**.

### 3. Enable Email/Password + Google sign-in
1. In the left sidebar, open **Build → Authentication**, then click
   **Get started**.
2. Go to the **Sign-in method** tab.
3. Click **Email/Password**, toggle it **Enabled**, and **Save**.
4. Click **Google**, toggle it **Enabled**, pick a support email from the
   dropdown, and **Save**.
5. Still in Authentication, open the **Settings → Authorized domains** tab and
   make sure your site's domains are listed. Add any that are missing:
   - `wanderspoofer.com`
   - your GitHub Pages domain (e.g. `your-username.github.io`)
   - `localhost` (already there by default — used for local testing)

### 4. Copy the web config object
1. Click the **gear icon → Project settings** (top-left).
2. Scroll to **Your apps → SDK setup and configuration** and select **Config**.
3. You'll see something like:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "wander-xxxx.firebaseapp.com",
     projectId: "wander-xxxx",
     storageBucket: "wander-xxxx.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```
4. Copy those values.

### 5. Paste it into `auth.js`
1. Open **`auth.js`** at the site root.
2. Find the block marked `PASTE YOUR FIREBASE CONFIG HERE` — the
   `const firebaseConfig = { ... }` object with `"PASTE_YOURS"` placeholders.
3. Replace each `"PASTE_YOURS"` with the matching value from step 4.
4. Save, commit, and push. **That's it — login/signup and Google sign-in now
   work.**

---

## How to test it
- Open **`login.html`**, create an account with an email + password, and you
  should be redirected to **`account.html`** showing your email.
- The nav's "Log in" link should now show your email instead (on every page).
- Try **Sign out** on the account page → it returns you to `login.html`.
- Try **Continue with Google** → a Google popup should sign you in.

If you see an error like *"Firebase isn't configured yet"* or
*"auth/invalid-api-key"*, the config in `auth.js` hasn't been pasted correctly —
re-check step 5.

---

## What's next (not done yet)
The account page's **"Your plan"** card currently shows a hard-coded **"Free"**.
Once you wire up payments, store each user's license/plan in **Cloud Firestore**
(e.g. a `users/{uid}` document with a `plan` field) and read it in
`account.html` where the `<!-- TODO -->` comment is. There's nothing to do for
that now — the auth foundation is all in place.
