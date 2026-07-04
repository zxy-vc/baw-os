// BaW OS — Cobros pendientes del mes para el portal de conserje (ADR-022 D5)
// GET con header x-conserje-token. Antes el tab leía `payments` directo del
// browser con la anon key; ahora la lectura es server-side y org-scoped por
// el token firmado.
import { NextRequest } from 'next/server'
import { createServiceClient, apiError, apiOk, unauthorized } from '@/lib/api-auth'
import { verifyConserjeToken } from '@/lib/conserje-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const orgId = verifyConserjeToken(request.headers.get('x-conserje-token'))
  if (!orgId) return unauthorized('Sesión de conserje inválida o expirada')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0]

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, amount, status, due_date, contract:contracts(id, unit_id, unit:units(id, number, floor, type, status), occupant:occupants(id, name, phone))',
    )
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .gte('due_date', monthStart)
    .lte('due_date', monthEnd)
    .order('due_date')

  if (error) return apiError(error.message, 500)
  return apiOk(data ?? [])
}
