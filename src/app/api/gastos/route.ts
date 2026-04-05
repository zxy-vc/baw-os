import { NextRequest } from 'next/server'
import {
  validateApiKey,
  createServiceClient,
  unauthorized,
  apiError,
  apiOk,
  getOrgId,
} from '@/lib/api-auth'
import { logEvent } from '@/lib/webhooks'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()
  const supabase = createServiceClient()
  const orgId = getOrgId()
  const { searchParams } = new URL(request.url)

  const now = new Date()
  const year = parseInt(searchParams.get('year') || now.getFullYear().toString(), 10)
  const month = parseInt(searchParams.get('month') || (now.getMonth() + 1).toString(), 10)

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return apiError('Invalid year or month parameter')
  }

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  // Day 0 of next month = last day of current month
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('org_id', orgId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false })

  if (error) return apiError(error.message, 500)
  return apiOk(data)
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()
  const supabase = createServiceClient()
  const orgId = getOrgId()
  const body = await request.json()

  const { data, error } = await supabase
    .from('expenses')
    .insert({ ...body, org_id: orgId })
    .select()
    .single()

  if (error) return apiError(error.message, 500)
  return apiOk(data)
}

export async function DELETE(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()
  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)

  const id = searchParams.get('id')
  if (!id) return apiError('id query param is required')

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id)

  if (error) return apiError(error.message, 500)

  await logEvent('expense.deleted', { expense_id: id })

  return apiOk({ deleted: id })
}
