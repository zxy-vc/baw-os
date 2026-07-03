'use client'

// BaW OS — Calendario de unidades · Vista A (timeline multi-unidad).
//
// Render según la spec «tl» del kit UI System v1: el grid es FLUIDO — las
// columnas reparten el 100% del ancho disponible entre los días visibles
// (nada de px fijos ni scroll horizontal), las barras usan fondo suave +
// borde de instrumento, y check-in/out caen a mitad de día para que salida
// y entrada convivan en el mismo día. La leyenda es un filtro interactivo.
//
// Fase 3: las barras de reservación/contrato/bloqueo son ARRASTRABLES —
// arrastra el cuerpo para mover la estancia completa, o sus orillas para
// extender/recortar. Al soltar se pide confirmación con las fechas nuevas y
// se valida el solape contra las demás estancias firmes de la unidad (la DB
// además lo garantiza con sus EXCLUDE constraints). Click simple → drawer;
// click en la unidad → /calendario/[unitId] (edición de precios).

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
import ConfirmModal from '@/components/ConfirmModal'
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
  blockToStay,
  layoutLanes,
  computeKpis,
  freeNightsInWindow,
} from '@/lib/calendar-occupancy'
import { formatDate } from '@/lib/utils'
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

type LegendKey = 'STR' | 'MTR' | 'LTR' | 'hold' | 'block' | 'tent' | 'season'
const LEGEND: Array<{ key: LegendKey; label: string; bar: string }> = [
  { key: 'STR', label: 'STR', bar: INSTR_VAR.STR },
  { key: 'MTR', label: 'MTR', bar: INSTR_VAR.MTR },
  { key: 'LTR', label: 'LTR', bar: INSTR_VAR.LTR },
  { key: 'hold', label: 'Hold', bar: INSTR_VAR.hold },
  { key: 'block', label: 'Bloqueo', bar: INSTR_VAR.block },
  { key: 'season', label: 'Temporada', bar: INSTR_VAR.season },
  { key: 'tent', label: 'Tentativa', bar: 'var(--baw-instr-tent)' },
]

/** Cambios de fechas pendientes de confirmar tras un drag. */
interface PendingChange {
  stay: CalendarStay
  newStart: string
  newEndExclusive: string | null
}

interface DragState {
  key: string
  mode: 'move' | 'resize-l' | 'resize-r'
  originX: number
  colPx: number
  delta: number
  moved: boolean
  stay: CalendarStay
}

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
    block: true,
    tent: true,
    season: true,
  })
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<CalendarStay | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Drag & drop de barras
  const [drag, setDrag] = useState<DragState | null>(null)
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null)
  const [savingChange, setSavingChange] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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

        // Bloqueos operativos (fase 3). Si la migración 20260703_03 no está
        // aplicada aún, la query falla y seguimos sin bloqueos (degradación).
        const blocksRes = await supabase
          .from('unit_blocks')
          .select('id, unit_id, start_date, end_date, reason, notes')
          .eq('org_id', orgId)

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
          ...((blocksRes.data ?? []) as any[]).map(blockToStay),
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
  }, [ctxLoading, activeOrgId, reloadKey])

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
        if (s.kind === 'bloqueo') return legend.block
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

  /* ── Drag & drop: cálculo de fechas nuevas y validación de solapes ── */

  function computeNewDates(d: DragState): PendingChange | null {
    const s = d.stay
    let newStart = s.start
    let newEnd = s.endExclusive
    if (d.mode === 'move') {
      newStart = addDaysISO(s.start, d.delta)
      newEnd = s.endExclusive ? addDaysISO(s.endExclusive, d.delta) : null
    } else if (d.mode === 'resize-r') {
      if (!s.endExclusive) return null
      newEnd = addDaysISO(s.endExclusive, d.delta)
      if (diffDaysISO(newStart, newEnd) < 1) newEnd = addDaysISO(newStart, 1)
    } else {
      newStart = addDaysISO(s.start, d.delta)
      if (s.endExclusive && diffDaysISO(newStart, s.endExclusive) < 1) {
        newStart = addDaysISO(s.endExclusive, -1)
      }
    }
    if (newStart === s.start && newEnd === s.endExclusive) return null
    return { stay: s, newStart, newEndExclusive: newEnd }
  }

  function overlapConflict(change: PendingChange): CalendarStay | null {
    const FAR = '9999-12-31'
    const nEnd = change.newEndExclusive ?? FAR
    return (
      stays.find((o) => {
        if (o.unitId !== change.stay.unitId || o.key === change.stay.key) return false
        if (o.kind === 'hold' || o.tentative) return false
        const oEnd = o.endExclusive ?? FAR
        return change.newStart < oEnd && o.start < nEnd
      }) ?? null
    )
  }

  async function applyPendingChange() {
    if (!pendingChange || savingChange) return
    const { stay, newStart, newEndExclusive } = pendingChange
    const id = stay.key.slice(2)
    setSavingChange(true)
    let error: { message: string } | null = null
    if (stay.kind === 'reservacion') {
      ;({ error } = await supabase
        .from('reservations')
        .update({ check_in: newStart, check_out: newEndExclusive })
        .eq('id', id))
    } else if (stay.kind === 'contrato') {
      ;({ error } = await supabase
        .from('contracts')
        .update({
          start_date: newStart,
          end_date: newEndExclusive ? addDaysISO(newEndExclusive, -1) : null,
        })
        .eq('id', id))
    } else if (stay.kind === 'bloqueo') {
      ;({ error } = await supabase
        .from('unit_blocks')
        .update({
          start_date: newStart,
          end_date: newEndExclusive ? addDaysISO(newEndExclusive, -1) : newStart,
        })
        .eq('id', id))
    }
    setSavingChange(false)
    setPendingChange(null)
    if (error) setActionError(`No se pudo guardar: ${error.message}`)
    else setReloadKey((k) => k + 1)
  }

  // "sale el" para mostrar en la confirmación: reservación usa check_out;
  // contrato/bloqueo usan end_date (endExclusive - 1).
  const moveOutOf = (kind: CalendarStay['kind'], endExclusive: string | null) => {
    if (!endExclusive) return null
    return kind === 'reservacion' ? endExclusive : addDaysISO(endExclusive, -1)
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
                            let startPos = b.clippedStart ? 0 : b.startIdx + 0.5
                            let endPos = b.clippedEnd
                              ? days
                              : Math.min(days, b.startIdx + b.span + 0.5)
                            // Ghost durante el drag: la barra sigue al puntero
                            const dragging = drag?.key === b.stay.key ? drag : null
                            if (dragging) {
                              if (dragging.mode !== 'resize-r') startPos += dragging.delta
                              if (dragging.mode !== 'resize-l') endPos += dragging.delta
                              startPos = Math.max(0, Math.min(days - 0.4, startPos))
                              endPos = Math.max(startPos + 0.4, Math.min(days, endPos))
                            }
                            const len = Math.max(0.4, endPos - startPos)
                            const showText = len / days > 0.045
                            const draggable = b.stay.kind !== 'hold'
                            return (
                              <button
                                key={b.stay.key}
                                onPointerDown={(e) => {
                                  if (!draggable) return
                                  const track = e.currentTarget.parentElement as HTMLElement
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  const offset = e.clientX - rect.left
                                  const edge = Math.min(12, rect.width / 4)
                                  let mode: DragState['mode'] =
                                    offset < edge
                                      ? 'resize-l'
                                      : offset > rect.width - edge
                                      ? 'resize-r'
                                      : 'move'
                                  // contrato sin fecha de fin: su orilla derecha no se estira
                                  if (mode === 'resize-r' && b.stay.endExclusive === null) mode = 'move'
                                  e.currentTarget.setPointerCapture(e.pointerId)
                                  setDrag({
                                    key: b.stay.key,
                                    mode,
                                    originX: e.clientX,
                                    colPx: track.clientWidth / days,
                                    delta: 0,
                                    moved: false,
                                    stay: b.stay,
                                  })
                                }}
                                onPointerMove={(e) => {
                                  const x = e.clientX
                                  setDrag((prev) => {
                                    if (!prev || prev.key !== b.stay.key) return prev
                                    const delta = Math.round((x - prev.originX) / prev.colPx)
                                    const moved = prev.moved || Math.abs(x - prev.originX) > 4
                                    if (delta === prev.delta && moved === prev.moved) return prev
                                    return { ...prev, delta, moved }
                                  })
                                }}
                                onPointerUp={() => {
                                  const d = drag
                                  setDrag(null)
                                  if (!d || d.key !== b.stay.key) return
                                  if (!d.moved || d.delta === 0) {
                                    setSelected(b.stay)
                                    return
                                  }
                                  const change = computeNewDates(d)
                                  if (!change) return
                                  const conflict = overlapConflict(change)
                                  if (conflict) {
                                    setActionError(
                                      `No se puede mover: se encima con ${conflict.person} (${formatDate(
                                        conflict.start,
                                      )} → ${conflict.moveOutDay ? formatDate(conflict.moveOutDay) : 'sin fin'}).`,
                                    )
                                    return
                                  }
                                  setActionError(null)
                                  setPendingChange(change)
                                }}
                                onClick={!draggable ? () => setSelected(b.stay) : undefined}
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
                                    cursor: draggable
                                      ? dragging
                                        ? 'grabbing'
                                        : 'grab'
                                      : 'pointer',
                                    ...(dragging ? { opacity: 0.85, zIndex: 5 } : {}),
                                  } as CSSProperties
                                }
                                title={`${b.stay.person} · ${b.stay.start} → ${
                                  b.stay.moveOutDay ?? 'sin fin'
                                } · arrastra para mover, orillas para extender`}
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

          {actionError && (
            <div
              className="flex items-center justify-between gap-3 text-sm rounded-lg px-3 py-2"
              style={{
                color: 'var(--baw-danger-fg)',
                backgroundColor: 'var(--baw-danger-bg)',
                border: '1px solid var(--baw-danger-border)',
              }}
            >
              <span>{actionError}</span>
              <button onClick={() => setActionError(null)} className="text-xs underline shrink-0">
                Cerrar
              </button>
            </div>
          )}

          <p className="text-xs muted-text">
            Arrastra una barra para mover la estancia (orillas para extender/recortar) — se pide
            confirmación antes de guardar · click simple abre el detalle · click en la unidad abre
            su calendario mensual con precios por noche.
          </p>
        </>
      )}

      <ConfirmModal
        isOpen={pendingChange !== null}
        onClose={() => setPendingChange(null)}
        onConfirm={applyPendingChange}
        title="Confirmar cambio de fechas"
        description={
          pendingChange
            ? `${pendingChange.stay.person} · ${unitLabelFor(pendingChange.stay) ?? ''}: de ${formatDate(
                pendingChange.stay.start,
              )} → ${
                pendingChange.stay.moveOutDay ? formatDate(pendingChange.stay.moveOutDay) : 'sin fin'
              } a ${formatDate(pendingChange.newStart)} → ${
                moveOutOf(pendingChange.stay.kind, pendingChange.newEndExclusive)
                  ? formatDate(moveOutOf(pendingChange.stay.kind, pendingChange.newEndExclusive)!)
                  : 'sin fin'
              }`
            : ''
        }
        confirmText={savingChange ? 'Guardando…' : 'Aplicar cambio'}
        variant="default"
      />

      <StayDrawer
        stay={selected}
        unitLabel={unitLabelFor(selected)}
        onClose={() => setSelected(null)}
        onDelete={
          selected?.kind === 'bloqueo'
            ? async () => {
                if (!window.confirm('¿Eliminar este bloqueo?')) return
                const { error } = await supabase
                  .from('unit_blocks')
                  .delete()
                  .eq('id', selected.key.slice(2))
                setSelected(null)
                if (error) setActionError(`No se pudo eliminar: ${error.message}`)
                else setReloadKey((k) => k + 1)
              }
            : null
        }
      />
    </div>
  )
}
