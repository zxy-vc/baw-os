// BaW OS — Owner Portal v2 Dashboard (Sprint 4 / S4-2)
//
// Punto de entrada del owner logueado. Muestra resumen agregado de todos los
// edificios donde tiene ownership_stake activo, multi-tenant.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { tryResolveOwnerContext, ownerBuildingIds } from '@/lib/owner-context'
import { createServiceClient } from '@/lib/api-auth'
import { Building2, Home, AlertCircle, Wallet, LogOut } from 'lucide-react'
import OwnerSignOutButton from './OwnerSignOutButton'

export const dynamic = 'force-dynamic'

async function getOwnerData() {
  const ctx = await tryResolveOwnerContext()
  if (!ctx) return null

  const service = createServiceClient()
  const buildingIds = ownerBuildingIds(ctx)

  if (buildingIds.length === 0) {
    return { ctx, units: [], openIncidents: 0, monthRevenue: 0 }
  }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10)

  const [unitsR, incidentsR, paymentsR] = await Promise.all([
    service
      .from('units')
      .select('id, number, status, building_id')
      .in('building_id', buildingIds),
    service
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress', 'waiting_parts'])
      .in(
        'unit_id',
        // subquery would be cleaner but anonymous select is unwieldy; use service
        [],
      ),
    service
      .from('payments')
      .select('amount_paid')
      .gte('paid_date', monthStart)
      .lte('paid_date', monthEnd)
      .eq('status', 'paid'),
  ])

  const units = unitsR.data ?? []

  // Re-query incidents now that we know the unit ids
  const unitIds = units.map((u) => u.id)
  let openIncidents = 0
  if (unitIds.length > 0) {
    const { count } = await service
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .in('unit_id', unitIds)
      .in('status', ['open', 'in_progress', 'waiting_parts'])
    openIncidents = count ?? 0
  }

  const monthRevenue = (paymentsR.data ?? []).reduce(
    (sum, p) => sum + Number(p.amount_paid ?? 0),
    0,
  )

  return { ctx, units, openIncidents, monthRevenue }
}

export default async function OwnerDashboard() {
  const data = await getOwnerData()

  if (!data) {
    redirect('/login?next=/owner&role=owner')
  }

  const { ctx, units, openIncidents, monthRevenue } = data

  const totalBuildings = new Set(
    ctx.properties.flatMap((p) => p.buildings.map((b) => b.building_id)),
  ).size

  const occupied = units.filter((u) => u.status === 'occupied').length
  const occupancy =
    units.length > 0 ? Math.round((occupied / units.length) * 100) : 0

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--baw-bg)' }}
    >
      {/* Header */}
      <header
        className="border-b px-4 py-3 flex items-center justify-between"
        style={{ borderColor: 'var(--baw-border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded"
            style={{
              backgroundColor: 'rgba(168, 85, 247, 0.15)',
              color: '#D8B4FE',
              border: '1px solid rgba(168, 85, 247, 0.3)',
            }}
          >
            Portal Propietario
          </div>
          <h1 className="text-[14px] font-medium" style={{ color: 'var(--baw-text)' }}>
            {ctx.email}
          </h1>
        </div>
        <OwnerSignOutButton />
      </header>

      <main className="p-6 max-w-5xl mx-auto space-y-6">
        {/* KPIs */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            icon={<Building2 size={16} />}
            label="Edificios"
            value={totalBuildings}
          />
          <Kpi icon={<Home size={16} />} label="Unidades" value={units.length} />
          <Kpi
            icon={<Home size={16} />}
            label="Ocupación"
            value={`${occupancy}%`}
            hint={`${occupied}/${units.length}`}
          />
          <Kpi
            icon={<Wallet size={16} />}
            label="Cobrado este mes"
            value={`$${monthRevenue.toLocaleString('es-MX')}`}
          />
        </section>

        {/* Properties by org */}
        <section>
          <h2
            className="text-[14px] font-medium mb-3"
            style={{ color: 'var(--baw-text)' }}
          >
            Tus propiedades
          </h2>
          <div className="space-y-3">
            {ctx.properties.length === 0 && (
              <Empty message="No tienes propiedades registradas." />
            )}
            {ctx.properties.map((p) => (
              <div
                key={p.property_owner_id}
                className="rounded-lg p-4"
                style={{
                  backgroundColor: 'var(--baw-surface)',
                  border: '1px solid var(--baw-border)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div
                      className="text-[10px] uppercase tracking-wider"
                      style={{ color: 'var(--baw-muted)' }}
                    >
                      {p.org_name}
                    </div>
                    <div
                      className="text-[14px] font-medium"
                      style={{ color: 'var(--baw-text)' }}
                    >
                      {p.full_name}
                    </div>
                  </div>
                </div>
                {p.buildings.length === 0 ? (
                  <p className="text-[12px]" style={{ color: 'var(--baw-muted)' }}>
                    Sin participaciones activas en esta organización.
                  </p>
                ) : (
                  <ul className="divide-y" style={{ borderColor: 'var(--baw-border)' }}>
                    {p.buildings.map((b) => (
                      <li
                        key={b.building_id}
                        className="py-2 flex items-center justify-between"
                        style={{ borderColor: 'var(--baw-border)' }}
                      >
                        <Link
                          href={`/owner/buildings/${b.building_id}`}
                          className="text-[13px] hover:underline"
                          style={{ color: 'var(--baw-text)' }}
                        >
                          {b.building_name}
                        </Link>
                        <span
                          className="text-[12px] tabular-nums"
                          style={{ color: 'var(--baw-muted)' }}
                        >
                          {b.percentage.toFixed(2)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Incidents */}
        {openIncidents > 0 && (
          <section
            className="rounded-lg p-4 flex items-center gap-3"
            style={{
              backgroundColor: 'rgba(234, 179, 8, 0.08)',
              border: '1px solid rgba(234, 179, 8, 0.25)',
            }}
          >
            <AlertCircle size={18} style={{ color: 'var(--baw-warning-fg)' }} />
            <div className="flex-1">
              <div
                className="text-[13px] font-medium"
                style={{ color: 'var(--baw-text)' }}
              >
                {openIncidents} incidente{openIncidents !== 1 ? 's' : ''} abierto
                {openIncidents !== 1 ? 's' : ''}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--baw-muted)' }}>
                Mantenimiento o reportes en proceso en tus propiedades.
              </div>
            </div>
            <Link
              href="/owner/incidents"
              className="text-[12px] px-3 py-1.5 rounded"
              style={{
                backgroundColor: 'rgba(234, 179, 8, 0.15)',
                color: 'var(--baw-warning-fg)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
              }}
            >
              Ver detalles
            </Link>
          </section>
        )}
      </main>
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: 'var(--baw-surface)',
        border: '1px solid var(--baw-border)',
      }}
    >
      <div
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-1"
        style={{ color: 'var(--baw-muted)' }}
      >
        {icon}
        {label}
      </div>
      <div
        className="text-[24px] font-semibold tabular-nums"
        style={{ color: 'var(--baw-text)' }}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[11px] mt-1" style={{ color: 'var(--baw-muted)' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg p-6 text-center text-[12px]"
      style={{
        backgroundColor: 'var(--baw-surface)',
        border: '1px dashed var(--baw-border)',
        color: 'var(--baw-muted)',
      }}
    >
      {message}
    </div>
  )
}
