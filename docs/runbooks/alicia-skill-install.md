# Runbook — Conectar Alicia (operadora) con BaW OS

**Audience:** Fran / `hugosanchez`
**Host actual:** Mac Studio M4 Max · `MS-M4Max-HS`
**Plataforma:** ZXY Agent OS **MK2** sobre OpenClaw 2026.5.28
**Última verificación en host:** 2026-06-21

---

> ## ✅ ESTADO: Alicia conectada y operando en MK2 (desde 2026-06-22)
>
> Alicia (`alicia-ops`) **ya está conectada a la API de BaW OS desde MK2** (Mac Studio M4 Max)
> y opera como agente third-party: puede **leer y registrar** en la plataforma. Verificado en
> `/agents` → aparece **CONECTADO** con runs recientes (trigger `agent` y `manual`).
>
> - **Credencial:** se gestiona en `/agents/alicia-ops/credentials` (formato `sk_live_...`).
> - **El conector vivo** (skill/plugin que llama la API) vive del lado de **OpenClaw / MK2**
>   (repo `openclaw-skill-baw-os` + config en la Mac Studio), **no** en este repo. Los pasos
>   exactos de instalación los mantiene quien opera MK2.
> - **Histórico:** un relevamiento del 2026-06-21 reportó la integración como "no reconstruida
>   en MK2"; **se completó el 2026-06-22**. El procedimiento de MK1 (MacBook Pro M1) queda al
>   final como **Legacy** — no ejecutarlo tal cual (rutas/comandos cambiaron; ver tabla MK2).

---

## Infraestructura MK2 confirmada (referencia)

| Campo | Valor MK2 |
|---|---|
| Host | Mac Studio M4 Max · `MS-M4Max-HS` · user `hugosanchez` |
| Plataforma | ZXY Agent OS MK2 sobre OpenClaw 2026.5.28 |
| Malla remota | **Tailscale** (variante `macsys`) — ya **no** Cloudflare Tunnel |
| Alicia — config home | `~/.openclaw-alicia` |
| Alicia — workspace de contenido | `~/agents/baw-operations/alicia` (`SOUL.md`, `IDENTITY.md`, `MEMORY.md`, `capabilities.yaml`) |
| Alicia — puerto gateway | `19100` |
| Alicia — label launchd | `ai.openclaw.alicia` |
| Alicia — log | `~/.openclaw-alicia/logs/gateway.log` (stderr → `/dev/null`) |
| Alicia — env de servicio | `~/.openclaw-alicia/service-env/ai.openclaw.alicia.env` (generado por OpenClaw; "do not edit while service is installed") |
| Token BaW (formato) | `sk_live_...` (el viejo `baw_pat_prod_...` está **obsoleto**) |
| Integración Alicia ↔ BaW OS | **No implementada en MK2** (legacy de MK1) |

El `~/.alicia` y el `.env` de MK1 **no existen** en MK2.

### Reiniciar Alicia (regla dura MK2)

**Nunca** `launchctl kickstart -k` en MK2. Usar bootout/bootstrap:

```bash
launchctl bootout gui/$(id -u)/ai.openclaw.alicia
sleep 3
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.alicia.plist
```

### Discord (MK2)

- Guild `1503865235575148635`.
- Canal de operación BaW = **`#baw-os`** (ID `1503898850601996369`).
- Alicia también escucha **`#809`** (ID `1514326760345309275`).
- Home channel de Alicia = **`#alicia`** (ID `1503898896873558167`).
- Alicia con `requireMention: false` en `#baw-os` y `#809` (desde 2026-06-21).
- El ruteo de Discord vive en `openclaw.json` (`channels.discord.accounts.default.guilds.…`).
- El `#baw-os-operations` de MK1 **ya no existe**.

### Operación del host

- La Mac Studio **no duerme** (modo servidor permanente). La advertencia MK1 de "sleeps overnight, Alicia offline" **no aplica**.
- Auto-updates de macOS/Tailscale **desactivados** (evitar reboots headless).
- `hugosanchez` (uid 501) debe mantener el foreground de consola; si `fran` (uid 502) lo toma, los LaunchAgents fallan.

---

## Reconstrucción (✅ COMPLETADA — 2026-06-22)

> Esta sección era el approach previsto cuando la integración estaba pendiente. **Ya se
> reconstruyó el 2026-06-22** (Alicia conectada y operando, ver banner arriba). Se conserva
> como referencia del diseño; los pasos exactos del conector vivo los mantiene MK2/OpenClaw.

Approach que se siguió:

1. **Cliente BaW OS como plugin/MCP de OpenClaw MK2.** El `openclaw skill install` de MK1
   ya no existe (`Unknown command: skill`); las skills hoy son **plugins** (`plugins.entries`
   en `openclaw.json`).
2. **Credencial:** emitir en `/agents/alicia-ops/credentials` (formato `sk_live_...`) y
   guardarla en el `service-env` de Alicia — **nunca** en archivos `.md` ni en Discord.
3. **Ruteo de canal:** ya vive en `openclaw.json`; `BAW_OS_DISCORD_CHANNEL_ID` sería redundante.
4. **Callbacks entrantes (Vercel → Alicia):** opcionales. Si se quieren, definir exposición
   sobre **Tailscale** (no Cloudflare) + HMAC + sincronización de reloj. Si no, basta el
   flujo **saliente** (Alicia → API de BaW OS), que no requiere túnel ni HMAC entrante.
5. **Smoke test:** validar `Auth: OK (agent=alicia-ops)` contra la API y una acción real
   que aparezca en BaW OS con badge `via Alicia`.

---

## Hugo (supervisor)

Hugo corre en el **mismo host MK2** pero con **workspace propio** (`~/.openclaw-hugo`,
puerto `19000`, label `ai.openclaw.hugo`) — no comparte workspace con Alicia.

**Hugo NO está conectado a BaW OS** (decisión 2026-06-17): obtiene info de BaW
preguntándole a Alicia por Discord y/o leyendo un resumen que Alicia empuja por cron a un
canal. El encuadre "Hugo = supervisor de la API con scopes solo-lectura" y el break-glass de
escritura quedan **teóricos** hasta que exista la integración. Ver `hugo-cos-connect.md`
(igualmente legacy).

---

---

# Legacy — MK1 (MacBook Pro M1) · referencia histórica

> ⚠️ Lo siguiente describe el setup de **MK1** que **ya no aplica** en MK2. Se conserva por
> trazabilidad. No ejecutar tal cual: el workspace, el CLI de skills, el restart, el túnel y
> el canal de Discord cambiaron (ver secciones MK2 arriba).

**Prerequisite (MK1):**
- Cloudflare Tunnel (`alicia.zxy.vc`) healthy — *en MK2 se usa Tailscale, no Cloudflare*
- Canal Discord `#baw-os-operations` — *en MK2 el canal es `#baw-os`*
- `openclaw-skill-baw-os` v0.1.0 released
- Token issued from `/agents/alicia-ops/connect` — *en MK2 la ruta es `/agents/alicia-ops/credentials`*

### 1. (MK1) Open Alicia's workspace
```bash
cd ~/.alicia     # MK2: ~/.openclaw-alicia (config) + ~/agents/baw-operations/alicia (contenido)
ls skills/
```

### 2. (MK1) Install the skill
```bash
openclaw skill install gh:zxy-vc/openclaw-skill-baw-os@v0.1.0   # MK2: comando inexistente; las skills son plugins
```

### 3. (MK1) Configure environment — `~/.alicia/.env`
```
BAW_OS_API_URL=https://baw-os.vercel.app
BAW_OS_API_KEY=baw_pat_prod_<token>   # MK2: formato real sk_live_...; y no hay .env (se usa service-env)
ALICIA_HMAC_SHARED_SECRET=<same-as-vercel>
ALICIA_HTTP_LISTEN_PORT=8787          # MK2: gateway en 19100
BAW_OS_DISCORD_CHANNEL_ID=<from-discord-runbook>
```

### 4. (MK1) Restart Alicia
```bash
launchctl kickstart -k gui/$(id -u)/com.zxy.alicia   # MK2: label ai.openclaw.alicia y bootout/bootstrap (NUNCA kickstart -k)
tail -f ~/.alicia/logs/alicia.log                    # MK2: ~/.openclaw-alicia/logs/gateway.log
```

### 5. (MK1) Smoke test desde Discord
```
alicia, ping baw-os    →   ✅ BaW OS conectado · Auth: OK (agent=alicia-ops…)
```
*En MK2 esto no responde "conectado": no hay backend cableado todavía.*
