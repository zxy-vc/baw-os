'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import UnitCard from '@/components/public-booking/UnitCard'
import MonoLabel from '@/components/public-booking/MonoLabel'
import { listBuildingUnits } from '@/lib/public-booking-client/api-client'
import type { PublicUnit } from '@/lib/public-booking/schemas'

type SortKey = 'price-asc' | 'price-desc' | 'capacity-desc'

export default function UnitsClient({
  buildingSlug,
  initialFrom,
  initialTo,
  initialGuests,
}: {
  buildingSlug: string
  initialFrom?: string
  initialTo?: string
  initialGuests?: number
}) {
  const sp = useSearchParams()
  const [units, setUnits] = useState<PublicUnit[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('price-asc')
  const [minGuests, setMinGuests] = useState<number>(initialGuests ?? 1)

  const from = initialFrom ?? sp.get('from') ?? undefined
  const to = initialTo ?? sp.get('to') ?? undefined

  // QueryString para propagar a unit detail
  const queryStr = useMemo(() => {
    const q = new URLSearchParams()
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    if (minGuests) q.set('guests', String(minGuests))
    return q.toString()
  }, [from, to, minGuests])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listBuildingUnits(buildingSlug, { from, to, guests: minGuests })
      .then((res) => {
        if (cancelled) return
        if (res.error) {
          setError(res.error.message)
          setUnits([])
        } else {
          setUnits(res.data)
        }
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setUnits([])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [buildingSlug, from, to, minGuests])

  const sorted = useMemo(() => {
    if (!units) return []
    const arr = [...units]
    if (sort === 'price-asc') arr.sort((a, b) => (a.base_rate_mxn ?? Infinity) - (b.base_rate_mxn ?? Infinity))
    else if (sort === 'price-desc') arr.sort((a, b) => (b.base_rate_mxn ?? 0) - (a.base_rate_mxn ?? 0))
    else if (sort === 'capacity-desc') arr.sort((a, b) => b.max_guests - a.max_guests)
    return arr
  }, [units, sort])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 32 }}>
      <FilterBar
        from={from}
        to={to}
        sort={sort}
        onSortChange={setSort}
        minGuests={minGuests}
        onMinGuestsChange={setMinGuests}
        count={sorted.length}
        loading={loading}
      />

      {loading && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 24,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="pb-card" style={{ overflow: 'hidden' }}>
              <div className="pb-skeleton" style={{ aspectRatio: '4 / 3', borderRadius: 0 }} />
              <div style={{ padding: 20 }}>
                <div className="pb-skeleton" style={{ height: 22, width: '70%', marginBottom: 12 }} />
                <div className="pb-skeleton" style={{ height: 14, width: '90%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div
          role="alert"
          style={{
            padding: 24,
            background: 'rgba(138, 42, 42, 0.05)',
            border: '1px solid rgba(138, 42, 42, 0.2)',
            borderRadius: 'var(--r-3)',
            color: 'var(--danger)',
          }}
        >
          No fue posible cargar las unidades: {error}
        </div>
      )}

      {!loading && !error && sorted.length === 0 && (
        <EmptyState />
      )}

      {!loading && !error && sorted.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 24,
          }}
        >
          {sorted.map((u, i) => (
            <UnitCard
              key={u.id ?? u.slug}
              unit={u}
              buildingSlug={buildingSlug}
              searchQuery={queryStr}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterBar({
  from,
  to,
  sort,
  onSortChange,
  minGuests,
  onMinGuestsChange,
  count,
  loading,
}: {
  from?: string
  to?: string
  sort: SortKey
  onSortChange: (s: SortKey) => void
  minGuests: number
  onMinGuestsChange: (n: number) => void
  count: number
  loading: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        padding: 16,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-3)',
      }}
    >
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <MonoLabel as="div" style={{ marginBottom: 6 }}>Búsqueda</MonoLabel>
          <div style={{ fontSize: 14, color: 'var(--ink)' }}>
            {from && to ? `${from} → ${to}` : 'Todas las fechas'}
          </div>
        </div>
        <div>
          <MonoLabel as="label" htmlFor="filter-guests" style={{ marginBottom: 6 }}>Huéspedes mín.</MonoLabel>
          <select
            id="filter-guests"
            className="pb-input"
            style={{ width: 120, padding: '8px 12px' }}
            value={minGuests}
            onChange={(e) => onMinGuestsChange(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}+</option>
            ))}
          </select>
        </div>
        <div>
          <MonoLabel as="label" htmlFor="filter-sort" style={{ marginBottom: 6 }}>Ordenar</MonoLabel>
          <select
            id="filter-sort"
            className="pb-input"
            style={{ width: 200, padding: '8px 12px' }}
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
          >
            <option value="price-asc">Precio: menor primero</option>
            <option value="price-desc">Precio: mayor primero</option>
            <option value="capacity-desc">Mayor capacidad</option>
          </select>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        {loading ? 'Cargando…' : `${count} unidad${count === 1 ? '' : 'es'}`}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      style={{
        padding: 48,
        textAlign: 'center',
        background: 'var(--surface-2)',
        border: '1px dashed var(--line-2)',
        borderRadius: 'var(--r-3)',
      }}
    >
      <h3 style={{ fontSize: 24, marginBottom: 8 }}>Sin disponibilidad</h3>
      <p style={{ color: 'var(--ink-2)', maxWidth: 480, margin: '0 auto' }}>
        No encontramos unidades libres para esas fechas. Intenta con otro
        rango o reduce el número de huéspedes.
      </p>
    </div>
  )
}
