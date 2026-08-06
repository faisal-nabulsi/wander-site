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
  Shortcut Input                         `{ Value = { Type = "ExtensionInput" },
                                            WFSerializationType = "WFTextTokenAttachment" }` —
                                         copied from a real Set Variable action in that same
                                         database.
  is.workflow.actions.delay              WFDelayTime, as in every shipped Wander shortcut.
  is.workflow.actions.openurl            WFTextTokenString shape, copied verbatim from the shipped
                                         wander-cellular-mode.shortcut.

WHICH WAY THE `Otherwise` BRANCH POINTS IS A SAFETY DECISION
────────────────────────────────────────────────────────────
The If tests for "on", so ANY other input — including no input at all, which is what happens when
somebody runs this by hand out of the Shortcuts app — lands in Otherwise and turns Airplane Mode
OFF. Turning it off when it was already off is a no-op; turning it ON because a variable was empty
would take somebody's phone offline by accident. The safe outcome has to be the default one.

RELEASE STEP YOU CANNOT SKIP
────────────────────────────
The output of this script is an unsigned XML plist and iOS WILL refuse it (see the string above).
Every file currently in this directory has that problem — they all start with `<?xm`. Before
publishing, on a Mac, signed in to your Apple Account:

    /usr/bin/shortcuts sign --mode anyone \
        --input  wander-airplane.shortcut \
        --output wander-airplane.signed.shortcut

`--mode anyone` is required for public distribution; the CLI default is `people-who-know-me`, which
binds the file to the signer's contacts and fails for strangers. A correctly signed file starts with
the magic `AEA1`, not `<?xm`. Signing does NOT make the shortcut "trusted" — that is a separate gate,
and the user still has to switch on Settings → Apps → Shortcuts → Advanced → Allow Untrusted
Shortcuts. Wander's setup card already asks for that.
"""

import plistlib
import pathlib

OUT = pathlib.Path(__file__).with_name("wander-airplane.shortcut")

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
    """The `Shortcut Input` token, exactly as a real Set Variable action serialises it."""
    return {
        "Value": {"Type": "ExtensionInput"},
        "WFSerializationType": "WFTextTokenAttachment",
    }


def if_input_is(uuid, text):
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": G_BRANCH,
            "UUID": uuid,
            "WFCondition": COND_IS,
            "WFConditionalActionString": text,
            "WFControlFlowMode": MODE_IF,
            "WFInput": shortcut_input(),
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


HEADER = """Wander Airplane — name this shortcut EXACTLY "Wander Airplane" or Wander's Cellular Mode button will not find it. Shortcuts are called by name.

WHAT IT DOES: flips Airplane Mode, and nothing else. Wander runs it twice — once with "on" before it brings its tunnel up, once with "off" afterwards — and does all the real work itself in between, where it can show you progress and tell you if something failed.

WHY WANDER NEEDS YOU FOR THIS: iOS gives an app no way to touch Airplane Mode. Shortcuts is the only thing on the system that can. That is the whole reason this file exists.

WHY IT MATTERS: on mobile data with no Wi-Fi, iOS refuses to let Wander's developer tunnel CONNECT — but it never re-checks once the tunnel is up. So the radio only has to be off for the moment the connection is made.

THERE IS NOTHING TO EDIT. Every action below is a built-in Shortcuts action. Unlike the older "Wander Cellular Mode" shortcut, this one contains no Wander actions, so nothing in it is tied to your copy of the app and nothing imports greyed out.

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
    OUT.write_bytes(plistlib.dumps(build(), fmt=plistlib.FMT_XML))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    print("REMEMBER: sign it before publishing — see the module docstring.")
