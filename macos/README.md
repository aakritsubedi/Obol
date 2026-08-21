# Obol macOS app

The native target is a menu-bar app. Build the daemon and dashboard before opening the Xcode project:

    npm ci
    npm run build
    open macos/Obol.xcodeproj

The Bundle daemon phase copies the bundled daemon, dashboard assets, and every installed Darwin ccusage runtime into the app. Users do not need npm; they only need a system-visible Node executable to run the bundled daemon.

## Version stamping

The root package.json version is the source of truth. Stamp all three package files and the Xcode target with:

    ./scripts/set-version.sh 0.2.0
    ./scripts/check-version.sh --no-tag

The stamping script validates x.y.z, rejects a leading v, uses npm version for the workspaces and lockfile, updates MARKETING_VERSION, and does not commit or tag. Release CI compares the v* tag to the stamped version before it builds. CFBundleVersion is the git rev-list --count HEAD build number and is not compared to a release tag.

The shared Obol scheme lives at Obol.xcodeproj/xcshareddata/xcschemes/Obol.xcscheme. Its debug-only environment entries for OBOL_UPDATE_FEED_URL and OBOL_UPDATE_REPO are disabled by default; enable them when running the fixture server.

## Universal build

The release build uses the generic macOS destination and explicitly disables active-architecture narrowing:

    xcodebuild \
      -project macos/Obol.xcodeproj \
      -scheme Obol \
      -configuration Release \
      -destination 'generic/platform=macOS' \
      -derivedDataPath .xcodebuild \
      ARCHS='arm64 x86_64' \
      ONLY_ACTIVE_ARCH=NO \
      CODE_SIGNING_ALLOWED=NO \
      build

Verify the result with:

    lipo -info .xcodebuild/Build/Products/Release/Obol.app/Contents/MacOS/Obol
    /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' .xcodebuild/Build/Products/Release/Obol.app/Contents/Info.plist

The first command must report arm64 and x86_64. The second must print a concrete version, never the literal $(MARKETING_VERSION).

## Packaging, ZIP, and DMG

    npm run package:dmg

macos/scripts/package-dmg.sh stages one Release app, signs its nested executables and outer bundle, writes the updater ZIP with ditto -c -k --sequesterRsrc --keepParent, then creates the DMG from that same staging directory. It writes:

- dist/Obol-VERSION.dmg for manual drag-to-Applications installation
- dist/Obol-VERSION.zip for the in-app updater
- dist/SHA256SUMS with basenames so shasum -c works after download

OBOL_VERSION can override the package version for a controlled build, but the script asserts that the built plist matches it. SIGN_IDENTITY defaults to - for an ad-hoc signature. OUTPUT_DIR changes the output directory, and SKIP_BUILD=1 reuses existing daemon/dashboard bundles.

The supported user-owned install path is ~/Applications/Obol.app as well as /Applications/Obol.app. The updater refuses build products under DerivedData or .xcodebuild. If the installed parent is not writable, it reveals the staged app in Finder rather than asking for administrator privileges.

## Signing and notarization

Without a Developer ID identity, the app is ad-hoc signed and not notarized. A downloaded DMG therefore needs right-click → Open once. The in-app ZIP arrives through URLSession and is deliberately verified before the app swap.

The notarization path is env-gated and intentionally untested in this repository. Set SIGN_IDENTITY to a Developer ID Application identity and provide AC_API_KEY_ID, AC_API_ISSUER, and AC_API_KEY. The script staples the app before re-zipping it, then submits and staples the DMG. A ZIP cannot be stapled; its copy of the app is refreshed from the stapled staging bundle.

## Build-phase caveat

The Bundle daemon phase declares the script, daemon bundle, daemon package.json, and dashboard index as inputs, plus its two copied entry points as outputs. It therefore skips correctly on a second identical build. It does not enumerate node_modules: changing only a ccusage dependency can leave the phase skipped, so run a clean build after a dependency bump.
