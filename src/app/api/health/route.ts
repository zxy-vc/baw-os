// BaW OS — Health Check API (Tier 2 Agent Interface)
import { NextRequest } from 'next/server'
import { createServiceClient, validateApiKey, unauthorized, apiError, apiOk, getOrgId } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorized()

  const supabase = createServiceClient()
  const orgId = getOrgId()

  const [unitsRes, contractsRes] = await Promise.all([
    supabase.from('units').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
  ])

  if (unitsRes.error || contractsRes.error) {
    return apiError('Database connection failed', 500)
  }

  return apiOk({
    status: 'ok',
    org: orgId,
    units: unitsRes.count ?? 0,
    contracts: contractsRes.count ?? 0,
  })
}
