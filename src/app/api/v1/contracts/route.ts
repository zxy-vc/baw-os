// BaW OS v1 — GET + POST /v1/contracts
import { v1Read, v1Write } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { parsePagination, makeCursor } from '@/lib/agents/v1/pagination'
import { createServiceClient } from '@/lib/supabase'

export const GET = v1Read({
  scopes: ['contracts:read'],
  handler: async ({ auth, req }) => {
    const { limit, afterTs } = parsePagination(req)
    const status = req.nextUrl.searchParams.get('status')
    const unitId = req.nextUrl.searchParams.get('unit_id')
    const occupantId = req.nextUrl.searchParams.get('occupant_id')
    const supabase = createServiceClient()

    let q = supabase
      .from('contracts')
      .select(
        'id, org_id, unit_id, occupant_id, start_date, end_date, monthly_amount, deposit_amount, deposit_paid, payment_day, status, contract_url, created_at, updated_at'
      )
      .eq('org_id', auth.orgId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    if (status) q = q.eq('status', status)
    if (unitId) q = q.eq('unit_id', unitId)
    if (occupantId) q = q.eq('occupant_id', occupantId)
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

interface ContractCreateBody {
  unit_id: string
  occupant_id: string
  start_date: string
  end_date: string
  monthly_amount: number
  deposit_amount?: number
  payment_day?: number
  status?: string
}

// POST /v1/contracts — crear el REGISTRO de un contrato en la DB. NO es la
// firma legal (contract.sign / e-firma es Fase 6). action_type 'contract.create'.
export const POST = v1Write<ContractCreateBody>({
  scopes: ['contracts:write'],
  actionType: 'contract.create',
  endpoint: '/v1/contracts',
  validate: (raw) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('body must be object')
    const b = raw as Record<string, unknown>
    for (const f of ['unit_id', 'occupant_id', 'start_date', 'end_date'] as const) {
      if (typeof b[f] !== 'string' || (b[f] as string).length === 0) {
        throw new Error(`${f} is required`)
      }
    }
    if (typeof b.monthly_amount !== 'number' || b.monthly_amount <= 0) {
      throw new Error('monthly_amount must be a positive number')
    }
    return {
      unit_id: b.unit_id as string,
      occupant_id: b.occupant_id as string,
      start_date: b.start_date as string,
      end_date: b.end_date as string,
      monthly_amount: b.monthly_amount,
      deposit_amount: typeof b.deposit_amount === 'number' ? b.deposit_amount : undefined,
      payment_day: typeof b.payment_day === 'number' ? b.payment_day : undefined,
      status: typeof b.status === 'string' ? b.status : undefined,
    }
  },
  handler: async ({ auth, body, recordAction }) => {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        org_id: auth.orgId,
        unit_id: body.unit_id,
        occupant_id: body.occupant_id,
        start_date: body.start_date,
        end_date: body.end_date,
        monthly_amount: body.monthly_amount,
        deposit_amount: body.deposit_amount ?? null,
        payment_day: body.payment_day ?? 5,
        status: body.status ?? 'active',
      })
      .select('id, org_id, unit_id, occupant_id, start_date, end_date, monthly_amount, deposit_amount, payment_day, status, created_at')
      .single()

    if (error || !data) {
      return v1Error('insert_error', error?.message || 'failed to create contract', 500)
    }

    await recordAction({
      actionType: 'contract.create',
      entityType: 'contract',
      entityId: data.id as string,
      payload: body as unknown as Record<string, unknown>,
      result: { id: data.id },
      status: 'ok',
    })

    return v1Ok(data)
  },
})
