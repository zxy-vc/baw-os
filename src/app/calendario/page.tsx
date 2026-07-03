'use client'

// BaW OS — Calendario de unidades · Vista A (timeline multi-unidad).
//
// Modelo Airbnb multi-calendar: filas = unidades agrupadas por edificio,
// columnas = días con desplazamiento horizontal por ventana (◀ Hoy ▶ + zoom).
// Barras = estancias de los 3 instrumentos (contratos LTR/MTR, reservaciones
// STR, holds del booking público) + franja de temporadas (str_seasons) arriba.
// Read-only en esta fase: click en barra → drawer con link al instrumento;
// click en la unidad → /calendario/[unitId] (Vista B mensual con precios).

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useActiveContext } from '@/lib/useActiveContext'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import { KPICard } from '@/components/ui/status'
import StayDrawer from '@/components/calendar/StayDrawer'
import {
  TYPE_BADGE,
  BAR_CLASS,
  HOLD_STRIPES,
  SEASON_CHIP,
  barClassFor,
} from '@/components/calendar/calendar-ui'
import type { CalendarStay, Season, StayType } from '@/lib/calendar-occupancy'
import {
  todayISO,
  addDaysISO,
  diffDaysISO,
  isWeekendISO,
  contractToStay,
  reservationToStay,
  holdToStay,
  layoutLanes,
  computeKpis,
} from '@/lib/calendar-occupancy'
import type { UnitType } from '@/types'

interface UnitRow {
  id: string
  building_id: string | null
  number: string
  floor: number | null
  type: UnitType
  status: string
  base_rate_mxn: number | null
  monthly_rate_mxn: number | null
}

const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  STR: 'Corta estancia',
  MTR: 'Media estancia',
  LTR: 'Larga estancia',
  RETAIL: 'Local comercial',
  OFFICE: 'Oficina',
  COMMON: 'Área común',
}

type Zoom = 14 | 31 | 92
const ZOOM_OPTIONS: Array<{ value: Zoom; label: string }> = [
  { value: 14, label: '2 semanas' },
  { value: 31, label: 'Mes' },
  { value: 92, label: 'Trimestre' },
]
const COL_PX: Record<Zoom, number> = { 14: 44, 31: 26, 92: 11 }
const LABEL_W = 210
const LANE_H = 24
const ALL = '__ALL__'
const SIN_EDIFICIO = '__NONE__'

export default function CalendarioPage() {
  const {
    activeOrgId,
    activeBuildingId,
    buildings,
    loading: ctxLoading,
  } = useActiveContext()

  const today = todayISO()
  const [units, setUnits] = useState<UnitRow[]>([])
  const [stays, setStays] = useState<CalendarStay[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)

  const [zoom, setZoom] = useState<Zoom>(31)
  const [windowStart, setWindowStart] = useState(() => addDaysISO(todayISO(), -7))

  const [buildingFilter, setBuildingFilter] = useState<string>(ALL)
  const [unitTypeFilter, setUnitTypeFilter] = useState<'all' | UnitType>('all')
  const [stayTypeFilter, setStayTypeFilter] = useState<'all' | StayType>('all')
  const [showHolds, setShowHolds] = useState(true)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<CalendarStay | null>(null)

  // Respetar el building activo del switcher como filtro inicial (patrón /units)
  useEffect(() => {
    if (activeBuildingId && activeBuildingId !== 'all' && buildingFilter === ALL) {
      setBuildingFilter(activeBuildingId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBuildingId])

  useEffect(() => {
    if (ctxLoading) return
    if (!activeOrgId) {
      setUnits([])
      setStays([])
      setLoading(false)
      return
    }
    let alive = true

    async function load(orgId: string) {
      setLoading(true)
      try {
        const [unitsRes, contractsRes, reservationsRes, seasonsRes] = await Promise.all([
          supabase
            .from('units')
            .select('id, building_id, number, floor, type, status, base_rate_mxn, monthly_rate_mxn')
            .eq('org_id', orgId)
            .is('archived_at', null)
            .order('floor')
            .order('number'),
          supabase
            .from('contracts')
            .select('id, unit_id, rent_type, status, monthly_amount, start_date, end_date, notes, occupant:occupants(name)')
            .eq('org_id', orgId)
            .is('archived_at', null)
            .not('unit_id', 'is', null),
          // Ojo: reservations filtra por organization_id, no org_id (esquema histórico)
          supabase
            .from('reservations')
            .select('id, unit_id, guest_name, check_in, check_out, status, payment_status, total_price, guests_count, channel, notes')
            .eq('organization_id', orgId),
          supabase.from('str_seasons').select('*').order('start_date'),
        ])

        const unitRows = (unitsRes.data ?? []) as UnitRow[]

        // reservation_holds no tiene org_id: se acota por las unidades de la org
        let holdRows: any[] = []
        if (unitRows.length > 0) {
          const { data } = await supabase
            .from('reservation_holds')
            .select('id, unit_id, from_date, to_date, guests_count, guest_email, expires_at')
            .in('unit_id', unitRows.map((u) => u.id))
            .gt('expires_at', new Date().toISOString())
          holdRows = data ?? []
        }

        const merged: CalendarStay[] = [
          ...((contractsRes.data ?? []) as any[]).map(contractToStay),
          ...((reservationsRes.data ?? []) as any[]).map(reservationToStay),
          ...holdRows.map(holdToStay),
        ].filter((s): s is CalendarStay => s !== null)

        if (alive) {
          setUnits(unitRows)
          setStays(merged)
          setSeasons((seasonsRes.data ?? []) as Season[])
        }
      } finally {
        if (alive) setLoading(false)
      }
    }

    load(activeOrgId)
    return () => {
      alive = false
    }
  }, [ctxLoading, activeOrgId])

  const orgBuildings = useMemo(
    () => buildings.filter((b) => b.org_id === activeOrgId),
    [buildings, activeOrgId],
  )

  const days = zoom
  const colPx = COL_PX[zoom]
  const gridW = days * colPx
  const dayList = useMemo(
    () => Array.from({ length: days }, (_, i) => addDaysISO(windowStart, i)),
    [windowStart, days],
  )
  const todayIdx = diffDaysISO(windowStart, today)
  const todayVisible = todayIdx >= 0 && todayIdx < days

  // Barras visibles según filtros de tipo de estancia / holds
  const visibleStays = useMemo(
    () =>
      stays.filter((s) => {
        if (s.kind === 'hold') return showHolds
        return stayTypeFilter === 'all' || s.type === stayTypeFilter
      }),
    [stays, stayTypeFilter, showHolds],
  )

  const staysByUnit = useMemo(() => {
    const map = new Map<string, CalendarStay[]>()
    for (const s of visibleStays) {
      if (!map.has(s.unitId)) map.set(s.unitId, [])
      map.get(s.unitId)!.push(s)
    }
    return map
  }, [visibleStays])

  const filteredUnits = useMemo(() => {
    const q = query.trim().toLowerCase()
    return units.filter((u) => {
      if (buildingFilter !== ALL && (u.building_id ?? SIN_EDIFICIO) !== buildingFilter) return false
      if (unitTypeFilter !== 'all' && u.type !== unitTypeFilter) return false
      if (q) {
        const numberMatch = u.number.toLowerCase().includes(q)
        const personMatch = (staysByUnit.get(u.id) ?? []).some((s) =>
          s.person.toLowerCase().includes(q),
        )
        if (!numberMatch && !personMatch) return false
      }
      return true
    })
  }, [units, buildingFilter, unitTypeFilter, query, staysByUnit])

  const groups = useMemo(() => {
    const byBuilding = new Map<string, UnitRow[]>()
    for (const u of filteredUnits) {
      const key = u.building_id ?? SIN_EDIFICIO
      if (!byBuilding.has(key)) byBuilding.set(key, [])
      byBuilding.get(key)!.push(u)
    }
    const nameOf = (id: string) =>
      id === SIN_EDIFICIO
        ? 'Sin edificio'
        : orgBuildings.find((b) => b.id === id)?.name ?? 'Edificio'
    return Array.from(byBuilding.entries())
      .map(([id, list]) => ({ id, name: nameOf(id), units: list }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [filteredUnits, orgBuildings])

  const kpis = useMemo(
    () =>
      computeKpis(
        filteredUnits.map((u) => u.id),
        visibleStays,
        windowStart,
        days,
        today,
      ),
    [filteredUnits, visibleStays, windowStart, days, today],
  )

  // Encabezado: runs de meses [label, startIdx, span]
  const monthSpans = useMemo(() => {
    const spans: Array<{ label: string; startIdx: number; span: number }> = []
    for (let i = 0; i < dayList.length; i++) {
      const ym = dayList[i].slice(0, 7)
      const last = spans[spans.length - 1]
      if (last && dayList[last.startIdx].slice(0, 7) === ym) {
        last.span++
      } else {
        const [y, m] = ym.split('-').map(Number)
        spans.push({
          label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-MX', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          startIdx: i,
          span: 1,
        })
      }
    }
    return spans
  }, [dayList])

  // Temporadas recortadas a la ventana
  const seasonSegments = useMemo(() => {
    const windowEnd = addDaysISO(windowStart, days)
    return seasons
      .map((s) => {
        const endExclusive = addDaysISO(s.end_date, 1)
        if (endExclusive <= windowStart || s.start_date >= windowEnd) return null
        const a = s.start_date < windowStart ? windowStart : s.start_date
        const b = endExclusive > windowEnd ? windowEnd : endExclusive
        return {
          season: s,
          startIdx: diffDaysISO(windowStart, a),
          span: diffDaysISO(a, b),
        }
      })
      .filter((x): x is { season: Season; startIdx: number; span: number } => x !== null)
  }, [seasons, windowStart, days])

  function shift(dir: -1 | 1) {
    setWindowStart((ws) => addDaysISO(ws, dir * Math.max(7, Math.floor(days / 2))))
  }

  function toggleGroup(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const unitLabelFor = (stay: CalendarStay | null) => {
    if (!stay) return undefined
    const u = units.find((x) => x.id === stay.unitId)
    if (!u) return undefined
    const b = orgBuildings.find((x) => x.id === u.building_id)
    return `Unidad ${u.number}${b ? ` · ${b.name}` : ''}`
  }

  const showDayNumbers = zoom !== 92

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="w-6 h-6 text-indigo-400" />
          Calendario de unidades
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Ocupación de los 3 instrumentos — contratos (LTR/MTR), reservaciones (STR) y holds —
          con temporadas de precio.
        </p>
      </div>

      {ctxLoading || loading ? (
        <SkeletonTable />
      ) : !activeOrgId ? (
        <EmptyState
          icon={CalendarDays}
          title="Sin organización activa"
          description="Selecciona una organización en el switcher del sidebar para ver su calendario."
        />
      ) : units.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No hay unidades"
          description="Crea unidades en Portafolio → Unidades para verlas en el calendario."
        />
      ) : (
        <>
          {/* KPIs de la ventana visible (respetan filtros) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPICard label="Ocupación (ventana)" value={`${kpis.occupancyPct}%`} />
            <KPICard label="Noches vacantes" value={kpis.vacantNights} />
            <KPICard
              label="Hoy · entradas / salidas"
              value={`${kpis.movesInToday} / ${kpis.movesOutToday}`}
            />
            <KPICard
              label="Contratos vencen ≤60d"
              value={kpis.expiringSoon}
              warning={kpis.expiringSoon > 0}
            />
          </div>

          {/* Controles */}
          <div className="flex flex-col xl:flex-row xl:items-center gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => shift(-1)}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setWindowStart(addDaysISO(today, -7))}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Hoy
              </button>
              <button
                onClick={() => shift(1)}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={windowStart}
                onChange={(e) => e.target.value && setWindowStart(e.target.value)}
                className="input-field text-sm py-1.5 w-auto"
                aria-label="Ir a fecha"
              />
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                {ZOOM_OPTIONS.map((z) => (
                  <button
                    key={z.value}
                    onClick={() => setZoom(z.value)}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                      zoom === z.value
                        ? 'bg-indigo-600 text-white'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400 shrink-0" />
              {orgBuildings.length > 1 && (
                <select
                  value={buildingFilter}
                  onChange={(e) => setBuildingFilter(e.target.value)}
                  className="input-field text-sm py-1.5 w-auto"
                >
                  <option value={ALL}>Todos los edificios</option>
                  {orgBuildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={unitTypeFilter}
                onChange={(e) => setUnitTypeFilter(e.target.value as 'all' | UnitType)}
                className="input-field text-sm py-1.5 w-auto"
              >
                <option value="all">Toda unidad</option>
                {(Object.keys(UNIT_TYPE_LABELS) as UnitType[]).map((t) => (
                  <option key={t} value={t}>
                    {UNIT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <select
                value={stayTypeFilter}
                onChange={(e) => setStayTypeFilter(e.target.value as 'all' | StayType)}
                className="input-field text-sm py-1.5 w-auto"
              >
                <option value="all">Toda estancia</option>
                <option value="STR">STR (corta)</option>
                <option value="MTR">MTR (media)</option>
                <option value="LTR">LTR (larga)</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showHolds}
                  onChange={(e) => setShowHolds(e.target.checked)}
                  className="rounded"
                />
                Holds
              </label>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar unidad o persona…"
                  className="input-field w-full pl-9 text-sm py-1.5"
                />
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <div style={{ width: LABEL_W + gridW, minWidth: '100%' }}>
                {/* Header: meses */}
                <div className="flex border-b border-gray-200 dark:border-gray-800">
                  <div
                    className="sticky left-0 z-20 shrink-0 px-3 py-1.5 text-[11px] uppercase tracking-wide muted-text"
                    style={{ width: LABEL_W, backgroundColor: 'var(--baw-surface)' }}
                  >
                    Unidad
                  </div>
                  <div className="relative" style={{ width: gridW, height: 26 }}>
                    {monthSpans.map((m) => (
                      <div
                        key={m.startIdx}
                        className="absolute top-0 h-full flex items-center px-2 text-xs font-medium capitalize border-l border-gray-200 dark:border-gray-800"
                        style={{
                          left: m.startIdx * colPx,
                          width: m.span * colPx,
                          color: 'var(--baw-text)',
                        }}
                      >
                        <span className="truncate">{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Header: días */}
                <div className="flex border-b border-gray-200 dark:border-gray-800">
                  <div
                    className="sticky left-0 z-20 shrink-0"
                    style={{ width: LABEL_W, backgroundColor: 'var(--baw-surface)' }}
                  />
                  <div className="flex" style={{ width: gridW, height: 24 }}>
                    {dayList.map((iso, i) => {
                      const isToday = iso === today
                      const showNum =
                        showDayNumbers || iso.endsWith('-01') || new Date(iso + 'T00:00:00Z').getUTCDay() === 1
                      return (
                        <div
                          key={iso}
                          className={`shrink-0 flex items-center justify-center text-[10px] tabular-nums ${
                            isWeekendISO(iso) ? 'bg-black/[0.03] dark:bg-white/[0.04]' : ''
                          } ${i > 0 ? 'border-l border-black/[0.05] dark:border-white/[0.05]' : ''}`}
                          style={{ width: colPx }}
                          title={iso}
                        >
                          {isToday ? (
                            <span className="px-1 rounded bg-indigo-600 text-white font-semibold">
                              {Number(iso.slice(8, 10))}
                            </span>
                          ) : showNum ? (
                            <span className="muted-text">{Number(iso.slice(8, 10))}</span>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Franja de temporadas */}
                {seasonSegments.length > 0 && (
                  <div className="flex border-b border-gray-200 dark:border-gray-800">
                    <div
                      className="sticky left-0 z-20 shrink-0 px-3 flex items-center text-[11px] muted-text"
                      style={{ width: LABEL_W, backgroundColor: 'var(--baw-surface)' }}
                    >
                      Temporadas
                    </div>
                    <div className="relative" style={{ width: gridW, height: 24 }}>
                      {seasonSegments.map(({ season, startIdx, span }) => (
                        <div
                          key={season.id}
                          className={`absolute top-1 h-[16px] rounded px-1.5 text-[10px] leading-[14px] truncate ${SEASON_CHIP}`}
                          style={{ left: startIdx * colPx, width: span * colPx }}
                          title={`${season.name} · ×${season.price_multiplier} · ${season.start_date} → ${season.end_date}`}
                        >
                          {span * colPx > 56 ? `${season.name} ×${season.price_multiplier}` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grupos por edificio */}
                {groups.map((g) => (
                  <div key={g.id}>
                    <button
                      onClick={() => toggleGroup(g.id)}
                      className="flex items-center w-full border-b border-gray-200 dark:border-gray-800 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                    >
                      <div
                        className="sticky left-0 z-20 shrink-0 px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold"
                        style={{ width: LABEL_W, color: 'var(--baw-text)' }}
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${
                            collapsed.has(g.id) ? '-rotate-90' : ''
                          }`}
                        />
                        {g.name}
                        <span className="muted-text font-normal">({g.units.length})</span>
                      </div>
                    </button>

                    {!collapsed.has(g.id) &&
                      g.units.map((u) => {
                        const { bars, laneCount } = layoutLanes(
                          staysByUnit.get(u.id) ?? [],
                          windowStart,
                          days,
                        )
                        const rowH = Math.max(34, 10 + laneCount * LANE_H)
                        return (
                          <div
                            key={u.id}
                            className="flex border-b border-gray-100 dark:border-gray-800/70"
                          >
                            {/* Celda de unidad (sticky) */}
                            <div
                              className="sticky left-0 z-20 shrink-0 px-3 flex items-center gap-2 border-r border-gray-200 dark:border-gray-800"
                              style={{
                                width: LABEL_W,
                                height: rowH,
                                backgroundColor: 'var(--baw-surface)',
                              }}
                            >
                              <Link
                                href={`/calendario/${u.id}`}
                                className="font-medium text-sm hover:text-indigo-500 transition-colors truncate"
                                style={{ color: 'var(--baw-text)' }}
                                title={`Abrir calendario mensual de ${u.number}`}
                              >
                                {u.number}
                              </Link>
                              <span
                                className={`inline-flex px-1.5 py-0 rounded-full text-[10px] font-medium ${
                                  u.type === 'STR' || u.type === 'MTR' || u.type === 'LTR'
                                    ? TYPE_BADGE[u.type]
                                    : 'bg-gray-500/10 text-gray-500 border border-gray-500/20'
                                }`}
                              >
                                {u.type}
                              </span>
                            </div>

                            {/* Grid de días + barras */}
                            <div className="relative" style={{ width: gridW, height: rowH }}>
                              {/* fondo: separadores de día, fin de semana, hoy */}
                              <div className="absolute inset-0 flex">
                                {dayList.map((iso, i) => (
                                  <div
                                    key={iso}
                                    className={`shrink-0 h-full ${
                                      iso === today
                                        ? 'bg-indigo-500/[0.07]'
                                        : isWeekendISO(iso)
                                        ? 'bg-black/[0.03] dark:bg-white/[0.04]'
                                        : ''
                                    } ${
                                      i > 0
                                        ? iso.endsWith('-01')
                                          ? 'border-l border-gray-300 dark:border-gray-700'
                                          : 'border-l border-black/[0.05] dark:border-white/[0.05]'
                                        : ''
                                    }`}
                                    style={{ width: colPx }}
                                  />
                                ))}
                              </div>
                              {/* línea de hoy */}
                              {todayVisible && (
                                <div
                                  className="absolute top-0 bottom-0 w-[2px] bg-indigo-500/70 z-10 pointer-events-none"
                                  style={{ left: todayIdx * colPx }}
                                />
                              )}
                              {/* barras */}
                              {bars.map((b) => {
                                const showText = b.span * colPx >= 44
                                return (
                                  <button
                                    key={b.stay.key}
                                    onClick={() => setSelected(b.stay)}
                                    className={`absolute border text-left px-1.5 text-[11px] font-medium truncate transition-opacity hover:opacity-90 ${barClassFor(
                                      b.stay.kind,
                                      b.stay.type,
                                      b.stay.tentative,
                                    )} ${b.clippedStart ? 'rounded-l-none' : 'rounded-l-md'} ${
                                      b.clippedEnd ? 'rounded-r-none' : 'rounded-r-md'
                                    }`}
                                    style={{
                                      left: b.startIdx * colPx + 1,
                                      width: Math.max(colPx - 2, b.span * colPx - 2),
                                      top: 5 + b.lane * LANE_H,
                                      height: LANE_H - 4,
                                      lineHeight: `${LANE_H - 6}px`,
                                      ...(b.stay.kind === 'hold' ? HOLD_STRIPES : {}),
                                    }}
                                    title={`${b.stay.person} · ${b.stay.start} → ${
                                      b.stay.moveOutDay ?? 'sin fin'
                                    }`}
                                  >
                                    {showText
                                      ? `${b.clippedStart ? '← ' : ''}${b.stay.person}${
                                          b.clippedEnd ? ' →' : ''
                                        }`
                                      : ''}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ))}

                {filteredUnits.length === 0 && (
                  <div className="py-10 text-center text-sm muted-text">
                    Sin unidades con los filtros actuales.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-3 text-xs muted-text">
            <span className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded ${BAR_CLASS.STR}`} /> STR (reservación)
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded ${BAR_CLASS.MTR}`} /> MTR (contrato)
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded ${BAR_CLASS.LTR}`} /> LTR (contrato)
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded border ${BAR_CLASS.hold}`} style={HOLD_STRIPES} /> Hold
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded ${SEASON_CHIP}`} /> Temporada de precio
            </span>
            <span className="flex items-center gap-1.5 opacity-60">
              <span className="w-3 h-3 rounded border border-dashed border-gray-400 bg-gray-400/30" />{' '}
              Tentativa / pendiente
            </span>
          </div>
        </>
      )}

      <StayDrawer stay={selected} unitLabel={unitLabelFor(selected)} onClose={() => setSelected(null)} />
    </div>
  )
}
