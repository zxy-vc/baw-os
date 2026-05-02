// BaW OS — Owner Portal v2 · Building Detail (Sprint 4 / S4-2)

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { tryResolveOwnerContext, ownerBuildingIds } from '@/lib/owner-context'
import { createServiceClient } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export default async function OwnerBuildingDetail({
  params,
}: {
  params: { buildingId: string }
}) {
  const ctx = await tryResolveOwnerContext()
  if (!ctx) redirect('/login?next=/owner&role=owner')

  // Authorization: ¿este building está en los stakes del owner?
  const allowed = ownerBuildingIds(ctx).includes(params.buildingId)
  if (!allowed) redirect('/owner?error=forbidden')

  const service = createServiceClient()

  const [buildingR, unitsR] = await Promise.all([
    service
      .from('buildings')
      .select('id, name, address, city')
      .eq('id', params.buildingId)
      .maybeSingle(),
    service
      .from('units')
      .select('id, number, floor, type, status, monthly_rent')
      .eq('building_id', params.buildingId)
      .order('number', { ascending: true }),
  ])

  const building = buildingR.data
  const units = unitsR.data ?? []

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--baw-bg)' }}>
      <header
        className="border-b px-4 py-3 flex items-center gap-3"
        style={{ borderColor: 'var(--baw-border)' }}
      >
        <Link
          href="/owner"
          className="text-[12px]"
          style={{ color: 'var(--baw-muted)' }}
        >
          ← Volver
        </Link>
        <div
          className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded"
          style={{
            backgroundColor: 'rgba(168, 85, 247, 0.15)',
            color: '#D8B4FE',
            border: '1px solid rgba(168, 85, 247, 0.3)',
          }}
        >
          Edificio
        </div>
        <h1 className="text-[14px] font-medium" style={{ color: 'var(--baw-text)' }}>
          {building?.name ?? 'Edificio'}
        </h1>
      </header>

      <main className="p-6 max-w-5xl mx-auto space-y-4">
        {building && (
          <p className="text-[12px]" style={{ color: 'var(--baw-muted)' }}>
            {[building.address, building.city].filter(Boolean).join(', ') || '—'}
          </p>
        )}

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
                  Unidad
                </th>
                <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--baw-muted)' }}>
                  Piso
                </th>
                <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--baw-muted)' }}>
                  Tipo
                </th>
                <th className="px-4 py-2.5 font-medium" style={{ color: 'var(--baw-muted)' }}>
                  Estado
                </th>
                <th
                  className="px-4 py-2.5 font-medium tabular-nums text-right"
                  style={{ color: 'var(--baw-muted)' }}
                >
                  Renta
                </th>
              </tr>
            </thead>
            <tbody>
              {units.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center"
                    style={{ color: 'var(--baw-muted)' }}
                  >
                    Sin unidades registradas.
                  </td>
                </tr>
              ) : (
                units.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--baw-border)' }}>
                    <td className="px-4 py-3" style={{ color: 'var(--baw-text)' }}>
                      {u.number}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--baw-muted)' }}>
                      {u.floor ?? '—'}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--baw-muted)' }}>
                      {u.type ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <UnitStatusBadge status={u.status} />
                    </td>
                    <td
                      className="px-4 py-3 tabular-nums text-right"
                      style={{ color: 'var(--baw-text)' }}
                    >
                      {u.monthly_rent
                        ? `$${Number(u.monthly_rent).toLocaleString('es-MX')}`
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

function UnitStatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { bg: string; fg: string; border: string; label: string }> = {
    occupied: { bg: 'var(--baw-success-bg-2)', fg: 'var(--baw-success-fg)', border: 'var(--baw-success-border)', label: 'Ocupada' },
    available: { bg: 'rgba(59,130,246,0.15)', fg: '#93C5FD', border: 'rgba(59,130,246,0.3)', label: 'Disponible' },
    maintenance: { bg: 'var(--baw-warning-bg-2)', fg: 'var(--baw-warning-fg)', border: 'var(--baw-warning-border)', label: 'Mantenimiento' },
  }
  const s = map[status ?? ''] ?? {
    bg: 'rgba(148,163,184,0.15)',
    fg: '#94A3B8',
    border: 'rgba(148,163,184,0.3)',
    label: status ?? '—',
  }
  return (
    <span
      className="px-1.5 py-0.5 text-[10px] rounded uppercase tracking-wider"
      style={{ backgroundColor: s.bg, color: s.fg, border: `1px solid ${s.border}` }}
    >
      {s.label}
    </span>
  )
}
