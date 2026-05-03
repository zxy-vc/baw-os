// BaW OS v1 — GET + POST /v1/tasks
import { v1Read, v1Write } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { parsePagination, makeCursor } from '@/lib/agents/v1/pagination'
import { createServiceClient } from '@/lib/supabase'

export const GET = v1Read({
  scopes: ['tasks:read'],
  handler: async ({ auth, req }) => {
    const { limit, afterTs } = parsePagination(req)
    const status = req.nextUrl.searchParams.get('status')
    const priority = req.nextUrl.searchParams.get('priority')
    const assignedTo = req.nextUrl.searchParams.get('assigned_to')
    const supabase = createServiceClient()

    let q = supabase
      .from('tasks')
      .select(
        'id, org_id, title, description, assigned_to, created_by, entity_type, entity_id, due_date, status, priority, created_at'
      )
      .eq('org_id', auth.orgId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    if (status) q = q.eq('status', status)
    if (priority) q = q.eq('priority', priority)
    if (assignedTo) q = q.eq('assigned_to', assignedTo)
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

interface TaskCreateBody {
  title: string
  description?: string
  assigned_to?: string
  entity_type?: string
  entity_id?: string
  due_date?: string
  priority?: 'urgent' | 'normal' | 'low'
}

export const POST = v1Write<TaskCreateBody>({
  scopes: ['tasks:write'],
  actionType: 'task.create',
  endpoint: '/v1/tasks',
  validate: (raw) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('body must be object')
    const b = raw as Record<string, unknown>
    if (typeof b.title !== 'string' || b.title.trim().length === 0) {
      throw new Error('title is required')
    }
    return {
      title: b.title.trim(),
      description: typeof b.description === 'string' ? b.description : undefined,
      assigned_to: typeof b.assigned_to === 'string' ? b.assigned_to : undefined,
      entity_type: typeof b.entity_type === 'string' ? b.entity_type : undefined,
      entity_id: typeof b.entity_id === 'string' ? b.entity_id : undefined,
      due_date: typeof b.due_date === 'string' ? b.due_date : undefined,
      priority:
        typeof b.priority === 'string' ? (b.priority as TaskCreateBody['priority']) : 'normal',
    }
  },
  handler: async ({ auth, body, recordAction }) => {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        org_id: auth.orgId,
        title: body.title,
        description: body.description ?? null,
        assigned_to: body.assigned_to ?? null,
        created_by: `agent:${auth.agentId}`,
        entity_type: body.entity_type ?? null,
        entity_id: body.entity_id ?? null,
        due_date: body.due_date ?? null,
        priority: body.priority ?? 'normal',
        status: 'pending',
      })
      .select('id, org_id, title, status, priority, due_date, assigned_to, created_at')
      .single()

    if (error || !data) {
      return v1Error('insert_error', error?.message || 'failed to create task', 500)
    }

    await recordAction({
      actionType: 'task.create',
      entityType: 'task',
      entityId: data.id as string,
      payload: body as unknown as Record<string, unknown>,
      result: { id: data.id },
      status: 'ok',
    })

    return v1Ok(data)
  },
})
