// BaW OS — Platform Admin · Tenants — Sprint 4 / S4-1.5

import { createServiceClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

type TenantRow = {
  id: string
  name: string
  slug: string
  created_at: string
  member_count: number
  building_count: number
  unit_count: number
}

async function getTenants(): Promise<TenantRow[]> {
  const service = createServiceClient()

  const { data: orgs } = await service
    .from('organizations')
    .select('id, name, slug, created_at')
    .order('created_at', { ascending: false })

  if (!orgs) return []

  // N+1 acceptable here — we expect <50 tenants for a long while
  const rows: TenantRow[] = await Promise.all(
    orgs.map(async (o) => {
      const [m, b, u] = await Promise.all([
        service
          .from('org_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('org_id', o.id),
        service
          .from('buildings')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', o.id),
        service
          .from('units')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', o.id),
      ])
      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        created_at: o.created_at,
        member_count: m.count ?? 0,
        building_count: b.count ?? 0,
        unit_count: u.count ?? 0,
      }
    }),
  )

  return rows
}

export default async function TenantsPage() {
  const tenants = await getTenants()

  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-[18px] font-semibold mb-1"
          style={{ color: 'var(--baw-text)' }}
        >
          Tenants ({tenants.length})
        </h2>
        <p className="text-[12px]" style={{ color: 'var(--baw-muted)' }}>
          Todas las PM Companies registradas en la plataforma.
        </p>
      </div>

      <div
        className="rounded-lg overflow-hidden"
        style={{
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
        }}
      >
        <table className="w-full text-[12px]">
          <thead>
            <tr
              className="text-left"
              style={{ borderBottom: '1px solid var(--baw-border)' }}
            >
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--baw-muted)' }}>
                Tenant
              </th>
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--baw-muted)' }}>
                Slug
              </th>
              <th
                className="px-4 py-2.5 font-medium tabular-nums text-right"
                style={{ color: 'var(--baw-muted)' }}
              >
                Miembros
              </th>
              <th
                className="px-4 py-2.5 font-medium tabular-nums text-right"
                style={{ color: 'var(--baw-muted)' }}
              >
                Edificios
              </th>
              <th
                className="px-4 py-2.5 font-medium tabular-nums text-right"
                style={{ color: 'var(--baw-muted)' }}
              >
                Unidades
              </th>
              <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--baw-muted)' }}>
                Creada
              </th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center"
                  style={{ color: 'var(--baw-muted)' }}
                >
                  Sin tenants aún.
                </td>
              </tr>
            ) : (
              tenants.map((t) => (
                <tr
                  key={t.id}
                  style={{ borderBottom: '1px solid var(--baw-border)' }}
                >
                  <td className="px-4 py-3" style={{ color: 'var(--baw-text)' }}>
                    {t.name}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--baw-muted)' }}>
                    {t.slug}
                  </td>
                  <td
                    className="px-4 py-3 tabular-nums text-right"
                    style={{ color: 'var(--baw-text)' }}
                  >
                    {t.member_count}
                  </td>
                  <td
                    className="px-4 py-3 tabular-nums text-right"
                    style={{ color: 'var(--baw-text)' }}
                  >
                    {t.building_count}
                  </td>
                  <td
                    className="px-4 py-3 tabular-nums text-right"
                    style={{ color: 'var(--baw-text)' }}
                  >
                    {t.unit_count}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--baw-muted)' }}>
                    {new Date(t.created_at).toLocaleDateString('es-MX')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
