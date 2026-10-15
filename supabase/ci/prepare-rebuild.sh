#!/usr/bin/env bash
# SOLO CI · prepara supabase/migrations/ en el runner para el job db-reset.
# No hace commit de nada ni se conecta a ningún proyecto remoto.
#
# 1. Verifica que ninguna migración aplicada en prod cambió de contenido
#    (applied-migrations.sha256). Si alguien edita una, el job falla aquí.
# 2. Copia bootstrap.sql como migración 20260326000000 (esquema previo a la
#    primera migración del repo; ver cabecera de bootstrap.sql).
# 3. Sustituye, solo en la copia del runner, la única sentencia aplicada en prod
#    que no puede correr en ningún Postgres:
#    20260523231651_public_booking.sql:73 · EXCLUDE … WHERE (expires_at > now())
#    → 42P17 (now() no es IMMUTABLE). Lo documenta
#    20260703020000_reservation_holds_now_fix.sql:4-8, que deja la constraint
#    sin predicado, igual que aquí. El paso 1 garantiza que el archivo original
#    es exactamente el hasheado.
set -euo pipefail
cd "$(dirname "$0")/.."

(cd migrations && sha256sum --check --quiet --strict ../ci/applied-migrations.sha256)
echo "OK: $(wc -l < ci/applied-migrations.sha256) migraciones aplicadas sin cambios"

cp ci/bootstrap.sql migrations/20260326000000_ci_bootstrap.sql

f=migrations/20260523231651_public_booking.sql
pattern='    ) WHERE (expires_at > now());'
[ "$(grep -cxF "$pattern" "$f")" -eq 1 ] || { echo "::error::patrón 42P17 no encontrado exactamente una vez en $f"; exit 1; }
sed -i 's/^    ) WHERE (expires_at > now());$/    );/' "$f"
[ "$(grep -cxF "$pattern" "$f")" -eq 0 ] || { echo "::error::el parche 42P17 no se aplicó en $f"; exit 1; }
echo "OK: bootstrap copiado y parche 42P17 aplicado solo en el runner"
