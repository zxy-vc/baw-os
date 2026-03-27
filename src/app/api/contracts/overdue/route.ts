// BaW OS — Overdue Contracts API (Tier 2 Agent Interface)
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()

  // Get all active contracts
  const { data: contracts, error: cErr } = await supabase
    .from('contracts')
    .select('*, unit:units(*), occupant:occupants(*)')
    .eq('org_id', orgId)
    .eq('status', 'active')

  if (cErr) return apiError(cErr.message, 500)

  const now = new Date()
  const currentDay = now.getDate()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

  // Get payments for current month
  const { data: payments, error: pErr } = await supabase
    .from('payments')
    .select('contract_id, status')
    .eq('org_id', orgId)
    .gte('due_date', monthStart)
    .lte('due_date', monthEnd)
    .in('status', ['paid', 'partial'])

  if (pErr) return apiError(pErr.message, 500)

  const paidContractIds = new Set(
    (payments || []).map((p: { contract_id: string }) => p.contract_id)
  )

  // Overdue = payment_day already passed this month AND no payment recorded
  const overdue = (contracts || []).filter(
    (c: { payment_day: number; id: string }) =>
      c.payment_day <= currentDay && !paidContractIds.has(c.id)
  )

  return apiOk(overdue)
}
