#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
NO_TAG=0
if [ "${1:-}" = "--no-tag" ]; then NO_TAG=1; fi

cd "${ROOT}"
ROOT_VERSION=$(node -p 'require("./package.json").version')
DAEMON_VERSION=$(node -p 'require("./daemon/package.json").version')
DASHBOARD_VERSION=$(node -p 'require("./dashboard/package.json").version')
PBX_VERSION=$(grep -m 1 'MARKETING_VERSION' macos/Obol.xcodeproj/project.pbxproj | sed -E 's/.*= ([^;]+);/\1/')

if [ "${ROOT_VERSION}" != "${DAEMON_VERSION}" ] ||
   [ "${ROOT_VERSION}" != "${DASHBOARD_VERSION}" ] ||
   [ "${ROOT_VERSION}" != "${PBX_VERSION}" ]; then
  echo "error: version drift (root=${ROOT_VERSION}, daemon=${DAEMON_VERSION}, dashboard=${DASHBOARD_VERSION}, xcode=${PBX_VERSION})" >&2
  exit 1
fi

if [ "${NO_TAG}" -eq 0 ]; then
  TAG=${GITHUB_REF_NAME:-}
  if [ -z "${TAG}" ]; then
    echo "error: GITHUB_REF_NAME is required unless --no-tag is used" >&2
    exit 2
  fi
  EXPECTED=${TAG#v}
  if [ "${EXPECTED}" != "${ROOT_VERSION}" ]; then
    echo "error: tag ${TAG} does not match package version ${ROOT_VERSION}" >&2
    exit 1
  fi
fi

echo "version OK: ${ROOT_VERSION}"
