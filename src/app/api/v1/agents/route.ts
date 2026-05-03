// BaW OS v1 — GET /v1/agents
// Lista agentes del catálogo + policy efectiva por org del caller.
import { v1Read } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { createServiceClient } from '@/lib/supabase'

export const GET = v1Read({
  scopes: ['agents:read'],
  handler: async ({ auth }) => {
    const supabase = createServiceClient()

    const [catalogRes, policiesRes] = await Promise.all([
      supabase
        .from('agents')
        .select(
          'id, display_name, full_name, family, domain, description, capability_level, feedback_level, status, is_shared_zxy'
        )
        .order('id'),
      supabase
        .from('agent_policies')
        .select('agent_id, autonomy_level, active, per_action, rate_caps')
        .eq('org_id', auth.orgId),
    ])

    if (catalogRes.error) {
      return v1Error('query_error', catalogRes.error.message, 500)
    }

    const policyMap = new Map<string, {
      autonomy_level: number
      active: boolean
      per_action: Record<string, string> | null
      rate_caps: Record<string, number> | null
    }>(
      (policiesRes.data || []).map((p) => [
        p.agent_id as string,
        {
          autonomy_level: (p.autonomy_level as number) ?? 1,
          active: (p.active as boolean) !== false,
          per_action: (p.per_action as Record<string, string> | null) ?? null,
          rate_caps: (p.rate_caps as Record<string, number> | null) ?? null,
        },
      ])
    )

    const list = (catalogRes.data || []).map((a) => {
      const policy = policyMap.get(a.id as string)
      return {
        id: a.id,
        display_name: a.display_name,
        full_name: a.full_name,
        family: a.family,
        domain: a.domain,
        description: a.description,
        status: a.status,
        is_shared_zxy: a.is_shared_zxy,
        capability_level: a.capability_level,
        feedback_level: a.feedback_level,
        // policy efectiva para esta org (si no hay registro, default L1 active)
        autonomy_level: policy?.autonomy_level ?? 1,
        active: policy?.active ?? true,
        rate_caps: policy?.rate_caps ?? null,
      }
    })

    return v1Ok(list, { next_cursor: null, limit: list.length })
  },
})
