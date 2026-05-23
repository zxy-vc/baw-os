# Sprint 5B — Environment Variables

All variables required by the public booking engine (WS-1). **Do not commit actual secret values.**
Add these to Vercel → Project Settings → Environment Variables (and to `.env.local` for local dev).

---

## Feature Flag

| Variable | Example | Description |
|---|---|---|
| `PUBLIC_BOOKING_ENABLED` | `false` | Master flag. Set to `"true"` only when ready for public traffic. Server-side only. |
| `NEXT_PUBLIC_PUBLIC_BOOKING_ENABLED` | `false` | Client-side version of the flag. Controls whether frontend renders booking UI. |

> **Default:** both are `false`. All 7 public endpoints return 404 while disabled.

---

## CORS

| Variable | Example | Description |
|---|---|---|
| `PUBLIC_BOOKING_ALLOWED_ORIGINS` | `https://809.mx,https://baw-os.vercel.app` | Comma-separated list of allowed origins. No trailing slashes. Exact match only. |

> In `development` (NODE_ENV=development), `localhost`, `127.0.0.1` and `*.vercel.app` are automatically allowed regardless of this list.

---

## Stripe (public booking)

| Variable | Example | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` | Stripe secret key. **Never expose to the browser.** Shared with internal billing (Sprint 4). Use `sk_test_...` in dev/staging, `sk_live_...` in production. |
| `STRIPE_WEBHOOK_SECRET_PUBLIC` | `whsec_...` | Webhook signing secret for `/api/public/v1/webhooks/stripe`. **Different from the internal** `STRIPE_WEBHOOK_SECRET` — do not mix them. Obtain from Stripe Dashboard → Webhooks → your endpoint → Signing secret. |

> `STRIPE_PUBLISHABLE_KEY` is not needed in v1 (Stripe Checkout hosted). Required only if migrating to Elements in v2.

---

## Checkout URLs

| Variable | Example | Description |
|---|---|---|
| `PUBLIC_BOOKING_SUCCESS_URL` | `https://809.mx/confirmacion/{HOLD_ID}` | Stripe redirects here on successful payment. Use `{HOLD_ID}` as a literal placeholder — the server substitutes the hold ID at session creation time. |
| `PUBLIC_BOOKING_CANCEL_URL` | `https://809.mx/reservar` | Stripe redirects here if the user cancels or the session expires. |

---

## Supabase (already in project)

These are already configured from Sprint 1–4 but are required for the public booking engine too:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key — used for reading public views. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — used server-side for writes (holds, reservations). **Never expose to the browser.** |

---

## Local `.env.local` template

Copy this to `.env.local` and fill in real values for local development:

```bash
# ── Feature flags ────────────────────────────────────────────
PUBLIC_BOOKING_ENABLED=true
NEXT_PUBLIC_PUBLIC_BOOKING_ENABLED=true

# ── CORS ────────────────────────────────────────────────────
PUBLIC_BOOKING_ALLOWED_ORIGINS=https://809.mx,https://baw-os.vercel.app

# ── Stripe (test mode) ───────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_REPLACE_ME
STRIPE_WEBHOOK_SECRET_PUBLIC=whsec_REPLACE_ME

# ── Checkout URLs ────────────────────────────────────────────
PUBLIC_BOOKING_SUCCESS_URL=https://809.mx/confirmacion/{HOLD_ID}
PUBLIC_BOOKING_CANCEL_URL=https://809.mx/reservar

# ── Supabase (already set, listed for completeness) ──────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## Vercel production checklist

Before enabling `PUBLIC_BOOKING_ENABLED=true` in production:

- [ ] Stripe webhook endpoint registered: `https://baw-os.vercel.app/api/public/v1/webhooks/stripe`
- [ ] Stripe webhook events enabled: `checkout.session.completed`, `checkout.session.expired`
- [ ] `STRIPE_WEBHOOK_SECRET_PUBLIC` updated with the production signing secret
- [ ] `PUBLIC_BOOKING_SUCCESS_URL` and `PUBLIC_BOOKING_CANCEL_URL` point to production URLs
- [ ] Smoke test completed with card `4242 4242 4242 4242` in Stripe test mode
- [ ] E2E test passing (WS-5)
- [ ] Reconciliation cron configured (WS-4)
- [ ] Email confirmation working (WS-4)

---

## Notes

- The public booking endpoints use **two Supabase clients**:
  - **Anon client** (`createAnonClient`): for reading `v_public_buildings` and `v_public_units` views.
  - **Service role client** (`createServiceClient`): for all writes (holds, reservations, idempotency tables) and calling `fn_unit_is_available`.
- The service role key is only used server-side (in Next.js API route handlers, never in `'use client'` components).
- Rate limits are in-memory per Vercel instance (v1). For multi-instance production, replace with Upstash Ratelimit.
