// BaW OS — Contracts API (Tier 2 Agent Interface)
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('contracts')
    .select('*, unit:units(*), occupant:occupants(*)')
    .eq('org_id', orgId)

  if (status === 'active') {
    query = query.eq('status', 'active')
  } else if (status === 'overdue') {
    // Filter active contracts; overdue logic applied below
    query = query.eq('status', 'active')
  } else if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return apiError(error.message, 500)

  if (status === 'overdue') {
    const now = new Date()
    const currentDay = now.getDate()
    const overdue = (data || []).filter((c: { payment_day: number }) => c.payment_day < currentDay)
    return apiOk(overdue)
  }

  return apiOk(data)
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const { data, error } = await supabase
    .from('contracts')
    .insert({ ...body, org_id: orgId })
    .select('*, unit:units(*), occupant:occupants(*)')
    .single()

  if (error) return apiError(error.message, 500)
  return apiOk(data)
}
