#!/usr/bin/env bash
# BaW OS — Tests de regresión del dominio de cobros (sin DB, sin framework).
# Candados de los bugs PR #94 (enum de method) y PR #95 (folio/referencia).
# Run: bash tests/cobros/run-all.sh
set -e
cd "$(dirname "$0")/../.."

echo "=== payment-method.test.mjs ==="
node tests/cobros/payment-method.test.mjs

echo ""
echo "=== folio-reference.test.mjs ==="
node tests/cobros/folio-reference.test.mjs

echo ""
echo "All cobros regression tests passed."
