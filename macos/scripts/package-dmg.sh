#!/bin/bash

# Build a Release app bundle and wrap it in a distributable disk image.
#
# Environment overrides:
#   SIGN_IDENTITY  codesign identity; "-" (default) is an ad-hoc signature.
#   OBOL_VERSION   expected marketing version; defaults to root package.json.
#   OUTPUT_DIR     where artifacts are written (default: <repo>/dist)
#   SKIP_BUILD     set to 1 to reuse daemon/dashboard bundles already on disk
#   OBOL_VOLUME_NAME      mounted volume name; defaults to "Obol Installer",
#                         which also becomes the installer window title
#   OBOL_SKIP_DMG_LAYOUT  set to 1 to skip the drag-to-Applications window styling
#   OBOL_DMG_BACKGROUND   path to a custom installer background PNG (@2x)
#   AC_API_KEY_ID, AC_API_ISSUER, AC_API_KEY (App Store Connect API key .p8 body)
#     enable the untested notarization path.
set -eo pipefail
export LANG=C
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SIGN_IDENTITY="$(printenv SIGN_IDENTITY 2>/dev/null || true)"
OUTPUT_DIR="$(printenv OUTPUT_DIR 2>/dev/null || true)"
OBOL_VERSION="$(printenv OBOL_VERSION 2>/dev/null || true)"
CURRENT_PROJECT_VERSION="$(printenv CURRENT_PROJECT_VERSION 2>/dev/null || true)"
SKIP_BUILD_VALUE="$(printenv SKIP_BUILD 2>/dev/null || true)"
APP_NAME="Obol"
VOLUME_NAME="$(printenv OBOL_VOLUME_NAME 2>/dev/null || true)"
DERIVED_DATA="$ROOT/.xcodebuild"

if [ -z "$VOLUME_NAME" ]; then VOLUME_NAME="$APP_NAME Installer"; fi

if [ -z "$SIGN_IDENTITY" ]; then SIGN_IDENTITY="-"; fi
if [ -z "$OUTPUT_DIR" ]; then OUTPUT_DIR="$ROOT/dist"; fi
if [ -z "$OBOL_VERSION" ]; then
  OBOL_VERSION="$(node -p 'require(process.argv[1]).version' "$ROOT/package.json")"
fi
if [ -z "$CURRENT_PROJECT_VERSION" ]; then
  CURRENT_PROJECT_VERSION="$(git -C "$ROOT" rev-list --count HEAD 2>/dev/null || printf '1')"
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "error: dependencies missing; run npm ci first" >&2
  exit 1
fi

if [ "$SKIP_BUILD_VALUE" != "1" ]; then
  echo "==> Building daemon and dashboard"
  (cd "$ROOT" && npm run build)
fi

echo "==> Building $APP_NAME.app (Release)"
xcodebuild \
  -project "$ROOT/macos/$APP_NAME.xcodeproj" \
  -scheme "$APP_NAME" \
  -configuration Release \
  -destination "generic/platform=macOS" \
  -derivedDataPath "$DERIVED_DATA" \
  ARCHS="arm64 x86_64" \
  ONLY_ACTIVE_ARCH=NO \
  MARKETING_VERSION="$OBOL_VERSION" \
  CURRENT_PROJECT_VERSION="$CURRENT_PROJECT_VERSION" \
  CODE_SIGNING_ALLOWED=NO \
  clean build >/dev/null

APP_SOURCE="$DERIVED_DATA/Build/Products/Release/$APP_NAME.app"
if [ ! -d "$APP_SOURCE" ]; then
  echo "error: expected app bundle at $APP_SOURCE" >&2
  exit 1
fi

VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_SOURCE/Contents/Info.plist")"
if [ "$VERSION" = '$(MARKETING_VERSION)' ] || [ "$VERSION" != "$OBOL_VERSION" ]; then
  echo "error: built plist version $VERSION does not match OBOL_VERSION $OBOL_VERSION" >&2
  exit 1
fi

DMG_PATH="$OUTPUT_DIR/$APP_NAME-$VERSION.dmg"
ZIP_PATH="$OUTPUT_DIR/$APP_NAME-$VERSION.zip"
SUMS_PATH="$OUTPUT_DIR/SHA256SUMS"
STAGING="$(mktemp -d "/tmp/$APP_NAME-dmg.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT

echo "==> Staging disk image contents"
ditto "$APP_SOURCE" "$STAGING/$APP_NAME.app"
ln -s /Applications "$STAGING/Applications"

sign_file() {
  if [ "$SIGN_IDENTITY" = "-" ]; then
    codesign --force --timestamp=none --sign "$SIGN_IDENTITY" "$1"
  else
    codesign --force --timestamp --options runtime --sign "$SIGN_IDENTITY" "$1"
  fi
}

echo "==> Signing with identity: $SIGN_IDENTITY"
while IFS= read -r -d '' candidate; do
  if file -b "$candidate" | grep -q "Mach-O"; then
    sign_file "$candidate"
  fi
done < <(find "$STAGING/$APP_NAME.app/Contents/Resources" -type f -perm -u+x -print0)

sign_file "$STAGING/$APP_NAME.app"
codesign --verify --deep --strict "$STAGING/$APP_NAME.app"

mkdir -p "$OUTPUT_DIR"
rm -f "$DMG_PATH" "$ZIP_PATH" "$SUMS_PATH"
echo "==> Creating update ZIP"
ditto -c -k --sequesterRsrc --keepParent "$STAGING/$APP_NAME.app" "$ZIP_PATH"

# Give the mounted volume the app's own icon rather than the generic disk image.
ICON_SET="$ROOT/macos/$APP_NAME/Resources/Assets.xcassets/AppIcon.appiconset"
if [ -d "$ICON_SET" ]; then
  ICONSET_DIR="$STAGING/.volume.iconset"
  mkdir -p "$ICONSET_DIR"
  for source in "$ICON_SET"/icon_*.png; do
    [ -f "$source" ] || continue
    cp "$source" "$ICONSET_DIR/$(basename "$source")"
  done
  if iconutil -c icns "$ICONSET_DIR" -o "$STAGING/.VolumeIcon.icns" 2>/dev/null; then
    SetFile -a C "$STAGING" 2>/dev/null || true
  fi
  rm -rf "$ICONSET_DIR"
fi

AC_API_KEY_ID_VALUE="$(printenv AC_API_KEY_ID 2>/dev/null || true)"
AC_API_ISSUER_VALUE="$(printenv AC_API_ISSUER 2>/dev/null || true)"
AC_API_KEY_VALUE="$(printenv AC_API_KEY 2>/dev/null || true)"
NOTARIZE_ENABLED=0
if [ "$SIGN_IDENTITY" != "-" ] &&
   [ -n "$AC_API_KEY_ID_VALUE" ] &&
   [ -n "$AC_API_ISSUER_VALUE" ] &&
   [ -n "$AC_API_KEY_VALUE" ]; then
  # Intentionally env-gated and untested without a Developer ID account.
  # notarytool authenticates with an App Store Connect API key (--key/--key-id/--issuer);
  # the --key flag needs the .p8 in a file, so the key body from AC_API_KEY is staged
  # outside STAGING (which becomes the DMG source folder) and cleaned up on exit.
  NOTARIZE_ENABLED=1
  AC_KEY_FILE="$(mktemp "/tmp/$APP_NAME-authkey.XXXXXX")"
  trap 'rm -rf "$STAGING" "$AC_KEY_FILE"' EXIT
  printf '%s\n' "$AC_API_KEY_VALUE" > "$AC_KEY_FILE"
  NOTARIZE_ARGS=(--key "$AC_KEY_FILE" --key-id "$AC_API_KEY_ID_VALUE" --issuer "$AC_API_ISSUER_VALUE")
fi

if [ "$NOTARIZE_ENABLED" = "1" ]; then
  echo "==> Notarizing app"
  xcrun notarytool submit "$STAGING/$APP_NAME.app" "${NOTARIZE_ARGS[@]}" --wait
  xcrun stapler staple "$STAGING/$APP_NAME.app"
  rm -f "$ZIP_PATH"
  ditto -c -k --sequesterRsrc --keepParent "$STAGING/$APP_NAME.app" "$ZIP_PATH"
fi

echo "==> Creating disk image"

# Drag-to-Applications layout, Grok-installer style: a near-white background
# scattered with cursor motifs, Obol.app on the left, the Applications folder
# (with its native alias-arrow badge) on the right, 128px icons, no chrome.
# Finder automation writes the icon positions into the volume's .DS_Store, so
# this needs a read-write round trip before final UDZO conversion. If Finder
# automation is unavailable (e.g. no Automation permission), fall back to a
# plain but perfectly valid disk image.
STYLE_DMG=1
if [ "${OBOL_SKIP_DMG_LAYOUT:-}" = "1" ]; then STYLE_DMG=0; fi

BG_PATH="$STAGING/.background/background.png"
if [ "$STYLE_DMG" = "1" ]; then
  mkdir -p "$STAGING/.background"
  if [ -n "${OBOL_DMG_BACKGROUND:-}" ] && [ -f "${OBOL_DMG_BACKGROUND}" ]; then
    cp "${OBOL_DMG_BACKGROUND}" "$BG_PATH"
  elif ! osascript -l JavaScript "$SCRIPT_DIR/make-dmg-background.js" "$BG_PATH" 660 420 >/dev/null; then
    echo "warning: could not generate installer background; using a plain disk image" >&2
    STYLE_DMG=0
  fi
fi

RW_DMG=""
if [ "$STYLE_DMG" = "1" ]; then
  echo "==> Laying out installer window"
  RW_WORK="$(mktemp -d "/tmp/$APP_NAME-rw.XXXXXX")"
  RW_DMG="$RW_WORK/installer.dmg"
  trap 'rm -rf "$STAGING" "${AC_KEY_FILE:-}" "${RW_WORK:-}"' EXIT

  hdiutil create \
    -volname "$VOLUME_NAME" \
    -srcfolder "$STAGING" \
    -fs HFS+ \
    -format UDRW \
    -quiet \
    "$RW_DMG"

  if [ -d "/Volumes/$VOLUME_NAME" ]; then
    echo "error: a disk named \"/Volumes/$VOLUME_NAME\" is already mounted; eject it and retry," >&2
    echo "or pass a different name via OBOL_VOLUME_NAME" >&2
    exit 1
  fi

  DEV="$(hdiutil attach "$RW_DMG" -nobrowse -noautoopen | awk '/^\/dev\//{print $1}' | head -1)"
  MOUNT="/Volumes/$VOLUME_NAME"
  if [ ! -d "$MOUNT" ] || [ -z "$DEV" ]; then
    echo "warning: could not mount the read-write image; using a plain disk image" >&2
    hdiutil detach "$DEV" -force >/dev/null 2>&1 || true
    STYLE_DMG=0
  fi
fi

if [ "$STYLE_DMG" = "1" ]; then
  sleep 1
  LAYOUT_OK=1
  osascript <<OSA || LAYOUT_OK=0
tell application "Finder"
  tell disk "$VOLUME_NAME"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set bounds of container window to {300, 150, 960, 570}
    set vo to the icon view options of container window
    set arrangement of vo to not arranged
    set icon size of vo to 128
    set text size of vo to 16
    set background picture of vo to file ".background:background.png"
    set position of item "$APP_NAME.app" to {165, 205}
    set position of item "Applications" to {495, 205}
    close
    open
    update without registering applications
  end tell
end tell
OSA
  if [ "$LAYOUT_OK" = "1" ]; then
    sleep 2
  else
    echo "warning: Finder styling failed (Automation permission?); keeping default window layout" >&2
  fi

  DETACHED=0
  for _ in 1 2 3; do
    if hdiutil detach "$DEV" >/dev/null 2>&1; then DETACHED=1; break; fi
    sleep 2
  done
  if [ "$DETACHED" != "1" ]; then
    hdiutil detach "$DEV" -force >/dev/null 2>&1 || true
  fi

  hdiutil convert "$RW_DMG" -format UDZO -imagekey zlib-level=9 -quiet -o "$DMG_PATH"
  rm -rf "$RW_WORK"
else
  hdiutil create \
    -volname "$VOLUME_NAME" \
    -srcfolder "$STAGING" \
    -fs HFS+ \
    -format UDZO \
    -imagekey zlib-level=9 \
    -quiet \
    "$DMG_PATH"
fi

if [ "$SIGN_IDENTITY" != "-" ]; then
  codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG_PATH"
fi

if [ "$NOTARIZE_ENABLED" = "1" ]; then
  # Intentionally env-gated and untested without a Developer ID account.
  echo "==> Notarizing disk image"
  xcrun notarytool submit "$DMG_PATH" "${NOTARIZE_ARGS[@]}" --wait
  xcrun stapler staple "$DMG_PATH"
fi

(cd "$OUTPUT_DIR" && shasum -a 256 "$(basename "$DMG_PATH")" "$(basename "$ZIP_PATH")" > "$(basename "$SUMS_PATH")")

echo
echo "Disk image: $DMG_PATH"
echo "Update ZIP: $ZIP_PATH"
echo "Checksums:  $SUMS_PATH"
echo "Size:       $(du -h "$DMG_PATH" | cut -f1)"
if [ "$SIGN_IDENTITY" = "-" ]; then
  echo
  echo "Ad-hoc signed and not notarized. On another Mac, macOS quarantines the"
  echo "app after download; the first launch needs a right click > Open, or:"
  echo "  xattr -dr com.apple.quarantine /Applications/$APP_NAME.app"
fi
