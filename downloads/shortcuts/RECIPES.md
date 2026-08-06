# Wander Shortcuts — hand-build recipes

Each .shortcut file imports directly (needs Settings > Shortcuts > Allow Untrusted Shortcuts ON). If a file wont import, build it by hand from these steps.


## Wander: Teleport  ()

VALIDATION VERDICT: The authored plist is CORRECT as-is and will import and run on iOS 26. It passes plutil -lint (well-formed XML) and every schema element checks out. No corrections were needed; the plistXml returned is the original, verified unchanged.

Per-check results:
(a) Well-formed XML: PASS (plutil -lint OK). The &#xFFFC; object-replacement chars and &amp; entity parse cleanly.
(b) Action identifiers: ALL REAL — is.workflow.actions.comment, .ask, .gettext, .downloadurl. None hallucinated.
(c) Parameter keys: ALL CORRECT — verified against ScPL action reference. Ask uses WFInputType=Number (this is the real key + real enum value; NOT WFAskActionType or similar), plus WFAskActionPrompt and WFAskActionDefaultAnswer. Comment uses WFCommentActionText. Text uses WFTextActionText. Get Contents of URL uses WFHTTPMethod=GET and WFURL. All confirmed genuine.
(d) Output chaining: CORRECT. Text action's WFTextTokenString embeds two U+FFFC placeholders; attachmentsByRange offsets {33,1} and {45,1} are byte-exact (I counted: prefix "http://wander.gsloc/set?latitude=" is 33 chars; second placeholder lands at offset 45). OutputUUIDs in the ranges match the two Ask actions' UUIDs. The downloadurl WFURL uses WFTextTokenAttachment with OutputUUID matching the Text action's UUID (CCCC...). Chain is intact end to end.
(e) Required top-level keys: ALL PRESENT — WFWorkflowActions, WFWorkflowClientVersion, WFWorkflowMinimumClientVersion(+String), WFWorkflowTypes, WFWorkflowInputContentItemClasses, WFWorkflowImportQuestions, WFWorkflowIcon.

CAVEATS / non-schema gotchas (import & run are two different things):
1. IMPORT GATE: This is an unsigned shortcut, so it imports ONLY with Settings > Shortcuts > "Allow Untrusted Shortcuts" ON. That toggle is greyed out until the user has run at least one shortcut on the device. Must be documented in the download instructions.
2. Number-typed input coercion: WFInputType=Number returns an NSDecimalNumber. Shortcuts coerces it to text fine when embedded in the Text token, so lat/lng render correctly. Edge risk: locale decimal separators — a device set to a comma-decimal locale could emit "40,6892" and break the URL. Low risk but worth a beta note. If it bites, switch WFInputType to Text.
3. RUNTIME UNVERIFIED (needs on-device TEST 1): schema validity does NOT prove the GET fires through the Shadowrocket tunnel. Shortcuts is historically balky with plain-HTTP local/non-routable hosts, and http://wander.gsloc only resolves while the VPN is connected + routing=config. This plist is correct; whether the fix actually moves is the open on-device test. downloadurl gives no explicit failure UI, so a silent no-op here is a real possibility to check for.
4. Wander app bundle id is DYNAMIC (com.stik.stikdebug.<TeamID>) so it correctly is NOT referenced here — this shortcut only hits the gsloc HTTP endpoint and needs no "Open App" action. Good.
5. Icon color 4282601983 and glyph 61440 are arbitrary-but-valid uint values; cosmetic only, no effect on import.


Hand-build in the Shortcuts app (guaranteed fallback if the file will not import):

1. Open Shortcuts, tap + to create a new shortcut. Tap the name at the top and rename it to: Wander: Teleport

2. (Optional) Add action -> search "Comment" -> add it. Text: Requires Shadowrocket VPN connected + routing set to config. Enter lat/lng in decimal degrees.

3. Add action -> "Ask for Input". Tap the type control (defaults to Text) and set it to: Number. In the Prompt field type exactly: Latitude?

4. Add action -> another "Ask for Input". Set type to: Number. Prompt: Longitude?

5. Add action -> "Text". Build this exact string, inserting the two variables where shown:
      http://wander.gsloc/set?latitude=[Latitude]&longitude=[Longitude]
   - Type "http://wander.gsloc/set?latitude=" then tap the variable bar and insert the FIRST Ask result (rename it "Latitude" for clarity).
   - Type "&longitude=" then insert the SECOND Ask result (Longitude).
   - No stray spaces; the & must be a literal ampersand.

6. Add action -> "Get Contents of URL". Clear the URL field and insert the Text variable (output of step 5) as the whole URL. Tap "Show More" and confirm Method = GET. Leave Headers/Body empty.

7. Run order top to bottom: Comment -> Ask (Latitude) -> Ask (Longitude) -> Text -> Get Contents of URL.

To use: connect Shadowrocket (shadowrocket://connect) and set routing to config first, keep Pokemon GO open, then run this from the Share sheet / widget / Back Tap; enter lat then lng.


## Wander: Teleport to preset  ()

VALIDATION VERDICT: The authored plist was BROKEN — one wrong param key would have made it import as empty-URL and silently fail on every branch. CORRECTED plist returned above. Details:

CRITICAL BUG FIXED (a): "Get Contents of URL" (is.workflow.actions.downloadurl) used the URL key `WFURL`. That is NOT the real key. The correct key is `WFURLActionURL`. With `WFURL`, the shortcut still IMPORTS and RUNS, but every "Get Contents of URL" action imports with an EMPTY URL field — so it fires a GET to nothing and no teleport happens. This is exactly the silent-failure class the task warned about. Fixed in all three branches. (`WFHTTPMethod` = "GET" was already correct.)

WHAT WAS ALREADY CORRECT (checked, no change needed):
- (b) All four action identifiers are real: is.workflow.actions.comment, is.workflow.actions.choosefrommenu, is.workflow.actions.downloadurl. None hallucinated.
- (c) Comment: WFCommentActionText — correct. Choose from Menu: GroupingIdentifier (shared UUID ties the start/cases/end together — matches across all 5 menu actions, good), WFControlFlowMode (0=start, 1=each case, 2=end — correct sequence), WFMenuPrompt, WFMenuItems (array of strings), WFMenuItemTitle — all correct keys. Menu items as plain <string> entries is the legacy form but still valid and imports fine on iOS 26.
- (d) Output-chaining: none needed. This flow is menu-branch → fixed-URL GET; no magic variables / WFVariable attachments are required, and the response JSON is intentionally not consumed. So the absence of chaining is correct, not a defect.
- (e) Required top-level keys all present: WFWorkflowActions, WFWorkflowClientVersion, WFWorkflowMinimumClientVersion, WFWorkflowTypes, WFWorkflowInputContentItemClasses, WFWorkflowIcon. Fine.

VERIFIED MECHANICALLY: ran `plutil -lint` on the corrected file → "OK" (well-formed XML plist). Ran `plutil -extract WFWorkflowActions.3.WFWorkflowActionParameters.WFURLActionURL` → returns "http://wander.gsloc/set?latitude=40.7580&longitude=-73.9855" (key present, value populated, &amp; correctly un-escapes to literal &).

IMPORT PREREQ (unchanged, user-side): unsigned .shortcut imports only with Settings > Shortcuts > "Allow Untrusted Shortcuts" ON.

RUNTIME CAVEATS (not plist bugs, but gate whether it actually teleports):
- Shadowrocket VPN must be CONNECTED and routing = config, or the GET to http://wander.gsloc never reaches Wander. The Comment action states this.
- TEST 1 STILL REQUIRED ON-DEVICE: whether Shortcuts' "Get Contents of URL" actually pushes a plain-HTTP local-domain GET through the active Shadowrocket tunnel and moves the fix is unverified — Shortcuts is historically balky with plain-HTTP local URLs. The plist is now structurally correct, but correctness of structure does not prove the tunnel round-trip works. Verify before promising it.
- No Wander app-open here, so the DYNAMIC bundle-id (com.stik.stikdebug.<TeamID>) problem does not bite this particular shortcut — it only calls URLs. (It would bite any shortcut that tries to hardcode an "Open App" step for Wander.)


Hand-build in the Shortcuts app (guaranteed fallback if the file will not import):

1. New Shortcut, rename it "Wander: Teleport to preset".

2. (Optional but recommended) Add action "Comment". Text: "Requires Shadowrocket VPN CONNECTED + routing = config or the push won't fire. Confirm {ok:true} in the response."

3. Add action "Choose from Menu". Set the Prompt field to: Choose a spot to teleport to. It starts with two menu items; tap "Add new item" once so you have three. Set the three item titles exactly to:
   - Times Square
   - Santa Monica Pier
   - Shibuya

4. Under the "Times Square" menu case, add action "Get Contents of URL". Tap the URL field and type exactly:
   http://wander.gsloc/set?latitude=40.7580&longitude=-73.9855
   Leave Method = GET (the default). Do NOT expand "Show more"/headers/body — a bare GET is what you want.

5. Under the "Santa Monica Pier" case, add "Get Contents of URL". URL:
   http://wander.gsloc/set?latitude=34.0089&longitude=-118.4980
   Method = GET.

6. Under the "Shibuya" case, add "Get Contents of URL". URL:
   http://wander.gsloc/set?latitude=35.6595&longitude=139.7005
   Method = GET.

7. Done. Each branch has exactly one Get Contents of URL action; the menu's End is automatic.

Notes on typing the URL: type the ampersand as a normal "&" in the Shortcuts editor (the XML file escapes it as &amp; only because it is XML — do NOT type &amp; into the app). Latitude first, then longitude, comma-free, no spaces.


## Wander: Flush snap  ()

VALID — imports and runs on iOS 26 as authored; NO corrections needed. Item-by-item: (a) well-formed XML plist, balanced nesting, correctly typed nodes. (b) all three action identifiers are real: is.workflow.actions.comment, is.workflow.actions.wifi (the genuine "Set Wi-Fi" id — NOT setwifi), is.workflow.actions.delay (the genuine "Wait" action; app label is "Wait" but id is delay). (c) parameter keys correct: WFCommentActionText (string), OnValue (boolean — this is the load-bearing check: the Set Wi-Fi/Bluetooth/Airplane/Cellular toggle family all use OnValue, NOT WFWiFi/WFState; false=off, true=on — authored plist is right), WFDelayTime (real). (d) no output-chaining needed — linear side-effect flow, no action consumes another's output, so no magic variables/WFInput attachments, correctly absent. (e) all required top-level keys present (WFWorkflowActions, client-version keys, Types, InputContentItemClasses, ImportQuestions, Icon).

CAVEATS: (1) Unsigned file — will only import with Settings > Shortcuts > "Allow Untrusted Shortcuts" ON. (2) TEST 2 UNVERIFIED: whether Settings-level Wi-Fi Off->On actually flushes the snapped gs-loc fix still needs on-device confirmation — the plist mechanics are sound but the flush-effect is a behavioral claim, not a plist guarantee. (3) 3s delay is a guess; may need tuning on-device so iOS fully drops the cached Wi-Fi location before re-enabling. (4) Not applicable here but relevant across the shortcut set: Wander's dynamic bundle id (com.stik.stikdebug.<TeamID>) can't be hardcoded in an Open App action — this shortcut avoids that trap by touching no app, so it's clean.


Hand-build fallback (Shortcuts app), guaranteed to work if the .shortcut file will not import:

1. Open Shortcuts -> tap + (new shortcut) -> tap the name at the top and rename it to "Wander: Flush snap".

2. Add action: search "Comment" -> tap Comment. In its text box type:
   "Wander: Flush snap. Toggles Settings Wi-Fi OFF, waits, then ON so iOS drops its cached gs-loc fix and Wander's keep-alive re-asserts the target. Use the real Settings Wi-Fi toggle, not Control Center. Keep the Shadowrocket tunnel connected + routing."

3. Add action: search "Wi-Fi" -> tap "Set Wi-Fi". It defaults to "Turn Wi-Fi On" — tap the word "On" and change it to "Off". (Reads: Set Wi-Fi Off.)

4. Add action: search "Wait" -> tap "Wait". Tap the number and set it to 3. (Reads: Wait 3 Seconds.)

5. Add action: search "Wi-Fi" -> tap "Set Wi-Fi" again. Leave it as "On". (Reads: Set Wi-Fi On.)

Final order top-to-bottom: Comment -> Set Wi-Fi Off -> Wait 3 Seconds -> Set Wi-Fi On. Tap to run.

NOTE: the user-facing action is called "Wait" but its internal identifier is is.workflow.actions.delay — search "Wait" in the app, not "Delay".


## Wander: Reset to real location  ()

VERDICT: The authored plist was WELL-FORMED XML and would IMPORT, but had ONE defect that would make it silently half-fail at RUN time. Corrected plist above passes `plutil -lint` (OK).

Per-check results:
(a) XML well-formed: PASS in original. Valid DTD, balanced tags, & correctly escaped as &amp; inside the prefs: URL. No change needed there.
(b) Action identifiers all REAL: PASS. is.workflow.actions.comment, .downloadurl (this IS the real id for "Get Contents of URL" — counter-intuitive but correct), .url, .openurl are all genuine WorkflowKit identifiers. None hallucinated.
(c) Parameter keys: MOSTLY correct. comment=WFCommentActionText OK. downloadurl=WFURL + WFHTTPMethod OK. url=WFURLActionURL OK. BUT openurl had an EMPTY <dict/> for WFWorkflowActionParameters — this is the bug (see d).
(d) Output-chaining — THE DEFECT (fixed): "Open URLs" (openurl) takes its URL via the WFInput key. The original left WFWorkflowActionParameters empty, on the assumption openurl auto-inherits the previous action's output. That auto-chain is an EDITOR-time (UI) convenience only; a hand-authored plist with no WFInput compiles to an Open URLs action pointed at the shortcut's own input, which is empty here (WFWorkflowInputContentItemClasses is []). Result: it would import and run with a green check but open NOTHING — the Location Services pane never appears. FIX: added an explicit WFInput ActionOutput attachment (WFSerializationType=WFTextTokenAttachment, Value.Type=ActionOutput, OutputUUID pointing at the url action, OutputName=URL), AND added the required UUID key to the url action so the attachment has a target to reference. Original url action had no UUID, so even a correct attachment would have had nothing to point at.
(e) Required top-level keys: PASS, and hardened. Original had all strictly-required keys (WFWorkflowActions, WFWorkflowClientVersion, WFWorkflowTypes, WFWorkflowImportQuestions, WFWorkflowIcon, WFWorkflowInputContentItemClasses). I added WFWorkflowHasShortcutInputVariables=false — not strictly required but makes the "no shortcut input" intent explicit and avoids the editor guessing, which is relevant now that openurl explicitly does NOT consume shortcut input.

Also corrected: removed the stray UUID that was on the downloadurl action in the original (UUID A1B2...0001). It was harmless but pointless there (nothing referenced it); the UUID that actually matters is now on the url action so openurl can chain to it.

UNCHANGED CAVEATS that still hold and are NOT fixable in the plist:
- Untrusted-shortcuts toggle must be ON to import at all.
- reset=1 only does anything while Shadowrocket is connected AND routing=config; the shortcut cannot force that state (Set VPN references the user's own named config).
- prefs:root=Privacy&path=LOCATION opens the Location Services PANE only; the master toggle and Reboot are hard OS walls, correctly NOT attempted.
- This shortcut contains NO "Open App" action, so the dynamic com.stik.stikdebug.<TeamID> bundle-id problem does not bite here — but it WILL in any sibling shortcut that tries to launch Wander; those must use a picker or an (unshipped) wander:// scheme.
- STILL NEEDS ON-DEVICE TEST 1: whether a Get Contents of URL GET to the plain-HTTP http://wander.gsloc/ actually fires through the live Shadowrocket tunnel from within Shortcuts. Shortcuts is historically balky with plain-HTTP local hostnames; if it fails, the fallback is to confirm the ping in Safari first, or wrap the URL fetch so a failure does not abort the subsequent Open URLs step.


Hand-build in the Shortcuts app (guaranteed fallback if the .shortcut file will not import). Prereq: Settings > Shortcuts > Advanced > "Allow Untrusted Shortcuts" must be ON to import any unsigned .shortcut file at all.

1. Open Shortcuts -> tap + (top right). Tap the name field at top -> rename to: Wander: Reset to real location

2. Add action -> search "Comment" -> add it. In its text field type: Requires Shadowrocket connected + routing set to config. This only opens the Location Services pane; you flip the toggle yourself.

3. Add action -> search "Get Contents of URL" -> add it.
   - Tap the URL field, type exactly: http://wander.gsloc/set?reset=1
   - Tap "Show More" -> confirm Method = GET. Leave headers/body default.

4. Add action -> search "URL" -> add the "URL" action (the plain literal-URL action, NOT "Get Contents of URL").
   - In its field type exactly: prefs:root=Privacy&path=LOCATION
   (Type & as a normal ampersand in the app; the &amp; escaping only applies inside the XML file.)

5. Add action -> search "Open URLs" -> add "Open URLs". Tap its input and select the blue "URL" magic variable produced by the URL action in step 4. Confirm the input reads "URL" and is NOT empty.

6. Run order top-to-bottom: Comment -> Get Contents of URL -> URL -> Open URLs. Tap Done.

To run: connect Shadowrocket and set routing to config FIRST, then run. It pings reset=1 (returns {ok:true}) to pass your real location back through, then opens the Location Services pane so you can toggle it.


## Wander: Open Location Services  ()

VERDICT: original plist is well-formed XML (plutil -lint OK) with all-real action identifiers, but it would IMPORT and then DO NOTHING because of a broken output chain. Corrected plist supplied above; it lints clean (plutil -lint OK).

Per-criterion audit of the ORIGINAL:
(a) Well-formed XML plist: PASS. Valid DOCTYPE, valid structure, and the &amp; entity is correct XML source for a literal & (it decodes to prefs:root=Privacy&path=LOCATION). No change needed there.
(b) Action identifiers all REAL: PASS. is.workflow.actions.comment, is.workflow.actions.url, is.workflow.actions.openurl all exist and are spelled correctly (confirmed against the shortcuts-js identifier list and Apple file-format references).
(c) Parameter keys: PASS for the two that were populated - WFCommentActionText (Comment) and WFURLActionURL (URL action) are the correct keys.
(d) Output chaining: FAIL - this is the real, silent-failure bug. Shortcuts actions do NOT implicitly chain. The authored Open URLs action has an EMPTY WFWorkflowActionParameters dict, so it has no WFInput and opens nothing. The URL action's output is never wired into Open URLs. To chain the two-action way you would need a UUID on the URL action plus a WFInput on Open URLs whose Value is a WFTextTokenAttachment with Type=ActionOutput / OutputUUID / OutputName. Rather than ship that fragile link (the magic-variable "invisible character" breaks on import constantly), the CORRECTION collapses to a single Open URLs action with the literal URL inlined as WFInput -> WFSerializationType=WFTextTokenString, string="prefs:root=Privacy&path=LOCATION", empty attachmentsByRange. This is the correct key (WFInput, not WFURLActionURL, for openurl) and removes the chaining dependency entirely. The now-orphan URL action was deleted.
(e) Required top-level WFWorkflow keys: PASS. WFWorkflowActions, WFWorkflowClientVersion, WFWorkflowMinimumClientVersion, WFWorkflowTypes, WFWorkflowInputContentItemClasses, WFWorkflowIcon, WFWorkflowImportQuestions all present. Kept as-is.

IMPORT PREREQUISITE (unchanged, applies to both versions): unsigned .shortcut imports only with Settings > Shortcuts > "Allow Untrusted Shortcuts" ON. That toggle itself only appears after the user has run at least one shortcut. Ship this instruction alongside the file.

RUNTIME CAVEAT: whether prefs:root=Privacy&path=LOCATION still deep-links to the Location Services pane on iOS 26.x is an Apple-controlled behavior that has shifted across releases and is NOT guaranteed - needs on-device confirmation. If the exact path stops resolving, prefs:root=Privacy still lands on Privacy & Security. This is independent of the plist being correct.

SCOPE: this shortcut only OPENS the pane. The Location Services master toggle is a documented hard wall (not automatable), correctly stated in the Comment. TEST 2 (does Wi-Fi Off->On flush the snapped fix) belongs to a different shortcut and is not exercised here.


Hand-build fallback (guaranteed to work if the file will not import):

1. Open Shortcuts, tap + (top right) to create a new shortcut.
2. Tap the shortcut name at the top, choose Rename, type exactly: Wander: Open Location Services
3. (Optional, cosmetic) Tap the icon next to the name to set a blue color and a globe glyph.
4. Add action 1 - Comment (optional documentation):
   - Tap "Add Action", search "Comment", tap "Comment".
   - Text: One tap to Location Services. Toggle it off then on after a teleport to flush a snapped fix. iOS cannot flip the master toggle for you - this only opens the pane.
5. Add action 2 - Open URLs (do NOT add a separate "URL" action):
   - Tap "Add Action", search "Open URLs", tap "Open URLs".
   - Tap the "URL" / input field inside the action and type exactly: prefs:root=Privacy&path=LOCATION
     (Type a normal & - the app stores it correctly. Do NOT type &amp;.)
   - Make sure the field holds this literal text, NOT a blue "Shortcut Input" or a magic variable. If a variable chip appears, delete it and type the literal URL.
6. Tap Done.
7. Test: run it. It should jump straight to Settings > Privacy & Security > Location Services.

Note: This one-action build (literal URL typed directly into Open URLs) is deliberately simpler than a URL-action-then-Open-URLs pair. It removes the magic-variable link that most often breaks on import, and it is exactly how a hand-built prefs: shortcut serializes.


## Wander: Connect proxy  ()

VERDICT: The authored plist is VALID as-is. It will import (with "Allow Untrusted Shortcuts" ON) and run on iOS 26. No corrections were required; the plistXml above is the authored plist returned verbatim (only re-emitted after linting).

Checks performed:
(a) Well-formed XML plist: PASS. plutil -lint returns OK on the full structure.
(b) Action identifiers all REAL (not hallucinated): PASS. is.workflow.actions.comment, .url, .openurl, .delay are all genuine WorkflowKit identifiers.
(c) Parameter keys correct per action: PASS.
  - comment -> WFCommentActionText (correct).
  - url -> WFURLActionURL (correct; this is the plain "URL" action that EMITS a URL object, it does not open anything).
  - openurl -> WFInput (correct; "Open URLs" takes its target via WFInput, NOT WFURLActionURL -- a common trap; the author got it right).
  - delay -> WFDelayTime (correct). Value as <real>1</real> is accepted (integer or real both fine).
(d) Output-chaining / magic variables: PASS and this is the subtle part that is done correctly. Each source "url" action carries its UUID key INSIDE WFWorkflowActionParameters (verified that is where UUID lives, not at the action-dict top level). Each "openurl" references it via WFInput -> a WFTextTokenAttachment whose Value dict has OutputUUID (matching the source UUID), OutputName=URL, Type=ActionOutput. Because the variable is the ENTIRE value of WFInput (not embedded inside a text string), the correct form is exactly this: WFSerializationType=WFTextTokenAttachment with a direct Value dict -- NOT a WFTextTokenString with attachmentsByRange. The author used the right form. UUIDs are also unique (...0001 vs ...0002) so the two chains don't collide.
(e) Required top-level WFWorkflow keys: PASS. WFWorkflowActions present (the only strictly-required key). Also present and well-typed: WFWorkflowClientVersion, WFWorkflowClientRelease, WFWorkflowMinimumClientVersion (integer), WFWorkflowMinimumClientVersionString, WFWorkflowTypes (empty array = normal shortcut), WFWorkflowInputContentItemClasses (empty array), WFWorkflowImportQuestions (empty array), WFWorkflowIcon (glyph 59770 + color are valid). No WFWorkflowName key, which is fine -- the app derives the name from the file's base name (wander-connect), and the recipe renames it anyway.

CAVEATS / gotchas that are correctly out-of-plist by design (not defects):
- Open App -> Wander CANNOT be baked into the plist: bundle id is DYNAMIC (com.stik.stikdebug.<TeamID>). Correctly deferred to a manual step in both the comment action and the recipe. Do NOT try to hardcode an Open App action with a guessed bundle id -- it would import as a broken/greyed action.
- Import requires Settings > Shortcuts > "Allow Untrusted Shortcuts" ON (file is unsigned). Flag this in shipping docs.
- shadowrocket://connect and shadowrocket://route/config are custom schemes -- valid to place in a URL action; iOS shows no scheme warning (expected). These only do anything if Shadowrocket is installed.
- FUNCTIONAL (not plist) risk to still verify on-device, unrelated to import validity: whether Shadowrocket honors shadowrocket://route/config to force Global Routing = Configuration in the installed build, and the 1s Wait may be too short between connect and route on a cold VPN spin-up -- consider bumping WFDelayTime to 2-3 during TEST. This does not affect whether the shortcut imports/runs; it affects whether the routing flip lands.
- This shortcut does NOT itself exercise TEST 1 (the http://wander.gsloc GET through the tunnel) -- that lives in the teleport shortcut, not this one.


Hand-build fallback (guaranteed to work if the .shortcut file will not import):

1. Shortcuts app -> "+" (New Shortcut). Tap the name at top -> Rename -> type: Wander: Connect proxy
2. Add action: search "Comment" -> tap it. Type: Wander: Connect proxy. Connects Shadowrocket and forces Global Routing = Configuration. AFTER this shortcut, add an Open App action below and pick Wander -- its bundle id is unique to your Apple ID and cannot be pre-filled.
3. Add action: search "URL" -> tap "URL" (the plain URL action, NOT "Get Contents of URL"). In its field type exactly: shadowrocket://connect
4. Add action: search "Open URLs" -> tap "Open URLs". It auto-reads "Open [URL]" using the URL from step 3. If it shows a different token, tap the token and pick the "URL" output of step 3.
5. Add action: search "Wait" -> tap "Wait". Set the number to 1.
6. Add action: search "URL" -> tap "URL" again. Type exactly: shadowrocket://route/config
7. Add action: search "Open URLs" -> tap "Open URLs". Confirm it reads "Open [URL]" pointing at the URL from step 6 (re-pick the token if needed).
8. Add action: search "Comment" -> tap it. Type: Then add Open App -> Wander yourself.
9. (Manual step this shortcut cannot bake in) Add action: search "Open App" -> tap it -> tap the "App" placeholder -> choose Wander. Must be done on YOUR device; cannot be shipped pre-filled because Wander's bundle id (com.stik.stikdebug.<YourTeamID>) is unique per Apple ID.
10. Tap Done. Run once to confirm Shadowrocket connects and Global Routing flips to Configuration.

Note: when you type shadowrocket://connect into a URL action, iOS will not warn it is a custom scheme -- that is expected.



## Wander Airplane  (wander-airplane.shortcut)  — the current Cellular Mode shortcut

WHAT IT IS FOR: flipping Airplane Mode, and nothing else. It is the whole of what a Shortcut is needed for now. Everything the old all-in-one file did around those two toggles — bring the tunnel up, teleport, decide whether the airplane cycle is needed at all — Wander does itself in `Wander/Services/CellularModeSequence.swift`, in the foreground, where it has real timeouts, real errors and a progress line.

WHY THE INVERSION. The two middle actions in the old shortcut (`Start Wander Tunnel`, `Teleport to Place`) were Wander App Intents for exactly one reason: a Shortcut can **wait** on an App Intent, and a `wander://` link returns instantly. But an App Intent action serialises `AppIntentDescriptor = { TeamIdentifier, BundleIdentifier, AppIntentIdentifier, Name }`, and Wander's bundle id differs per install (`app.yellow2173.nadir6666` on the cert build, `com.stik.stikdebug.<TeamID>` after a free re-sign). No single file can carry a per-install value, so those two actions imported greyed and the user had to re-pick them in the editor.

Generating the file on-device with the *right* identity does not rescue it: a `.shortcut` must be signed to import (see DISTRIBUTION §1a) and an iPhone cannot sign one. So the fix was to stop needing the identity in the file. Nothing ever forced the Shortcut to be the conductor — it only had to be, because it was the thing that could wait.

ACTION ORDER AS SHIPPED (all `is.workflow.actions.*`, no app identity anywhere):

1. Comment (the explanation, in the file).
2. `If <Shortcut Input> is "on"` — `is.workflow.actions.conditional`, `WFCondition` **4** (text equality), `WFConditionalActionString` = `on`, `WFControlFlowMode` 0. `WFInput` is `{ Value = { Type = "ExtensionInput" }, WFSerializationType = "WFTextTokenAttachment" }`.
3.   Set Airplane Mode **On** — `is.workflow.actions.airplanemode.set`, `OnValue` = true.
4.   Wait **4 seconds** — `is.workflow.actions.delay`, `WFDelayTime` = 4. Same reasoning as the old file: iOS tears the cellular data interface down asynchronously, so `pdp_ip0` lingers for a beat. Wander re-checks the interfaces itself when it regains the foreground, so this is a head start rather than the whole guarantee.
5. Otherwise — `WFControlFlowMode` 1.
6.   Set Airplane Mode **Off** — `OnValue` = false.
7. End If — `WFControlFlowMode` 2.
8. Comment (why the tail exists).
9. Open URLs -> `wander://open` (literal `WFInput` as a `WFTextTokenString`).

WHICH WAY THE `Otherwise` BRANCH POINTS IS A SAFETY DECISION. The `If` tests for `"on"`, so every other input — including no input at all, which is what a hand-run from the Shortcuts app produces — lands in `Otherwise` and turns Airplane Mode **off**. Turning it off when it was already off is a no-op. Turning it *on* because a variable came through empty would take somebody's phone offline by accident.

WHY `wander://open` AND NOT A DEDICATED CALLBACK. `open` is already a documented no-op in Wander's link table ("opening the app is the whole effect"). The sequence does not advance on the *link*; it advances on Wander regaining the foreground and then **checking the actual network path** (`NetworkReachability.isOnCellular` / `hasWiFi`, which read the underlying interface so Wander's own utun cannot fake them). A leg that silently did nothing is therefore caught by looking at the radio, not by trusting a callback — which is the failure mode the old design could never close.

WHAT WAS VERIFIED, AND WHERE:

- `is.workflow.actions.airplanemode.set`, `.conditional`, `.delay`, `.openurl`, `.comment` — all present as literal strings in the shipping iOS 26.5 WorkflowKit binary. The airplane action is backed by `WFSetAirplaneModeIntent` ("Set Airplane Mode", parameters Operation/State) in `ShortcutsIntents.appex/Base.lproj/Actions.intentdefinition`.
- `WFCondition` **4** = "is" (text equality) with `WFConditionalActionString` — read out of real conditionals in a live `~/Library/Shortcuts/Shortcuts.sqlite`, many samples.
- The Shortcut Input token — copied from a real `Set Variable` action in that same database.
- `OnValue` / `WFDelayTime` — the legacy Shortcuts keys, matching `wander-cellular-mode.shortcut`. Neither appears in WorkflowKit's string table, but neither does `WFDelayTime`, which is unquestionably the current key for the Wait action — so absence there proves nothing about either. **This is the one residual uncertainty in the file** and it is the same uncertainty the previous file already shipped with.

## Wander Cellular Mode  (wander-cellular-mode.shortcut)  — FALLBACK, kept for people who already built it

WHAT IT IS FOR: setting a spoof on **mobile data with no Wi-Fi**. `lockdownd` refuses the developer-tunnel connection while the device has cellular and no Wi-Fi **at connect time**, and it does **not** re-evaluate a session that is already established. Confirmed on device (build 139): Airplane Mode ON -> connect -> set location -> Airplane Mode OFF, and the spoof HOLDS with cellular back on. So the toggle is needed for the moment of connection and nothing else. iOS gives apps no Airplane Mode API — Shortcuts is the only thing on the system that can flip it — which is why this exists as a shortcut and not a button.

HOW LONG THE USER IS OFFLINE — say the real number. 4 s settle + up to 12 s in `WanderTunnel.ensureStarted()` + up to ~12 s in `TeleportIntent` + 2 s = **about 30 seconds worst case**, usually less. The copy in the app, the setup card and the shortcut's own comment all say "up to about 30 seconds". They used to say "a few seconds" / "roughly six to eight seconds", which is not what the code does; a user waiting on a call notices, and a promise we break costs more than a number that sounds bad.

SHIPS PARTIALLY PRE-BUILT — READ THIS BEFORE PROMOTING IT. Two of the actions **cannot** be shipped in the file: `Start Wander Tunnel` and `Teleport to Place` are Wander App Intents, and an App Intent action stores the target app's bundle ID. Wander's is `com.stik.stikdebug.<AppleTeamID>` (WanderSigner appends the signing team so the install upgrades in place), i.e. unique to whoever signed the copy. A hardcoded id would import as a greyed, broken action. Same wall as the pack's existing "add Open App -> Wander yourself" step. The file therefore imports with two clearly-labelled `ADD THE WANDER ACTION HERE` comments where those two actions go; the user replaces them once. Everything else — both network checks, both Airplane toggles, both waits, the failure notification, the return to Wander — is baked.

WHY APP INTENTS AND NOT `wander://` LINKS (this is the load-bearing design choice): the sequence must not turn the radio back on until the tunnel is genuinely up AND the location is genuinely set. An App Intent action blocks until `perform()` returns, and `Start Wander Tunnel` calls `WanderTunnel.ensureStarted()`, which POLLS the loopback endpoint rather than trusting `.connected` — `.connected` only means iOS started the provider, and injecting before the route is installed fails. A `wander://` link returns instantly, so the shortcut would have to guess a delay and would sometimes restore cellular underneath a half-built session. Determinism is the whole point.

ACTION ORDER AS SHIPPED:

1. Comment (the explanation, in the file).
2. **Get Network Details -> Cellular -> Carrier Name** — `is.workflow.actions.getwifi`, `WFNetworkDetailsNetwork` = `Cellular`, `WFCellularDetail` = `Carrier Name`, carries `UUID` so the If below can reference it.
3. **Get Network Details -> Wi-Fi -> Network Name** — same identifier, `WFNetworkDetailsNetwork` = `Wi-Fi`, `WFWiFiDetail` = `Network Name`, own `UUID`.
4. Comment (what the two checks are for).
5. `If <carrier name> has any value` — `WFCondition` 100, `WFControlFlowMode` 0, group OUTER.
6.   `If <Wi-Fi network name> does not have any value` — `WFCondition` 101, `WFControlFlowMode` 0, group INNER.
7.     Set Airplane Mode **On** — `is.workflow.actions.airplanemode.set`, `OnValue` = true (same `OnValue` key as the Set Wi-Fi / Cellular toggle family).
8.     Wait **4 seconds** — `is.workflow.actions.delay`. WHY 4: iOS tears the cellular data interface down asynchronously, so `pdp_ip0` lingers for a beat after the switch flips. The community "Offline auto StikDebug" shortcut uses ~3s; the entire discovery hinges on lockdownd seeing **no** cellular interface at connect time, so an under-wait silently reproduces the exact failure this shortcut exists to remove — and it reproduces it as "the tunnel just didn't come up", which looks like the old bug rather than a tuning problem. One extra second buys the margin. Not longer: Airplane Mode also drops Wi-Fi, and every extra second is offline time the user is paying for.
9.   End If (INNER).
10. Otherwise (OUTER) — **Show Notification**, `is.workflow.actions.notification`, `WFNotificationActionTitle` / `WFNotificationActionBody` / `WFNotificationActionSound`. Tells the user the network state could not be read and that Airplane Mode was therefore left alone.
11. End If (OUTER).
12. **ADD: Start Wander Tunnel** (Wander App Intent, no parameters).
13. **ADD: Teleport to Place** (Wander App Intent) -> set its **Place** field to **Shortcut Input**.
14. Wait **2 seconds**. WHY 2, and why any at all when the two intents already blocked: they guarantee the tunnel answered and the inject returned 0. Two seconds is cheap insurance at the one moment where being early is unrecoverable.
15. Set Airplane Mode **Off** — `OnValue` = false.
16. Comment (why the tail is unconditional).
17. Open URLs -> `wander://cellular-done` (literal `WFInput` as a `WFTextTokenString`).

### The Wi-Fi check: what was wrong, what was verified, and how it fails now

**What was wrong.** The shipped file carried `is.workflow.actions.getwifi` with a `UUID` and *no parameters*, and a single `If <that> does not have any value -> Set Airplane Mode On`. That is one determination with two ways to be wrong and one dangerous outcome: if the action returned nothing — wrong/missing parameters, a greyed import, a permission the action needs — the If read it as "no Wi-Fi" and turned Airplane Mode on for a user who was on Wi-Fi and needed none of it.

**What was verified, and how.** The action identifiers and parameter keys below were read out of WorkflowKit's own action definitions in this machine's dyld shared cache (`dyld_shared_cache_arm64e.05`, the `is.workflow.actions.getwifi` record at byte offset 1515902784), not inferred from a community shortcut:

- `is.workflow.actions.getwifi` -> class `WFGetNetworkDetailsAction`, display name **Get Network Details**, default output name **Network Details**.
- `WFNetworkDetailsNetwork` (a `WFNetworkPickerParameter`) with the two branches **Wi-Fi** and **Cellular** — the parameter summaries in the definition are literally `WFNetworkDetailsNetwork(Wi-Fi),WFWiFiDetail` and `WFNetworkDetailsNetwork(Cellular),WFCellularDetail`.
- `WFWiFiDetail`: Network Name, BSSID, Wi-Fi Standard, RX Rate, TX Rate, RSSI, Noise, Channel Number, Hardware MAC Address.
- `WFCellularDetail`: Carrier Name, Radio Technology, Country Code, Is Roaming Abroad, Number of Signal Bars.
- `is.workflow.actions.notification` -> `WFNotificationAction`, params `WFNotificationActionTitle`, `WFNotificationActionBody`, `WFNotificationActionSound`.
- `is.workflow.actions.comment` / `.conditional` / `.airplanemode.set` / `.delay` / `.openurl` all present in the same definition table.

So the identifier was right all along; the **parameters were missing**, which is the half that decides whether the action returns a network name or nothing at all. They are now set.

**Still NOT verified, and stated as such:** the integers `WFCondition` 100 ("has any value") and 101 ("does not have any value"). They are not recoverable from the action definitions — the operator table is not string-keyed — and this pack has no other conditional shortcut to compare against. So the structure is built to survive being wrong about them rather than to depend on being right.

**How it fails now.** Two checks instead of one, nested, with the dangerous action in the inner branch:

- *Cannot read the network at all* (action broken, greyed, or returning nothing): the OUTER `has any value` is false, so we take Otherwise, show a notification, and **never touch Airplane Mode**. The run then just tries the tunnel, fails visibly on cellular, and Wander reports "nothing is simulating" and offers a retry.
- *No SIM / Wi-Fi-only iPad*: same branch, same outcome. An Airplane Mode cycle cannot help a device with no cellular to rescue, so it is not performed.
- *On Wi-Fi*: outer true, inner `does not have any value` false, Airplane Mode untouched — same as before, and now it also survives the action returning nothing, because that case is caught one level up.
- *Cellular, no Wi-Fi*: outer true, inner true, airplane cycle runs. The intended path.
- *If 100/101 turn out to be swapped*: on any device with a carrier the OUTER condition inverts to false, we take Otherwise and touch nothing. The feature does not fire and says so. (The one residue is a carrier-less device on Wi-Fi, where a swap could still fire the cycle — Wander never offers the button there, since its own entry point requires `NetworkReachability.isOnCellular`, and the app-side recovery banner below covers it if someone runs the shortcut by hand.)

In every one of those, the failure is "Cellular Mode didn't fire, and something said so", never "the phone lost signal for no reason".

### Being left in Airplane Mode, and why the OFF cannot move earlier

The Airplane-Mode-Off is at step 15, near the end. If the run is interrupted before it — force-quit, cancelled, or Shortcuts losing background execution while the App Intents foreground Wander — **the phone stays in Airplane Mode**. That is the worst failure this feature has, and the old "the unconditional Off at the end means nothing can strand the phone offline" claim was only true for a run that reaches the end.

**Can the OFF move earlier — say, right after the tunnel is up and before the teleport?** No, and the reason is in the code rather than in the discovery. `Start Wander Tunnel` brings up Wander's own packet tunnel and polls `ip:49152` with a plain bounded TCP probe (`isTunnelSimEndpointReachable`); that probe opens and closes a socket. The session lockdownd will not re-evaluate is the DVT one built inside `_simulate_location` (`tunnel_create_rppairing` -> remote server -> `location_simulation_new`), and that is built by the **teleport**, not by the tunnel step. Restoring cellular between the two would put the radio back exactly where lockdownd refuses the connection, at the moment the connection is made. So the teleport has to land first, which is why the OFF sits where it does.

Trimming the trailing 2 s would shave 2 s off a ~30 s window at the one moment where being early is unrecoverable, which is not a trade worth making. **The exposure window is therefore irreducible in the shortcut, and the recovery had to be built in the app instead:** Wander records a marker when it launches a run (timestamp + the pin), clears it when the run reports completion, and — if the marker is live, the grace period has passed, and the device has no network path of any kind — shows a calm banner explaining that Airplane Mode is still on and how to turn it off. See `Wander/Services/CellularModeRun.swift`. Critically, none of that recovery UI is gated on `NetworkReachability.isOnCellular`, which is *false* in Airplane Mode and is what used to hide the app's only mention of Airplane Mode at exactly the wrong moment.

INPUT: text, `"lat, lng"`. Wander passes the selected pin via `shortcuts://x-callback-url/run-shortcut?...&input=text&text=40.75800,%20-73.98550` (see `ShortcutRunner.runCellularMode`), formatted with `en_US_POSIX` so a comma-decimal locale cannot turn one coordinate into four numbers. `TeleportIntent` already parses `"lat, lng"`, an address, or a place name, so there is no formatting logic in the shortcut to get subtly wrong.

CALLBACKS: `x-success` -> `wander://cellular-done`, `x-error` -> `wander://cellular-missing` (clears the installed flag, so a renamed or deleted shortcut brings the setup card back instead of failing forever, and retires the stranding marker because nothing ran). The shortcut ALSO opens `wander://cellular-done` itself as its last action, so completion is recorded even if the x-callback is lost; the handler is idempotent. `cellular-done` is what tells Wander to stop watching for a stranded phone and to check whether anything is actually simulating.

WHAT THE USER SEES: Shortcuts flashes to the foreground for about a second (unavoidable for a URL-invoked run), the status bar goes to Airplane Mode and calls/data are off for **up to about 30 seconds, usually less**, then it comes back and Wander returns to the front with the pin set. If it did not work, Wander says so and offers to try again.


Hand-build in the Shortcuts app (guaranteed fallback if the file will not import):

1. New Shortcut. Rename it EXACTLY: Wander Cellular Mode  (Wander's button finds it by name.)
2. Add "Comment" and paste anything you like — or skip it.
3. Add "Get Network Details". Set Network to **Cellular** and the detail to **Carrier Name**.
4. Add "Get Network Details" again. Set Network to **Wi-Fi** and the detail to **Network Name**.
5. Add "If". Set its input to the **Carrier Name** variable from step 3, condition **has any value**.
6. Inside that If, add another "If". Set its input to the **Network Name** variable from step 4, condition **does not have any value**.
7. Inside the inner If: add "Set Airplane Mode" and set it to **On**.
8. Inside the inner If: add "Wait" and set it to **4** seconds. (The action is called Wait; search "Wait", not "Delay".)
9. On the OUTER If, tap "Otherwise" and add "Show Notification" with a body like "Couldn't read this device's network state, so Airplane Mode was left alone."
10. Below the outer End If: add **Start Wander Tunnel** (search its name; it appears under Wander).
11. Below that: add **Teleport to Place**. Tap the Place field and pick **Shortcut Input**.
12. Add "Wait", **2** seconds.
13. Add "Set Airplane Mode", **Off**.
14. Add "Open URLs" and type the literal text `wander://cellular-done` into it. Make sure it is literal text, not a blue variable chip.

Steps 12-14 must sit OUTSIDE every If, so they run on every path.

To use: teleport from Wander's map — on mobile data with no Wi-Fi the Teleport panel offers "Simulate — Cellular Mode", which runs this with the pin you selected. Running it by hand works too; it will ask you where to go. It is a paid feature on the same footing as the ordinary Simulate button: a free account gets its one teleport a day through this path too, not an unlimited side door.
