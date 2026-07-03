'use client'

// BaW OS — Calendario de unidades · Vista A (timeline multi-unidad).
//
// Render según la spec «tl» del kit UI System v1: el grid es FLUIDO — las
// columnas reparten el 100% del ancho disponible entre los días visibles
// (nada de px fijos ni scroll horizontal), las barras usan fondo suave +
// borde izquierdo de instrumento, y check-in/out caen a mitad de día para
// que salida y entrada convivan en el mismo día sin conflicto visual.
// La leyenda es un filtro interactivo (toggles por instrumento).
//
// Click en barra → drawer con link al instrumento; click en la unidad →
// /calendario/[unitId] (Vista B mensual, donde vive la edición de precios).

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
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
  INSTR_VAR,
  instrVarFor,
  unitTypeVar,
  barModifiers,
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
  freeNightsInWindow,
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
const LANE_H = 28
const ALL = '__ALL__'
const SIN_EDIFICIO = '__NONE__'

type LegendKey = 'STR' | 'MTR' | 'LTR' | 'hold' | 'tent' | 'season'
const LEGEND: Array<{ key: LegendKey; label: string; bar: string }> = [
  { key: 'STR', label: 'STR', bar: INSTR_VAR.STR },
  { key: 'MTR', label: 'MTR', bar: INSTR_VAR.MTR },
  { key: 'LTR', label: 'LTR', bar: INSTR_VAR.LTR },
  { key: 'hold', label: 'Hold', bar: INSTR_VAR.hold },
  { key: 'season', label: 'Temporada', bar: INSTR_VAR.season },
  { key: 'tent', label: 'Tentativa', bar: 'var(--baw-instr-tent)' },
]

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
  const [query, setQuery] = useState('')
  const [legend, setLegend] = useState<Record<LegendKey, boolean>>({
    STR: true,
    MTR: true,
    LTR: true,
    hold: true,
    tent: true,
    season: true,
  })
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
  const dayList = useMemo(
    () => Array.from({ length: days }, (_, i) => addDaysISO(windowStart, i)),
    [windowStart, days],
  )
  const todayIdx = diffDaysISO(windowStart, today)
  const todayVisible = todayIdx >= 0 && todayIdx < days

  // Barras visibles según la leyenda-filtro
  const visibleStays = useMemo(
    () =>
      stays.filter((s) => {
        if (s.kind === 'hold') return legend.hold
        if (s.tentative && !legend.tent) return false
        return legend[(s.type ?? 'LTR') as LegendKey]
      }),
    [stays, legend],
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

  // Header: runs de meses [label, startIdx, span]
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
            month: zoom === 14 ? 'long' : 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          startIdx: i,
          span: 1,
        })
      }
    }
    return spans
  }, [dayList, zoom])

  // Overlays: runs de fin de semana + inicios de mes
  const weekendRuns = useMemo(() => {
    const runs: Array<{ startIdx: number; len: number }> = []
    for (let i = 0; i < dayList.length; i++) {
      if (!isWeekendISO(dayList[i])) continue
      const last = runs[runs.length - 1]
      if (last && last.startIdx + last.len === i) last.len++
      else runs.push({ startIdx: i, len: 1 })
    }
    return runs
  }, [dayList])

  const monthStarts = useMemo(
    () =>
      dayList
        .map((iso, i) => ({ iso, i }))
        .filter(({ iso, i }) => i > 0 && iso.endsWith('-01'))
        .map(({ i }) => i),
    [dayList],
  )

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

  // Densidad de números en el header: a Trimestre solo lunes (evita colisiones)
  const showAllDayNumbers = zoom !== 92
  const isMonday = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay() === 1

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
            <div className="flex flex-wrap items-center gap-2">
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
              {/* Leyenda-filtro: click apaga/enciende cada instrumento */}
              <div className="tl-legend">
                {LEGEND.map((l) => (
                  <button
                    key={l.key}
                    aria-pressed={legend[l.key]}
                    onClick={() => setLegend((prev) => ({ ...prev, [l.key]: !prev[l.key] }))}
                    style={{ '--bar': l.bar } as CSSProperties}
                    title={legend[l.key] ? `Ocultar ${l.label}` : `Mostrar ${l.label}`}
                  >
                    <i />
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline fluido (spec «tl»: columnas = 100% del ancho / días) */}
          <div className="tl" style={{ '--cols': days } as CSSProperties}>
            {/* Overlays de contexto: fines de semana, inicios de mes, hoy */}
            {weekendRuns.map((r) => (
              <i
                key={`we-${r.startIdx}`}
                className="tl-we"
                style={{ '--d': r.startIdx, '--len': r.len } as CSSProperties}
              />
            ))}
            {monthStarts.map((i) => (
              <i key={`ml-${i}`} className="tl-monthline" style={{ '--d': i } as CSSProperties} />
            ))}
            {todayVisible && (
              <i className="tl-todayline" style={{ '--today': todayIdx } as CSSProperties} />
            )}

            {/* Header: meses + días */}
            <div className="tl-row">
              <div className="tl-unit" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                UNIDAD
              </div>
              <div className="tl-track tl-track--head">
                <div className="tl-months">
                  {monthSpans.map((m) => (
                    <span
                      key={m.startIdx}
                      className="tl-month"
                      style={{ '--d': m.startIdx, '--len': m.span } as CSSProperties}
                    >
                      {m.label}
                    </span>
                  ))}
                </div>
                <div className="tl-days">
                  {dayList.map((iso) => {
                    const isToday = iso === today
                    const show = showAllDayNumbers || isMonday(iso)
                    return (
                      <span key={iso} title={iso} className={isWeekendISO(iso) ? 'we' : undefined}>
                        {isToday ? (
                          <span className="today">{Number(iso.slice(8, 10))}</span>
                        ) : show ? (
                          Number(iso.slice(8, 10))
                        ) : null}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Franja de temporadas de precio */}
            {legend.season && seasonSegments.length > 0 && (
              <div className="tl-row">
                <div className="tl-unit" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                  Temporadas
                </div>
                <div className="tl-track tl-track--season">
                  {seasonSegments.map(({ season, startIdx, span }) => (
                    <span key={season.id}>
                      <i
                        className="tl-season"
                        style={{ '--d': startIdx, '--len': span } as CSSProperties}
                        title={`${season.name} · ×${season.price_multiplier} · ${season.start_date} → ${season.end_date}`}
                      />
                      {startIdx + span < days - 6 && (
                        <span
                          className="tl-season-label"
                          style={{ '--d': startIdx, '--len': span } as CSSProperties}
                        >
                          {season.name} ×{season.price_multiplier}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Grupos por edificio */}
            {groups.map((g) => (
              <div key={g.id}>
                <button className="tl-group" onClick={() => toggleGroup(g.id)}>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      collapsed.has(g.id) ? '-rotate-90' : ''
                    }`}
                  />
                  {g.name} <small>({g.units.length})</small>
                </button>

                {!collapsed.has(g.id) &&
                  g.units.map((u) => {
                    const unitStays = staysByUnit.get(u.id) ?? []
                    const { bars, laneCount } = layoutLanes(unitStays, windowStart, days)
                    const trackH = Math.max(36, 12 + laneCount * LANE_H)
                    const free = freeNightsInWindow(unitStays, windowStart, days)
                    return (
                      <div key={u.id} className="tl-row">
                        <div className="tl-unit" style={{ height: trackH }}>
                          <Link
                            href={`/calendario/${u.id}`}
                            title={`Abrir calendario mensual de ${u.number}`}
                          >
                            {u.number}
                          </Link>
                          <span
                            className="tl-chip"
                            style={{ '--c': unitTypeVar(u.type) } as CSSProperties}
                          >
                            {u.type}
                          </span>
                          {free > 0 && free < days && <span className="tl-vac">{free}n libres</span>}
                          {free === days && <span className="tl-vac">libre</span>}
                        </div>
                        <div className="tl-track" style={{ height: trackH }}>
                          {bars.map((b) => {
                            // Half-day: check-in arranca a mitad de día y
                            // check-out termina a mitad de día — salvo bordes
                            // recortados por la ventana, que van al límite.
                            const startPos = b.clippedStart ? 0 : b.startIdx + 0.5
                            const endPos = b.clippedEnd
                              ? days
                              : Math.min(days, b.startIdx + b.span + 0.5)
                            const len = Math.max(0.4, endPos - startPos)
                            const showText = len / days > 0.045
                            return (
                              <button
                                key={b.stay.key}
                                onClick={() => setSelected(b.stay)}
                                className={`tl-bar ${barModifiers({
                                  kind: b.stay.kind,
                                  tentative: b.stay.tentative,
                                  clippedStart: b.clippedStart,
                                  clippedEnd: b.clippedEnd,
                                })}`}
                                style={
                                  {
                                    '--d': startPos,
                                    '--len': len,
                                    '--bar': instrVarFor(b.stay.kind, b.stay.type),
                                    top: 6 + b.lane * LANE_H,
                                  } as CSSProperties
                                }
                                title={`${b.stay.person} · ${b.stay.start} → ${
                                  b.stay.moveOutDay ?? 'sin fin'
                                }`}
                              >
                                {showText && (
                                  <>
                                    {b.stay.type && <span className="cap">{b.stay.type}</span>}
                                    <span className="truncate">{b.stay.person}</span>
                                  </>
                                )}
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

          <p className="text-xs muted-text">
            Click en una barra para ver el detalle · click en la unidad para abrir su calendario
            mensual con precios por noche · las barras punteadas continúan fuera de la ventana
            visible.
          </p>
        </>
      )}

      <StayDrawer stay={selected} unitLabel={unitLabelFor(selected)} onClose={() => setSelected(null)} />
    </div>
  )
}
