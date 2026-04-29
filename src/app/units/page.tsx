'use client'

// BaW OS — Página de Unidades (Sprint 3 / S10 multi-building)
// Antes: subtítulo hardcoded "ALM809P", query sin filtros, sin columna de edificio.
// Ahora: header dinámico desde contexto activo, pill selector de building cuando
// hay 2+, columna "Edificio" condicional, filtro real por org_id + building_id.

import { useEffect, useMemo, useState } from 'react'
import { Plus, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Unit, UnitType, UnitStatus } from '@/types'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import UnitModal from './UnitModal'
import { StatusBadge, type StatusKind } from '@/components/ui/status'
import { useActiveContext } from '@/lib/useActiveContext'

const statusLabels: Record<UnitStatus, string> = {
  available: 'Disponible',
  occupied: 'Ocupado',
  maintenance: 'Mantenimiento',
  reserved: 'Reservado',
  inactive: 'Inactivo',
}

const typeLabels: Record<UnitType, string> = {
  STR: 'Corta estancia',
  MTR: 'Media estancia',
  LTR: 'Larga estancia',
  OFFICE: 'Oficina',
  COMMON: 'Área común',
}

type FilterChip = 'all' | 'occupied' | 'vacant' | 'maintenance' | 'reserved' | 'delinquent'

const STATUS_TO_KIND: Record<UnitStatus, StatusKind> = {
  available: 'available',
  occupied: 'occupied',
  maintenance: 'maintenance',
  reserved: 'reserved',
  inactive: 'expired',
}

// Tipo extendido con datos del building joinado
interface UnitWithBuilding extends Unit {
  building?: { id: string; name: string; city: string | null } | null
}

// Pill especial para "todos los edificios"
const ALL_BUILDINGS = '__ALL__'

export default function UnitsPage() {
  const {
    activeOrgId,
    activeBuildingId,
    orgs,
    buildings,
    loading: ctxLoading,
  } = useActiveContext()

  const [units, setUnits] = useState<UnitWithBuilding[]>([])
  const [loading, setLoading] = useState(true)
  const [filterChip, setFilterChip] = useState<FilterChip>('all')
  const [buildingFilter, setBuildingFilter] = useState<string>(ALL_BUILDINGS)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)

  // Buildings de la org activa (lo que el user puede ver/elegir)
  const orgBuildings = useMemo(
    () => buildings.filter((b) => b.org_id === activeOrgId),
    [buildings, activeOrgId],
  )

  // Inicializar buildingFilter desde activeBuildingId la primera vez
  useEffect(() => {
    if (activeBuildingId && buildingFilter === ALL_BUILDINGS) {
      // si el switcher tiene un building activo, lo respetamos como filtro inicial
      setBuildingFilter(activeBuildingId)
    }
  }, [activeBuildingId, buildingFilter])

  async function fetchUnits() {
    if (!activeOrgId) {
      setUnits([])
      setLoading(false)
      return
    }
    setLoading(true)
    let query = supabase
      .from('units')
      .select('*, building:buildings(id, name, city)')
      .eq('org_id', activeOrgId)
      .order('floor')
      .order('number')

    if (buildingFilter !== ALL_BUILDINGS) {
      query = query.eq('building_id', buildingFilter)
    }

    const { data } = await query
    setUnits((data as UnitWithBuilding[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    if (ctxLoading) return
    fetchUnits()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxLoading, activeOrgId, buildingFilter])

  const counts = useMemo(() => {
    const c = { total: units.length, occupied: 0, vacant: 0, maintenance: 0, reserved: 0 }
    for (const u of units) {
      if (u.status === 'occupied') c.occupied++
      else if (u.status === 'available') c.vacant++
      else if (u.status === 'maintenance') c.maintenance++
      else if (u.status === 'reserved') c.reserved++
    }
    return c
  }, [units])

  const filtered = useMemo(() => {
    if (filterChip === 'all') return units
    if (filterChip === 'occupied') return units.filter((u) => u.status === 'occupied')
    if (filterChip === 'vacant') return units.filter((u) => u.status === 'available')
    if (filterChip === 'maintenance') return units.filter((u) => u.status === 'maintenance')
    if (filterChip === 'reserved') return units.filter((u) => u.status === 'reserved')
    if (filterChip === 'delinquent') return units.filter((u) => u.status === 'occupied').slice(0, 0)
    return units
  }, [units, filterChip])

  function handleEdit(unit: UnitWithBuilding) {
    setEditingUnit(unit)
    setModalOpen(true)
  }

  function handleNew() {
    setEditingUnit(null)
    setModalOpen(true)
  }

  async function handleSave(unit: Partial<Unit>) {
    if (editingUnit) {
      await supabase.from('units').update(unit).eq('id', editingUnit.id)
    } else {
      // Inyectar org_id y building_id al crear
      const payload: Partial<Unit> = {
        ...unit,
        org_id: activeOrgId ?? unit.org_id,
      }
      if (
        buildingFilter !== ALL_BUILDINGS &&
        !(payload as { building_id?: string }).building_id
      ) {
        ;(payload as { building_id?: string }).building_id = buildingFilter
      }
      await supabase.from('units').insert(payload)
    }
    setModalOpen(false)
    setEditingUnit(null)
    fetchUnits()
  }

  async function handleStatusChange(unitId: string, status: UnitStatus) {
    await supabase.from('units').update({ status }).eq('id', unitId)
    fetchUnits()
  }

  // Derivados de presentación
  const activeOrg = orgs.find((o) => o.id === activeOrgId)
  const showBuildingColumn = orgBuildings.length > 1
  const showBuildingPills = orgBuildings.length > 1
  const activeFilterBuilding =
    buildingFilter === ALL_BUILDINGS
      ? null
      : orgBuildings.find((b) => b.id === buildingFilter)

  // Subtítulo del header: contexto explícito según selección
  const subtitle = (() => {
    if (ctxLoading) return '···'
    if (!activeOrg) return 'Sin organización'
    if (orgBuildings.length === 0) {
      return `${activeOrg.name} · sin edificios todavía`
    }
    if (activeFilterBuilding) {
      const cityPart = activeFilterBuilding.city
        ? ` · ${activeFilterBuilding.city}`
        : ''
      return `${activeFilterBuilding.name}${cityPart} · ${counts.total} unidades`
    }
    // ALL_BUILDINGS con varios edificios
    return `${activeOrg.name} · ${orgBuildings.length} edificios · ${counts.total} unidades`
  })()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold">Unidades</h1>
          <p className="text-[13px] muted-text mt-0.5 truncate">{subtitle}</p>
        </div>
        <button
          onClick={handleNew}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva unidad
        </button>
      </div>

      {/* Building selector pills (solo si hay 2+ buildings) */}
      {showBuildingPills && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-[11px] uppercase tracking-wide font-medium muted-text mr-1"
          >
            Edificio
          </span>
          <BuildingPill
            label={`Todos (${orgBuildings.length})`}
            active={buildingFilter === ALL_BUILDINGS}
            onClick={() => setBuildingFilter(ALL_BUILDINGS)}
          />
          {orgBuildings.map((b) => (
            <BuildingPill
              key={b.id}
              label={b.name}
              sublabel={b.city ?? undefined}
              active={buildingFilter === b.id}
              onClick={() => setBuildingFilter(b.id)}
            />
          ))}
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Ocupadas" value={counts.occupied} accent="#60A5FA" />
        <StatCard label="Disponibles" value={counts.vacant} accent="#4ADE80" />
        <StatCard
          label="Mantenimiento"
          value={counts.maintenance}
          accent="#FBBF24"
        />
        <StatCard label="Reservadas" value={counts.reserved} accent="#A78BFA" />
      </div>

      {/* Filter chips de estado */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'Todas'],
            ['occupied', 'Ocupadas'],
            ['vacant', 'Disponibles'],
            ['maintenance', 'Mantenimiento'],
            ['reserved', 'Reservadas'],
            ['delinquent', 'Morosas'],
          ] as [FilterChip, string][]
        ).map(([key, label]) => {
          const active = filterChip === key
          return (
            <button
              key={key}
              onClick={() => setFilterChip(key)}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: active
                  ? 'rgba(59, 130, 246, 0.15)'
                  : 'var(--baw-surface)',
                color: active ? '#60A5FA' : 'var(--baw-muted)',
                border: `1px solid ${
                  active ? 'rgba(59, 130, 246, 0.4)' : 'var(--baw-border)'
                }`,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <SkeletonTable />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={
            orgBuildings.length === 0
              ? 'Aún no hay edificios cargados'
              : 'No hay unidades para este filtro'
          }
          description={
            orgBuildings.length === 0
              ? 'Crea tu primer edificio desde el onboarding o desde la sección de Configuración.'
              : 'Prueba otro filtro o agrega una nueva unidad.'
          }
          actionLabel={orgBuildings.length === 0 ? 'Ir al onboarding' : 'Crear unidad'}
          actionHref={orgBuildings.length === 0 ? '/onboarding' : '/units'}
        />
      ) : (
        <div
          className="rounded-lg overflow-hidden"
          style={{
            backgroundColor: 'var(--baw-surface)',
            border: '1px solid var(--baw-border)',
          }}
        >
          <table className="w-full text-[13px]">
            <thead className="table-header">
              <tr>
                <th className="text-left px-4 py-2">Unidad</th>
                {showBuildingColumn && (
                  <th className="text-left px-4 py-2">Edificio</th>
                )}
                <th className="text-left px-4 py-2">Piso</th>
                <th className="text-left px-4 py-2">Tipo</th>
                <th className="text-left px-4 py-2">Estado</th>
                <th className="text-left px-4 py-2">Detalles</th>
                <th className="text-left px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((unit) => (
                <tr key={unit.id} className="table-row">
                  <td
                    className="px-4 py-2 font-medium tabular-nums"
                    style={{ color: 'var(--baw-text)' }}
                  >
                    {unit.number}
                  </td>
                  {showBuildingColumn && (
                    <td className="px-4 py-2 muted-text">
                      <div className="flex flex-col leading-tight">
                        <span style={{ color: 'var(--baw-text)' }}>
                          {unit.building?.name ?? '—'}
                        </span>
                        {unit.building?.city && (
                          <span className="text-[11px] muted-text">
                            {unit.building.city}
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-2 muted-text tabular-nums">
                    {unit.floor ?? '—'}
                  </td>
                  <td className="px-4 py-2 muted-text">{unit.type}</td>
                  <td className="px-4 py-2">
                    <StatusBadge
                      status={STATUS_TO_KIND[unit.status]}
                      label={statusLabels[unit.status]}
                    />
                  </td>
                  <td className="px-4 py-2 muted-text">
                    {[
                      unit.bedrooms && `${unit.bedrooms} rec`,
                      unit.bathrooms && `${unit.bathrooms} baño(s)`,
                      unit.area_m2 && `${unit.area_m2} m²`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(unit)}
                        className="text-[12px]"
                        style={{ color: 'var(--baw-primary)' }}
                      >
                        Editar
                      </button>
                      <select
                        value={unit.status}
                        onChange={(e) =>
                          handleStatusChange(unit.id, e.target.value as UnitStatus)
                        }
                        className="text-[12px] rounded px-2 py-1"
                        style={{
                          backgroundColor: 'var(--baw-elevated)',
                          color: 'var(--baw-text)',
                          border: '1px solid var(--baw-border)',
                        }}
                      >
                        {(Object.keys(statusLabels) as UnitStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {statusLabels[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <UnitModal
          unit={editingUnit}
          onSave={handleSave}
          onClose={() => {
            setModalOpen(false)
            setEditingUnit(null)
          }}
        />
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: string
}) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-1"
      style={{
        backgroundColor: 'var(--baw-surface)',
        border: '1px solid var(--baw-border)',
      }}
    >
      <span className="text-[11px] uppercase tracking-wide font-medium muted-text">
        {label}
      </span>
      <span
        className="text-[22px] font-semibold leading-none tabular-nums"
        style={{ color: accent || 'var(--baw-text)' }}
      >
        {value}
      </span>
    </div>
  )
}

function BuildingPill({
  label,
  sublabel,
  active,
  onClick,
}: {
  label: string
  sublabel?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors flex items-center gap-1.5"
      style={{
        backgroundColor: active
          ? 'rgba(59, 130, 246, 0.15)'
          : 'var(--baw-surface)',
        color: active ? '#60A5FA' : 'var(--baw-text)',
        border: `1px solid ${
          active ? 'rgba(59, 130, 246, 0.4)' : 'var(--baw-border)'
        }`,
      }}
    >
      <Building2 className="w-3.5 h-3.5" />
      <span>{label}</span>
      {sublabel && (
        <span className="text-[10px] muted-text font-normal">· {sublabel}</span>
      )}
    </button>
  )
}
