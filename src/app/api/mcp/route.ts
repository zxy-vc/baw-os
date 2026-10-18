// BaW OS — POST/GET /api/mcp · Servidor MCP remoto (BAW-11)
//
// Puerta para asistentes que hablan MCP (Grok Bot, Hugo/OpenClaw). Transporte
// Streamable HTTP en modo stateless con respuestas JSON: cada POST crea su
// propio McpServer + transporte, sin sesiones en memoria (Vercel serverless).
//
// Auth: detrás de la interfaz de src/lib/mcp/auth.ts. Slice 1 = API key del
// agente (`Authorization: Bearer sk_live_…` o `x-api-key: sk_live_…`); slice 2
// = OAuth 2.1, que se enchufa como otro proveedor sin tocar tools ni esta ruta.
// Sin credencial válida → 401 con error JSON-RPC legible.
//
// GET: el servidor no ofrece stream SSE iniciado por el servidor (no hay nada
// que empujar en stateless), así que responde 405 como permite la spec.
//
// Origin: no se valida. La credencial viaja solo en headers (nunca cookies), y
// sin CORS un navegador ajeno no puede leer respuestas ni adjuntar la key.

import { NextRequest } from 'next/server'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { authenticateMcpRequest, MCP_WWW_AUTHENTICATE } from '@/lib/mcp/auth'
import { buildMcpServer } from '@/lib/mcp/server'

export const dynamic = 'force-dynamic'

function jsonRpcError(status: number, code: number, message: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function unauthorized(message: string) {
  return jsonRpcError(401, -32001, message, { 'www-authenticate': MCP_WWW_AUTHENTICATE })
}

export async function POST(req: NextRequest): Promise<Response> {
  const outcome = await authenticateMcpRequest(req)
  if (!outcome.ok) return unauthorized(outcome.message)

  const server = buildMcpServer({ auth: outcome.auth, baseUrl: req.nextUrl.origin })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  try {
    await server.connect(transport)
    return await transport.handleRequest(req)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error interno'
    return jsonRpcError(500, -32603, `Error interno del servidor MCP: ${msg}`)
  } finally {
    void server.close()
  }
}

async function methodNotAllowed(req: NextRequest): Promise<Response> {
  const outcome = await authenticateMcpRequest(req)
  if (!outcome.ok) return unauthorized(outcome.message)
  return jsonRpcError(
    405,
    -32000,
    'Este servidor MCP es stateless: usa POST para todas las llamadas (no hay stream SSE ni sesiones).',
    { allow: 'POST' }
  )
}

export const GET = methodNotAllowed
export const DELETE = methodNotAllowed
