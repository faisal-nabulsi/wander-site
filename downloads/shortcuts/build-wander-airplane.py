#!/usr/bin/env python3
"""Build wander-airplane.shortcut — the ONLY shortcut Cellular Mode needs.

WHY THIS FILE EXISTS AT ALL, AND WHY IT IS SO SMALL
───────────────────────────────────────────────────
The old wander-cellular-mode.shortcut was the conductor: it toggled Airplane Mode, then called two
of Wander's own App Intents (Start Wander Tunnel, Teleport to Place) so that it could WAIT for them,
then toggled the radio back. Those two actions are why setup had a step 4 telling people to open the
Shortcuts editor and add them by hand — an App Intent action serialises the target app's identity:

    AppIntentDescriptor = { TeamIdentifier, BundleIdentifier, AppIntentIdentifier, Name }

and Wander's bundle id is different for every person who installs it (the cert build is
app.yellow2173.nadir6666; a free-Apple-ID re-sign produces com.stik.stikdebug.<TeamID>). One static
file cannot carry an identifier that is different per install, so those two actions imported greyed
out and the user had to re-pick them.

Generating the file on-device with the RIGHT identity does not fix it: since iOS 15 a .shortcut file
must be SIGNED to be imported, and an iPhone cannot sign one. Apple's own words, from the shipping
iOS 26.5 WorkflowKit (en.lproj/Localizable.strings):

    "Importing unsigned shortcut files is not supported. Please use another sharing option."

So the fix is not a better file — it is not needing the identity in the file at all. Wander now
conducts the sequence itself (CellularModeSequence.swift) and this shortcut does the ONE thing an app
is not allowed to do: flip the Airplane Mode switch. Every action below is an `is.workflow.actions.*`
built-in. There is no bundle id, no team id, no AppIntentDescriptor anywhere in the output, so ONE
signed copy is correct for the cert build, for every free-sideload re-sign, and for every future
signature — and there is nothing left for the user to edit after importing.

WHAT WAS VERIFIED, AND HOW (nothing here is guessed)
────────────────────────────────────────────────────
  is.workflow.actions.airplanemode.set   present in iOS 26.5 WorkflowKit's binary, backed by
                                         WFSetAirplaneModeIntent ("Set Airplane Mode", params
                                         Operation/State). Parameter key `OnValue` is the legacy
                                         Shortcuts key, matching the previously shipped
                                         wander-cellular-mode.shortcut. (Neither `OnValue` nor
                                         `WFDelayTime` appears in WorkflowKit's string table — but
                                         `WFDelayTime` is unquestionably the current key for the Wait
                                         action, so absence there proves nothing about either.)
  is.workflow.actions.conditional        WFCondition 4 == "is" (text equality) with
                                         WFConditionalActionString, read out of REAL conditionals in
                                         this Mac's ~/Library/Shortcuts/Shortcuts.sqlite. Control
                                         flow modes 0/1/2 = If / Otherwise / End If, matching the
                                         already-shipped wander-cellular-mode.shortcut.
  WFInput on a conditional               `{ Type = "Variable", Variable = <token> }`. THE ENVELOPE IS
                                         MANDATORY — see the section below. 47 of 47 editor-built
                                         If-heads in that database use it; 0 of 47 use a bare token.
  Shortcut Input                         `{ Value = { Type = "ExtensionInput" },
                                            WFSerializationType = "WFTextTokenAttachment" }` —
                                         copied from a real Set Variable action in that same
                                         database. Correct for ORDINARY actions as a bare token;
                                         on a conditional it must go inside the Variable envelope.
  is.workflow.actions.delay              WFDelayTime, as in every shipped Wander shortcut.
  is.workflow.actions.openurl            WFTextTokenString shape, copied verbatim from the shipped
                                         wander-cellular-mode.shortcut.
  OnValue (airplanemode.set)             No longer a guess. The same database contains an
                                         editor-built shortcut ("Open App", not ours) whose
                                         `is.workflow.actions.airplanemode.set` carries `OnValue`,
                                         and the owner's IMPORTED copy of wander-cellular-mode kept
                                         `OnValue` true/false intact through the import. The key is
                                         right; it was never part of this bug.

THE BUG THIS FILE SHIPPED WITH, AND WHY IT LOOKED FINE
──────────────────────────────────────────────────────
`WFInput` on a CONDITIONAL is a variable-typed parameter. It takes

    { "Type": "Variable", "Variable": { …token… } }

and NOT the bare token. This file used to pass the bare token, copied from a Set Variable action —
where a bare token is correct. WorkflowKit silently drops a parameter it cannot decode, so the
action still imported, still said "If", and simply had no input left to hang a comparison on: the
editor rendered a pale, empty `If [Condition]` and every neighbouring action looked perfect.

That is why nobody caught it by reading the file. Proof it is a silent DROP and not a parse error:
the owner's imported copy of wander-cellular-mode.shortcut, read back out of Shortcuts.sqlite after
his iPhone synced it, has `WFInput` AND `WFConditionalActionString` missing from both If-heads while
`GroupingIdentifier`, `WFCondition` and `WFControlFlowMode` survived — and every non-conditional
action in the same file, including both `airplanemode.set` actions, came through untouched.

An `If` with no condition is not a working shortcut, so this mattered on both files.

WHICH WAY THE `Otherwise` BRANCH POINTS IS A SAFETY DECISION
────────────────────────────────────────────────────────────
The If tests for "on", so ANY other input — including no input at all, which is what happens when
somebody runs this by hand out of the Shortcuts app — lands in Otherwise and turns Airplane Mode
OFF. Turning it off when it was already off is a no-op; turning it ON because a variable was empty
would take somebody's phone offline by accident. The safe outcome has to be the default one.

That ordering also decides how the file DEGRADES, which is why the ON branch is the one inside the
`If` and the OFF branch is the one in `Otherwise`, and not the other way round. If WorkflowKit ever
drops the three conditional actions wholesale, what is left executes straight through —

    Set Airplane Mode ON → Wait 4 → Set Airplane Mode OFF → open wander://open

— which ends with the radio back ON. Inverting the branches would leave a stripped file ending on
Airplane Mode ON, i.e. a phone with no signal. Same actions, opposite failure.

The one case no single-input toggle can defend against is a condition that survives but always
evaluates TRUE, which would take the ON branch even for input "off". Nothing inside a Shortcut can
catch that, because the branch choice IS the information. Wander covers it from outside instead:
`CellularModeRun.airplaneModeLeftOn` is persisted the moment the radio actually goes off and only
cleared when it comes back, and it raises a recovery banner telling the user how to switch Airplane
Mode off by hand. That net does not depend on this file being correct.

RELEASE STEP YOU CANNOT SKIP
────────────────────────────
The output of this script is an unsigned XML plist and iOS WILL refuse it (see the string above).
Every file currently in this directory has that problem — they all start with `<?xm`. Before
publishing, on a Mac, signed in to your Apple Account:

    /usr/bin/shortcuts sign --mode anyone \
        --input  unsigned/wander-airplane.shortcut \
        --output "Wander Airplane.shortcut"

`--mode anyone` is required for public distribution; the CLI default is `people-who-know-me`, which
binds the file to the signer's contacts and fails for strangers. A correctly signed file starts with
the magic `AEA1`, not `<?xm`.

PUBLISH IT UNDER THE DISPLAY NAME — note the output filename above. A .shortcut carries NO name of
its own: its authenticated header holds only a certificate chain, and the payload's single entry is
always called `Shortcut.wflow`. So iOS has exactly one thing to name an import after — the
downloaded file's name, minus the extension. Ship `wander-airplane.shortcut` and it imports as
"wander-airplane", which is NOT the name Wander runs, and every user is quietly required to rename
it by hand. Ship it as `Wander Airplane.shortcut` and it imports correct. The filename is not part
of the signed bytes, so this costs nothing and invalidates nothing.

Signing does NOT make the shortcut "trusted" — that is a separate gate. On current iOS the setting
is Settings → Apps → Shortcuts → **Private Sharing** (Apple renamed it from "Allow Untrusted
Shortcuts", which is what older iOS still calls it, under Advanced). The row stays hidden until
Shortcuts has run at least one shortcut. Wander's setup card says all of this.
"""

import plistlib
import pathlib

# Writes the SOURCE, never the published file. This used to point at the sibling
# `wander-airplane.shortcut` — the published, SIGNED copy — so a plain rebuild silently replaced a
# signed AEA1 file with unsigned XML, which iOS refuses outright. Per DISTRIBUTION.md the editable
# sources live in `unsigned/` and signing is what promotes one to the published name.
OUT = pathlib.Path(__file__).with_name("unsigned") / "wander-airplane.shortcut"

# Stable UUIDs. Fixed rather than random so that rebuilding the file twice produces byte-identical
# output and a diff of two builds shows only what actually changed.
G_BRANCH = "7A2F5C10-0000-4C21-9E44-000000000001"
U_IF = "7A2F5C10-0000-4C21-9E44-000000000002"
U_ON = "7A2F5C10-0000-4C21-9E44-000000000003"
U_WAIT = "7A2F5C10-0000-4C21-9E44-000000000004"
U_OFF = "7A2F5C10-0000-4C21-9E44-000000000005"
U_RETURN = "7A2F5C10-0000-4C21-9E44-000000000006"

COND_IS = 4          # text equality, verified in real on-device conditionals
MODE_IF = 0
MODE_OTHERWISE = 1
MODE_ENDIF = 2

# Seconds to sit still after the radio goes off, before handing control back to Wander. iOS does not
# drop the cellular interface the instant the switch flips, and Wander's tunnel has to be established
# AFTER it is gone. Wander re-checks the interface itself when it regains the foreground, so this is
# a head start rather than the whole guarantee — but starting the check from zero would mean burning
# the first seconds of a 12-second tunnel timeout on a radio that is still up.
SETTLE_SECONDS = 4


def comment(text):
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.comment",
        "WFWorkflowActionParameters": {"WFCommentActionText": text},
    }


def shortcut_input():
    """The bare `Shortcut Input` token, as an ORDINARY action serialises it.

    Correct as-is for actions that take a value directly — Set Variable, Open URL, Text. It is NOT
    correct on a conditional, which needs `variable(...)` around it. Reading this docstring as
    "this is how you reference Shortcut Input anywhere" is precisely what shipped two broken files:
    the token was always right, the envelope around it was missing.
    """
    return {
        "Value": {
            "Type": "ExtensionInput",
            # A conditional compares a TYPED value. Without this coercion the input has no declared
            # type, WorkflowKit cannot type the comparison, and it drops `WFConditionalActionString`
            # on import — which renders as an `If` with a RED "is" and no value box beside it.
            # 44 of 44 real text-equality If-heads in a genuine library carry an Aggrandizements
            # entry; NONE carry zero. (43 of those are WFPropertyVariableAggrandizement, which is a
            # user picking a property — but "always a property" is not "optional", and reading it as
            # optional is what shipped the second broken file.)
            "Aggrandizements": [
                {
                    "Type": "WFCoercionVariableAggrandizement",
                    "CoercionItemClass": "WFStringContentItem",
                }
            ],
        },
        "WFSerializationType": "WFTextTokenAttachment",
    }


def variable(token):
    """Wrap a token for a VARIABLE-typed parameter, which is what `WFInput` is on a conditional.

    47 of 47 editor-built If-heads in ~/Library/Shortcuts/Shortcuts.sqlite carry exactly this shape;
    0 of 47 carry a bare token.

    The coercion that belongs INSIDE the token lives in `shortcut_input()`. An earlier pass left it
    out, reasoning that most real samples carry a *property* aggrandizement rather than a coercion
    and that copying one in would be cargo-culting. The envelope alone got the input and the
    operator to render — and the comparison value still vanished, on device. Re-counted: 44 of 44
    text-equality heads carry an Aggrandizements entry and none carry zero.
    """
    return {"Type": "Variable", "Variable": token}


def if_input_is(uuid, text):
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": G_BRANCH,
            "UUID": uuid,
            "WFCondition": COND_IS,
            "WFConditionalActionString": text,
            "WFControlFlowMode": MODE_IF,
            "WFInput": variable(shortcut_input()),
        },
    }


def branch(mode):
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": G_BRANCH,
            "WFControlFlowMode": mode,
        },
    }


def airplane(uuid, on):
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.airplanemode.set",
        "WFWorkflowActionParameters": {"UUID": uuid, "OnValue": bool(on)},
    }


def wait(uuid, seconds):
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.delay",
        "WFWorkflowActionParameters": {"UUID": uuid, "WFDelayTime": seconds},
    }


def open_url(uuid, url):
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.openurl",
        "WFWorkflowActionParameters": {
            "UUID": uuid,
            "WFInput": {
                "Value": {"attachmentsByRange": {}, "string": url},
                "WFSerializationType": "WFTextTokenString",
            },
        },
    }


HEADER = """WHAT IT DOES: flips Airplane Mode, and nothing else. Wander runs it twice — once with "on" before it brings its tunnel up, once with "off" afterwards — and does all the real work itself in between, where it can show you progress and tell you if something failed.

WHY WANDER NEEDS YOU FOR THIS: iOS gives an app no way to touch Airplane Mode. Shortcuts is the only thing on the system that can. That is the whole reason this file exists.

WHY IT MATTERS: on mobile data with no Wi-Fi, iOS refuses to let Wander's developer tunnel CONNECT — but it never re-checks once the tunnel is up. So the radio only has to be off for the moment the connection is made.

THERE IS NOTHING TO EDIT AND NOTHING TO RENAME. Every action below is a built-in Shortcuts action. Unlike the older "Wander Cellular Mode" shortcut, this one contains no Wander actions, so nothing in it is tied to your copy of the app and nothing imports greyed out.

INPUT: text. "on" turns Airplane Mode on and waits for the radio to settle. ANYTHING ELSE — including running this by hand with no input — turns Airplane Mode off. That default is deliberate: an empty variable should never be able to take your phone offline, and running this by hand is exactly what you would do to get your signal back."""

TAIL = """wander://open just brings Wander back to the front. It is a plain URL, not an app action, so it carries no app identity and works on every copy of Wander.

Wander is also told separately, by the callback it attached when it ran this shortcut. The two arrive moments apart and Wander ignores the second — belt and braces, because a run that finished but never got back to Wander would leave the sequence half-done."""


def build():
    actions = [
        comment(HEADER),
        if_input_is(U_IF, "on"),
        airplane(U_ON, True),
        wait(U_WAIT, SETTLE_SECONDS),
        branch(MODE_OTHERWISE),
        airplane(U_OFF, False),
        branch(MODE_ENDIF),
        comment(TAIL),
        open_url(U_RETURN, "wander://open"),
    ]
    return {
        "WFQuickActionSurfaces": [],
        "WFWorkflowActions": actions,
        "WFWorkflowClientRelease": "18.0",
        "WFWorkflowClientVersion": "2038.0.2.3",
        "WFWorkflowHasShortcutInputVariables": True,
        "WFWorkflowIcon": {
            "WFWorkflowIconGlyphNumber": 61440,          # airplane-ish glyph, as the old file used
            "WFWorkflowIconStartColor": 4282601983,      # Wander blue, matching the rest of the pack
        },
        "WFWorkflowImportQuestions": [],
        "WFWorkflowInputContentItemClasses": ["WFStringContentItem"],
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
    }


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(plistlib.dumps(build(), fmt=plistlib.FMT_XML))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    print('REMEMBER: sign it to "Wander Airplane.shortcut" — see the module docstring.')
