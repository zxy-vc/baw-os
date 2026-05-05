# Runbook — Cloudflare Tunnel `alicia.zxy.vc`

**Audience**: Fran
**Estimated time**: 30 min
**Sprint**: 5A
**Prerequisite**: Cloudflare account; `zxy.vc` DNS managed by Cloudflare

## Why

Vercel (where BaW OS runs) needs a stable, secure URL to push events (approval state changes, conversation echoes) to Alicia's runtime on Fran's MacBook Pro M1. Cloudflare Tunnel gives us:

- Persistent public URL (`alicia.zxy.vc`) without exposing the M1 directly
- Free TLS certificates auto-managed
- Zero Trust access policy (only Vercel egress IPs / mTLS cert holders)
- Robust to home-network NAT changes

## Steps

### 1. Install `cloudflared` on M1

```bash
brew install cloudflared
cloudflared --version
```

### 2. Authenticate

```bash
cloudflared tunnel login
```

A browser opens. Log into Cloudflare with the `zxy.vc` zone account. Authorize the certificate. It saves to `~/.cloudflared/cert.pem`.

### 3. Create the tunnel

```bash
cloudflared tunnel create alicia-zxy-vc
```

Output includes a tunnel UUID. Save it. The credentials file lives at `~/.cloudflared/<UUID>.json`.

### 4. Configure routing

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <UUID-from-step-3>
credentials-file: /Users/fran/.cloudflared/<UUID>.json

ingress:
  - hostname: alicia.zxy.vc
    service: http://localhost:8787
    originRequest:
      noTLSVerify: true
  - service: http_status:404
```

Note: `localhost:8787` is the port where Alicia's HTTP listener will run (added by `baw-os-skill` in WS-2). If a different port is chosen, update accordingly.

### 5. Route DNS

```bash
cloudflared tunnel route dns alicia-zxy-vc alicia.zxy.vc
```

This creates a CNAME `alicia.zxy.vc → <UUID>.cfargotunnel.com` in Cloudflare DNS automatically.

### 6. Run as a service (so it survives reboots)

```bash
sudo cloudflared service install
sudo launchctl start com.cloudflare.cloudflared
```

Verify:
```bash
sudo launchctl list | grep cloudflared
curl -I https://alicia.zxy.vc/health
# Expect: 502 (no listener yet) or 200 (listener up)
```

### 7. Cloudflare Zero Trust policy

In the Cloudflare dashboard:
- Zero Trust → Access → Applications → Add application → Self-hosted
- Application name: `BaW OS → Alicia`
- Subdomain: `alicia.zxy.vc`
- Identity providers: skip (we'll use service token)
- Policies:
  - Name: `Vercel egress only`
  - Action: Service Auth
  - Include: Service Token (create new: `baw-os-vercel`, copy ID + secret)
- Save

### 8. Save Vercel-side env vars

Push these to Vercel (production env):

```
ALICIA_TUNNEL_URL=https://alicia.zxy.vc
ALICIA_CF_ACCESS_CLIENT_ID=<service-token-id>
ALICIA_CF_ACCESS_CLIENT_SECRET=<service-token-secret>
ALICIA_HMAC_SHARED_SECRET=<32-byte-random-hex>  # generate with: openssl rand -hex 32
```

Save the same `ALICIA_HMAC_SHARED_SECRET` to M1 in `.alicia/.env`. This is the shared secret for HMAC payload signing.

## Verification

```bash
# from any machine, this should fail (no service token):
curl -I https://alicia.zxy.vc/health
# Expect: 401

# with service token (replace IDs):
curl -I https://alicia.zxy.vc/health \
  -H "CF-Access-Client-Id: <id>" \
  -H "CF-Access-Client-Secret: <secret>"
# Expect: 502 if Alicia listener not yet running, 200 once it is.
```

## Done when

- [ ] `alicia.zxy.vc` resolves and reaches the M1
- [ ] Cloudflare Zero Trust policy enforces service token
- [ ] Vercel env vars set and verified
- [ ] HMAC shared secret saved on both sides
- [ ] `cloudflared` runs as a launchd service (survives reboot)

## Notes

- If `zxy.vc` is NOT on Cloudflare DNS, you must either move it or use a different subdomain on a Cloudflare-managed zone.
- The tunnel is one-way (Vercel → M1). M1 → Vercel uses regular outbound HTTPS to `https://baw-os.vercel.app`.
- Free tier covers our usage easily (10k req/day, 50ms latency from US-West).
