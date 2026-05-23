#!/usr/bin/env bash
# scripts/e2e-hook-kit.sh
#
# Builds the local feats package, links it into a sibling hook-kit checkout,
# runs hook-kit's feature tests against the linked feats, then unlinks.
#
# Override the hook-kit location with HOOK_KIT_DIR=/path/to/hook-kit.
# Skips with exit 0 if hook-kit is not present (so CI without hook-kit passes).

set -euo pipefail

FEATS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_KIT_DIR="${HOOK_KIT_DIR:-$FEATS_DIR/../hook-kit}"

if [[ ! -d "$HOOK_KIT_DIR" ]]; then
  echo "skip: hook-kit not found at $HOOK_KIT_DIR (set HOOK_KIT_DIR to override)"
  exit 0
fi

cleanup() {
  set +e
  if [[ -d "$HOOK_KIT_DIR" ]]; then
    (cd "$HOOK_KIT_DIR" && bun unlink @questi0nm4rk/feats >/dev/null 2>&1)
  fi
  (cd "$FEATS_DIR" && bun unlink >/dev/null 2>&1)
}
trap cleanup EXIT

echo "==> Building feats"
cd "$FEATS_DIR"
bun install --frozen-lockfile
bun run build
bun run build:types

echo "==> Linking feats globally"
bun link

echo "==> Linking feats into hook-kit at $HOOK_KIT_DIR"
cd "$HOOK_KIT_DIR"
bun link @questi0nm4rk/feats

echo "==> Running hook-kit feature tests"
bun test tests/features/

echo "==> hook-kit feature tests passed"
