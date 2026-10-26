// BAW-26: aislamiento por org y permisos en los rieles de agentes (chat in-app,
// credenciales, long-poll de interacciones y escrituras v1). No cambia qué
// agente opera: la selección del chat sigue siendo "agentes con credencial
// activa en la org".
//
// Qué es real y qué es simulado:
//  - Real: rutas de credenciales, chat y Discord, requireMemberCaller /
//    resolveOrgId (membresía + cookie de org leídas del Supabase en memoria),
//    generateApiKey/hashApiKey, los guards de org-refs y el dispatcher.
//  - Simulado: Supabase (en memoria), auth.getUser(), cookies() y la firma de
//    Discord. Las rutas v1 se prueban con el handler ya autorizado (el wrapper
//    devuelve la config) y el PATCH de interacciones con authenticateAgentRequest
//    simulado. Nada sale a la red: fetch está stubbeado; ni Stripe, ni FacturAPI,
//    ni WhatsApp, ni la BD de prod.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeFakeSupabase, type Row } from '../helpers/fake-supabase'

const h = vi.hoisted(() => ({
  user: null as null | { id: string },
  cookies: {} as Record<string, string>,
  db: null as unknown,
  agentAuth: null as null | { orgId: string; agentId: string },
}))

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (name in h.cookies ? { name, value: h.cookies[name] } : undefined),
    getAll: () => Object.entries(h.cookies).map(([name, value]) => ({ name, value })),
    set: () => {},
  }),
}))
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  }),
}))
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  createServiceClient: () => h.db,
}))
vi.mock('@/lib/supabase', () => ({ createServiceClient: () => h.db }))
vi.mock('@/lib/agents/v1/handler', () => ({
  v1Read: (opts: unknown) => opts,
  v1Write: (opts: unknown) => opts,
}))
vi.mock('@/lib/agents/discord-verify', () => ({
  verifyDiscordRequest: async (req: Request) => ({ valid: true, rawBody: await req.text() }),
}))
vi.mock('@/lib/agents/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agents/auth')>()),
  authenticateAgentRequest: async () =>
    h.agentAuth
      ? { ok: true, credentialId: 'cred', scopes: [], rateLimitTier: 'standard', ...h.agentAuth }
      : { ok: false, status: 401, code: 'invalid_credential', message: 'no' },
}))

import { ISSUABLE_SCOPES, unknownScopes } from '@/lib/agents/issuable-scopes'
import { noResponseMessage } from '@/lib/agents/chat-status'
import * as credentialsRoute from '@/app/api/admin/agents/[id]/credentials/route'
import * as conversationsRoute from '@/app/api/chat/conversations/route'
import * as messagesRoute from '@/app/api/chat/conversations/[id]/messages/route'
import * as interactionsRoute from '@/app/api/v1/interactions/route'
import * as interactionRoute from '@/app/api/v1/interactions/[id]/route'
import * as v1ContractsRoute from '@/app/api/v1/contracts/route'
import * as v1IncidentsRoute from '@/app/api/v1/incidents/route'
import * as v1TasksRoute from '@/app/api/v1/tasks/route'
import * as discordRoute from '@/app/api/agents/discord-interactions/route'
import { dispatchApprovedAction } from '@/lib/agents/v1/dispatcher'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'

let tables: Record<string, Row[]>

function loginAs(id: string | null, activeOrg?: string) {
  h.user = id ? { id } : null
  h.cookies = activeOrg ? { baw_active_org_id: activeOrg } : {}
}

function jsonReq(url: string, body: unknown, method = 'POST') {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  loginAs('u-owner-a')
  h.agentAuth = null
  tables = {
    platform_admins: [],
    org_members: [
      { user_id: 'u-owner-a', org_id: ORG_A, role: 'pm_owner', created_at: '2026-01-01', is_active: true },
      { user_id: 'u-viewer-a', org_id: ORG_A, role: 'pm_viewer', created_at: '2026-01-01', is_active: true },
      { user_id: 'u-owner-b', org_id: ORG_B, role: 'pm_owner', created_at: '2026-01-01', is_active: true },
    ],
    agents: [
      { id: 'alicia-ops', display_name: 'Alicia-Ops', full_name: 'Agente Alicia-Ops', role_label: 'Operadora · Mateos 809P', domain: 'ops', status: 'beta' },
      { id: 'hugo-cos', display_name: 'Hugo-COS', full_name: 'Agente Hugo-COS', role_label: 'Supervisor de Alicia · solo lectura', domain: 'ops', status: 'beta' },
    ],
    agent_credentials: [
      { id: 'cred-alicia-a', org_id: ORG_A, agent_id: 'alicia-ops', status: 'active' },
      { id: 'cred-hugo-a', org_id: ORG_A, agent_id: 'hugo-cos', status: 'revoked' },
    ],
    agent_conversations: [
      { id: 'conv-alicia-a', org_id: ORG_A, agent_id: 'alicia-ops', title: null, created_at: '2026-06-23', last_message_at: '2026-06-23' },
      { id: 'conv-hugo-a', org_id: ORG_A, agent_id: 'hugo-cos', title: null, created_at: '2026-06-23', last_message_at: '2026-06-22' },
      { id: 'conv-alicia-b', org_id: ORG_B, agent_id: 'alicia-ops', title: null, created_at: '2026-06-23', last_message_at: '2026-06-23' },
    ],
    agent_interactions: [
      { id: 'int-a', agent_id: 'alicia-ops', org_id: ORG_A, channel: 'app', status: 'deferred', payload: { text: 'A' }, created_at: '2026-10-16T10:00:00Z' },
      { id: 'int-b', agent_id: 'alicia-ops', org_id: ORG_B, channel: 'app', status: 'deferred', payload: { text: 'B secreto' }, created_at: '2026-10-16T10:00:01Z' },
      { id: 'int-null', agent_id: 'alicia-ops', org_id: null, channel: 'discord', status: 'deferred', payload: {}, created_at: '2026-10-16T10:00:02Z' },
    ],
    units: [
      { id: 'unit-a', org_id: ORG_A },
      { id: 'unit-b', org_id: ORG_B },
    ],
    occupants: [
      { id: 'occ-a', org_id: ORG_A },
      { id: 'occ-b', org_id: ORG_B },
    ],
    contracts: [],
    incidents: [],
    tasks: [],
  }
  h.db = makeFakeSupabase(tables)
})

// ── 1. Emisión de credenciales ───────────────────────────────────────────────

describe('emisión de credenciales', () => {
  it('la lista emitible no incluye approvals:resolve ni comodín', () => {
    expect(ISSUABLE_SCOPES).not.toContain('approvals:resolve')
    expect(ISSUABLE_SCOPES).not.toContain('*')
    expect(unknownScopes(['units:read', 'approvals:resolve', '*'])).toEqual(['approvals:resolve', '*'])
  })

  it('emite scopes de la lista tal cual, en la org activa', async () => {
    const res = await credentialsRoute.POST(
      jsonReq('http://x/api/admin/agents/alicia-ops/credentials', { label: 'prod', scopes: ['incidents:read', 'incidents:write'] }),
      params('alicia-ops')
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data.api_key).toMatch(/^sk_live_/)
    const row = tables.agent_credentials.find((c) => c.label === 'prod')!
    expect(row).toMatchObject({ org_id: ORG_A, agent_id: 'alicia-ops', scopes: ['incidents:read', 'incidents:write'] })
  })

  it('rechaza approvals:resolve, * y scopes inventados aunque se pidan a mano', async () => {
    for (const bad of ['approvals:resolve', '*', 'root:all']) {
      const res = await credentialsRoute.POST(
        jsonReq('http://x/api/admin/agents/alicia-ops/credentials', { label: `x-${bad}`, scopes: ['units:read', bad] }),
        params('alicia-ops')
      )
      expect(res.status).toBe(400)
    }
    expect(tables.agent_credentials).toHaveLength(2)
  })

  it('un viewer no puede emitir credenciales', async () => {
    loginAs('u-viewer-a')
    const res = await credentialsRoute.POST(
      jsonReq('http://x/api/admin/agents/alicia-ops/credentials', { label: 'prod', scopes: ['units:read'] }),
      params('alicia-ops')
    )
    expect(res.status).toBe(403)
  })
})

// ── 2. Chat in-app ───────────────────────────────────────────────────────────

describe('chat in-app', () => {
  it('selección sin cambios: ofrece los agentes con credencial activa de la org', async () => {
    const json = await (await conversationsRoute.GET()).json()
    expect(json.data.agents.map((a: { id: string }) => a.id)).toEqual(['alicia-ops'])
    expect(json.data.can_send).toBe(true)
    // Nada de la org B.
    const ids = json.data.conversations.map((c: { id: string }) => c.id)
    expect(ids).toContain('conv-alicia-a')
    expect(ids).not.toContain('conv-alicia-b')
    expect(json.data).not.toHaveProperty('operator')
  })

  it('POST sigue exigiendo agent_id y solo agentes con credencial activa', async () => {
    expect((await conversationsRoute.POST(jsonReq('http://x/api/chat/conversations', {}))).status).toBe(400)
    expect(
      (await conversationsRoute.POST(jsonReq('http://x/api/chat/conversations', { agent_id: 'hugo-cos' }))).status
    ).toBe(400)
    const res = await conversationsRoute.POST(jsonReq('http://x/api/chat/conversations', { agent_id: 'alicia-ops' }))
    expect(res.status).toBe(200)
    const row = tables.agent_conversations.find((c) => c.id === 'new-agent_conversations')!
    expect(row).toMatchObject({ org_id: ORG_A, agent_id: 'alicia-ops', created_by: 'u-owner-a' })
  })

  it('un mensaje crea la interacción app/deferred para el agente de la conversación, en la org', async () => {
    const res = await messagesRoute.POST(
      jsonReq('http://x/api/chat/conversations/conv-alicia-a/messages', { text: 'registra el pago de D104' }),
      params('conv-alicia-a')
    )
    expect(res.status).toBe(200)
    const it = tables.agent_interactions.find((i) => i.conversation_id === 'conv-alicia-a')!
    expect(it).toMatchObject({ agent_id: 'alicia-ops', org_id: ORG_A, channel: 'app', status: 'deferred' })
  })

  it('sin credencial activa del agente, el mensaje se rechaza en vez de quedar esperando', async () => {
    const before = tables.agent_interactions.length
    const res = await messagesRoute.POST(
      jsonReq('http://x/api/chat/conversations/conv-hugo-a/messages', { text: 'hola' }),
      params('conv-hugo-a')
    )
    expect(res.status).toBe(409)
    expect(tables.agent_interactions).toHaveLength(before)
  })

  it('no se puede escribir en una conversación de otra org', async () => {
    const res = await messagesRoute.POST(
      jsonReq('http://x/api/chat/conversations/conv-alicia-b/messages', { text: 'hola' }),
      params('conv-alicia-b')
    )
    expect(res.status).toBe(404)
  })

  it('un pm_viewer ve el historial pero no puede darle órdenes a un agente', async () => {
    loginAs('u-viewer-a')
    const list = await (await conversationsRoute.GET()).json()
    expect(list.data.can_send).toBe(false)
    expect(list.data.conversations.length).toBeGreaterThan(0)
    const conv = await conversationsRoute.POST(jsonReq('http://x/api/chat/conversations', { agent_id: 'alicia-ops' }))
    expect(conv.status).toBe(403)
    const before = tables.agent_interactions.length
    const msg = await messagesRoute.POST(
      jsonReq('http://x/api/chat/conversations/conv-alicia-a/messages', { text: 'registra un pago' }),
      params('conv-alicia-a')
    )
    expect(msg.status).toBe(403)
    expect(tables.agent_interactions).toHaveLength(before)
  })

  it('estado honesto: texto cuando el agente no responde', () => {
    expect(noResponseMessage('Alicia')).toBe(
      'Alicia no ha respondido; revisa que su conector en OpenClaw esté encendido.'
    )
  })
})

// ── 3. Fugas entre orgs ──────────────────────────────────────────────────────

describe('long-poll y PATCH de /v1/interactions acotados a la org de la credencial', () => {
  type ReadOpts = { handler: (a: { auth: unknown; req: NextRequest }) => Promise<Response> }

  it('GET solo devuelve interacciones de la org de la credencial', async () => {
    const res = await (interactionsRoute.GET as unknown as ReadOpts).handler({
      auth: { orgId: ORG_A, agentId: 'alicia-ops' },
      req: new NextRequest('http://x/api/v1/interactions'),
    })
    const json = await res.json()
    expect(json.data.map((r: { id: string }) => r.id)).toEqual(['int-a'])
  })

  it('PATCH no puede cerrar la interacción de otra org', async () => {
    h.agentAuth = { orgId: ORG_A, agentId: 'alicia-ops' }
    const res = await interactionRoute.PATCH(
      jsonReq('http://x/api/v1/interactions/int-b', { status: 'completed', response: { text: 'x' } }, 'PATCH')
    )
    expect(res.status).toBe(404)
    expect(tables.agent_interactions.find((i) => i.id === 'int-b')!.status).toBe('deferred')

    const ok = await interactionRoute.PATCH(
      jsonReq('http://x/api/v1/interactions/int-a', { status: 'completed', response: { text: 'listo' } }, 'PATCH')
    )
    expect(ok.status).toBe(200)
    expect(tables.agent_interactions.find((i) => i.id === 'int-a')!.status).toBe('completed')
  })
})

describe('escrituras v1 no ligan unidades/inquilinos/entidades de otra org', () => {
  type WriteOpts<B> = { handler: (a: { auth: unknown; body: B; recordAction: () => Promise<void> }) => Promise<Response> }
  const auth = { orgId: ORG_A, agentId: 'alicia-ops' }
  const recordAction = async () => {}
  const contractBody = (unit: string, occ: string) => ({
    unit_id: unit,
    occupant_id: occ,
    start_date: '2026-11-01',
    end_date: '2027-10-31',
    monthly_amount: 10000,
  })

  it('POST /v1/contracts con unidad o inquilino de B → 404, sin insertar', async () => {
    const route = v1ContractsRoute.POST as unknown as WriteOpts<ReturnType<typeof contractBody>>
    for (const body of [contractBody('unit-b', 'occ-a'), contractBody('unit-a', 'occ-b')]) {
      const res = await route.handler({ auth, body, recordAction })
      expect(res.status).toBe(404)
    }
    expect(tables.contracts).toHaveLength(0)
    const ok = await route.handler({ auth, body: contractBody('unit-a', 'occ-a'), recordAction })
    expect(ok.status).toBe(200)
    expect(tables.contracts[0]).toMatchObject({ org_id: ORG_A, unit_id: 'unit-a', occupant_id: 'occ-a' })
  })

  it('POST /v1/incidents con unidad o reportante de B → 404', async () => {
    const route = v1IncidentsRoute.POST as unknown as WriteOpts<{ title: string; unit_id?: string; reported_by?: string }>
    expect((await route.handler({ auth, body: { title: 'Fuga', unit_id: 'unit-b' }, recordAction })).status).toBe(404)
    expect((await route.handler({ auth, body: { title: 'Fuga', reported_by: 'occ-b' }, recordAction })).status).toBe(404)
    expect(tables.incidents).toHaveLength(0)
  })

  it('POST /v1/tasks no liga entidades de otra org ni tipos no verificables', async () => {
    const route = v1TasksRoute.POST as unknown as WriteOpts<{ title: string; entity_type?: string; entity_id?: string }>
    const foreign = await route.handler({ auth, body: { title: 't', entity_type: 'unit', entity_id: 'unit-b' }, recordAction })
    expect(foreign.status).toBe(404)
    for (const entity_type of ['secret', 'constructor', 'toString', '__proto__']) {
      const unknown = await route.handler({ auth, body: { title: 't', entity_type, entity_id: 'x' }, recordAction })
      expect(unknown.status).toBe(404)
    }
    expect(tables.tasks).toHaveLength(0)
    const ok = await route.handler({ auth, body: { title: 't', entity_type: 'unit', entity_id: 'unit-a' }, recordAction })
    expect(ok.status).toBe(200)
    const r = await dispatchApprovedAction({
      approvalId: 'ap-3',
      resolvedBy: 'u-owner-a',
      orgId: ORG_A,
      agentId: 'alicia-ops',
      actionType: 'task.create',
      payload: { title: 't', entity_type: 'occupant', entity_id: 'occ-b' },
    })
    expect(r.ok).toBe(false)
    expect(tables.tasks).toHaveLength(1)
  })

  it('el dispatcher (aprobación concedida) tampoco liga refs de otra org', async () => {
    const r1 = await dispatchApprovedAction({
      approvalId: 'ap-1',
      resolvedBy: 'u-owner-a',
      orgId: ORG_A,
      agentId: 'alicia-ops',
      actionType: 'contract.create',
      payload: contractBody('unit-b', 'occ-b'),
    })
    expect(r1.ok).toBe(false)
    const r2 = await dispatchApprovedAction({
      approvalId: 'ap-2',
      resolvedBy: 'u-owner-a',
      orgId: ORG_A,
      agentId: 'alicia-ops',
      actionType: 'incident.create',
      payload: { title: 'x', unit_id: 'unit-b' },
    })
    expect(r2.ok).toBe(false)
    expect(tables.contracts).toHaveLength(0)
    expect(tables.incidents).toHaveLength(0)
  })
})

describe('Discord', () => {
  it('la interacción se guarda con su org ANTES del dispatch; el agente por defecto no cambia', async () => {
    process.env.DISCORD_PUBLIC_KEY = 'aa'
    process.env.DISCORD_DEFAULT_ORG_ID = ORG_A
    let rowAtDispatch: Row | undefined
    const fetchSpy = vi.fn(async () => {
      rowAtDispatch = tables.agent_interactions.find((i) => i.interaction_id === 'd-1')
      return new Response('{}')
    })
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const res = await discordRoute.POST(
        new NextRequest('http://x/api/agents/discord-interactions', {
          method: 'POST',
          body: JSON.stringify({ id: 'd-1', type: 2, token: 't', application_id: 'app', data: { name: 'baw' } }),
        })
      )
      expect(res.status).toBe(200)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(rowAtDispatch).toMatchObject({ agent_id: 'alicia-ops', org_id: ORG_A, channel: 'discord', status: 'deferred' })
    } finally {
      vi.unstubAllGlobals()
      delete process.env.DISCORD_PUBLIC_KEY
      delete process.env.DISCORD_DEFAULT_ORG_ID
    }
  })
})
