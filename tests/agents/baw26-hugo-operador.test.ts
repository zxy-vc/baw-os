// BAW-26: Hugo reemplaza a Alicia como agente operador.
//
// Qué es real y qué es simulado:
//  - Real: rutas de credenciales y chat, requireMemberCaller/resolveOrgId
//    (membresía + cookie de org leídas del Supabase en memoria), el preset
//    «operador», generateApiKey/hashApiKey, findForeignRef y el dispatcher.
//  - Simulado: Supabase (en memoria), auth.getUser() y cookies(). Las rutas v1
//    se prueban con el handler ya autorizado (el wrapper devuelve la config) y
//    el PATCH de interacciones con authenticateAgentRequest simulado.
//    Nada sale a la red: ni Stripe, ni FacturAPI, ni WhatsApp, ni la BD de prod.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
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

import {
  ISSUABLE_SCOPES,
  OPERATOR_AGENT_ID,
  OPERATOR_SCOPES,
  SCOPE_PRESETS,
  isRetiredAgent,
  noResponseMessage,
} from '@/lib/agents/roster'
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

const EXPECTED_OPERATOR_SCOPES = [
  'units:read',
  'reservations:read',
  'payments:read',
  'contracts:read',
  'occupants:read',
  'incidents:read',
  'tasks:read',
  'runs:read',
  'insights:read',
  'approvals:read',
  'agents:read',
  'units:write',
  'payments:write',
  'contracts:write',
  'occupants:write',
  'incidents:write',
  'tasks:write',
  'messages:send',
  'lifecycle:archive',
  'interactions:read',
  'interactions:write',
]

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
      { id: 'hugo-cos', display_name: 'Hugo-COS', full_name: 'Agente Hugo-COS', role_label: 'Agente operador del 809', domain: 'ops', status: 'beta' },
      // Sin la migración aplicada Alicia sigue 'beta': la lista en código la retira igual.
      { id: 'alicia-ops', display_name: 'Alicia-Ops', full_name: 'Agente Alicia-Ops', role_label: 'Operadora · Mateos 809P', domain: 'ops', status: 'beta' },
    ],
    agent_credentials: [
      { id: 'cred-hugo-a', org_id: ORG_A, agent_id: 'hugo-cos', status: 'active' },
      { id: 'cred-alicia-a', org_id: ORG_A, agent_id: 'alicia-ops', status: 'active' },
    ],
    agent_conversations: [
      { id: 'conv-alicia-a', org_id: ORG_A, agent_id: 'alicia-ops', title: null, created_at: '2026-06-23', last_message_at: '2026-06-23' },
      { id: 'conv-hugo-b', org_id: ORG_B, agent_id: 'hugo-cos', title: null, created_at: '2026-06-23', last_message_at: '2026-06-23' },
    ],
    agent_interactions: [
      { id: 'int-a', agent_id: 'hugo-cos', org_id: ORG_A, channel: 'app', status: 'deferred', payload: { text: 'A' }, created_at: '2026-10-16T10:00:00Z' },
      { id: 'int-b', agent_id: 'hugo-cos', org_id: ORG_B, channel: 'app', status: 'deferred', payload: { text: 'B secreto' }, created_at: '2026-10-16T10:00:01Z' },
      { id: 'int-null', agent_id: 'hugo-cos', org_id: null, channel: 'discord', status: 'deferred', payload: {}, created_at: '2026-10-16T10:00:02Z' },
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

// ── 1. Preset «operador» ─────────────────────────────────────────────────────

describe('preset operador', () => {
  it('son exactamente los scopes acordados', () => {
    expect([...OPERATOR_SCOPES].sort()).toEqual([...EXPECTED_OPERATOR_SCOPES].sort())
    expect(new Set(OPERATOR_SCOPES).size).toBe(OPERATOR_SCOPES.length)
    expect(SCOPE_PRESETS.operador.scopes).toBe(OPERATOR_SCOPES)
  })

  it('nunca incluye approvals:resolve, comodín ni disparadores sin aprobación', () => {
    for (const s of ['approvals:resolve', '*', 'agents:run', 'payments:trigger']) {
      expect(OPERATOR_SCOPES).not.toContain(s)
    }
    expect(ISSUABLE_SCOPES).not.toContain('approvals:resolve')
    expect(ISSUABLE_SCOPES).not.toContain('*')
  })

  it('cada scope del preset lo usa algún endpoint /v1 real (no hay permisos sin uso)', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (f === 'route.ts') files.push(readFileSync(p, 'utf8'))
      }
    }
    walk(path.resolve(__dirname, '../../src/app/api/v1'))
    const src = files.join('\n')
    for (const scope of OPERATOR_SCOPES) expect(src, scope).toContain(`'${scope}'`)
  })

  it('POST credencial con preset emite exactamente esos scopes para hugo-cos', async () => {
    const res = await credentialsRoute.POST(
      jsonReq('http://x/api/admin/agents/hugo-cos/credentials', { label: 'prod', preset: 'operador' }),
      params('hugo-cos')
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data.api_key).toMatch(/^sk_live_/)
    const row = tables.agent_credentials.find((c) => c.label === 'prod')!
    expect(row.org_id).toBe(ORG_A)
    expect(row.agent_id).toBe('hugo-cos')
    expect([...(row.scopes as string[])].sort()).toEqual([...EXPECTED_OPERATOR_SCOPES].sort())
  })

  it('rechaza approvals:resolve y * aunque se pidan a mano', async () => {
    for (const bad of ['approvals:resolve', '*']) {
      const res = await credentialsRoute.POST(
        jsonReq('http://x/api/admin/agents/hugo-cos/credentials', { label: `x-${bad}`, scopes: ['units:read', bad] }),
        params('hugo-cos')
      )
      expect(res.status).toBe(400)
    }
    expect(tables.agent_credentials).toHaveLength(2)
  })

  it('rechaza preset + scopes juntos y presets desconocidos', async () => {
    const both = await credentialsRoute.POST(
      jsonReq('http://x/api/admin/agents/hugo-cos/credentials', { label: 'p', preset: 'operador', scopes: ['agents:run'] }),
      params('hugo-cos')
    )
    expect(both.status).toBe(400)
    const unknown = await credentialsRoute.POST(
      jsonReq('http://x/api/admin/agents/hugo-cos/credentials', { label: 'p', preset: 'root' }),
      params('hugo-cos')
    )
    expect(unknown.status).toBe(400)
  })

  it('nombres heredados de Object no son presets (400, no 500)', async () => {
    for (const preset of ['constructor', 'toString', '__proto__']) {
      const res = await credentialsRoute.POST(
        jsonReq('http://x/api/admin/agents/hugo-cos/credentials', { label: `p-${preset}`, preset }),
        params('hugo-cos')
      )
      expect(res.status).toBe(400)
    }
  })

  it('no emite credenciales nuevas a Alicia (retirada)', async () => {
    const res = await credentialsRoute.POST(
      jsonReq('http://x/api/admin/agents/alicia-ops/credentials', { label: 'prod', preset: 'operador' }),
      params('alicia-ops')
    )
    expect(res.status).toBe(409)
  })

  it('un viewer no puede emitir credenciales', async () => {
    loginAs('u-viewer-a')
    const res = await credentialsRoute.POST(
      jsonReq('http://x/api/admin/agents/hugo-cos/credentials', { label: 'prod', preset: 'operador' }),
      params('hugo-cos')
    )
    expect(res.status).toBe(403)
  })
})

// ── 2. Chat in-app ───────────────────────────────────────────────────────────

describe('chat in-app', () => {
  it('Alicia está retirada (lista en código) y Hugo es el operador', () => {
    expect(OPERATOR_AGENT_ID).toBe('hugo-cos')
    expect(isRetiredAgent('alicia-ops')).toBe(true)
    expect(isRetiredAgent('hugo-cos')).toBe(false)
    expect(isRetiredAgent('otro', 'retired')).toBe(true)
  })

  it('GET ofrece a Hugo y no a Alicia, aunque Alicia conserve credencial activa', async () => {
    const res = await conversationsRoute.GET()
    const json = await res.json()
    expect(json.data.agents.map((a: { id: string }) => a.id)).toEqual(['hugo-cos'])
    expect(json.data.operator).toMatchObject({ id: 'hugo-cos', short_name: 'Hugo', has_credential: true })
    // La conversación vieja con Alicia se conserva como historial, marcada.
    const old = json.data.conversations.find((c: { id: string }) => c.id === 'conv-alicia-a')
    expect(old.agent_retired).toBe(true)
    // Nada de la org B.
    expect(json.data.conversations.map((c: { id: string }) => c.id)).not.toContain('conv-hugo-b')
  })

  it('GET sin credencial de Hugo: no hay agentes y el operador lo dice (sin "conectado" falso)', async () => {
    tables.agent_credentials.splice(0, tables.agent_credentials.length)
    const json = await (await conversationsRoute.GET()).json()
    expect(json.data.agents).toEqual([])
    expect(json.data.operator.has_credential).toBe(false)
    expect(json.data.operator).not.toHaveProperty('connected')
  })

  it('una conversación nueva sin agent_id va a hugo-cos en la org del usuario', async () => {
    const res = await conversationsRoute.POST(jsonReq('http://x/api/chat/conversations', {}))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data.agent_id).toBe('hugo-cos')
    const row = tables.agent_conversations.find((c) => c.id === 'new-agent_conversations')!
    expect(row).toMatchObject({ org_id: ORG_A, agent_id: 'hugo-cos', created_by: 'u-owner-a' })
  })

  it('no se puede abrir conversación con Alicia', async () => {
    const res = await conversationsRoute.POST(jsonReq('http://x/api/chat/conversations', { agent_id: 'alicia-ops' }))
    expect(res.status).toBe(400)
    expect(tables.agent_conversations).toHaveLength(2)
  })

  it('sin credencial de Hugo, el error dice dónde emitirla', async () => {
    tables.agent_credentials.splice(0, tables.agent_credentials.length)
    const res = await conversationsRoute.POST(jsonReq('http://x/api/chat/conversations', {}))
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toContain('/agents/hugo-cos/credentials')
  })

  it('un mensaje en conversación de Hugo crea la interacción app/deferred para hugo-cos en la org', async () => {
    const created = await (await conversationsRoute.POST(jsonReq('http://x/api/chat/conversations', {}))).json()
    const convId = created.data.id as string
    const res = await messagesRoute.POST(
      jsonReq(`http://x/api/chat/conversations/${convId}/messages`, { text: 'registra el pago de D104' }),
      params(convId)
    )
    expect(res.status).toBe(200)
    const it = tables.agent_interactions.find((i) => i.conversation_id === convId)!
    expect(it).toMatchObject({ agent_id: 'hugo-cos', org_id: ORG_A, channel: 'app', status: 'deferred' })
  })

  it('no se puede escribir en la conversación vieja de Alicia', async () => {
    const before = tables.agent_interactions.length
    const res = await messagesRoute.POST(
      jsonReq('http://x/api/chat/conversations/conv-alicia-a/messages', { text: 'hola' }),
      params('conv-alicia-a')
    )
    expect(res.status).toBe(409)
    expect(tables.agent_interactions).toHaveLength(before)
  })

  it('no se puede escribir en una conversación de otra org', async () => {
    const res = await messagesRoute.POST(
      jsonReq('http://x/api/chat/conversations/conv-hugo-b/messages', { text: 'hola' }),
      params('conv-hugo-b')
    )
    expect(res.status).toBe(404)
  })

  it('un pm_viewer ve el historial pero no puede darle órdenes a Hugo', async () => {
    loginAs('u-viewer-a')
    const list = await (await conversationsRoute.GET()).json()
    expect(list.data.can_send).toBe(false)
    const conv = await conversationsRoute.POST(jsonReq('http://x/api/chat/conversations', {}))
    expect(conv.status).toBe(403)
    tables.agent_conversations.push({ id: 'conv-hugo-a', org_id: ORG_A, agent_id: 'hugo-cos', title: null })
    const before = tables.agent_interactions.length
    const msg = await messagesRoute.POST(
      jsonReq('http://x/api/chat/conversations/conv-hugo-a/messages', { text: 'registra un pago' }),
      params('conv-hugo-a')
    )
    expect(msg.status).toBe(403)
    expect(tables.agent_interactions).toHaveLength(before)
  })

  it('mensaje sin respuesta: texto exacto pedido', () => {
    expect(noResponseMessage('Hugo')).toBe(
      'Hugo no ha respondido; revisa que su conector en OpenClaw esté encendido.'
    )
  })
})

// ── 3. Fugas entre orgs en los rieles de Hugo ────────────────────────────────

describe('long-poll y PATCH de /v1/interactions acotados a la org de la credencial', () => {
  type ReadOpts = { handler: (a: { auth: unknown; req: NextRequest }) => Promise<Response> }

  it('GET solo devuelve interacciones de la org de la credencial', async () => {
    const res = await (interactionsRoute.GET as unknown as ReadOpts).handler({
      auth: { orgId: ORG_A, agentId: 'hugo-cos' },
      req: new NextRequest('http://x/api/v1/interactions'),
    })
    const json = await res.json()
    expect(json.data.map((r: { id: string }) => r.id)).toEqual(['int-a'])
  })

  it('PATCH no puede cerrar la interacción de otra org', async () => {
    h.agentAuth = { orgId: ORG_A, agentId: 'hugo-cos' }
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

describe('escrituras v1 no ligan unidades/inquilinos de otra org', () => {
  type WriteOpts<B> = { handler: (a: { auth: unknown; body: B; recordAction: () => Promise<void> }) => Promise<Response> }
  const auth = { orgId: ORG_A, agentId: 'hugo-cos' }
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

  it('POST /v1/incidents con unidad de B → 404', async () => {
    const route = v1IncidentsRoute.POST as unknown as WriteOpts<{ title: string; unit_id?: string }>
    const res = await route.handler({ auth, body: { title: 'Fuga', unit_id: 'unit-b' }, recordAction })
    expect(res.status).toBe(404)
    expect(tables.incidents).toHaveLength(0)
  })

  it('POST /v1/tasks no liga entidades de otra org ni tipos no verificables', async () => {
    const route = v1TasksRoute.POST as unknown as WriteOpts<{ title: string; entity_type?: string; entity_id?: string }>
    const foreign = await route.handler({ auth, body: { title: 't', entity_type: 'unit', entity_id: 'unit-b' }, recordAction })
    expect(foreign.status).toBe(404)
    const unknown = await route.handler({ auth, body: { title: 't', entity_type: 'secret', entity_id: 'x' }, recordAction })
    expect(unknown.status).toBe(404)
    expect(tables.tasks).toHaveLength(0)
    const ok = await route.handler({ auth, body: { title: 't', entity_type: 'unit', entity_id: 'unit-a' }, recordAction })
    expect(ok.status).toBe(200)
    const r = await dispatchApprovedAction({
      approvalId: 'ap-3',
      resolvedBy: 'u-owner-a',
      orgId: ORG_A,
      agentId: 'hugo-cos',
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
      agentId: 'hugo-cos',
      actionType: 'contract.create',
      payload: contractBody('unit-b', 'occ-b'),
    })
    expect(r1.ok).toBe(false)
    const r2 = await dispatchApprovedAction({
      approvalId: 'ap-2',
      resolvedBy: 'u-owner-a',
      orgId: ORG_A,
      agentId: 'hugo-cos',
      actionType: 'incident.create',
      payload: { title: 'x', unit_id: 'unit-b' },
    })
    expect(r2.ok).toBe(false)
    expect(tables.contracts).toHaveLength(0)
    expect(tables.incidents).toHaveLength(0)
  })
})

describe('Discord → Hugo', () => {
  it('la interacción se guarda con su org ANTES del dispatch y va a hugo-cos', async () => {
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
      expect(rowAtDispatch).toMatchObject({ agent_id: 'hugo-cos', org_id: ORG_A, channel: 'discord', status: 'deferred' })
    } finally {
      vi.unstubAllGlobals()
      delete process.env.DISCORD_PUBLIC_KEY
      delete process.env.DISCORD_DEFAULT_ORG_ID
    }
  })
})
