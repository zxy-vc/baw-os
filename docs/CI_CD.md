# CI/CD — baw-os

GitHub Actions workflow que actúa como **precondición de merge a main**. Sin CI verde, no se mergea.

---

## Jobs del workflow (`.github/workflows/ci.yml`)

El workflow se dispara en:
- `pull_request` hacia `main`
- `push` a `main`

### Job 1 — `lint-and-typecheck`

| Detalle | Valor |
|---|---|
| Runner | ubuntu-latest, Node 20 |
| Checkout | `actions/checkout@v4` con `submodules: recursive` |
| Cache | `actions/setup-node@v4` con `cache: 'npm'` |

Pasos:
1. `npm ci`
2. Typecheck: usa `npm run typecheck` si existe en `package.json`; si no, corre `npx tsc --noEmit`
3. `npm run lint --if-present`

---

### Job 2 — `build`

| Detalle | Valor |
|---|---|
| Runner | ubuntu-latest, Node 20 |
| Necesita | `lint-and-typecheck` |

Pasos:
1. `npm ci`
2. `npm run build` con variables de entorno dummy para CI (ver `.env.example` y `docs/sprints/SPRINT_5B_ENV.md`)

Variables configuradas como dummy en CI (no son secretos críticos en build time):

```
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
SUPABASE_SERVICE_ROLE_KEY=placeholder
PUBLIC_BOOKING_ENABLED=false
NEXT_PUBLIC_PUBLIC_BOOKING_ENABLED=false
PUBLIC_BOOKING_ALLOWED_ORIGINS=https://placeholder.example.com
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET_PUBLIC=whsec_placeholder
PUBLIC_BOOKING_SUCCESS_URL=https://placeholder.example.com/confirmacion/{HOLD_ID}
PUBLIC_BOOKING_CANCEL_URL=https://placeholder.example.com/reservar
NEXT_PUBLIC_APP_URL=https://placeholder.example.com
BAWOS_API_KEY=placeholder
CRON_SECRET=placeholder
```

> **Nota:** Si en el futuro el build requiere vars adicionales que no son críticas en runtime de CI, agregarlas como dummy en `env:` del job `build` en el workflow.

---

### Job 3 — `tests`

| Detalle | Valor |
|---|---|
| Runner | ubuntu-latest, Node 20 |
| Necesita | `lint-and-typecheck` |

Pasos:
1. `npm ci`
2. `bash tests/public-booking/run-all.sh` — 43 tests de pure-logic (pricing, idempotency, cors, rate-limit)
3. `bash tests/v1/run-all.sh` — 28 tests de pure-logic (classifier, idempotency, pagination)

> Los tests son scripts Node puro (.mjs), no requieren Vitest. Se corren en paralelo con `build`.

---

### Job 4 — `smoke-supabase`

| Detalle | Valor |
|---|---|
| Runner | ubuntu-latest, Node 20 |
| Necesita | `lint-and-typecheck` |
| Condición | Solo corre si `secrets.SUPABASE_STAGING_URL != ''` |

Si el secret no está configurado, el job se **skipea sin falla** — no bloquea el merge.

Si está configurado:
1. `curl` al endpoint `/rest/v1/` del proyecto Supabase staging con el anon key
2. Verifica que el HTTP status es 2xx/3xx

Secrets requeridos (opcionales para CI básico):
- `SUPABASE_STAGING_URL` — URL del proyecto Supabase staging
- `SUPABASE_STAGING_ANON_KEY` — Anon key del proyecto staging

---

### Job 5 — `all-checks-pass` (merge gate)

| Detalle | Valor |
|---|---|
| Runner | ubuntu-latest |
| Necesita | `lint-and-typecheck`, `build`, `tests`, `smoke-supabase` |
| Condición | `if: always()` — siempre corre para verificar resultados |

Este job valida que todos los jobs requeridos (`lint-and-typecheck`, `build`, `tests`) hayan terminado en `success`. `smoke-supabase` puede ser `skipped` o `success`.

**Este es el job que se configura como required check en branch protection.**

---

## Agregar el secret `SUPABASE_STAGING_URL` (gh CLI)

```bash
# Agrega el secret al repositorio
gh secret set SUPABASE_STAGING_URL --body "https://your-staging-project.supabase.co" --repo zxy-vc/baw-os

# Agrega también el anon key de staging
gh secret set SUPABASE_STAGING_ANON_KEY --body "eyJ..." --repo zxy-vc/baw-os
```

Para verificar que los secrets existen:
```bash
gh secret list --repo zxy-vc/baw-os
```

---

## Activar branch protection en `main` requiriendo `all-checks-pass` (gh CLI)

```bash
gh api repos/zxy-vc/baw-os/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["all-checks-pass"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews=null \
  --field restrictions=null
```

Para verificar la protección activa:
```bash
gh api repos/zxy-vc/baw-os/branches/main/protection
```

Para actualizar si ya existe protección y quieres agregar más checks:
```bash
gh api repos/zxy-vc/baw-os/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["all-checks-pass","lint-and-typecheck","build","tests"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews=null \
  --field restrictions=null
```

---

## Convención de merge

**NO se mergea a `main` sin CI verde.**

- El agente Andrés Mark II solo puede mergear PRs donde el check `all-checks-pass` esté en estado `success`.
- Si algún job falla, el PR queda bloqueado hasta que se corrija.
- Para emergencias (hotfix urgente), un admin puede hacer bypass del branch protection, pero debe documentarse en el PR.

---

## Troubleshooting

**Build falla por variables de entorno faltantes:**
Agregar la variable como dummy en la sección `env:` del job `build` en `.github/workflows/ci.yml`.

**Tests fallan en CI pero pasan local:**
Los tests son Node puro, sin dependencias externas. Verificar versión de Node (debe ser 20).

**smoke-supabase siempre se skipea:**
Comportamiento esperado si `SUPABASE_STAGING_URL` no está configurado como secret. Ver sección "Agregar el secret" para configurarlo.

**`all-checks-pass` falla aunque los jobs individuales pasaron:**
Verificar que `smoke-supabase` terminó en `success` o `skipped` (no `failure` ni `cancelled`).
