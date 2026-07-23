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