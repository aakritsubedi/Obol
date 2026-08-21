#!/bin/bash

# Build a Release app bundle and wrap it in a distributable disk image.
#
# Environment overrides:
#   SIGN_IDENTITY  codesign identity; "-" (default) is an ad-hoc signature.
#   OBOL_VERSION   expected marketing version; defaults to root package.json.
#   OUTPUT_DIR     where artifacts are written (default: <repo>/dist)
#   SKIP_BUILD     set to 1 to reuse daemon/dashboard bundles already on disk
#   AC_API_KEY_ID, AC_API_ISSUER, AC_API_KEY enable the untested notarization path.
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
VOLUME_NAME="Obol"
DERIVED_DATA="$ROOT/.xcodebuild"

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
if [ "$SIGN_IDENTITY" != "-" ] &&
   [ -n "$AC_API_KEY_ID_VALUE" ] &&
   [ -n "$AC_API_ISSUER_VALUE" ] &&
   [ -n "$AC_API_KEY_VALUE" ]; then
  # Intentionally env-gated and untested without a Developer ID account.
  echo "==> Notarizing app"
  xcrun notarytool submit "$STAGING/$APP_NAME.app" \
    --apple-id "$AC_API_KEY_ID_VALUE" \
    --issuer "$AC_API_ISSUER_VALUE" \
    --key "$AC_API_KEY_VALUE" \
    --wait
  xcrun stapler staple "$STAGING/$APP_NAME.app"
  rm -f "$ZIP_PATH"
  ditto -c -k --sequesterRsrc --keepParent "$STAGING/$APP_NAME.app" "$ZIP_PATH"
fi

echo "==> Creating disk image"
hdiutil create \
  -volname "$VOLUME_NAME" \
  -srcfolder "$STAGING" \
  -fs HFS+ \
  -format UDZO \
  -imagekey zlib-level=9 \
  -quiet \
  "$DMG_PATH"

if [ "$SIGN_IDENTITY" != "-" ]; then
  codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG_PATH"
fi

if [ "$SIGN_IDENTITY" != "-" ] &&
   [ -n "$AC_API_KEY_ID_VALUE" ] &&
   [ -n "$AC_API_ISSUER_VALUE" ] &&
   [ -n "$AC_API_KEY_VALUE" ]; then
  # Intentionally env-gated and untested without a Developer ID account.
  echo "==> Notarizing disk image"
  xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$AC_API_KEY_ID_VALUE" \
    --issuer "$AC_API_ISSUER_VALUE" \
    --key "$AC_API_KEY_VALUE" \
    --wait
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
