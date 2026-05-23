#!/usr/bin/env bash
# BaW OS · Sprint 5B — Pure-logic tests for public booking (no DB, no framework)
# Run: bash tests/public-booking/run-all.sh
set -e
cd "$(dirname "$0")/../.."

echo "=== pricing.test.mjs ==="
node tests/public-booking/pricing.test.mjs

echo ""
echo "=== idempotency.test.mjs ==="
node tests/public-booking/idempotency.test.mjs

echo ""
echo "=== cors.test.mjs ==="
node tests/public-booking/cors.test.mjs

echo ""
echo "=== rate-limit.test.mjs ==="
node tests/public-booking/rate-limit.test.mjs

echo ""
echo "All public-booking pure-logic tests passed."
