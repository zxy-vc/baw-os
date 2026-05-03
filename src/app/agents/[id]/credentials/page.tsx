// BaW OS — /agents/[id]/credentials · Gestión de API keys por agente
// Owners/admins del tenant generan, listan y revocan credenciales aquí.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { resolveOrgId, OrgContextError } from '@/lib/org-context'
import { createSupabaseServer } from '@/lib/supabase-server'
import CredentialsManager from './CredentialsManager'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

interface AgentRow {
  id: string
  display_name: string
  full_name: string
  family: string
  domain: string
  description: string | null
  is_shared_zxy: boolean
}

interface CredentialRow {
  id: string
  agent_id: string
  agent_name: string
  label: string
  api_key_prefix: string
  scopes: string[]
  status: string
  rate_limit_tier: string
  expires_at: string | null
  last_used_at: string | null
  created_at: string
  revoked_at: string | null
}

async function requireAdminOfActiveOrg(): Promise<{
  ok: true
  orgId: string
  isPlatformAdmin: boolean
} | null> {
  const supabase = createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const service = createServiceClient()

  const { data: pa } = await service
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const isPlatformAdmin = !!pa

  let orgId: string
  try {
    orgId = await resolveOrgId()
  } catch (e) {
    if (e instanceof OrgContextError) return null
    throw e
  }

  if (!isPlatformAdmin) {
    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!membership || !['owner', 'admin'].includes(membership.role as string)) {
      return null
    }
  }

  return { ok: true, orgId, isPlatformAdmin }
}

async function loadAgent(id: string): Promise<AgentRow | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('agents')
    .select('id, display_name, full_name, family, domain, description, is_shared_zxy')
    .eq('id', id)
    .maybeSingle()
  return (data as AgentRow) || null
}

async function loadCredentials(agentId: string, orgId: string): Promise<CredentialRow[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('v_agent_credentials_audit')
    .select('*')
    .eq('agent_id', agentId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  return (data as CredentialRow[]) || []
}

export default async function AgentCredentialsPage({ params }: PageProps) {
  const resolvedParams = await params
  const agentId = resolvedParams.id

  const ctx = await requireAdminOfActiveOrg()
  if (!ctx) {
    redirect(`/login?next=/agents/${agentId}/credentials`)
  }

  const agent = await loadAgent(agentId)
  if (!agent) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <p className="text-sm text-neutral-500">
          Agente no encontrado.{' '}
          <Link href="/agents" className="underline">
            Volver al catálogo
          </Link>
        </p>
      </div>
    )
  }

  const credentials = await loadCredentials(agentId, ctx.orgId)

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-6 text-sm">
        <Link href="/agents" className="text-neutral-500 hover:text-neutral-900">
          ← Agentes
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-semibold">{agent.full_name} · Credenciales</h1>
        <p className="mt-2 text-sm text-neutral-600">{agent.description}</p>
        <div className="mt-2 flex gap-2 text-xs">
          <span className="rounded bg-neutral-100 px-2 py-0.5">
            family: {agent.family}
          </span>
          <span className="rounded bg-neutral-100 px-2 py-0.5">domain: {agent.domain}</span>
          {agent.is_shared_zxy && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">ZXY shared</span>
          )}
        </div>
      </header>

      <CredentialsManager
        agentId={agentId}
        agentName={agent.full_name}
        initialCredentials={credentials}
      />
    </div>
  )
}
