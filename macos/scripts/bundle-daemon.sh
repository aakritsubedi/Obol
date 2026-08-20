#!/bin/sh

# Bundle only the daemon runtime dependencies. npm hoists workspace packages to
# the repository root, so copying daemon/node_modules would silently omit
# ccusage from the app bundle.
set -eu

DAEMON_ROOT="${SRCROOT}/../daemon"
DASHBOARD_ROOT="${SRCROOT}/../dashboard"
NODE_MODULES_ROOT="${SRCROOT}/../node_modules"
RESOURCE_ROOT="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}"
DAEMON_DEST="${RESOURCE_ROOT}/daemon"

if [ ! -f "${DAEMON_ROOT}/dist/index.bundle.js" ]; then
  echo "error: daemon bundle missing; run npm run build before building Obol" >&2
  exit 1
fi
if [ ! -f "${DASHBOARD_ROOT}/dist/index.html" ]; then
  echo "error: dashboard bundle missing; run npm run build before building Obol" >&2
  exit 1
fi
if [ ! -d "${NODE_MODULES_ROOT}/ccusage" ]; then
  echo "error: ccusage dependency missing; run npm install before building Obol" >&2
  exit 1
fi

rm -rf "${DAEMON_DEST}" "${RESOURCE_ROOT}/dashboard"
mkdir -p "${DAEMON_DEST}/dist" "${DAEMON_DEST}/node_modules/.bin"
cp "${DAEMON_ROOT}/dist/index.bundle.js" "${DAEMON_DEST}/dist/index.js"
cp "${DAEMON_ROOT}/package.json" "${DAEMON_DEST}/package.json"

# ccusage is a small JavaScript launcher with a platform-specific native
# package. Include every installed Darwin architecture so the app matches the
# architecture it is built for.
ditto "${NODE_MODULES_ROOT}/ccusage" "${DAEMON_DEST}/node_modules/ccusage"
native_package_found=0
if [ -d "${NODE_MODULES_ROOT}/@ccusage" ]; then
  mkdir -p "${DAEMON_DEST}/node_modules/@ccusage"
  for native_package in "${NODE_MODULES_ROOT}"/@ccusage/ccusage-darwin-*; do
    if [ -d "${native_package}" ]; then
      ditto "${native_package}" "${DAEMON_DEST}/node_modules/@ccusage/$(basename "${native_package}")"
      native_package_found=1
    fi
  done
fi
if [ "${native_package_found}" -ne 1 ]; then
  echo "error: ccusage native runtime missing; run npm install with optional dependencies enabled" >&2
  exit 1
fi
ln -sf ../ccusage/src/cli.js "${DAEMON_DEST}/node_modules/.bin/ccusage"

mkdir -p "${RESOURCE_ROOT}/dashboard"
ditto "${DASHBOARD_ROOT}/dist" "${RESOURCE_ROOT}/dashboard/dist"
