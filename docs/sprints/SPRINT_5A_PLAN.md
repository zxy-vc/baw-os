# Sprint 5A — Conversational Agent Runtime (Alicia third-party)

**Status**: Planned, ready to start
**Start**: 2026-05-03
**Target end**: 2026-05-07 (4 days)
**Owner**: Computer (this AI), supervised by Fran
**Related ADR**: [ADR-016](../adr/ADR-016-third-party-agent-integration.md)

---

## Goal (one sentence)

Connect Alicia (ZXY Agent OS, OpenClaw, on Fran's M1) to BaW OS production so that typing `"alicia, agrega incidencia plomería D104"` in Discord results in a real incident record in BaW OS, attributed to Alicia, fully audited.

## Non-goals (explicit)

- No other ZXY agent connected (no Hugo, Beto, Maribel, Luis, Rafa, Andrés).
- No native BaW OS agents built (Sprint 7+).
- No CFDI/Stripe irreversible writes (Phase 6).
- No in-app chat UI (`/agents/[id]/chat`) — that is Sprint 5B.
- No payments:write or contracts:write scopes for Alicia (Sprint 5B+).

## Success criteria

1. Fran types in Discord `#baw-os-operations`: `alicia, ¿qué incidencias hay abiertas en D104?`
   → Alicia replies with real data from `GET /api/v1/incidents?unit=D104&status=open` within 5s.
2. Fran types: `alicia, agrega incidencia "fuga en lavabo" en D104, prioridad alta`
   → Alicia creates incident via `POST /api/v1/incidents`, replies with the BaW OS URL of the new incident.
3. The same incident, opened in BaW OS UI, displays badge: `via Alicia · ZXY Agent OS · Discord · [ver mensaje]` with working link.
4. If the action requires approval (per agent_policies setting), Alicia replies "Necesito tu OK" and Fran sees a Discord embed with **Aprobar** / **Denegar** buttons. Click → BaW OS executes (verified via Discord Interactions endpoint with Ed25519 verification).
5. All Alicia actions logged in `agent_runs` table with idempotency keys, request hashes, response statuses.
6. Smoke tests E2E pass: 5 happy-path flows + 3 failure modes (token revoked, M1 offline, approval denied).
7. No production data corruption, no double-writes (idempotency verified by replay test).

---

## Workstreams (parallel)

### WS-1 — BaW OS server-side (`baw-os` repo)

| # | Task | Estimate |
|---|------|----------|
| 1.1 | Add `agent_class` enum + column to `agents` table; backfill 17 existing rows as `third_party` | 1h |
| 1.2 | New endpoint `POST /api/v1/admin/agents/:slug/credentials` (issue bearer, store hash) | 2h |
| 1.3 | New endpoint `DELETE /api/v1/admin/agents/:slug/credentials/:id` (revoke) | 1h |
| 1.4 | Middleware: enforce per-agent scopes on every v1 request | 3h |
| 1.5 | Audit log: `agent_runs` table writes on every authenticated v1 call | 2h |
| 1.6 | Discord Interactions endpoint `/api/discord/interactions` (Ed25519 verify, button → grant/deny) | 4h |
| 1.7 | Outbound webhook to Alicia on approval-state-change (`https://alicia.zxy.vc/incoming/baw-os`) | 3h |
| 1.8 | UI wizard `/agents/[slug]/connect` → issues token, shows once, copies to clipboard | 3h |
| 1.9 | UI: split `/agents` into "Nativos" (placeholders) + "Third Party" (real data) | 2h |
| 1.10 | UI: `via <agent>` badge component on every record list/detail (incidents, tasks, contracts, etc.) | 3h |

**Subtotal: ~24h**

### WS-2 — OpenClaw skill (`openclaw-skill-baw-os` new repo)

| # | Task | Estimate |
|---|------|----------|
| 2.1 | Repo init: `skill.yaml`, `LICENSE`, `README.md`, structure | 1h |
| 2.2 | Tool implementations (10 tools): incidents, tasks, units, contracts, payments, approvals | 4h |
| 2.3 | HTTP client: bearer auth, idempotency keys, HMAC signing, retry-with-backoff | 2h |
| 2.4 | Long-poll worker: every 30s, fetch pending approvals for this agent | 2h |
| 2.5 | Mock server for tests (FastAPI) + test suite (pytest, 20+ cases) | 3h |
| 2.6 | Install instructions for OpenClaw runtime on M1 | 1h |
| 2.7 | Initial release `v0.1.0` on GitHub | 0.5h |

**Subtotal: ~13.5h**

### WS-3 — Cloudflare Tunnel + Discord setup (Fran-driven, runbooks by Computer)

| # | Task | Estimate |
|---|------|----------|
| 3.1 | Runbook: setup-cloudflare-tunnel.md (Fran executes) | 1h doc / 30min Fran |
| 3.2 | Runbook: setup-discord-channel.md (Hugo or Fran creates `#baw-os-operations`) | 0.5h doc / 15min Fran |
| 3.3 | Runbook: alicia-skill-install.md (install skill on M1, paste token, smoke test) | 1h doc / 30min Fran |
| 3.4 | Runbook: discord-bot-permissions.md (Discord app, scopes, interactions URL) | 1h doc / 30min Fran |

**Subtotal: ~3.5h doc + ~2h Fran-side execution**

### WS-4 — Verification

| # | Task | Estimate |
|---|------|----------|
| 4.1 | E2E smoke test script (Playwright + Discord webhook simulator) — 5 happy paths | 3h |
| 4.2 | Failure-mode tests: token revoke mid-action, M1 offline (502 from tunnel), approval denied, replay of idempotency key | 2h |
| 4.3 | Manual UAT with Fran: real Discord, real M1, real BaW OS prod | 1h |
| 4.4 | Sprint retrospective doc | 0.5h |

**Subtotal: ~6.5h**

---

## Total estimate

~47h ≈ 3.5 days of agent-time. With Fran's Discord setup (~1h total), realistic delivery in 4 calendar days assuming no Cloudflare/Discord blockers.

## Dependencies / blockers

- **Cloudflare account access**: Fran needs an account (free tier OK). If new, +30min for setup.
- **Discord bot creation**: Fran or Hugo creates a new bot in ZXY Discord server with Interactions URL pointing to Vercel. +15min Fran.
- **DNS for `alicia.zxy.vc`**: needs an A or CNAME record. Cloudflare-managed if domain is on Cloudflare. +5min.
- **OpenClaw runtime version on M1**: must support skill manifest v0.1+. To verify in 3.3 runbook.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Cloudflare Tunnel flaps | Low | Medium | Polling fallback every 30s |
| M1 sleeps overnight, Alicia offline | Medium | Low | Approvals queue persists in DB; Fran sees pending in BaW OS UI |
| Idempotency key collision | Very low | High (double-write) | UUIDv4 + DB unique constraint |
| Bearer token leaks in M1 logs | Low | High | Token redaction filter in skill HTTP client; bcrypt-hash storage server-side |
| Discord rate limits trigger | Low | Medium | Max 5 messages/sec from bot; queue with backoff |
| HMAC signing skew (M1 clock drift) | Low | Medium | NTP enforced on M1; ±5min window |

## Rollout plan

- Day 1 (today): WS-1 tasks 1.1–1.5 + WS-2 tasks 2.1–2.3
- Day 2: WS-1 tasks 1.6–1.8 + WS-2 tasks 2.4–2.5 + WS-3 runbooks
- Day 3: WS-1 tasks 1.9–1.10 + WS-2 release + Fran executes WS-3 runbooks
- Day 4: WS-4 verification + UAT + retrospective

## Definition of done

- [ ] All success criteria met and verified with Fran
- [ ] PR merged to `main` (no auto-merge — Fran clicks the button)
- [ ] Vercel preview deployment Ready
- [ ] `openclaw-skill-baw-os` v0.1.0 tagged and released
- [ ] Cloudflare Tunnel `alicia.zxy.vc` resolving, healthy
- [ ] At least one real incident created in production by Alicia via Discord (the "first car on the highway")
- [ ] Sprint retrospective doc captures learnings for Sprint 5B
- [ ] Notion bitácora page updated with completion timestamp + screenshots
