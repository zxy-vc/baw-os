// BaW OS — Admin: rastro de lecturas de una llave del conector v1 (ENG-624)
// GET /api/admin/connectors/keys/[id]/access-log?limit=100 — quién, cuándo, qué.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdminCaller } from '@/lib/admin-auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminCaller()
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status })

  const limitRaw = Number(req.nextUrl.searchParams.get('limit') ?? 100)
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100

  const { data, error } = await createServiceClient()
    .from('connector_access_log')
    .select('id, key_id, consumer, consumer_ref, dataset, endpoint, query, outcome, http_status, row_count, ip, user_agent, created_at')
    .eq('org_id', auth.orgId)
    .eq('key_id', params.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}
