#!/bin/bash

# Build a Release app bundle and wrap it in a distributable disk image.
#
# Environment overrides:
#   SIGN_IDENTITY  codesign identity; "-" (default) is an ad-hoc signature.
#                  Pass a "Developer ID Application: ..." identity to produce a
#                  bundle that can be notarized.
#   OUTPUT_DIR     where the .dmg is written (default: <repo>/dist)
#   SKIP_BUILD     set to 1 to reuse daemon/dashboard bundles already on disk
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SIGN_IDENTITY="${SIGN_IDENTITY:--}"
OUTPUT_DIR="${OUTPUT_DIR:-${ROOT}/dist}"
DERIVED_DATA="${ROOT}/.xcodebuild"
APP_NAME="Obol"
VOLUME_NAME="Obol"

if [ ! -d "${ROOT}/node_modules" ]; then
  echo "error: dependencies missing; run npm install first" >&2
  exit 1
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "==> Building daemon and dashboard"
  (cd "${ROOT}" && npm run build)
fi

echo "==> Building ${APP_NAME}.app (Release)"
xcodebuild \
  -project "${ROOT}/macos/${APP_NAME}.xcodeproj" \
  -scheme "${APP_NAME}" \
  -configuration Release \
  -derivedDataPath "${DERIVED_DATA}" \
  CODE_SIGNING_ALLOWED=NO \
  clean build >/dev/null

APP_SOURCE="${DERIVED_DATA}/Build/Products/Release/${APP_NAME}.app"
if [ ! -d "${APP_SOURCE}" ]; then
  echo "error: expected app bundle at ${APP_SOURCE}" >&2
  exit 1
fi

VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${APP_SOURCE}/Contents/Info.plist")"
DMG_PATH="${OUTPUT_DIR}/${APP_NAME}-${VERSION}.dmg"
STAGING="$(mktemp -d "${TMPDIR:-/tmp}/${APP_NAME}-dmg.XXXXXX")"
trap 'rm -rf "${STAGING}"' EXIT

echo "==> Staging disk image contents"
ditto "${APP_SOURCE}" "${STAGING}/${APP_NAME}.app"
ln -s /Applications "${STAGING}/Applications"

# Nested executables must carry their own signature before the outer bundle is
# sealed, otherwise codesign rejects the app as containing unsigned code.
echo "==> Signing with identity: ${SIGN_IDENTITY}"
SIGN_FLAGS=(--force --timestamp=none)
if [ "${SIGN_IDENTITY}" != "-" ]; then
  SIGN_FLAGS=(--force --timestamp --options runtime)
fi

while IFS= read -r -d '' candidate; do
  if file -b "${candidate}" | grep -q "Mach-O"; then
    codesign "${SIGN_FLAGS[@]}" --sign "${SIGN_IDENTITY}" "${candidate}"
  fi
done < <(find "${STAGING}/${APP_NAME}.app/Contents/Resources" -type f -perm -u+x -print0)

codesign "${SIGN_FLAGS[@]}" --sign "${SIGN_IDENTITY}" "${STAGING}/${APP_NAME}.app"
codesign --verify --deep --strict "${STAGING}/${APP_NAME}.app"

# Give the mounted volume the app's own icon rather than the generic disk image.
ICON_SET="${ROOT}/macos/${APP_NAME}/Resources/Assets.xcassets/AppIcon.appiconset"
if [ -d "${ICON_SET}" ]; then
  ICONSET_DIR="${STAGING}/.volume.iconset"
  mkdir -p "${ICONSET_DIR}"
  for source in "${ICON_SET}"/icon_*.png; do
    [ -f "${source}" ] || continue
    cp "${source}" "${ICONSET_DIR}/$(basename "${source}")"
  done
  if iconutil -c icns "${ICONSET_DIR}" -o "${STAGING}/.VolumeIcon.icns" 2>/dev/null; then
    SetFile -a C "${STAGING}" 2>/dev/null || true
  fi
  rm -rf "${ICONSET_DIR}"
fi

echo "==> Creating disk image"
mkdir -p "${OUTPUT_DIR}"
rm -f "${DMG_PATH}"
hdiutil create \
  -volname "${VOLUME_NAME}" \
  -srcfolder "${STAGING}" \
  -fs HFS+ \
  -format UDZO \
  -imagekey zlib-level=9 \
  -quiet \
  "${DMG_PATH}"

if [ "${SIGN_IDENTITY}" != "-" ]; then
  codesign --force --timestamp --sign "${SIGN_IDENTITY}" "${DMG_PATH}"
fi

echo
echo "Disk image: ${DMG_PATH}"
echo "Size:       $(du -h "${DMG_PATH}" | cut -f1)"
if [ "${SIGN_IDENTITY}" = "-" ]; then
  echo
  echo "Ad-hoc signed and not notarized. On another Mac, macOS quarantines the"
  echo "app after download; the first launch needs a right click > Open, or:"
  echo "  xattr -dr com.apple.quarantine /Applications/${APP_NAME}.app"
fi
