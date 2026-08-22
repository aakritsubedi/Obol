#!/bin/sh

# Ship a Node interpreter inside Obol.app so end users need no system Node.
# Downloads the pinned upstream distribution for both Darwin architectures,
# merges them into one fat binary with lipo, caches it under .cache/, and
# installs it at Contents/Resources/runtime/bin/node. The packaging script's
# signing loop picks the binary up like any other executable resource.
#
# Usage: fetch-node-runtime.sh <path-to-Obol.app>
#
#   NODE_VERSION           upstream version to vendor (default: 22.23.2)
#   OBOL_SKIP_NODE_RUNTIME set to 1 to skip (system Node becomes required)

set -eu

if [ $# -ne 1 ]; then
  echo "usage: $0 <path-to-Obol.app>" >&2
  exit 2
fi

APP="$1"
NODE_VERSION="${NODE_VERSION:-22.23.2}"
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
CACHE_DIR="$ROOT/.cache/node-runtime/v$NODE_VERSION"
DEST_DIR="$APP/Contents/Resources/runtime/bin"

case "$(uname -s)" in
  Darwin) ;;
  *) echo "error: node runtime vendoring only supports macOS" >&2; exit 1 ;;
esac

if [ ! -d "$APP/Contents/MacOS" ]; then
  echo "error: app bundle not found at $APP" >&2
  exit 1
fi

mkdir -p "$CACHE_DIR"

fetch_arch() {
  arch="$1"
  tarball="$CACHE_DIR/node-v$NODE_VERSION-darwin-$arch.tar.gz"
  if [ ! -f "$tarball" ]; then
    url="https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-darwin-$arch.tar.gz"
    echo "==> Downloading Node v$NODE_VERSION ($arch)"
    curl -fSL --retry 3 -o "$tarball.part" "$url"
    mv "$tarball.part" "$tarball"
  fi
  extraction="$CACHE_DIR/extract-$arch"
  rm -rf "$extraction"
  mkdir -p "$extraction"
  tar -xzf "$tarball" -C "$extraction" "node-v$NODE_VERSION-darwin-$arch/bin/node"
  mv "$extraction/node-v$NODE_VERSION-darwin-$arch/bin/node" "$CACHE_DIR/node-$arch"
}

fetch_arch arm64
fetch_arch x64

echo "==> Merging Node into a universal binary"
lipo -create \
  "$CACHE_DIR/node-arm64" \
  "$CACHE_DIR/node-x64" \
  -output "$CACHE_DIR/node-universal"

mkdir -p "$DEST_DIR"
cp "$CACHE_DIR/node-universal" "$DEST_DIR/node"
chmod 0755 "$DEST_DIR/node"

# Fail loudly if the vendored interpreter cannot run on this machine.
"$DEST_DIR/node" --version >/dev/null

echo "==> Vendored Node $($DEST_DIR/node --version) at ${DEST_DIR#"$ROOT"/}/node"
