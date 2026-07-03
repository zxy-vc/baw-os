// BaW OS — GET /api/engagements/[id]/estado-cuenta?periodo=YYYY-MM
// Estado de cuenta CONSOLIDADO del pool: movimientos de todos los contratos
// miembros mezclados por fecha (unidad como prefijo) + saldo individual por
// contrato. Devuelve JSON; el PDF consolidado es follow-up.
import { NextRequest } from 'next/server'
import { createServiceClient, apiError, apiOk } from '@/lib/api-auth'
import { requireMemberCaller } from '@/lib/admin-auth'
import { getEstadoCuentaCombinadoData } from '@/lib/engagement'

export const dynamic = 'force-dynamic'

function currentPeriodo(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireMemberCaller()
  if (!auth.ok) return apiError(auth.message, auth.status)

  const periodo = request.nextUrl.searchParams.get('periodo') || currentPeriodo()
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return apiError('periodo inválido (use YYYY-MM)', 400)
  }

  const supabase = createServiceClient()
  const doc = await getEstadoCuentaCombinadoData(supabase, auth.orgId, params.id, periodo)
  if (!doc) return apiError('Engagement no encontrado o sin contratos', 404)

  return apiOk(doc)
}
