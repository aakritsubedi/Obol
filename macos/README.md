# macOS app

Open `Obol.xcodeproj` in Xcode after building the daemon and dashboard:

```sh
npm install
npm run build
open macos/Obol.xcodeproj
```

The build phase copies the bundled daemon, dashboard assets, and ccusage's production runtime dependencies into the app resources. Users do not need to run `npm install`; they only need a system Node installation to execute the bundled daemon.
The daemon invokes the bundled ccusage JavaScript entry point with that same Node executable, so launching the app from Finder does not require an nvm/Homebrew shell `PATH` or `npx`.

## Packaging a disk image

```sh
npm install
npm run package:dmg
```

The script builds the daemon and dashboard, produces a Release app bundle, signs it, and writes `dist/Obol-<version>.dmg` — a volume holding the app next to an `/Applications` symlink, so installing is a drag.

Overrides:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SIGN_IDENTITY` | `-` (ad-hoc) | A `Developer ID Application: …` identity signs with the hardened runtime enabled, which is the prerequisite for notarizing. |
| `OUTPUT_DIR` | `dist/` | Where the disk image is written. |
| `SKIP_BUILD` | unset | Set to `1` to reuse the daemon and dashboard bundles already on disk. |

An ad-hoc signature is enough to run the app on the machine that built it, but Gatekeeper rejects it after a download because it is not notarized. The first launch on another Mac needs a right click on the app and **Open**, or:

```sh
xattr -dr com.apple.quarantine /Applications/Obol.app
```

Node must be installed at `/opt/homebrew/bin/node`, `/usr/local/bin/node`, or `/usr/bin/node` on the target machine. The app spawns the daemon with the first of those it finds and does not read the login shell `PATH`, so an nvm-only Node installation is invisible to it and the widget reports that it could not start the daemon.

To build and install a local app bundle without a disk image:

```sh
xcodebuild -project macos/Obol.xcodeproj \
  -scheme Obol \
  -configuration Release \
  -derivedDataPath .xcodebuild \
  CODE_SIGNING_ALLOWED=NO build

mkdir -p "$HOME/Applications"
ditto .xcodebuild/Build/Products/Release/Obol.app \
  "$HOME/Applications/Obol.app"
open "$HOME/Applications/Obol.app"
```

The app bundle contains ccusage and its native runtime. Rebuild and replace the installed app after changing dependencies or daemon code; do not run `npm install` from inside the installed `.app`.
