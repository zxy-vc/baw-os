// BaW OS — Autenticación de /api/mcp detrás de una interfaz (BAW-11)
//
// Todo método de auth termina en lo mismo: una fila de `agent_credentials`
// (org + agente + scopes) expresada como AgentAuthResult. Las tools solo ven
// eso, así que agregar un método nuevo no las toca.
//
//  - Slice 1 (hoy): apiKeyProvider — `Authorization: Bearer sk_live_…` o
//    `x-api-key: sk_live_…`, validada con verifyAgentBearer.
//  - Slice 2 (OAuth 2.1): un oauthProvider que reconozca el access token
//    (no empieza con sk_), lo valide y lo mapee a su fila de agent_credentials.
//    Se agrega a MCP_AUTH_PROVIDERS y se cambia MCP_WWW_AUTHENTICATE para
//    anunciar resource_metadata. Ver docs/runbooks/grok-bot-connect.md.

import { verifyAgentBearer, type AgentAuthResult } from '@/lib/agents/auth'

export type McpAuthOutcome =
  | { ok: true; auth: AgentAuthResult }
  | { ok: false; message: string }

export interface McpAuthProvider {
  name: string
  /**
   * null = este proveedor no reconoce la credencial (que pruebe el siguiente).
   * { ok: false } = la reconoce pero es inválida: se corta ahí con 401.
   */
  authenticate(req: Request): Promise<McpAuthOutcome | null>
}

/** Header del 401. Slice 2: agregar resource_metadata="…/.well-known/oauth-protected-resource". */
export const MCP_WWW_AUTHENTICATE = 'Bearer realm="baw-os"'

const INVALID = 'Credencial de BaW OS inválida, revocada o expirada.'

function bearerToken(req: Request): string {
  const authz = req.headers.get('authorization') || ''
  return /^Bearer\s+/i.test(authz) ? authz.replace(/^Bearer\s+/i, '').trim() : ''
}

const isAgentKey = (v: string) => v.startsWith('sk_live_') || v.startsWith('sk_test_')

export const apiKeyProvider: McpAuthProvider = {
  name: 'api-key',
  async authenticate(req) {
    const bearer = bearerToken(req)
    const xApiKey = (req.headers.get('x-api-key') || '').trim()
    if (bearer && xApiKey && bearer !== xApiKey) {
      return { ok: false, message: 'Llegaron dos credenciales distintas (Authorization y x-api-key). Manda solo una.' }
    }
    const key = bearer || xApiKey
    if (!isAgentKey(key)) return null

    const identity = await verifyAgentBearer(key)
    if (!identity) return { ok: false, message: INVALID }
    return {
      ok: true,
      auth: {
        ok: true,
        credentialId: identity.credential_id,
        orgId: identity.org_id,
        agentId: identity.agent_id,
        scopes: identity.scopes,
        rateLimitTier: identity.rate_limit_tier,
      },
    }
  },
}

export const MCP_AUTH_PROVIDERS: McpAuthProvider[] = [apiKeyProvider]

export async function authenticateMcpRequest(
  req: Request,
  providers: McpAuthProvider[] = MCP_AUTH_PROVIDERS
): Promise<McpAuthOutcome> {
  if (!bearerToken(req) && !(req.headers.get('x-api-key') || '').trim()) {
    return {
      ok: false,
      message:
        'Falta la credencial de BaW OS. Manda «Authorization: Bearer sk_live_…» o «x-api-key: sk_live_…» ' +
        '(se emite en /agents/<agente>/credentials).',
    }
  }
  for (const provider of providers) {
    const outcome = await provider.authenticate(req)
    if (outcome) return outcome
  }
  return { ok: false, message: INVALID }
}
