#!/usr/bin/env bash
# BaW OS — Agent tests runner (Sprint 5A WS-1)
# Run: bash tests/agents/run-all.sh

set -e

PASS=0
FAIL=0

run_test() {
  local file=$1
  echo ""
  echo "── $file ────────────────────────"
  if node "$file"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
}

cd "$(dirname "$0")/../.."

run_test tests/agents/discord-verify.test.mjs
run_test tests/agents/auth.test.mjs
run_test tests/agents/attribution.test.mjs
run_test tests/agents/resolved-by-channel.test.mjs

echo ""
echo "══════════════════════════════════════"
echo "Test suites: $((PASS + FAIL)) total, $PASS passed, $FAIL failed"
echo "══════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
