// BaW OS — Platform Admin Dashboard — Sprint 4 / S4-1.5

import { createServiceClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

async function getStats() {
  const service = createServiceClient()

  const [orgsR, membersR, buildingsR, unitsR, adminsR] = await Promise.all([
    service.from('organizations').select('id', { count: 'exact', head: true }),
    service.from('org_members').select('user_id', { count: 'exact', head: true }),
    service.from('buildings').select('id', { count: 'exact', head: true }),
    service.from('units').select('id', { count: 'exact', head: true }),
    service.from('platform_admins').select('id', { count: 'exact', head: true }),
  ])

  return {
    orgs: orgsR.count ?? 0,
    members: membersR.count ?? 0,
    buildings: buildingsR.count ?? 0,
    units: unitsR.count ?? 0,
    admins: adminsR.count ?? 0,
  }
}

export default async function AdminDashboard() {
  const stats = await getStats()

  const cards = [
    { label: 'Tenants (orgs)', value: stats.orgs, hint: 'PM Companies activas' },
    { label: 'Miembros', value: stats.members, hint: 'Usuarios con rol PM' },
    { label: 'Edificios', value: stats.buildings, hint: 'Activos bajo gestión' },
    { label: 'Unidades', value: stats.units, hint: 'En el sistema' },
    { label: 'Platform Admins', value: stats.admins, hint: 'L0 con acceso /admin' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-[18px] font-semibold mb-1"
          style={{ color: 'var(--baw-text)' }}
        >
          Estado de la plataforma
        </h2>
        <p className="text-[12px]" style={{ color: 'var(--baw-muted)' }}>
          Vista global de todos los tenants. Solo visible para L0.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg p-4"
            style={{
              backgroundColor: 'var(--baw-surface)',
              border: '1px solid var(--baw-border)',
            }}
          >
            <div
              className="text-[10px] uppercase tracking-wider mb-1"
              style={{ color: 'var(--baw-muted)' }}
            >
              {c.label}
            </div>
            <div
              className="text-[28px] font-semibold tabular-nums"
              style={{ color: 'var(--baw-text)' }}
            >
              {c.value}
            </div>
            <div
              className="text-[11px] mt-1"
              style={{ color: 'var(--baw-muted)' }}
            >
              {c.hint}
            </div>
          </div>
        ))}
      </div>

      <div
        className="rounded-lg p-4"
        style={{
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
        }}
      >
        <h3 className="text-[14px] font-medium mb-2" style={{ color: 'var(--baw-text)' }}>
          Capas de administración
        </h3>
        <ul className="space-y-2 text-[12px]" style={{ color: 'var(--baw-muted)' }}>
          <li>
            <strong style={{ color: 'var(--baw-text)' }}>L0 Platform</strong> · /admin
            · solo ZXY (fran@zxy.vc)
          </li>
          <li>
            <strong style={{ color: 'var(--baw-text)' }}>L1 Tenant</strong> ·
            /settings/account · pm_owner | pm_admin por org
          </li>
          <li>
            <strong style={{ color: 'var(--baw-text)' }}>L2 User</strong> · /me ·
            preferencias del usuario actual
          </li>
        </ul>
      </div>
    </div>
  )
}
