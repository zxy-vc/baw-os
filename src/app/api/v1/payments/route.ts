// BaW OS v1 — GET + POST /v1/payments
import { v1Read, v1Write } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { parsePagination, makeCursor } from '@/lib/agents/v1/pagination'
import { createServiceClient } from '@/lib/supabase'

export const GET = v1Read({
  scopes: ['payments:read'],
  handler: async ({ auth, req }) => {
    const { limit, afterTs } = parsePagination(req)
    const status = req.nextUrl.searchParams.get('status')
    const contractId = req.nextUrl.searchParams.get('contract_id')
    const dueFrom = req.nextUrl.searchParams.get('due_from')
    const dueTo = req.nextUrl.searchParams.get('due_to')
    const supabase = createServiceClient()

    let q = supabase
      .from('payments')
      .select(
        'id, org_id, contract_id, amount, amount_paid, due_date, paid_date, status, method, reference, notes, created_at'
      )
      .eq('org_id', auth.orgId)
      .order('due_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    if (status) q = q.eq('status', status)
    if (contractId) q = q.eq('contract_id', contractId)
    if (dueFrom) q = q.gte('due_date', dueFrom)
    if (dueTo) q = q.lte('due_date', dueTo)
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

interface PaymentRecordBody {
  contract_id: string
  amount: number
  method?: string
  reference?: string
  paid_date?: string
  due_date?: string
  notes?: string
}

// POST /v1/payments — registrar un pago YA recibido (efectivo/transferencia).
// NO cobra una tarjeta; es contabilidad. action_type 'payment.record'.
export const POST = v1Write<PaymentRecordBody>({
  scopes: ['payments:write'],
  actionType: 'payment.record',
  endpoint: '/v1/payments',
  validate: (raw) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('body must be object')
    const b = raw as Record<string, unknown>
    if (typeof b.contract_id !== 'string' || b.contract_id.length === 0) {
      throw new Error('contract_id is required')
    }
    if (typeof b.amount !== 'number' || b.amount <= 0) {
      throw new Error('amount must be a positive number')
    }
    return {
      contract_id: b.contract_id,
      amount: b.amount,
      method: typeof b.method === 'string' ? b.method : undefined,
      reference: typeof b.reference === 'string' ? b.reference : undefined,
      paid_date: typeof b.paid_date === 'string' ? b.paid_date : undefined,
      due_date: typeof b.due_date === 'string' ? b.due_date : undefined,
      notes: typeof b.notes === 'string' ? b.notes : undefined,
    }
  },
  handler: async ({ auth, body, recordAction }) => {
    const supabase = createServiceClient()
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('payments')
      .insert({
        org_id: auth.orgId,
        contract_id: body.contract_id,
        amount: body.amount,
        amount_paid: body.amount,
        due_date: body.due_date ?? today,
        paid_date: body.paid_date ?? today,
        status: 'paid',
        method: body.method ?? 'transfer',
        reference: body.reference ?? null,
        notes: body.notes ?? `Registrado vía agente ${auth.agentId}`,
      })
      .select('id, org_id, contract_id, amount, amount_paid, due_date, paid_date, status, method, reference, notes, created_at')
      .single()

    if (error || !data) {
      return v1Error('insert_error', error?.message || 'failed to record payment', 500)
    }

    await recordAction({
      actionType: 'payment.record',
      entityType: 'payment',
      entityId: data.id as string,
      payload: body as unknown as Record<string, unknown>,
      result: { id: data.id },
      status: 'ok',
    })

    return v1Ok(data)
  },
})
