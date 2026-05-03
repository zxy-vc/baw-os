// BaW OS v1 — GET /v1/approvals/:id
// Detalle de una approval (incluye payload completo).
import { NextRequest } from 'next/server'
import { v1Read } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { createServiceClient } from '@/lib/supabase'

function extractId(req: NextRequest): string | null {
  const m = req.nextUrl.pathname.match(/\/v1\/approvals\/([^/]+)/)
  if (!m) return null
  if (m[1] === 'grant' || m[1] === 'deny') return null
  return m[1]
}

export const GET = v1Read({
  scopes: ['approvals:read'],
  handler: async ({ auth, req }) => {
    const id = extractId(req)
    if (!id) return v1Error('invalid_path', 'approval id missing', 400)

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('agent_approvals')
      .select('*')
      .eq('org_id', auth.orgId)
      .eq('id', id)
      .maybeSingle()

    if (error) return v1Error('query_error', error.message, 500)
    if (!data) return v1Error('not_found', `approval ${id} not found`, 404)

    return v1Ok(data)
  },
})
