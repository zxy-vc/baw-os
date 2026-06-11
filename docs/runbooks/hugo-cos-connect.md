# Runbook — Conectar a Hugo (hugo-cos) como supervisor read-only

**Audience**: Fran
**Estimated time**: 15 min
**Sprint**: 5A MVP
**Prerequisite**:
- Alicia conectada y operando (runbooks `alicia-skill-install.md` + `setup-discord-channel.md` completos)
- Fix de `GET /v1/runs` deployado (Sprint 5A MVP)
- Skill `openclaw-skill-baw-os` con soporte de persona Hugo (lado Codex)

## Rol de Hugo en el MVP

Hugo (`hugo-cos`) es el **supervisor de Alicia**: ve sus runs, sus aprobaciones
y las métricas de la org, y publica resúmenes/digests en Discord. En el MVP:

- **Solo lectura.** Hugo NUNCA recibe scopes `*:write`, `approvals:resolve` ni `agents:run`.
- **No aprueba acciones.** Las aprobaciones REQUIRE_APPROVAL las resuelve solo Fran
  (botones Discord o UI).
- **No dispara a Alicia.** La delegación supervisor→worker queda para un sprint posterior.

## Steps

### 1. Emitir la credencial de Hugo

1. Entra a `https://baw-os.vercel.app/agents/hugo-cos/credentials` (sesión owner/admin).
2. Crea una credencial con label `prod` y **exactamente** estos scopes:
   - `runs:read`
   - `approvals:read`
   - `insights:read`
3. Copia la key `sk_live_...` — **se muestra una sola vez**.

### 2. Configurar el skill (lado Hugo)

En el `.env` del skill en la máquina donde corre Hugo:

```env
BAW_OS_API_URL=https://baw-os.vercel.app
BAW_OS_HUGO_API_KEY=sk_live_...   # la key del paso 1
```

### 3. Smoke tests (verificación positiva)

Con la credencial de Hugo, los tres endpoints read-only deben responder 200:

```bash
KEY="sk_live_..."
BASE="https://baw-os.vercel.app"

curl -s -H "Authorization: Bearer $KEY" "$BASE/api/v1/runs?agent_id=alicia-ops&limit=5"
curl -s -H "Authorization: Bearer $KEY" "$BASE/api/v1/approvals?status=all&agent_id=alicia-ops"
curl -s -H "Authorization: Bearer $KEY" "$BASE/api/v1/insights/summary"
```

### 4. Verificación negativa (obligatoria)

La misma credencial debe recibir **403 `forbidden_scope`** en cualquier write:

```bash
# Debe fallar con 403:
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"test"}' "$BASE/api/v1/incidents"

# Debe fallar con 403:
curl -s -X POST -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/approvals/00000000-0000-0000-0000-000000000000/grant"
```

Si alguno de estos devuelve algo distinto de 403, **revoca la credencial
inmediatamente** en `/agents/hugo-cos/credentials` y revisa los scopes.

### 5. Digest en Discord

El digest lo compone y publica el **skill** (no hay endpoint de digest
server-side): el skill consulta los tres GET y arma el resumen con footer
de atribución "via Hugo · BaW OS Agent · Discord". Frecuencia sugerida:
1 digest diario + alerta inmediata si hay approvals pendientes >2h.

## Rollback

Revocar la credencial en `/agents/hugo-cos/credentials` → Hugo pierde acceso
de inmediato. No hay nada más que limpiar (Hugo no escribe datos).
