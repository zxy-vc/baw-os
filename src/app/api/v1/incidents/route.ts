// BaW OS v1 — GET + POST /v1/incidents
import { v1Read, v1Write } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { parsePagination, makeCursor } from '@/lib/agents/v1/pagination'
import { createServiceClient } from '@/lib/supabase'

export const GET = v1Read({
  scopes: ['incidents:read'],
  handler: async ({ auth, req }) => {
    const { limit, afterTs } = parsePagination(req)
    const status = req.nextUrl.searchParams.get('status')
    const priority = req.nextUrl.searchParams.get('priority')
    const unitId = req.nextUrl.searchParams.get('unit_id')
    const supabase = createServiceClient()

    let q = supabase
      .from('incidents')
      .select(
        'id, org_id, unit_id, reported_by, title, description, status, priority, assigned_to, assigned_phone, estimated_cost, actual_cost, created_at, updated_at'
      )
      .eq('org_id', auth.orgId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    if (status) q = q.eq('status', status)
    if (priority) q = q.eq('priority', priority)
    if (unitId) q = q.eq('unit_id', unitId)
    if (afterTs) q = q.lt('created_at', afterTs)

    const { data, error } = await q
    if (error) return v1Error('query_error', error.message, 500)

    const rows = data || []
    const hasMore = rows.length > limit
    const trimmed = hasMore ? rows.slice(0, limit) : rows
    const last = trimmed[trimmed.length - 1]
    const next_cursor = hasMore && last ? makeCursor(last) : null

    return v1Ok(trimmed, { next_cursor, limit })
  },
})

interface IncidentCreateBody {
  unit_id?: string
  title: string
  description?: string
  priority?: 'urgent' | 'high' | 'normal' | 'low'
  estimated_cost?: number
  reported_by?: string
}

export const POST = v1Write<IncidentCreateBody>({
  scopes: ['incidents:write'],
  actionType: 'incident.create',
  endpoint: '/v1/incidents',
  validate: (raw) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('body must be object')
    const b = raw as Record<string, unknown>
    if (typeof b.title !== 'string' || b.title.trim().length === 0) {
      throw new Error('title is required')
    }
    return {
      unit_id: typeof b.unit_id === 'string' ? b.unit_id : undefined,
      title: b.title.trim(),
      description: typeof b.description === 'string' ? b.description : undefined,
      priority: typeof b.priority === 'string' ? (b.priority as IncidentCreateBody['priority']) : 'normal',
      estimated_cost: typeof b.estimated_cost === 'number' ? b.estimated_cost : undefined,
      reported_by: typeof b.reported_by === 'string' ? b.reported_by : undefined,
    }
  },
  handler: async ({ auth, body, recordAction }) => {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('incidents')
      .insert({
        org_id: auth.orgId,
        unit_id: body.unit_id ?? null,
        title: body.title,
        description: body.description ?? null,
        priority: body.priority ?? 'normal',
        estimated_cost: body.estimated_cost ?? null,
        // reported_by es uuid FK a occupants(id). Para incidencias creadas por un
        // agente no hay occupant reportante → null. La autoría del agente queda
        // registrada vía recordAction() en agent_actions/audit (no en esta columna).
        reported_by: body.reported_by ?? null,
        status: 'open',
      })
      .select('id, org_id, unit_id, title, description, status, priority, created_at')
      .single()

    if (error || !data) {
      return v1Error('insert_error', error?.message || 'failed to create incident', 500)
    }

    await recordAction({
      actionType: 'incident.create',
      entityType: 'incident',
      entityId: data.id as string,
      payload: body as unknown as Record<string, unknown>,
      result: { id: data.id },
      status: 'ok',
    })

    return v1Ok(data)
  },
})
