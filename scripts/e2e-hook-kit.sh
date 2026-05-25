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

echo "==> Running hook-kit feature tests with FEATS_REPORTERS=pretty (verify reporter pipeline)"
PRETTY_OUTPUT="$(FEATS_REPORTERS=pretty NO_COLOR=1 bun test tests/features/ 2>&1)"
echo "$PRETTY_OUTPUT" | tail -30
if ! echo "$PRETTY_OUTPUT" | grep -q "Feature:"; then
  echo "FAIL: PrettyReporter did not emit 'Feature:' header" >&2
  exit 1
fi
if ! echo "$PRETTY_OUTPUT" | grep -qE "[0-9]+ scenario"; then
  echo "FAIL: PrettyReporter did not emit a run summary" >&2
  exit 1
fi
echo "==> PrettyReporter pipeline works"

echo "==> hook-kit feature tests passed"
