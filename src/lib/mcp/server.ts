// BaW OS — Servidor MCP (BAW-11)
//
// Un McpServer por request (stateless, Vercel serverless). Solo registra las
// tools que permiten los scopes de la credencial, y cada tool se ejecuta
// llamando en proceso al handler v1 que envuelve (ver ./tools.ts).
//
// Origen del disparo: el puente NUNCA reenvía `x-baw-trigger`, así que el
// clasificador siempre ve 'auto'. Con una API key estática no hay forma de
// probar que la petición la hizo Fran (un prompt inyectado podría decir que
// sí), así que las escrituras reversibles quedan en REQUIRE_APPROVAL salvo que
// la política del agente (agent_policies) diga otra cosa. Cuando llegue OAuth
// (slice 2) se podrá distinguir a Fran y marcar 'human'.

import { NextRequest } from 'next/server'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { AgentAuthResult } from '@/lib/agents/auth'
import { toolsForScopes, type McpToolDef } from './tools'

export interface McpCallContext {
  /** Identidad ya autenticada (API key hoy, OAuth en slice 2) → agent_credentials. */
  auth: AgentAuthResult
  /** Origen del request entrante (solo para armar la URL interna). */
  baseUrl: string
}

const INSTRUCTIONS =
  'Servidor MCP de BaW OS (property management). Cada tool opera sobre la organización de tu credencial. ' +
  'Las escrituras pasan por el clasificador de BaW OS: si una respuesta dice «Pendiente de aprobación de Fran», ' +
  'la acción NO se ejecutó; díselo así al usuario y no la reintentes. Usa ver_aprobacion para consultar su estado.'

export function buildMcpServer(ctx: McpCallContext): McpServer {
  const server = new McpServer(
    { name: 'baw-os', version: '1.0.0' },
    { instructions: INSTRUCTIONS }
  )
  const allowed = toolsForScopes(ctx.auth.scopes)

  for (const def of allowed) {
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.inputShape,
        annotations: {
          readOnlyHint: def.kind === 'read',
          destructiveHint: false,
          idempotentHint: def.kind === 'read',
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>) => callV1(def, args, ctx)
    )
  }

  // McpServer solo instala tools/list y tools/call al registrar la primera
  // tool. Una credencial sin scopes útiles debe ver una lista vacía, no un
  // «method not found».
  if (allowed.length === 0) {
    server.server.registerCapabilities({ tools: {} })
    server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }))
    server.server.setRequestHandler(CallToolRequestSchema, async (req) =>
      toolError(`La tool ${req.params.name} no existe o tu credencial no tiene permiso para usarla.`)
    )
  }

  return server
}

/**
 * v1Write lee el motivo de un header, y un header no admite saltos de línea ni
 * caracteres fuera de Latin-1 (emoji): Headers.set lanzaría y la escritura ni
 * se encolaría. Acentos, ñ y ¿¡ sí pasan.
 */
export function headerSafe(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[^\u0020-\u00ff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toolError(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] }
}

/**
 * Ejecuta la tool con el núcleo de la ruta v1 (`withAuth`) y la identidad ya
 * autenticada. Todo lo que hace REST (scopes, idempotencia, clasificador,
 * aprobaciones, auditoría) pasa aquí igual porque ES el mismo handler.
 * El NextRequest interno se arma de cero: ningún header del cliente MCP
 * (x-baw-trigger incluido) llega a v1.
 */
export async function callV1(
  def: McpToolDef,
  args: Record<string, unknown>,
  ctx: McpCallContext
): Promise<CallToolResult> {
  const url = new URL(def.path(args), ctx.baseUrl)
  const headers = new Headers({ 'user-agent': 'baw-os-mcp/1.0' })

  let body: string | undefined
  if (def.kind === 'read') {
    for (const [k, v] of Object.entries(args)) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, String(v))
    }
  } else {
    headers.set('content-type', 'application/json')
    if (typeof args.idempotency_key === 'string') headers.set('idempotency-key', args.idempotency_key)
    if (typeof args.motivo === 'string') {
      const motivo = headerSafe(args.motivo)
      if (motivo) headers.set('x-baw-reason', motivo)
    }
    body = JSON.stringify(def.toBody ? def.toBody(args) : args)
  }

  const res = await def.handler.withAuth(
    ctx.auth,
    new NextRequest(url, { method: def.method, headers, body })
  )

  let json: {
    success?: boolean
    data?: Record<string, unknown> | unknown[]
    pagination?: unknown
    error?: { code?: string; message?: string }
  }
  try {
    json = await res.json()
  } catch {
    return toolError(`BaW OS respondió ${res.status} sin cuerpo JSON.`)
  }

  if (!res.ok || json.success === false) {
    const code = json.error?.code ?? 'error'
    const msg = json.error?.message ?? 'sin detalle'
    return toolError(`No se pudo completar (${res.status} ${code}): ${msg}`)
  }

  const data = json.data as Record<string, unknown> | undefined
  if (res.status === 202 && data && data.status === 'pending_approval') {
    const vence = typeof data.expires_at === 'string' ? ` Vence ${data.expires_at}.` : ''
    return {
      content: [
        {
          type: 'text',
          text:
            `Pendiente de aprobación de Fran (id ${String(data.approval_id)}). ` +
            `No se ejecutó nada todavía: la acción queda en cola hasta que Fran la apruebe o la rechace.${vence}`,
        },
      ],
    }
  }

  const payload = JSON.stringify(
    json.pagination ? { data: json.data, pagination: json.pagination } : json.data
  )
  if (def.kind === 'write') {
    const id = data && typeof data.id === 'string' ? ` (id ${data.id})` : ''
    return { content: [{ type: 'text', text: `${def.doneLabel ?? 'Listo'}${id}.\n${payload}` }] }
  }
  return { content: [{ type: 'text', text: payload }] }
}
