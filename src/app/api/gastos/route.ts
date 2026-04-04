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
  const year = searchParams.get('year') || now.getFullYear().toString()
  const month = searchParams.get('month') || (now.getMonth() + 1).toString().padStart(2, '0')
  const from = `${year}-${month}-01`
  const to = `${year}-${month}-31`

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
