#!/usr/bin/env bash
# BaW OS — Pure-logic tests para v1 helpers (sin DB, sin framework)
# Run: bash tests/v1/run-all.sh
set -e
cd "$(dirname "$0")/../.."

echo "=== classifier.test.mjs ==="
node tests/v1/classifier.test.mjs

echo ""
echo "=== pagination.test.mjs ==="
node tests/v1/pagination.test.mjs

echo ""
echo "=== idempotency.test.mjs ==="
node tests/v1/idempotency.test.mjs

echo ""
echo "All v1 pure-logic tests passed."
