# Publishing Wander builds

**Binaries are never committed to this repo.** Committing installers here grew the git
history to 4.5 GB (95+ OTA builds × 60–130 MB each) before the 2026-07-20 migration to
GitHub Releases. The `downloads/` folder now holds only the two update manifests —
`android.json` and `desktop.json` — because shipped apps fetch them from hardcoded
`wanderspoofer.com/downloads/…` URLs.

## Where binaries live

| Binary | Home | Stable URL |
|---|---|---|
| Wander.ipa | `Wander` repo, latest release | `https://github.com/faisal-nabulsi/Wander/releases/latest/download/Wander.ipa` |
| Everything else | This repo, rolling release `current` | `https://github.com/faisal-nabulsi/wander-site/releases/download/current/<file>` |

The `current` release is **rolling**: uploading with `--clobber` replaces the asset in
place and the URL never changes, so the site links and OTA manifests keep working.

## Shipping a build

**iOS** — `wander-ios/publish-ota.sh` does everything (build, upload to the Wander
release, write `update.json`/`apps.json`); then push the wander-ios repo.

**Android** — bump `versionCode` in `build.gradle.kts` and `downloads/android.json`
(also `versionName`, `notes`, `size`), then:

    gh release upload current Wander.apk --repo faisal-nabulsi/wander-site --clobber

**Desktop** — bump `WANDER_VERSION` in `wander-desktop/src/main.py` and `version` in
`downloads/desktop.json`, then:

    gh release upload current Wander-Desktop-mac.zip Wander-Windows.zip --repo faisal-nabulsi/wander-site --clobber

**Installer / Wear** — same pattern:

    gh release upload current Wander-Installer.dmg Wander-Installer-Windows.exe Wander-Wear.apk --repo faisal-nabulsi/wander-site --clobber

Then commit + push the manifest bump (json only) so Pages serves the new version info.
