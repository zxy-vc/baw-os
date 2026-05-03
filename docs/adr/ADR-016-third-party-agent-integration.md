# ADR-016 — Third-Party Agent Integration Model & Sprint 5A Runtime

**Status**: Accepted
**Date**: 2026-05-03
**Authors**: Fran (Founder, only human in the loop), Computer (this AI)
**Supersedes**: previous Phase-5 plan (CFDI/Stripe irreversible writes — moved to Phase 6)

---

## Context

### The product model — two classes of agents

BaW OS is a property-management SaaS. Its agent strategy has **two distinct classes** of agents that must NOT be conflated in code, UI, or documentation:

#### Class 1 — Native BaW OS Agents (10 slim + 1 fat = 11)

- **Part of the product**. Shipped to every PM Company Owner who buys BaW OS.
- **Status today: 0% built**. Concept-only.
- **+1 fat = "BaW"**: coordinator/orchestrator of the 10 slim agents.
- **10 slim**: task-specific executors (cobros, mantenimiento, reservas, contratos, atención, facturación, fiscal, tarifas, reportes, renovaciones).
- **Roadmap**: design + build deferred until Sprint 7+ (post-Sprint 5/6). Out of scope for Sprint 5A.

#### Class 2 — Third-Party Agents (per-PM-Company-Owner, customizable)

- **NOT part of the product**. They are an **integration layer** each PM Company Owner connects with their own agents.
- Each owner brings their own runtime (could be OpenClaw, LangGraph, custom code, etc.) with their own names, scopes, models, and channels.
- For us (PM Company Owner = "BaW Operations"), our third-party agents are the **7 ZXY Agent OS agents** running on Fran's MacBook Pro M1 today, on top of OpenClaw, with rosters of LLMs (GPT-5.5, Sonnet, Opus, etc.) and channels (Discord primary; also WhatsApp/Slack/Signal/Telegram/iMessage available).
- Each PM Company Owner will have their own Third-Party section in BaW OS with their own connected agents — **not shared across tenants**.

### Critical clarification (Fran, verbatim)

> "Andrés solo es parte de los agentes. Aquí en esta situación y en todo lo que hemos hablado, solo existe un humano, que soy yo."

There is exactly **one human** in this product: Fran. All other named entities (Hugo, Alicia, Beto, Maribel, Luis, Rafa, Andrés) are AI agents. They MUST NEVER be referenced as humans in copy, error messages, audit logs, or commits.

### Why we need this ADR now

Sprint 5A is the **first time** any agent will have **operational write access** to BaW OS production data. The architecture decisions here determine:

- How tokens are issued, scoped, rotated, audited
- How approvals flow back from BaW OS to the agent runtime
- How the integration is packaged so future external PM Company Owners can connect *their* OpenClaw agents (or other runtimes) cleanly
- How the UI signals to all users that "BaW OS does not include agents — they are your integration"

### Use case driving this Sprint (verbatim from Fran)

> "Poder decirle a Alicia 'revisa las incidencias' o 'agrega una incidencia en tal departamento' en lenguaje natural y que ella acceda a hacer las modificaciones registradas en la plataforma."

The API v1 (16 endpoints, shipped in PR #55) is the transport layer. What's missing is **the bridge from natural-language instructions to API calls**. Today the toggle Human/Agent toggles a `preferred_view_mode` column and re-renders the `/agents` route. It does NOT execute any agent action. This ADR closes that gap.

---

## Decision

### D1 — Agent class separation in DB, API, and UI

Add `agent_class` enum to the `agents` table: `'native_baw' | 'third_party'`.

- All current 17 seeded agents (`alicia-ops`, `andres-tech`, etc.) are reclassified as **third_party** (they belong to ZXY Agent OS, our specific PM Company Owner integration, not to BaW OS the product).
- Future native agents (when designed in Sprint 7+) will be inserted with `agent_class='native_baw'`.
- The UI `/agents` route splits into two sections:
  - **"Agentes BaW OS (Nativos)"** — empty for now, with placeholders for the 10 slim + 1 fat marked "Próximamente — Roadmap Q3 2026".
  - **"Tus Agentes Third Party"** — per-tenant connected agents with badge `ZXY Agent OS · vía Discord` (or whatever runtime), health status, and "Conectar nuevo agente" wizard.

### D2 — Sprint 5A scope: connect Alicia ONLY (not all 7 ZXY agents)

After reading the 7 ZXY agent profile pages in Notion, we determined:

- **Alicia (AliOps)** = the only operational fit for BaW OS. 80% of her real-world JTBDs map directly to BaW OS endpoints (incidents, tasks, contracts, units, payments).
- **Hugo, Beto, Maribel, Luis, Rafa**: deferred. They have valuable scopes but operate at different abstraction levels (Chief of Staff, finance, legal, growth, research). Connecting them prematurely creates noise without operational impact.
- **Andrés**: explicitly NOT connected. He is ZXY's tech lead — equivalent to Computer (this AI). His role is to *build* platforms, not operate them. He gets `connected_to_platform: false` in the agents table with a rationale field.

Principle: **one agent connected end-to-end > seven half-connected**.

### D3 — Communication channels: Discord-first, in-app chat second

**Vía A (Sprint 5A)**: Discord channel `#baw-os-operations` in Fran's ZXY Ventures private server. Alicia (already running on M1, already speaking Discord) gets a new skill called `baw-os-skill` in her OpenClaw toolkit. Fran types "alicia, ¿qué incidencias hay abiertas en D104?" in the channel; Alicia processes the intent, invokes `baw.incidents.list({unit:"D104", status:"open"})`, formats the result, replies in Discord with a link to BaW OS.

**Vía B (Sprint 5B, deferred)**: in-app chat at `/agents/alicia-ops/chat` inside BaW OS. Same Alicia runtime, second door — via Cloudflare Tunnel exposing Alicia's HTTP message endpoint to BaW OS. Single agent, two interfaces.

Rationale for Discord-first:
- Alicia already lives there. Her personality, memory, and conversation history are in Discord.
- Zero changes to her runtime — only a new skill installed.
- Tests our integration story: "your existing agents, your existing channels, plus BaW OS as one more skill they can use."

### D4 — Webhooks vs Polling for approvals: hybrid (push-first, poll-as-safety-net)

Sprint 5A integrates two flows:

**Flow A — Vercel → Alicia (M1)**: Cloudflare Tunnel
- Named tunnel `alicia.zxy.vc` (DNS controlled by ZXY), persistent URL.
- Cloudflare Access (Zero Trust) policy: only Vercel egress IPs OR mTLS cert holders.
- mTLS between Vercel and the M1 endpoint. Cert pinned in Vercel env vars.
- Alicia exposes `POST /incoming/baw-os` listener; receives approval-state-changed events, conversation echoes, etc.
- Why not ngrok: free tier rotates URLs; paid tier is more expensive than Cloudflare Tunnel (free) and gives less control.
- If M1 is asleep/off, Cloudflare returns 502 → BaW OS approval queue retains the entry intact (no event is lost, no double-processing).

**Flow B — Discord buttons → BaW OS (Vercel)**: Discord Interactions HTTP endpoint
- Single endpoint: `POST /api/discord/interactions` on Vercel.
- Discord sends button-click events here when Fran clicks "Aprobar" or "Denegar" in an approval embed.
- Vercel verifies the Ed25519 signature from Discord (per Discord docs), executes `grant`/`deny` on the approval, returns ack.
- Stateless, serverless-native. No always-on process required.
- Why not Discord Gateway WebSocket: requires a long-lived process; Vercel functions are stateless. Mismatch.

**Safety net**: the `baw-os-skill` runs a `long-poll` every 30s against `GET /api/v1/approvals?agent=alicia-ops&status=pending&since=<ts>`. If a push event drops, the poll catches up within 30s. Belt-and-suspenders.

**Replay & idempotency**:
- All write requests from Alicia include `Idempotency-Key: alicia-{uuid_v4}` (already supported by v1 middleware).
- HMAC-signed payloads with timestamp; reject `>5min` old.
- Each approval has a `nonce`, invalidated on first click.
- All Alicia actions logged to `agent_runs` with `agent_id`, `endpoint`, `params`, `response_status`, `idempotency_key`, `discord_message_url`.

### D5 — Repository structure: separate repo for OpenClaw skill

The OpenClaw skill `baw-os-skill` lives in a **new dedicated repo**: `zxy-vc/openclaw-skill-baw-os`.

Rationale:
- OpenClaw is an external ecosystem with its own format (`skill.yaml`), lifecycle, and install path (`~/.openclaw/skills/`). Mixing it with the BaW OS monorepo creates cross-deployment coupling: a change to `app/` could trigger a Vercel rebuild that has nothing to do with the skill, and vice versa.
- Distribution: future external PM Company Owners running OpenClaw install via `openclaw skill install gh:zxy-vc/openclaw-skill-baw-os@v0.1.0` — they do NOT need to clone the BaW OS product to get the skill.
- Independent SemVer: API v1 can add endpoints without bumping skill version. Breaking API changes get `v2.0.0` of skill with backward-compat shims.
- Isolated tests: skill suite hits a mock server, doesn't require booting all of BaW OS.
- Reinforces "BaW OS = product, skills = client integration" mental model. The `baw-os` repo stays free of agent-side code.

**Visibility**: private at start. Open-source when the first external OpenClaw user wants it (likely with the first paying customer who runs OpenClaw, expected late 2026).

**Manifest** (skill.yaml shape):
```yaml
name: baw-os
version: 0.1.0
description: Operate BaW OS property-management platform from any OpenClaw agent
maintainers:
  - zxy-vc
auth:
  type: bearer
  env_var: BAW_OS_API_KEY
config:
  endpoint:
    env_var: BAW_OS_API_URL
    default: https://baw-os.vercel.app
tools:
  - id: baw.incidents.list
    schema_ref: ./schemas/incidents.list.json
  - id: baw.incidents.create
    schema_ref: ./schemas/incidents.create.json
  - id: baw.tasks.list
  - id: baw.tasks.create
  - id: baw.units.list
  - id: baw.contracts.list
  - id: baw.payments.aggregate
  - id: baw.approvals.list
```

### D6 — Bearer token & scopes

Each connected third-party agent gets a row in `agent_credentials` with:

- `agent_slug` (e.g. `alicia-ops`)
- `tenant_org_id` (which PM Company Owner this agent belongs to)
- `token_hash` (bcrypt of the bearer; raw token shown ONCE on issue)
- `scopes` (JSONB array of capability strings)
- `rate_caps` (JSONB: per-minute, per-hour, per-day caps)
- `created_at`, `last_used_at`, `revoked_at`

**Scopes for Alicia v0.1**:
```json
[
  "incidents:read", "incidents:write",
  "tasks:read", "tasks:write",
  "units:read",
  "contracts:read",
  "payments:read",
  "approvals:read"
]
```

Notably absent: `contracts:write` (defer until Sprint 5B with Maribel coordination), `payments:write` (CFDI/Stripe writes — Phase 6), `units:write` (organizational changes — human-only).

Token format: `baw_pat_<env>_<base64url-32bytes>`. Issued once via UI wizard on `/agents/alicia-ops/connect`. Revoke is one-click; rotation requires re-install of skill on M1.

### D7 — Audit trail (bidirectional traceability)

Every action originated by a third-party agent must be traceable in **both** directions:

- **In BaW OS**: any record created/modified by Alicia displays a badge "via Alicia · ZXY Agent OS · Discord · [ver mensaje]". Clicking opens the Discord message URL that triggered the action. The `agent_runs` table stores `(agent_id, action, endpoint, params_hash, idempotency_key, response_status, discord_message_url, created_at)`.
- **In Discord/Alicia logs**: each baw-os-skill invocation logs the BaW OS resource URL it created/read in its conversation context, so Alicia can reference it later ("la incidencia que abriste en D104 esta mañana sigue pendiente").

### D8 — Phase 5 original (CFDI/Stripe writes): moved to Phase 6

The earlier "Phase 5: irreversible external writes" plan is **paused**. Rationale:

- Without a working agent runtime, irreversible writes are pointless — there is no actor to call them.
- Once Alicia is operating BaW OS reliably for 2–4 weeks in Sprint 5A/B, we'll know what auth + approval patterns scale to CFDI/Stripe.
- Phase 6 will then layer external irreversibles on the proven runtime, not in parallel to it.

---

## Consequences

### Positive

- First production-realistic test of the third-party agent integration story. If Alicia works for us (BaW Operations), the same model sells to other PM Company Owners running OpenClaw, LangGraph, or custom agents.
- Clean separation in the codebase: BaW OS repo stays product-only; skill repo is integration-only.
- Discord-first means zero changes to Alicia's existing personality/memory/runtime — only a new skill installed.
- Cloudflare Tunnel + mTLS gives us production-grade ingress to a home-network M1 without exposing it directly.
- Hybrid push+poll = no missed events even if tunnels flap.

### Negative

- One more repo to maintain (`openclaw-skill-baw-os`).
- Cloudflare account dependency for the M1 tunnel. Mitigation: tunnel config in Terraform/Notion runbook, swappable for any other Zero Trust provider if needed.
- Discord becomes a critical-path dependency for the operational flow. Mitigation: in-app chat (Sprint 5B) gives a second channel; both eventually feed the same runtime.
- We cannot test the multi-tenant Third-Party section yet (only one PM Company Owner exists today). Mitigation: design wizard now, validate UX with first external customer in Sprint 7+.

### Neutral / open

- Token rotation policy (90-day forced rotation? on-demand only?). Decided in Sprint 5C.
- How to merge agent memory between Discord conversations and in-app chat (Sprint 5B problem).
- Whether to support non-OpenClaw runtimes (LangGraph, custom Python) in the same skill format. Defer to Sprint 6+.

---

## References

- Fran's verbatim use case: "Poder decirle a Alicia 'revisa las incidencias' o 'agrega una incidencia en tal departamento'..."
- ZXY Agent OS Notion root: https://www.notion.so/zxyventures/ZXY-Agent-OS-v1-0-Dise-o-vs-Realidad-Feb-May-2026-355169373e7281578078f8822e507e47
- Alicia (AliOps) Notion: https://www.notion.so/355169373e7281ec8908dbb54379378e
- Andrés (AndyCode) Notion: https://www.notion.so/355169373e72815db879dad27a4cd5c7
- PR #55 (foundations shipped): https://github.com/zxy-vc/baw-os/pull/55
- Roadmap (Phase 2-4 done, Phase 5 reformulated): `/docs/AGENT_PLATFORM_ROADMAP.md`
- API v1 reference: `/docs/AGENT_INTEGRATION.md`
