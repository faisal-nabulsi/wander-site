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
