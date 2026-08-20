# macOS app

Open `TokenCostWidget.xcodeproj` in Xcode after building the daemon and dashboard:

```sh
npm install
npm run build
open macos/TokenCostWidget.xcodeproj
```

The build phase copies the bundled daemon, dashboard assets, and ccusage's production runtime dependencies into the app resources. Users do not need to run `npm install`; they only need a system Node installation to execute the bundled daemon.
The daemon invokes the bundled ccusage JavaScript entry point with that same Node executable, so launching the app from Finder does not require an nvm/Homebrew shell `PATH` or `npx`.

To build and install a local app bundle:

```sh
xcodebuild -project macos/TokenCostWidget.xcodeproj \
  -scheme TokenCostWidget \
  -configuration Release \
  -derivedDataPath .xcodebuild \
  CODE_SIGNING_ALLOWED=NO build

mkdir -p "$HOME/Applications"
ditto .xcodebuild/Build/Products/Release/TokenCostWidget.app \
  "$HOME/Applications/TokenCostWidget.app"
open "$HOME/Applications/TokenCostWidget.app"
```

The app bundle contains ccusage and its native runtime. Rebuild and replace the installed app after changing dependencies or daemon code; do not run `npm install` from inside the installed `.app`.
