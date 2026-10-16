// BAW-11: servidor MCP en /api/mcp.
//
// Qué es real y qué es simulado:
//  - Real: la ruta /api/mcp, el SDK MCP (cliente y transporte Streamable HTTP),
//    verifyAgentBearer/authenticateAgentRequest (hash + scopes), v1Read/v1Write,
//    idempotencia, clasificador y los handlers v1 envueltos por cada tool.
//  - Simulado: Supabase (en memoria) y el comprobante WhatsApp de pagos
//    (sendPaymentReceipt) — nada sale de aquí.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { makeFakeSupabase, type Row } from '../helpers/fake-supabase'

const h = vi.hoisted(() => ({
  db: null as unknown,
  tables: {} as Record<string, Record<string, unknown>[]>,
  sendPaymentReceipt: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ createServiceClient: () => h.db }))
vi.mock('@/lib/payment-receipt', () => ({ sendPaymentReceipt: h.sendPaymentReceipt }))

import * as mcpRoute from '@/app/api/mcp/route'
import * as incidentsRoute from '@/app/api/v1/incidents/route'
import { hashApiKey, type AgentAuthResult } from '@/lib/agents/auth'
import { MCP_TOOLS } from '@/lib/mcp/tools'
import { apiKeyProvider, authenticateMcpRequest, type McpAuthProvider } from '@/lib/mcp/auth'
import { buildMcpServer } from '@/lib/mcp/server'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const ALL_TOOL_SCOPES = Array.from(new Set(MCP_TOOLS.map((t) => t.scope)))

const KEYS = {
  full: 'sk_live_aaaa' + '1'.repeat(44),
  readOnly: 'sk_live_bbbb' + '2'.repeat(44),
  orgB: 'sk_live_cccc' + '3'.repeat(44),
  noScopes: 'sk_live_dddd' + '4'.repeat(44),
  revoked: 'sk_live_eeee' + '5'.repeat(44),
}

async function credential(key: string, orgId: string, scopes: string[], status = 'active'): Promise<Row> {
  return {
    id: `cred-${key.slice(8, 12)}`,
    org_id: orgId,
    agent_id: 'grok-bot',
    api_key_prefix: key.slice(0, 12),
    api_key_hash: await hashApiKey(key),
    scopes,
    status,
    expires_at: null,
    rate_limit_tier: 'standard',
  }
}

async function seed(credentials: Row[] = []) {
  h.tables = {
    agent_credentials: [
      await credential(KEYS.full, ORG_A, ALL_TOOL_SCOPES),
      await credential(KEYS.readOnly, ORG_A, ['units:read', 'payments:read']),
      await credential(KEYS.orgB, ORG_B, ['units:read']),
      await credential(KEYS.noScopes, ORG_A, []),
      await credential(KEYS.revoked, ORG_A, ALL_TOOL_SCOPES, 'revoked'),
      ...credentials,
    ],
    // L2: incident.create / task.create AUTO; payment.record, occupant.create y
    // message.send_to_tenant siguen en REQUIRE_APPROVAL (default del clasificador).
    agent_policies: [{ org_id: ORG_A, agent_id: 'grok-bot', autonomy_level: 2, per_action: {}, active: true }],
    units: [
      { id: 'unit-a-809', org_id: ORG_A, number: '809-1', status: 'occupied', created_at: '2026-10-01' },
      { id: 'unit-b-1', org_id: ORG_B, number: 'B-1', status: 'available', created_at: '2026-10-01' },
    ],
    contracts: [{ id: '11111111-1111-4111-8111-111111111111', org_id: ORG_A }],
    incidents: [],
    tasks: [],
    payments: [],
    agent_runs: [],
    agent_actions: [],
    agent_approvals: [],
    idempotency_keys: [],
  }
  h.db = makeFakeSupabase(h.tables)
}

const BASE = 'https://baw-os.test/api/mcp'

function routeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const req = new NextRequest(
    input instanceof Request ? input.url : input.toString(),
    init as ConstructorParameters<typeof NextRequest>[1]
  )
  const method = (init?.method || 'GET').toUpperCase()
  if (method === 'POST') return mcpRoute.POST(req)
  if (method === 'DELETE') return mcpRoute.DELETE(req)
  return mcpRoute.GET(req)
}

async function connect(headers: Record<string, string>) {
  const client = new Client({ name: 'test-grok', version: '0.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(BASE), {
    fetch: routeFetch,
    requestInit: { headers },
  })
  await client.connect(transport)
  return client
}

async function rawRpc(body: unknown, headers: Record<string, string> = {}, method = 'POST') {
  const res = await routeFetch(BASE, {
    method,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json() }
}

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'curl', version: '0' } },
}
const LIST = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }

function text(result: unknown): string {
  return ((result as { content: { text: string }[] }).content[0]?.text) ?? ''
}

beforeEach(async () => {
  h.sendPaymentReceipt.mockReset()
  await seed()
})

describe('auth de /api/mcp', () => {
  it('initialize y tools/list sin credencial → 401 con error MCP legible', async () => {
    for (const body of [INIT, LIST]) {
      const { status, json } = await rawRpc(body)
      expect(status).toBe(401)
      expect(json.jsonrpc).toBe('2.0')
      expect(json.error.message).toMatch(/Falta la credencial/)
    }
  })

  it('credencial inválida o revocada → 401', async () => {
    for (const key of ['sk_live_nope' + '9'.repeat(44), KEYS.revoked, 'no-es-una-key']) {
      const { status, json } = await rawRpc(INIT, { authorization: `Bearer ${key}` })
      expect(status).toBe(401)
      expect(json.error.message).toMatch(/inválida, revocada o expirada/)
    }
  })

  it('dos credenciales distintas → 401', async () => {
    const { status } = await rawRpc(INIT, { authorization: `Bearer ${KEYS.full}`, 'x-api-key': KEYS.orgB })
    expect(status).toBe(401)
  })

  it('GET sin credencial → 401; con credencial → 405 (stateless, solo POST)', async () => {
    expect((await rawRpc(null, {}, 'GET')).status).toBe(401)
    const res = await rawRpc(null, { authorization: `Bearer ${KEYS.full}` }, 'GET')
    expect(res.status).toBe(405)
  })

  it('initialize + tools/list con Bearer (cliente MCP real)', async () => {
    const client = await connect({ authorization: `Bearer ${KEYS.full}` })
    expect(client.getServerVersion()?.name).toBe('baw-os')
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(MCP_TOOLS.map((t) => t.name).sort())
    await client.close()
  })

  it('initialize + tools/list con x-api-key', async () => {
    const client = await connect({ 'x-api-key': KEYS.full })
    const { tools } = await client.listTools()
    expect(tools.length).toBe(MCP_TOOLS.length)
    await client.close()
  })
})

describe('lectura acotada a la org de la credencial', () => {
  it('listar_unidades solo devuelve unidades de la org del agente', async () => {
    const a = await connect({ authorization: `Bearer ${KEYS.full}` })
    const ra = await a.callTool({ name: 'listar_unidades', arguments: {} })
    expect(ra.isError).toBeFalsy()
    const unitsA = JSON.parse(text(ra)).data as Row[]
    expect(unitsA.map((u) => u.id)).toEqual(['unit-a-809'])

    const b = await connect({ authorization: `Bearer ${KEYS.orgB}` })
    const rb = await b.callTool({ name: 'listar_unidades', arguments: {} })
    const unitsB = JSON.parse(text(rb)).data as Row[]
    expect(unitsB.map((u) => u.id)).toEqual(['unit-b-1'])
  })

  it('cada tool de lectura funciona con SOLO su scope (scopes en sync con v1)', async () => {
    for (const def of MCP_TOOLS.filter((t) => t.kind === 'read')) {
      const key = `sk_live_r${def.name.slice(0, 3)}` + 'f'.repeat(44)
      h.tables.agent_credentials.push(await credential(key, ORG_A, [def.scope]))
      const client = await connect({ authorization: `Bearer ${key}` })
      const args = def.name === 'ver_aprobacion' ? { approval_id: '22222222-2222-4222-8222-222222222222' } : {}
      const r = await client.callTool({ name: def.name, arguments: args })
      // ver_aprobacion con id inexistente → 404 de v1, pero NUNCA un 403 de scope.
      expect(text(r)).not.toMatch(/forbidden_scope/)
      if (def.name !== 'ver_aprobacion') expect(r.isError).toBeFalsy()
      h.tables.agent_credentials.pop()
    }
  })
})

describe('escrituras pasan por el clasificador', () => {
  it('crear_incidencia (AUTO) crea la fila en la org del agente y deja agent_actions', async () => {
    const client = await connect({ authorization: `Bearer ${KEYS.full}` })
    const r = await client.callTool({
      name: 'crear_incidencia',
      arguments: { title: 'Fuga en baño', unit_id: '33333333-3333-4333-8333-333333333333', priority: 'high' },
    })
    expect(r.isError).toBeFalsy()
    expect(text(r)).toMatch(/^Incidencia creada/)
    expect(h.tables.incidents).toHaveLength(1)
    expect(h.tables.incidents[0]).toMatchObject({ org_id: ORG_A, title: 'Fuga en baño', priority: 'high' })
    expect(h.tables.agent_actions).toHaveLength(1)
    expect(h.tables.agent_actions[0]).toMatchObject({
      org_id: ORG_A,
      agent_id: 'grok-bot',
      action_type: 'incident.create',
      status: 'ok',
    })
    expect(h.tables.agent_runs[0]).toMatchObject({ org_id: ORG_A, agent_id: 'grok-bot', status: 'succeeded' })
    expect(h.tables.agent_approvals).toHaveLength(0)
  })

  it('enviar_mensaje_inquilino (REQUIRE_APPROVAL) crea agent_approvals y no ejecuta', async () => {
    const client = await connect({ authorization: `Bearer ${KEYS.full}` })
    const r = await client.callTool({
      name: 'enviar_mensaje_inquilino',
      arguments: { channel: 'whatsapp', to: '+5215555555555', body: 'Hola, te recuerdo tu renta.', motivo: 'Fran lo pidió' },
    })
    expect(r.isError).toBeFalsy()
    expect(text(r)).toMatch(/^Pendiente de aprobación de Fran \(id new-agent_approvals\)/)
    expect(h.tables.agent_approvals).toHaveLength(1)
    expect(h.tables.agent_approvals[0]).toMatchObject({
      org_id: ORG_A,
      agent_id: 'grok-bot',
      action_type: 'message.send_to_tenant',
      reason: 'Fran lo pidió',
      payload: expect.objectContaining({ audience: 'tenant', channel: 'whatsapp' }),
    })
    expect(h.tables.agent_actions).toHaveLength(0)
    expect(h.tables.agent_runs).toHaveLength(0)
  })

  it('registrar_pago_recibido (REQUIRE_APPROVAL) no inserta pago ni manda comprobante', async () => {
    const client = await connect({ authorization: `Bearer ${KEYS.full}` })
    const r = await client.callTool({
      name: 'registrar_pago_recibido',
      arguments: { contract_id: '11111111-1111-4111-8111-111111111111', amount: 12000 },
    })
    expect(text(r)).toMatch(/Pendiente de aprobación de Fran/)
    expect(h.tables.payments).toHaveLength(0)
    expect(h.sendPaymentReceipt).not.toHaveBeenCalled()
    expect(h.tables.agent_approvals[0]).toMatchObject({ action_type: 'payment.record' })
  })

  it('x-baw-trigger: human mandado a /api/mcp se ignora (no salta la aprobación)', async () => {
    const client = await connect({ authorization: `Bearer ${KEYS.full}`, 'x-baw-trigger': 'human' })
    const r = await client.callTool({
      name: 'crear_ocupante',
      arguments: { name: 'Inquilino Nuevo' },
    })
    expect(text(r)).toMatch(/Pendiente de aprobación de Fran/)
    expect(h.tables.agent_approvals[0]).toMatchObject({ action_type: 'occupant.create' })
  })

  it('sin política (autonomía L1) hasta crear_incidencia queda pendiente', async () => {
    h.tables.agent_policies.length = 0
    const client = await connect({ authorization: `Bearer ${KEYS.full}` })
    const r = await client.callTool({ name: 'crear_incidencia', arguments: { title: 'Foco fundido' } })
    expect(text(r)).toMatch(/Pendiente de aprobación de Fran/)
    expect(h.tables.incidents).toHaveLength(0)
  })

  it('idempotency_key: la misma llamada dos veces crea una sola tarea', async () => {
    const client = await connect({ authorization: `Bearer ${KEYS.full}` })
    const args = { title: 'Cambiar chapa 809', idempotency_key: 'grok-1' }
    const r1 = await client.callTool({ name: 'crear_tarea', arguments: args })
    const r2 = await client.callTool({ name: 'crear_tarea', arguments: args })
    expect(text(r1)).toMatch(/^Tarea creada/)
    expect(text(r2)).toMatch(/^Tarea creada/)
    expect(h.tables.tasks).toHaveLength(1)
    expect(h.tables.agent_actions).toHaveLength(1)
  })
})

describe('scopes filtran tools', () => {
  it('scope faltante → la tool no aparece y una llamada directa da error sin escribir nada', async () => {
    const client = await connect({ authorization: `Bearer ${KEYS.readOnly}` })
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['listar_pagos', 'listar_unidades'])

    const r = await client.callTool({ name: 'crear_incidencia', arguments: { title: 'x' } })
    expect(r.isError).toBe(true)
    expect(text(r)).toMatch(/crear_incidencia not found/)
    expect(h.tables.incidents).toHaveLength(0)
    expect(h.tables.agent_approvals).toHaveLength(0)
  })

  it('credencial sin scopes → tools/list vacío y tools/call da error', async () => {
    const client = await connect({ authorization: `Bearer ${KEYS.noScopes}` })
    expect((await client.listTools()).tools).toEqual([])
    const r = await client.callTool({ name: 'listar_unidades', arguments: {} })
    expect(r.isError).toBe(true)
  })
})

describe('catálogo', () => {
  it('no expone candados duros, resolución de aprobaciones ni rutas fuera de la lista', () => {
    const paths = MCP_TOOLS.map((t) => `${t.method} ${t.path({ approval_id: 'ID' })}`).sort()
    expect(paths).toEqual(
      [
        'GET /api/v1/approvals',
        'GET /api/v1/approvals/ID',
        'GET /api/v1/contracts',
        'GET /api/v1/incidents',
        'GET /api/v1/insights/summary',
        'GET /api/v1/occupants',
        'GET /api/v1/payments',
        'GET /api/v1/runs',
        'GET /api/v1/tasks',
        'GET /api/v1/units',
        'POST /api/v1/incidents',
        'POST /api/v1/messages',
        'POST /api/v1/occupants',
        'POST /api/v1/payments',
        'POST /api/v1/tasks',
      ].sort()
    )
    const scopes = MCP_TOOLS.map((t) => t.scope)
    for (const s of ['payments:trigger', 'approvals:resolve', 'agents:run', 'lifecycle:archive', 'contracts:write', 'units:write']) {
      expect(scopes).not.toContain(s)
    }
  })
})

describe('núcleo v1 compartido (REST y MCP)', () => {
  const restPost = (headers: Record<string, string>, body: unknown) =>
    incidentsRoute.POST(
      new NextRequest('https://baw-os.test/api/v1/incidents', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })
    )

  it('REST sigue autenticando, clasificando y auditando igual', async () => {
    expect((await restPost({}, { title: 'x' })).status).toBe(401)
    expect((await restPost({ authorization: `Bearer ${KEYS.readOnly}` }, { title: 'x' })).status).toBe(403)
    const res = await restPost({ authorization: `Bearer ${KEYS.full}` }, { title: 'Por REST' })
    expect(res.status).toBe(200)
    expect(h.tables.agent_actions[0]).toMatchObject({ action_type: 'incident.create', org_id: ORG_A })
  })

  it('withAuth revalida scopes aunque la identidad venga de otro proveedor', async () => {
    const auth: AgentAuthResult = {
      ok: true,
      credentialId: 'cred-x',
      orgId: ORG_A,
      agentId: 'grok-bot',
      scopes: ['incidents:read'],
      rateLimitTier: 'standard',
    }
    const res = await incidentsRoute.POST.withAuth(
      auth,
      new NextRequest('https://baw-os.test/api/v1/incidents', { method: 'POST', body: '{"title":"x"}' })
    )
    expect(res.status).toBe(403)
    expect(h.tables.incidents).toHaveLength(0)
  })
})

describe('interfaz de auth (slice 2 se enchufa sin tocar tools)', () => {
  const oauthLike: McpAuthProvider = {
    name: 'oauth-de-prueba',
    async authenticate(req) {
      const authz = req.headers.get('authorization') || ''
      if (!authz.startsWith('Bearer at_')) return null
      return {
        ok: true,
        auth: { ok: true, credentialId: 'cred-oauth', orgId: ORG_B, agentId: 'grok-bot', scopes: ['units:read'], rateLimitTier: 'standard' },
      }
    },
  }
  const req = (headers: Record<string, string>) => new Request(BASE, { method: 'POST', headers })

  it('un token que no es sk_ lo toma el siguiente proveedor; una sk_ sigue yendo a api-key', async () => {
    const providers = [apiKeyProvider, oauthLike]
    const viaOauth = await authenticateMcpRequest(req({ authorization: 'Bearer at_123' }), providers)
    expect(viaOauth).toMatchObject({ ok: true, auth: { credentialId: 'cred-oauth' } })
    const viaKey = await authenticateMcpRequest(req({ authorization: `Bearer ${KEYS.full}` }), providers)
    expect(viaKey).toMatchObject({ ok: true, auth: { credentialId: 'cred-aaaa', orgId: ORG_A } })
    // Sin el proveedor OAuth (slice 1), el mismo token es 401.
    expect(await authenticateMcpRequest(req({ authorization: 'Bearer at_123' }))).toMatchObject({ ok: false })
  })

  it('las tools operan con la identidad del proveedor, sin key que reenviar', async () => {
    const outcome = await authenticateMcpRequest(req({ authorization: 'Bearer at_123' }), [oauthLike])
    if (!outcome.ok) throw new Error('auth')
    const server = buildMcpServer({ auth: outcome.auth, baseUrl: 'https://baw-os.test' })
    const client = new Client({ name: 't', version: '0' })
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
    const [a, b] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(a), client.connect(b)])
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['listar_unidades'])
    const r = await client.callTool({ name: 'listar_unidades', arguments: {} })
    expect((JSON.parse(text(r)).data as Row[]).map((u) => u.id)).toEqual(['unit-b-1'])
  })
})
