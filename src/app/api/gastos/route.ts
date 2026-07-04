import { NextRequest } from 'next/server'
import {
  validateApiKey,
  createServiceClient,
  unauthorized,
  apiError,
  apiOk,
  getOrgId,
  getOrgIdAsync,
} from '@/lib/api-auth'
import { requireMemberCaller } from '@/lib/admin-auth'
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

  // D7 (ADR-022): la columna real es expense_date (20260401_expenses.sql);
  // este endpoint filtraba por una columna 'date' inexistente.
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('org_id', orgId)
    .gte('expense_date', from)
    .lte('expense_date', to)
    .order('expense_date', { ascending: false })

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
  // Doble plano de auth (mismo patrón que PR #134): API key (agentes/legacy)
  // o sesión de un miembro de la org (la página /gastos llama sin API key —
  // antes este DELETE siempre devolvía 401 desde la UI). En ambos casos el
  // delete queda acotado a la org del caller (antes borraba cross-org por id).
  let orgId: string
  if (validateApiKey(request)) {
    orgId = await getOrgIdAsync()
  } else {
    const caller = await requireMemberCaller()
    if (!caller.ok) return unauthorized(caller.message)
    orgId = caller.orgId
  }

  const supabase = createServiceClient()
  const { searchParams } = new URL(request.url)

  const id = searchParams.get('id')
  if (!id) return apiError('id query param is required')

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) return apiError(error.message, 500)

  await logEvent('expense.deleted', { expense_id: id })

  return apiOk({ deleted: id })
}
