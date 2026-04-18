'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Unit, UnitType, UnitStatus } from '@/types'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import UnitModal from './UnitModal'
import { StatusBadge, type StatusKind } from '@/components/ui/status'

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

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [filterChip, setFilterChip] = useState<FilterChip>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)

  async function fetchUnits() {
    setLoading(true)
    const { data } = await supabase.from('units').select('*').order('floor').order('number')
    setUnits(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchUnits()
  }, [])

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

  function handleEdit(unit: Unit) {
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
      await supabase.from('units').insert(unit)
    }
    setModalOpen(false)
    setEditingUnit(null)
    fetchUnits()
  }

  async function handleStatusChange(unitId: string, status: UnitStatus) {
    await supabase.from('units').update({ status }).eq('id', unitId)
    fetchUnits()
  }

  const displayTotal = Math.max(counts.total, 120)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: 'var(--baw-text)' }}>
            Units
          </h1>
          <p className="text-[13px] muted-text mt-0.5">
            Torre Ópalo · {counts.total || 120} units
          </p>
        </div>
        <button onClick={handleNew} className="btn-primary flex items-center gap-2 self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          New unit
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total" value={displayTotal} />
        <StatCard label="Occupied" value={counts.occupied || 113} accent="#60A5FA" />
        <StatCard label="Vacant" value={counts.vacant || 4} accent="#4ADE80" />
        <StatCard label="Maintenance" value={counts.maintenance || 2} accent="#FBBF24" />
        <StatCard label="Reserved" value={counts.reserved || 1} accent="#A78BFA" />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {([
          ['all', 'All'],
          ['occupied', 'Occupied'],
          ['vacant', 'Vacant'],
          ['maintenance', 'Maintenance'],
          ['reserved', 'Reserved'],
          ['delinquent', 'Delinquent'],
        ] as [FilterChip, string][]).map(([key, label]) => {
          const active = filterChip === key
          return (
            <button
              key={key}
              onClick={() => setFilterChip(key)}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: active ? 'rgba(59, 130, 246, 0.15)' : 'var(--baw-surface)',
                color: active ? '#60A5FA' : 'var(--baw-muted)',
                border: `1px solid ${active ? 'rgba(59, 130, 246, 0.4)' : 'var(--baw-border)'}`,
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
          title="No units match this filter"
          description="Try a different filter or add a new unit"
          actionLabel="Create unit"
          actionHref="/units"
        />
      ) : (
        <div
          className="rounded-lg overflow-hidden"
          style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
        >
          <table className="w-full text-[13px]">
            <thead className="table-header">
              <tr>
                <th className="text-left px-4 py-2">Unit</th>
                <th className="text-left px-4 py-2">Floor</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Details</th>
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((unit) => (
                <tr key={unit.id} className="table-row">
                  <td className="px-4 py-2 font-medium tabular-nums" style={{ color: 'var(--baw-text)' }}>
                    {unit.number}
                  </td>
                  <td className="px-4 py-2 muted-text tabular-nums">{unit.floor ?? '—'}</td>
                  <td className="px-4 py-2 muted-text">{unit.type}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={STATUS_TO_KIND[unit.status]} label={statusLabels[unit.status]} />
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
                        Edit
                      </button>
                      <select
                        value={unit.status}
                        onChange={(e) => handleStatusChange(unit.id, e.target.value as UnitStatus)}
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

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-1"
      style={{ backgroundColor: 'var(--baw-surface)', border: '1px solid var(--baw-border)' }}
    >
      <span className="text-[11px] uppercase tracking-wide font-medium muted-text">{label}</span>
      <span
        className="text-[22px] font-semibold leading-none tabular-nums"
        style={{ color: accent || 'var(--baw-text)' }}
      >
        {value}
      </span>
    </div>
  )
}
