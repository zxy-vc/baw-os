// BaW OS — /agents/[id]/policies
// Página de control de autonomía para un agente específico, por org.
// Server component: fetch policy efectiva. Cliente: editor con slider 0-4 +
// per-action overrides + rate caps.
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { resolveOrgId, OrgContextError } from '@/lib/org-context'
import { createSupabaseServer } from '@/lib/supabase-server'
import { DEFAULT_ACTION_CLASSIFICATION } from '@/lib/agents/v1/classifier'
import PoliciesEditorClient from './PoliciesEditorClient'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

export default async function AgentPoliciesPage({ params }: RouteParams) {
  const { id } = await params
  const supa = createSupabaseServer()
  const {
    data: { user },
  } = await supa.auth.getUser()
  if (!user) redirect(`/login?next=/agents/${id}/policies`)

  let orgId: string
  try {
    orgId = await resolveOrgId()
  } catch (e) {
    if (e instanceof OrgContextError) {
      redirect(`/login?next=/agents/${id}/policies`)
    }
    throw e
  }

  const service = createServiceClient()
  const { data: agent } = await service
    .from('agents')
    .select(
      'id, display_name, full_name, family, domain, description, status, capability_level, feedback_level, is_shared_zxy'
    )
    .eq('id', id)
    .maybeSingle()

  if (!agent) notFound()

  const { data: policy } = await service
    .from('agent_policies')
    .select('autonomy_level, active, per_action, rate_caps, updated_at, updated_by')
    .eq('org_id', orgId)
    .eq('agent_id', id)
    .maybeSingle()

  const effective = {
    autonomy_level: (policy?.autonomy_level as number | undefined) ?? 1,
    active: (policy?.active as boolean | undefined) ?? true,
    per_action:
      (policy?.per_action as Record<string, string> | null | undefined) ?? null,
    rate_caps:
      (policy?.rate_caps as Record<string, number> | null | undefined) ?? null,
    updated_at: (policy?.updated_at as string | undefined) ?? null,
    has_explicit_policy: !!policy,
  }

  // Lista de action types relevantes para este agente: por ahora pasamos todos
  // los del catálogo. UI puede filtrar por familia.
  const allActionTypes = Object.keys(DEFAULT_ACTION_CLASSIFICATION).sort()

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/agents"
          className="text-[11px] underline"
          style={{ color: 'var(--baw-muted)' }}
        >
          ← Agentes
        </Link>
        <h1
          className="text-[26px] mt-2 tracking-tight"
          style={{ color: 'var(--baw-text)', fontFamily: 'var(--font-display)' }}
        >
          {agent.full_name}
        </h1>
        <p
          className="text-[11px] uppercase tracking-wider mt-1"
          style={{ color: 'var(--baw-muted)' }}
        >
          Policies · {agent.family} · {agent.domain} · {agent.status}
        </p>
        {agent.description && (
          <p
            className="text-[12px] mt-2 max-w-2xl"
            style={{ color: 'var(--baw-muted)' }}
          >
            {agent.description}
          </p>
        )}
      </div>

      <PoliciesEditorClient
        agentId={agent.id as string}
        agentName={agent.full_name as string}
        initialPolicy={effective}
        actionTypes={allActionTypes}
        defaultClassifications={DEFAULT_ACTION_CLASSIFICATION}
      />

      <div
        className="text-[11px] rounded p-3"
        style={{
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
          color: 'var(--baw-muted)',
        }}
      >
        <p>
          <strong style={{ color: 'var(--baw-text)' }}>Cómo se resuelven:</strong>{' '}
          autonomy_level afecta el default global. per_action gana sobre autonomy
          (excepto irreversibles externos: payment.charge, cfdi.emit,
          contract.sign/terminate, policy.modify — siempre REQUIRE_APPROVAL).
        </p>
      </div>
    </div>
  )
}
