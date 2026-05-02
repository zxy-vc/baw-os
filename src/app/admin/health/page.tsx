// BaW OS — Platform Admin · Health — Sprint 4 / S4-1.5

import { createServiceClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

type Check = {
  name: string
  status: 'ok' | 'warn' | 'error'
  detail: string
}

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = []
  const service = createServiceClient()

  // 1. Tenants without owner
  const { data: orgs } = await service.from('organizations').select('id, name, slug')
  if (orgs) {
    for (const o of orgs) {
      const { data: owners } = await service
        .from('org_members')
        .select('user_id')
        .eq('org_id', o.id)
        .eq('role', 'pm_owner')
      if (!owners || owners.length === 0) {
        checks.push({
          name: `Tenant sin owner: ${o.name}`,
          status: 'error',
          detail: `Org ${o.slug} no tiene ningún pm_owner asignado.`,
        })
      }
    }
    if (orgs.length > 0 && checks.length === 0) {
      checks.push({
        name: 'Tenants con owner',
        status: 'ok',
        detail: `Todos los ${orgs.length} tenants tienen pm_owner.`,
      })
    }
  }

  // 2. Buildings without org_id
  const { count: orphanBuildings } = await service
    .from('buildings')
    .select('id', { count: 'exact', head: true })
    .is('org_id', null)
  checks.push({
    name: 'Edificios huérfanos',
    status: (orphanBuildings ?? 0) === 0 ? 'ok' : 'error',
    detail: `${orphanBuildings ?? 0} edificios sin org_id`,
  })

  // 3. Units without org_id
  const { count: orphanUnits } = await service
    .from('units')
    .select('id', { count: 'exact', head: true })
    .is('org_id', null)
  checks.push({
    name: 'Unidades huérfanas',
    status: (orphanUnits ?? 0) === 0 ? 'ok' : 'error',
    detail: `${orphanUnits ?? 0} unidades sin org_id`,
  })

  // 4. Platform admins
  const { count: adminCount } = await service
    .from('platform_admins')
    .select('id', { count: 'exact', head: true })
  checks.push({
    name: 'Platform admins',
    status: (adminCount ?? 0) >= 1 ? 'ok' : 'error',
    detail: `${adminCount ?? 0} L0 admins configurados`,
  })

  return checks
}

const statusStyles: Record<Check['status'], { bg: string; fg: string; border: string; label: string }> = {
  ok: {
    bg: 'var(--baw-success-bg)',
    fg: 'var(--baw-success-fg)',
    border: 'var(--baw-success-border)',
    label: 'OK',
  },
  warn: {
    bg: 'var(--baw-warning-bg)',
    fg: 'var(--baw-warning-fg)',
    border: 'var(--baw-warning-border)',
    label: 'WARN',
  },
  error: {
    bg: 'var(--baw-danger-bg)',
    fg: 'var(--baw-danger-fg)',
    border: 'var(--baw-danger-border)',
    label: 'ERROR',
  },
}

export default async function HealthPage() {
  const checks = await runChecks()

  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-[18px] font-semibold mb-1"
          style={{ color: 'var(--baw-text)' }}
        >
          Salud de la plataforma
        </h2>
        <p className="text-[12px]" style={{ color: 'var(--baw-muted)' }}>
          Verificaciones automáticas de integridad multi-tenant.
        </p>
      </div>

      <div className="space-y-2">
        {checks.map((c, i) => {
          const s = statusStyles[c.status]
          return (
            <div
              key={i}
              className="rounded-lg p-3 flex items-center gap-3"
              style={{
                backgroundColor: 'var(--baw-surface)',
                border: '1px solid var(--baw-border)',
              }}
            >
              <span
                className="px-1.5 py-0.5 text-[10px] rounded uppercase tracking-wider"
                style={{
                  backgroundColor: s.bg,
                  color: s.fg,
                  border: `1px solid ${s.border}`,
                }}
              >
                {s.label}
              </span>
              <div className="flex-1">
                <div
                  className="text-[12px] font-medium"
                  style={{ color: 'var(--baw-text)' }}
                >
                  {c.name}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--baw-muted)' }}>
                  {c.detail}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
