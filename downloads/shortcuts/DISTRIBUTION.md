# Wander Shortcuts Pack — Packaging & Distribution Guide

## 1. Shortcuts we built (shippable `.shortcut` files)

All six are self-contained: they call fixed URLs/schemes only, so they import and run without referencing any user-specific config.

| Shortcut | What it does |
|---|---|
| **Wander: Teleport** | Prompts for (or accepts) lat/lng, then `Get Contents of URL` GET → `http://wander.gsloc/set?latitude={LAT}&longitude={LNG}`. Pushes one coordinate to the active tunnel. |
| **Wander: Teleport to preset** | Same call, but lat/lng come from a hardcoded `Dictionary`/menu of saved spots (user edits the list once). One tap → pick a spot → teleport. |
| **Wander: Flush snap** | Set Wi-Fi **Off**, wait ~2s, Set Wi-Fi **On**. Forces iOS to re-query network location to clear a snapped/stuck fix. *(Depends on TEST 2 — see §5.)* |
| **Wander: Reset to real location** | GET → `http://wander.gsloc/set?reset=1`. Drops the spoof, returns to real GPS. |
| **Wander: Open Location Services** | Opens `prefs:root=Privacy&path=LOCATION`. Convenience jump to the pane the user needs during setup/troubleshooting. |
| **Wander: Connect proxy** | `shadowrocket://connect` then `shadowrocket://route/config`. Brings the tunnel up and sets routing so `wander.gsloc` calls will fire. |

### 1a. EVERY FILE IN THIS FOLDER MUST BE SIGNED BEFORE IT IS PUBLISHED

Since iOS 15 a `.shortcut` file has to be **signed** to import. This is not folklore — it is Apple's own user-facing string, present in the shipping iOS 26.5 WorkflowKit (`en.lproj/Localizable.strings`):

> Importing unsigned shortcut files is not supported. Please use another sharing option.

A correctly signed file is an Apple Encrypted Archive and starts with the magic `AEA1`. An unsigned one starts with `3c3f786d` (`<?xm`) — a raw XML plist. Publish an unsigned one and iOS refuses it outright, before the user ever reaches the untrusted-shortcuts question.

**This was live for two weeks.** Every file here shipped unsigned from 2026-07-22 until 2026-08-06, so nobody who followed our own instructions could import any of them. Fixed at the same time as the 404 on `wander-cellular-mode.shortcut`, which had never been deployed at all. If someone in Discord said the shortcuts "didn't work", they were right and it was not their device.

**Layout.** The published `.shortcut` files in this directory are the SIGNED ones. Their editable sources live in `unsigned/` under the same names. Edit the source, re-sign, replace the published copy — never publish out of `unsigned/`.

Release step, on a Mac, signed in to your Apple Account:

```
/usr/bin/shortcuts sign --mode anyone --input unsigned/NAME.shortcut --output NAME.shortcut
```

Check it took, before pushing — this is the whole failure mode, and it is one command:

```
for f in *.shortcut; do printf "%-40s %s\n" "$f" "$(head -c 4 "$f" | xxd -p)"; done
```

Every line must read `41454131`. Anything reading `3c3f786d` is unsigned and will be refused on device.

`--mode anyone` is mandatory for public distribution. The CLI default is `people-who-know-me`, which binds validation to the signer's contacts and fails for a stranger downloading from the site.

**Signing is not trusting.** They are two independent gates with two separate error strings in the same framework. A correctly signed, publicly distributed Wander shortcut *still* needs Settings → Apps → Shortcuts → Advanced → Allow Untrusted Shortcuts, because "trusted" means "from Apple's Gallery". The in-app setup card already asks for that; it did not, until now, know about the signing gate.

### 1b. Wander Airplane (`wander-airplane.shortcut`) — the only one Cellular Mode needs

**One import, nothing to edit.** Every action in it is an `is.workflow.actions.*` built-in: an `If` on Shortcut Input, two `Set Airplane Mode` actions, a `Wait`, and an `Open URLs` back to `wander://open`. There is no bundle id, no team id and no `AppIntentDescriptor` anywhere in the file, so **one signed copy is correct for the cert build, for every free-sideload re-sign, and for every future signature.**

Input `"on"` turns Airplane Mode on and waits 4 s for the radio to settle. **Anything else — including a hand-run with no input — turns it off.** That default is a safety decision: an empty variable must never be able to take somebody's phone offline, and "run it by hand" is exactly what a user does to get their signal back.

**Why it replaced the all-in-one shortcut.** Wander is the conductor now (`Wander/Services/CellularModeSequence.swift`): it runs this with `"on"`, waits for the cellular and Wi-Fi interfaces to actually disappear, brings the tunnel up and teleports **in-process**, then runs this again with `"off"`. Nothing forced the Shortcut to be the conductor — it only had to be, because it was the thing that could *wait*. Inverting that deletes the two App Intent actions, and with them the setup step that told people to open the Shortcuts editor (see §1c), which is the step that ended most setups. It also means a failure is now something Wander can put on screen: while a Shortcut ran the sequence unattended, an App Intent's return value was never surfaced at all, so a failed run and a working one looked identical.

Rebuild it with `build-wander-airplane.py` in this directory. That script's docstring records which action identifier and parameter key was verified where.

### 1c. Wander Cellular Mode (`wander-cellular-mode.shortcut`) — now the documented FALLBACK

**Kept, not deleted.** It is no longer the main path — `wander-airplane.shortcut` above is — but it stays published and stays wired up, because an import can fail for reasons that have nothing to do with the user (an unsigned or stale published file is refused outright), and because anyone who already did the Shortcuts-editor work should keep working untouched. `ShortcutRunner.runCellularMode` routes to whichever of the two the user actually has, and the in-app setup card carries this one behind an "If it won't import" disclosure.

It is the only file here that is not self-contained. It is the older one-tap answer to "spoofing on mobile data with no Wi-Fi", and it does **not** belong to the gs-loc/Shadowrocket family above — it drives the ordinary developer tunnel.

**Why it exists.** `lockdownd` refuses the developer-tunnel connection while the device has cellular and no Wi-Fi *at connect time*, and never re-checks an established session. Confirmed on device (build 139): Airplane Mode ON → connect → set location → Airplane Mode OFF, and the spoof holds. iOS gives apps no Airplane Mode API, so a shortcut is the only thing that can perform that sequence.

**Why it can't ship whole.** Two of its actions are Wander App Intents (`Start Wander Tunnel`, `Teleport to Place`). An App Intent action stores the target app's bundle ID, and Wander's is `com.stik.stikdebug.<AppleTeamID>` — unique to whoever signed the copy (see §6). A hardcoded id imports greyed. So the file ships with two labelled `ADD THE WANDER ACTION HERE` comments and the user replaces them once, exactly like the "add Open App → Wander yourself" step in §2. Everything else is baked: both network checks, both Airplane toggles, both waits, the failure notification, the return to Wander.

**Why App Intents rather than `wander://` links, given the cost above.** The radio must not come back until the tunnel is genuinely usable and the location genuinely set. An App Intent blocks until `perform()` returns, and `Start Wander Tunnel` polls the loopback endpoint (`.connected` only means iOS started the provider — injecting before the route is installed fails). A URL returns instantly, so the shortcut would guess a delay and would sometimes restore cellular underneath a half-built session. The two hand-added actions buy determinism; a fully self-contained file would only be self-contained at the cost of being unreliable.

**How long the user is offline: about 30 seconds worst case, usually less.** 4 s settle + up to 12 s for the tunnel + up to ~12 s for the teleport + 2 s. Every piece of copy says that number now; the earlier "a few seconds" / "roughly six to eight seconds" was not what the code does.

**In-app entry point.** Wander's Teleport panel offers this itself when `NetworkReachability.isOnCellular` is true (cellular, no Wi-Fi, and not gs-loc mode): one tap runs it with the selected pin if it's installed, otherwise a short setup card. It is gated behind the same paywall check as the ordinary Simulate button (`License.isLicensed || TrialManager.canUse(.teleport)`), and the teleport it performs charges the same trial bucket — this is not a free door to a paid engine. Callbacks are `wander://cellular-done` / `wander://cellular-missing`, which keep its own installed-flag honest — it deliberately does not share the flag with the gs-loc pack.

**It can leave the phone in Airplane Mode, and the app now handles that.** The Airplane-Mode-Off is near the end, and the OFF cannot be moved earlier: the session `lockdownd` refuses to re-evaluate is the DVT one built by the *teleport* (`tunnel_create_rppairing` inside `_simulate_location`), not by the tunnel step, so restoring cellular before the teleport lands would put the radio back exactly where the connection gets refused. A run interrupted before the OFF therefore leaves Airplane Mode on. Wander records a marker when it launches a run, clears it when the run reports completion, and shows a calm recovery banner if the marker is live and the device has no network path at all (`Wander/Services/CellularModeRun.swift`). None of that UI is gated on `isOnCellular` — that flag is false in Airplane Mode, which is what used to hide the app's only mention of Airplane Mode at exactly the wrong moment.

Full action-by-action breakdown, the reasoning behind the 4 s and 2 s waits, and the hand-build fallback are in `RECIPES.md`. **Verified since the first draft:** `is.workflow.actions.getwifi` is real and is "Get Network Details" — but it needs `WFNetworkDetailsNetwork` plus `WFWiFiDetail` / `WFCellularDetail`, which the first file omitted; without them the action returns nothing and the old single `If` read that as "no Wi-Fi" and cycled the radio for a user on Wi-Fi. Keys read from WorkflowKit's own action definitions (see RECIPES). **Still wants on-device confirmation:** `WFCondition` 100 / 101. The check is now two nested `If`s arranged so that a wrong integer, a broken action, or a device with no cellular all land in a branch that touches nothing and notifies — the failure is "Cellular Mode didn't fire and said so", not "the phone lost signal for no reason".

**Every teleport/reset/flush shortcut carries a hard dependency line in its comment block:** the `wander.gsloc` GET only works while Shadowrocket is **connected and routing**. Ship "Connect proxy" as a prerequisite, and have Teleport optionally chain it first.

## 2. Recipe-only shortcuts (cannot ship as files)

These two include a **Set VPN** action. `Set VPN` targets *a named VPN configuration on the user's own device* — the config name isn't knowable at build time, so a hardcoded file would import with an empty/broken VPN action. We ship these as **written recipes**, not files.

**Wander: Spoof mode** (get into PoGo-spoofing state)
1. `Set VPN` → toggle **On** → pick **Shadowrocket** (user's config).
2. *(optional)* `URL` `shadowrocket://route/config` → `Open URLs`.
3. `Open App` → pick **Wander** (user must select it — dynamic bundle id, see §6).

**Wander: Update mode** (switch tunnel for app/OTA updates)
1. `Set VPN` → toggle **On** → pick **LocalDevVPN** (user's config).
2. Done — this just flips the active VPN to the dev tunnel Wander uses for updates.

Both recipes go in the in-app help screen and on the site as step lists with screenshots, since the one blocking action is a two-tap pick the user does once.

## 3. Personal Automations (Automation tab — not importable)

These are configured per-device in **Shortcuts › Automation**. They can't be shipped as files; document them as setup steps.

| Automation | Trigger | Runs silently on iOS 26? | Caveat |
|---|---|---|---|
| **PoGo opens → Connect proxy** | App-open trigger on Pokémon GO | **Yes** — app-open triggers support "Run Immediately" with no notification. | User must set "Run Immediately" (default on iOS 26) and un-check "Notify When Run" to make it invisible. If the tunnel is already up, the re-connect is a harmless no-op. |
| **Back Tap (double) → Teleport** | Accessibility Back Tap bound to run the shortcut | **Partially** — Back Tap fires the shortcut instantly, but if Teleport *prompts* for coordinates it will show UI. | Bind Back Tap to a **preset/no-prompt** variant so it's one gesture, zero dialogs. Back Tap is set in Settings › Accessibility › Touch, not the Shortcuts app. |
| **NFC tag → Connect proxy** | Scan an NFC tag | **Yes**, once triggered — but NFC-triggered automations **always require the trigger; iOS may still show a tap-to-run banner** depending on setup. | NFC automations are iPhone-only (not iPad), and the tag must be registered on each device. Good for a "tap phone to sticker on desk = go spoof mode" ritual. |

General iOS 26 note: personal automations set to **Run Immediately** skip the confirmation prompt; leave that on for all three.

## 4. Distribution — three options

**Option A — Host `.shortcut` files at `wanderspoofer.com/shortcuts/`.**
Direct download links. **Requires** the user to enable Settings › Shortcuts › **Allow Untrusted Shortcuts** first (only available after they've run at least one shortcut). Cheapest to ship, but the "untrusted" toggle is a real drop-off point and a scary label for non-technical users.

**Option B — Signed iCloud share links, built on-device.**
Open each shortcut on your iPhone, Share → Copy iCloud Link. These import **without** the untrusted toggle and show a clean preview. More trusted, but every link is **manually generated on your device** and iCloud links can rot/expire — higher maintenance.

**Option C — In-app "Automations" help screen that deep-links to import.**
A screen in Wander listing each shortcut with an **Add** button that opens the iCloud import link (or the hosted file). Combines discovery + one-tap import in-context, and lets you show the untrusted-toggle instructions *right where the user hits them*.

**Recommendation: Option C, backed by Option B links.**
Build the in-app Automations screen and point its Add buttons at **signed iCloud links** (Option B). Reasoning: iCloud links dodge the "Allow Untrusted Shortcuts" wall entirely, so the scariest step disappears — because that toggle is the single biggest install-drop risk and the label alarms non-technical users. The in-app screen gives you a place to render the §2 recipes and §3 automation setup that files can't carry. Keep the `wanderspoofer.com/shortcuts/` hosted files as a **fallback** for users importing on a device that isn't signed into your iCloud share, and document the untrusted toggle only on that fallback page.

## 5. Blocked on testing — verify before promoting

**TEST 1 — does `Get Contents of URL` GET to `http://wander.gsloc/set` fire through the live Shadowrocket tunnel and move the fix?**
Shortcuts is historically balky with plain-HTTP *local* URLs. **Blocks: Wander: Teleport, Wander: Teleport to preset, Wander: Reset to real location** (and any automation that calls them). Do **not** promote these until confirmed on-device. If the GET won't fire from Shortcuts, the fallback is `Open URLs` with a `shadowrocket://`-style handoff or launching the request from within Wander.

**TEST 2 — does Set Wi-Fi Off→On actually flush the snapped fix?**
**Blocks: Wander: Flush snap.** Confirm the toggle clears a stuck gs-loc snap (consistent with the reboot-priming-as-cache-flush behavior we've documented) before we tell users it works.

Everything else — **Open Location Services** (pure `prefs:` deep link) and **Connect proxy** (pure `shadowrocket://` schemes) — is safe to ship now.

## 6. The case for a `wander://teleport?lat=..&lng=..` URL scheme

**Problem:** Wander's bundle id is dynamic (`com.stik.stikdebug.<AppleTeamID>`), so no shortcut or automation can hardcode an **Open App** action for it — the user must hand-pick Wander every time (see §2, §3). That's the one un-automatable seam in the whole pack.

**Fix:** register a stable custom URL scheme `wander://`. Because URL schemes are resolved by the OS registry, not the bundle id, a scheme survives the dynamic id and the re-sign churn of free sideloading. That unlocks:

- **`wander://open`** — deep link to open the app from any shortcut/automation with a hardcoded `Open URLs` action. Kills the manual "pick Wander" step, so **Spoof mode becomes a fully shippable file** instead of a recipe.
- **`wander://teleport?lat=..&lng=..`** — open **and** drive Wander in one call. More robust than the plain-HTTP `wander.gsloc` GET (which is at the mercy of TEST 1), because it hands the coordinate to the app to push, rather than betting on Shortcuts firing a local-HTTP request through the tunnel itself.
- **`wander://connect`**, **`wander://reset`** — round out the set so the entire pack can run on schemes, which import cleanly and never touch the untrusted-file wall.

**Why it's worth building:** it converts two recipe-only shortcuts into shippable files, removes the only manual pick-the-app step from every automation, and gives us a teleport path that doesn't depend on TEST 1 passing. It's the highest-leverage change for making this pack "one-tap" instead of "one-tap-plus-a-fiddly-setup." Ship it before the pack graduates from beta.

---

**Net:** 6 files ship (4 pending TEST 1/TEST 2 sign-off, 2 safe now), 2 recipes + 3 automations are documented setup, distribute via an in-app Automations screen backed by signed iCloud links, and prioritize the `wander://` scheme to collapse the remaining manual steps.