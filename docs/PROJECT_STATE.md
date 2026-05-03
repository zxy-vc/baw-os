# PROJECT_STATE.md — Estado vivo de BaW OS

> **Este archivo cambia seguido.** Cualquier agente que vaya a tocar el repo debe leerlo después de `AGENTS.md` y antes de empezar.
> **Última actualización:** 2026-05-02 (Sprint 6 cerrado, post PR #51 mergeado)

---

## 1 · Sprint en curso

**Sprint 6 — Visual Rollout & Bug Bash · CERRADO el 2026-05-02.**

PRs cerrados en el sprint:
- #44 BaW Mark + Sidebar shell + Mark A canónico
- #45 Migrar `/me`, `/agents`, `/admin/roadmap` a tokens BaW
- #46 Owner Portal a tokens BaW
- #47 Onboarding wizard a tokens BaW
- #48 Visual audit final + cierre HEX residual
- #49 Sprint 6 followups (BawGrid en AppShell + bulk visible en Configurar cuenta)
- #50 Sprint 6 followups #2 (`/settings` real fix + bulk en `/units` + login race fix)
- #51 Hotfix login: `sync-session` cookie roundtrip + probe loop graceful fallback

**Resultado:** producción `baw-os.vercel.app` con visual unificado (Mark A + retícula de fondo + tokens `--baw-*`), wizard onboarding con bulk de unidades, `/units` con bulk también, login funcional con `?next=/admin`.

---

## 2 · Próximo sprint (Sprint 7) — propuestas a confirmar con Fran

Estas son hipótesis derivadas de issues abiertos y conversaciones recientes. **Confirmar con Fran antes de empezar.**

| Tema | Justificación | Issue/Doc |
|---|---|---|
| Cierre del tablero de cobranza real (Mateos) | Aparece como sugerencia en Codex (image-3); cliente piloto activo | Por crear issue |
| Gestión de edificios y propietarios | Backlog del PRD; CRUD aún incompleto | `docs/PRD.md` |
| Blindar deploy Vercel con `baw-design` | Build inestable cuando `design/baw-design/` cambia | Por crear issue |
| Migración legacy `member_role` enum | Deuda heredada de Sprint 3 | [#23](https://github.com/zxy-vc/baw-os/issues/23) |
| Migración HEX residual a tokens BaW | Deuda heredada Sprint 4-5 | [#24](https://github.com/zxy-vc/baw-os/issues/24) |
| `getOrgIdAsync()` shim en webhooks | Deuda heredada | [#22](https://github.com/zxy-vc/baw-os/issues/22) |

---

## 3 · Bugs conocidos abiertos

(Ninguno crítico al cierre del Sprint 6. Si encuentras uno, agrégalo aquí o abre issue.)

---

## 4 · Decisiones canónicas vigentes (refresco)

> Versión condensada. La fuente completa es `AGENTS.md` §2.

- **Logo:** Mark A (desfase pronunciado). Componente `BawMark` en `src/components/brand/BawMark.tsx`.
- **Retícula de fondo:** `BawGrid` debe estar visible en TODAS las pantallas como distintivo (decisión de Fran post Sprint 6 PR D).
- **Visual unificado:** toda la app debería verse como `/login` (decisión de Fran).
- **Tokens:** todos `--baw-*` desde `design/baw-design/tokens/index.css`. Nunca tokens paralelos.
- **Tipografía:** Inter via `next/font/google` en `src/app/layout.tsx`. No tocar.
- **Navegación:** 6 secciones top + 2 footer en `src/lib/navigation.ts`. Ver `AGENTS.md` §2.3.
- **Admin 3 capas:** L0 `/admin` (solo `fran@zxy.vc`) · L1 `/settings/account` · L2 `/me`. Ver `AGENTS.md` §2.4.
- **Org context:** `resolveOrgId()` en `src/lib/org-context.ts` es la única fuente de verdad de `org_id`. Cualquier query a Supabase filtra por `org_id`.

---

## 5 · Patrones de bug ya documentados (NO repetir)

Estos bugs ya pasaron una vez. Si los ves de nuevo, hay solución conocida:

### 5.1 — Loading eterno en pages que dependen de `useOrgContext()`

**Síntoma:** página queda en "Cargando…" infinito.
**Causa:** `useEffect(() => { if (orgId) load(orgId) }, [orgId])` — si `orgId === null` el `load()` jamás corre y `useState(true)` queda eterno.
**Fix canónico:** distinguir 3 estados:

```tsx
useEffect(() => {
  if (orgLoading) return
  if (orgId) { load(orgId); return }
  setLoading(false)  // sin org, no spinear
}, [orgId, orgLoading])
```

Y rama "no hay org" debe mostrar UI con CTAs, no `<div>` plano.
**Caso histórico:** PR #50 (`/settings`).

### 5.2 — Race condition en login con `?next=/admin`

**Síntoma:** infinite loop entre `/login` y la página destino.
**Causa:** `window.location.href` se ejecuta antes de que el browser commit el `Set-Cookie`.
**Fix canónico:** probe loop a `/api/me/whoami` con backoff antes de navegar; si falla, navegar igual con warn (no bloquear con error visible).
**Caso histórico:** PRs #50 + #51.

### 5.3 — Cookies a medio setear en endpoints de auth

**Síntoma:** browser recibe `Set-Cookie` sin `path` / `httpOnly` / `sameSite`.
**Causa:** crear un `NextResponse` nuevo y copiar cookies de otro response con `cookies.set(name, value, c)` donde `c` es el `ResponseCookie` original (shape incorrecto para `CookieOptions`).
**Fix canónico:** devolver el response original con `{ headers: response.headers }` en vez de reconstruir.
**Caso histórico:** PR #51 (`/api/auth/sync-session`).

### 5.4 — `Promise.all` que rechaza deja `setLoading(false)` sin ejecutar

**Síntoma:** spinner eterno cuando una de N queries falla.
**Causa:** `setLoading(false)` solo en `.then()`, no en `.finally()`.
**Fix:** siempre `try/finally` o `.finally(() => setLoading(false))`.

### 5.5 — `supabase-js` `.single()` rechaza con `PGRST116` cuando no hay row

**Fix:** usar `.maybeSingle()` cuando la row puede no existir.

---

## 6 · Stack y URLs vivas

- **Repo:** https://github.com/zxy-vc/baw-os
- **Producción:** https://baw-os.vercel.app
- **Supabase project:** `zlcgxmllaeweypyodvzk`
- **Org producción:** `BaW Operations` · slug `baw-operations` · id `81a011c4-4ea6-4b79-924d-73dbe6d35e14`
- **Owner humano:** Fran Durán · `fran@zxy.vc` (prod) · `franduranv@gmail.com` (personal)
- **Stack:** Next.js 14 App Router + TypeScript + Tailwind 3 + Supabase 2.43 + Vercel

---

## 7 · Cómo actualizar este archivo

Cualquier agente que cierre un sprint, mergee un PR mayor, o descubra un nuevo patrón de bug:

1. Edita la sección correspondiente de este archivo.
2. Actualiza la fecha al inicio.
3. Inclúyelo en el mismo PR que cierra el cambio (no PR separado).

Si el cambio es grande (nuevo sprint, nueva arquitectura), también actualiza `AGENTS.md`.
