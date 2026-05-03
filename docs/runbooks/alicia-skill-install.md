# Runbook — Install `baw-os-skill` on Alicia (M1)

**Audience**: Fran
**Estimated time**: 30 min
**Sprint**: 5A
**Prerequisite**:
- Cloudflare Tunnel runbook complete (`alicia.zxy.vc` healthy)
- Discord channel runbook complete (`#baw-os-operations` exists)
- `openclaw-skill-baw-os` v0.1.0 released on GitHub
- Alicia's runtime on M1 reachable and operational
- Token issued from BaW OS UI wizard at `/agents/alicia-ops/connect` (copy it once — shown only on issue)

## Steps

### 1. Open Alicia's workspace

```bash
cd ~/.alicia    # or wherever Alicia's OpenClaw workspace lives
ls skills/      # see existing skills (notion-skill, gcli, etc.)
```

### 2. Install the skill

```bash
openclaw skill install gh:zxy-vc/openclaw-skill-baw-os@v0.1.0
```

If `openclaw skill install` is not yet a command in your runtime, fallback:

```bash
cd skills/
git clone https://github.com/zxy-vc/openclaw-skill-baw-os baw-os
cd baw-os
pip install -e .   # or npm install if Node-based
```

### 3. Configure environment

Create or update `~/.alicia/.env`:

```
BAW_OS_API_URL=https://baw-os.vercel.app
BAW_OS_API_KEY=baw_pat_prod_<paste-token-from-wizard>
ALICIA_HMAC_SHARED_SECRET=<same-as-vercel>
ALICIA_HTTP_LISTEN_PORT=8787
BAW_OS_DISCORD_CHANNEL_ID=<from-discord-runbook>
```

### 4. Restart Alicia

```bash
launchctl kickstart -k gui/$(id -u)/com.zxy.alicia
# or whatever your existing restart command is
tail -f ~/.alicia/logs/alicia.log
```

Look for these lines:
```
[baw-os-skill] loaded v0.1.0
[baw-os-skill] HTTP listener bound to :8787
[baw-os-skill] BAW_OS_API_URL=https://baw-os.vercel.app
[baw-os-skill] long-poll started (interval=30s, agent=alicia-ops)
```

### 5. Smoke test from Discord

In `#baw-os-operations`:

```
alicia, ping baw-os
```

Expected reply (within 5s):
```
✅ BaW OS conectado
- API: https://baw-os.vercel.app (status 200)
- Auth: OK (agent=alicia-ops, scopes: incidents:rw, tasks:rw, units:r, contracts:r, payments:r, approvals:r)
- Tunnel: alicia.zxy.vc (Vercel can reach me)
- Long-poll: every 30s, last poll 12s ago
```

Then real query:
```
alicia, ¿qué incidencias hay abiertas en D104?
```

### 6. Inspect first action in BaW OS

Open https://baw-os.vercel.app/incidents in a browser. The list view should be unchanged (Alicia only read).

Now create one:
```
alicia, agrega incidencia "test conexión sprint 5A" en D104, prioridad baja
```

Refresh BaW OS `/incidents`. The new incident should appear with badge:
```
via Alicia · ZXY Agent OS · Discord · [ver mensaje]
```

Click "ver mensaje" → opens the Discord message that triggered the action.

## Done when

- [ ] Skill installed, version v0.1.0 confirmed in logs
- [ ] Environment configured with token, HMAC secret, port
- [ ] `alicia, ping baw-os` returns healthy in Discord
- [ ] `alicia, agrega incidencia ...` creates a real incident in BaW OS prod
- [ ] The incident shows `via Alicia` badge with working Discord link
- [ ] At least one approval-required action tested with button click → grant flow works

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `auth: 401` in logs | Token wrong or revoked | Re-issue from `/agents/alicia-ops/connect` |
| `tunnel: unreachable` | Cloudflared not running | `sudo launchctl start com.cloudflare.cloudflared` |
| Incident created but no badge | `agent_runs` insert failed | Check Vercel logs for the insert query |
| Approval button click does nothing | Discord Interactions endpoint not configured | Re-verify Vercel `/api/discord/interactions` and Discord app settings |
| HMAC mismatch errors | Clock drift on M1 | `sudo sntp -sS time.apple.com` |
