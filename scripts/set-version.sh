#!/bin/sh

# Stamp the root package version into every workspace and the native target.
# This intentionally changes files only; it never commits or creates a tag.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=${1:-}

case "${VERSION}" in
  ''|v*|*[!0-9.]*|*.*.*.*)
    echo "usage: $0 x.y.z" >&2
    exit 2
    ;;
esac

if ! printf '%s\n' "${VERSION}" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "error: version must be an x.y.z semantic version without a leading v" >&2
  exit 2
fi

cd "${ROOT}"
npm version "${VERSION}" --no-git-tag-version --allow-same-version --workspaces --include-workspace-root

PBXPROJ="${ROOT}/macos/Obol.xcodeproj/project.pbxproj"
if [ "$(uname -s)" = "Darwin" ]; then
  sed -i '' -E "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = ${VERSION};/g" "${PBXPROJ}"
else
  sed -i -E "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = ${VERSION};/g" "${PBXPROJ}"
fi

echo "root:      $(node -p 'require("./package.json").version')"
echo "daemon:    $(node -p 'require("./daemon/package.json").version')"
echo "dashboard: $(node -p 'require("./dashboard/package.json").version')"
echo "xcode:     $(grep -m 1 'MARKETING_VERSION' "${PBXPROJ}" | sed -E 's/.*= ([^;]+);/\1/')"
