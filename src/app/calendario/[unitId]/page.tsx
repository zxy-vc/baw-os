'use client'

// BaW OS — Calendario de unidades · Vista B (mensual por unidad).
//
// Modelo Airbnb host: meses apilados con scroll vertical. Cada día muestra la
// ocupación (banda con instrumento, half-day en check-in/out) y el precio por
// noche (tarifa base × multiplicador de temporada — misma fórmula que /quotes).
//
// AQUÍ vive el price management: arrastra sobre días libres para seleccionar
// un rango → panel con desglose de precio, crear/editar temporadas
// (str_seasons, misma tabla que usa el cotizador y /pricing), editar la tarifa
// base de la unidad, y crear una reservación con las fechas prellenadas.

import { useEffect, useMemo, useState, useCallback, type CSSProperties } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CalendarDays, X, Trash2, BedDouble, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useActiveContext } from '@/lib/useActiveContext'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import StayDrawer from '@/components/calendar/StayDrawer'
import { INSTR_VAR, instrVarFor, unitTypeVar } from '@/components/calendar/calendar-ui'
import type { CalendarStay, Season, RateOverride } from '@/lib/calendar-occupancy'
import {
  todayISO,
  addDaysISO,
  diffDaysISO,
  contractToStay,
  reservationToStay,
  holdToStay,
  blockToStay,
  seasonForDate,
  overrideForDate,
  nightlyPrice,
  monthMatrix,
  monthLabel,
  monthRange,
} from '@/lib/calendar-occupancy'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { UnitType } from '@/types'

interface UnitDetail {
  id: string
  number: string
  floor: number | null
  type: UnitType
  status: string
  base_rate_mxn: number | null
  monthly_rate_mxn: number | null
  is_publicly_bookable: boolean | null
  building: { id: string; name: string } | { id: string; name: string }[] | null
}

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

export default function UnidadCalendarioPage() {
  const params = useParams()
  const unitId = params.unitId as string
  const { activeOrgId, loading: ctxLoading } = useActiveContext()

  const today = todayISO()
  const [unit, setUnit] = useState<UnitDetail | null>(null)
  const [stays, setStays] = useState<CalendarStay[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [overrides, setOverrides] = useState<RateOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [monthsBack, setMonthsBack] = useState(0)
  const [monthsAhead, setMonthsAhead] = useState(6)
  const [selected, setSelected] = useState<CalendarStay | null>(null)

  // Selección de rango (drag sobre días libres)
  const [selAnchor, setSelAnchor] = useState<string | null>(null)
  const [selEnd, setSelEnd] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (ctxLoading) return
    if (!activeOrgId || !unitId) {
      setLoading(false)
      return
    }
    let alive = true

    async function load(orgId: string) {
      setLoading(true)
      try {
        const [unitRes, contractsRes, reservationsRes, holdsRes, seasonsRes] = await Promise.all([
          supabase
            .from('units')
            .select('id, number, floor, type, status, base_rate_mxn, monthly_rate_mxn, is_publicly_bookable, building:buildings(id, name)')
            .eq('id', unitId)
            .eq('org_id', orgId)
            .maybeSingle(),
          supabase
            .from('contracts')
            .select('id, unit_id, rent_type, status, monthly_amount, start_date, end_date, notes, occupant:occupants(name)')
            .eq('org_id', orgId)
            .eq('unit_id', unitId)
            .is('archived_at', null),
          // reservations filtra por organization_id (esquema histórico)
          supabase
            .from('reservations')
            .select('id, unit_id, guest_name, check_in, check_out, status, payment_status, total_price, guests_count, channel, notes')
            .eq('organization_id', orgId)
            .eq('unit_id', unitId),
          supabase
            .from('reservation_holds')
            .select('id, unit_id, from_date, to_date, guests_count, guest_email, expires_at')
            .eq('unit_id', unitId)
            .gt('expires_at', new Date().toISOString()),
          supabase.from('str_seasons').select('*').order('start_date'),
        ])

        // Fase 3: bloqueos + overrides de precio. Si la migración 20260703_03
        // no está aplicada, estas queries fallan y degradamos sin ellas.
        const [blocksRes, overridesRes] = await Promise.all([
          supabase
            .from('unit_blocks')
            .select('id, unit_id, start_date, end_date, reason, notes')
            .eq('unit_id', unitId),
          supabase
            .from('unit_rate_overrides')
            .select('id, unit_id, start_date, end_date, nightly_rate_mxn, notes')
            .eq('unit_id', unitId)
            .order('start_date'),
        ])

        const merged: CalendarStay[] = [
          ...((contractsRes.data ?? []) as any[]).map(contractToStay),
          ...((reservationsRes.data ?? []) as any[]).map(reservationToStay),
          ...((blocksRes.data ?? []) as any[]).map(blockToStay),
          ...((holdsRes.data ?? []) as any[]).map(holdToStay),
        ].filter((s): s is CalendarStay => s !== null)

        if (alive) {
          setUnit((unitRes.data as UnitDetail | null) ?? null)
          setStays(merged)
          setSeasons((seasonsRes.data ?? []) as Season[])
          setOverrides((overridesRes.data ?? []) as RateOverride[])
        }
      } finally {
        if (alive) setLoading(false)
      }
    }

    load(activeOrgId)
    return () => {
      alive = false
    }
  }, [ctxLoading, activeOrgId, unitId, reloadKey])

  // Terminar el drag donde sea que suelte el pointer
  useEffect(() => {
    function onUp() {
      setDragging(false)
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [])

  const months = useMemo(
    () => monthRange(today, monthsBack, monthsAhead),
    [today, monthsBack, monthsAhead],
  )

  const coveringOf = useCallback(
    (iso: string): CalendarStay[] =>
      stays.filter(
        (s) => s.start <= iso && (s.endExclusive === null || iso < s.endExclusive),
      ),
    [stays],
  )
  const endingOf = useCallback(
    (iso: string): CalendarStay[] => stays.filter((s) => s.endExclusive === iso),
    [stays],
  )
  const isFree = useCallback((iso: string) => coveringOf(iso).length === 0, [coveringOf])

  /** Extiende la selección desde el ancla hacia target sin cruzar días ocupados. */
  const clampToFree = useCallback(
    (anchor: string, target: string): string => {
      const step = target >= anchor ? 1 : -1
      let cur = anchor
      while (cur !== target) {
        const next = addDaysISO(cur, step)
        if (!isFree(next)) break
        cur = next
      }
      return cur
    },
    [isFree],
  )

  const selection = useMemo(() => {
    if (!selAnchor || !selEnd) return null
    const a = selAnchor <= selEnd ? selAnchor : selEnd
    const b = selAnchor <= selEnd ? selEnd : selAnchor
    return { from: a, to: b, nights: diffDaysISO(a, b) + 1, checkOut: addDaysISO(b, 1) }
  }, [selAnchor, selEnd])

  function clearSelection() {
    setSelAnchor(null)
    setSelEnd(null)
    setDragging(false)
  }

  const building = one(unit?.building ?? null)
  const showPrices = unit?.base_rate_mxn != null

  if (ctxLoading || loading) {
    return (
      <div className="space-y-6">
        <SkeletonTable />
      </div>
    )
  }

  if (!activeOrgId) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Sin organización activa"
        description="Selecciona una organización en el switcher del sidebar."
      />
    )
  }

  if (!unit) {
    return (
      <div className="space-y-4">
        <Link
          href="/calendario"
          className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-400"
        >
          <ArrowLeft className="w-4 h-4" /> Volver al calendario
        </Link>
        <EmptyState
          icon={CalendarDays}
          title="Unidad no encontrada"
          description="La unidad no existe o pertenece a otra organización."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/calendario"
          className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-400 mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> Todas las unidades
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-indigo-400" />
            Unidad {unit.number}
          </h1>
          <span className="tl-chip" style={{ '--c': unitTypeVar(unit.type) } as CSSProperties}>
            {unit.type}
          </span>
        </div>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          {building ? `${building.name} · ` : ''}
          {showPrices
            ? `Tarifa base ${formatCurrency(unit.base_rate_mxn!)}/noche · precio/día = base × temporada`
            : 'Sin tarifa base por noche configurada'}
          {unit.monthly_rate_mxn != null
            ? ` · Renta mensual ${formatCurrency(unit.monthly_rate_mxn)}/mes`
            : ''}
        </p>
        <p className="text-xs muted-text mt-1">
          Arrastra sobre días libres para seleccionar un rango: cotiza, fija precio de esta
          unidad, crea/edita temporadas, bloquea el rango o crea una reservación con las fechas
          prellenadas.
        </p>
      </div>

      {/* Cargar meses anteriores */}
      <button
        onClick={() => setMonthsBack((n) => n + 3)}
        className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 muted-text"
      >
        ← Cargar meses anteriores
      </button>

      {/* Meses apilados */}
      <div className="space-y-8 max-w-3xl select-none">
        {months.map(({ year, month }) => {
          const cells = monthMatrix(year, month)
          return (
            <section key={`${year}-${month}`}>
              <h2
                className="text-base font-semibold capitalize mb-2"
                style={{ color: 'var(--baw-text)' }}
              >
                {monthLabel(year, month)}
              </h2>
              <div className="card p-2">
                <div className="grid grid-cols-7 mb-1">
                  {WEEKDAYS.map((d) => (
                    <div
                      key={d}
                      className="text-center text-[11px] uppercase tracking-wide muted-text py-1"
                    >
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {cells.map((cell) => {
                    if (!cell.inMonth) {
                      return <div key={cell.iso} className="min-h-[72px]" />
                    }
                    const covering = coveringOf(cell.iso)
                    const band =
                      covering.find((s) => s.kind !== 'hold' && !s.tentative) ??
                      covering.find((s) => s.kind !== 'hold') ??
                      covering[0] ??
                      null
                    const ending = endingOf(cell.iso)[0] ?? null
                    const isStart = band ? band.start === cell.iso : false
                    const isBandEnd = band
                      ? band.endExclusive !== null &&
                        addDaysISO(cell.iso, 1) === band.endExclusive
                      : false
                    const season = seasonForDate(seasons, cell.iso)
                    const override = overrideForDate(overrides, cell.iso)
                    const price = nightlyPrice(unit.base_rate_mxn, seasons, cell.iso, overrides)
                    const isPast = cell.iso < today
                    const isToday = cell.iso === today
                    const free = !band
                    const inSelection =
                      selection !== null &&
                      cell.iso >= selection.from &&
                      cell.iso <= selection.to

                    return (
                      <div
                        key={cell.iso}
                        onPointerDown={() => {
                          if (!free) return
                          setSelAnchor(cell.iso)
                          setSelEnd(cell.iso)
                          setDragging(true)
                        }}
                        onPointerEnter={() => {
                          if (dragging && selAnchor) setSelEnd(clampToFree(selAnchor, cell.iso))
                        }}
                        onClick={() => {
                          const target = band ?? ending
                          if (target) {
                            clearSelection()
                            setSelected(target)
                          }
                        }}
                        className={`relative min-h-[72px] p-1 border border-black/[0.04] dark:border-white/[0.04] transition-colors ${
                          band || ending ? 'cursor-pointer' : 'cursor-crosshair'
                        } ${season && !inSelection ? 'bg-emerald-500/[0.06]' : ''} ${
                          isPast ? 'opacity-55' : ''
                        } ${inSelection ? 'cal-cell--sel' : ''} hover:bg-black/[0.02] dark:hover:bg-white/[0.02]`}
                        title={
                          band
                            ? `${band.person} · ${band.start} → ${band.moveOutDay ?? 'sin fin'}`
                            : season
                            ? `${season.name} ×${season.price_multiplier}`
                            : cell.iso
                        }
                      >
                        <span
                          className={`relative z-10 text-xs tabular-nums ${
                            isToday
                              ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white font-semibold'
                              : 'muted-text'
                          }`}
                        >
                          {cell.day}
                        </span>

                        {/* Banda que TERMINA hoy (check-out por la mañana) */}
                        {ending && (!band || band.key !== ending.key) && (
                          <span
                            className={`cal-band cal-band--end ${
                              ending.kind === 'hold'
                                ? 'cal-band--hold'
                                : ending.kind === 'bloqueo'
                                ? 'cal-band--block'
                                : ending.tentative
                                ? 'cal-band--tent'
                                : ''
                            }`}
                            style={
                              {
                                left: 0,
                                width: '50%',
                                '--bar': instrVarFor(ending.kind, ending.type),
                              } as CSSProperties
                            }
                          />
                        )}

                        {/* Banda de ocupación (check-in arranca a mitad de día) */}
                        {band && (
                          <span
                            className={`cal-band ${isStart ? 'cal-band--start' : ''} ${
                              isBandEnd ? 'cal-band--end' : ''
                            } ${
                              band.kind === 'hold'
                                ? 'cal-band--hold'
                                : band.kind === 'bloqueo'
                                ? 'cal-band--block'
                                : band.tentative
                                ? 'cal-band--tent'
                                : ''
                            }`}
                            style={
                              {
                                left: isStart ? '50%' : 0,
                                right: 0,
                                '--bar': instrVarFor(band.kind, band.type),
                              } as CSSProperties
                            }
                          >
                            {isStart ? band.person : ''}
                          </span>
                        )}

                        {/* Precio por noche (solo días sin banda, no encima).
                            Override por unidad → indigo; temporada → esmeralda. */}
                        {price !== null && !band && (
                          <span
                            className={`absolute bottom-1 right-1 text-[10px] tabular-nums ${
                              override
                                ? 'text-indigo-500 dark:text-indigo-400 font-semibold underline decoration-dotted'
                                : season
                                ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                : 'muted-text'
                            }`}
                            title={
                              override
                                ? `Precio fijo de esta unidad (${override.start_date} → ${override.end_date})`
                                : season
                                ? `${season.name} ×${season.price_multiplier}`
                                : undefined
                            }
                          >
                            ${price.toLocaleString('es-MX')}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          )
        })}
      </div>

      {/* Cargar más meses */}
      <button
        onClick={() => setMonthsAhead((n) => n + 3)}
        className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 muted-text"
      >
        Cargar más meses →
      </button>

      {/* Leyenda */}
      <div className="tl-legend">
        <button aria-pressed="true" style={{ '--bar': INSTR_VAR.STR } as CSSProperties} disabled>
          <i /> STR
        </button>
        <button aria-pressed="true" style={{ '--bar': INSTR_VAR.MTR } as CSSProperties} disabled>
          <i /> MTR
        </button>
        <button aria-pressed="true" style={{ '--bar': INSTR_VAR.LTR } as CSSProperties} disabled>
          <i /> LTR
        </button>
        <button aria-pressed="true" style={{ '--bar': INSTR_VAR.hold } as CSSProperties} disabled>
          <i /> Hold
        </button>
        <button aria-pressed="true" style={{ '--bar': INSTR_VAR.block } as CSSProperties} disabled>
          <i /> Bloqueo
        </button>
        <button aria-pressed="true" style={{ '--bar': INSTR_VAR.season } as CSSProperties} disabled>
          <i /> Temporada
        </button>
      </div>

      {/* Panel de rango seleccionado (price management) */}
      {selection && !selected && (
        <RangePanel
          unit={unit}
          orgId={activeOrgId}
          selection={selection}
          seasons={seasons}
          overrides={overrides}
          onClose={clearSelection}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}

      <StayDrawer
        stay={selected}
        unitLabel={`Unidad ${unit.number}${building ? ` · ${building.name}` : ''}`}
        onClose={() => setSelected(null)}
        onDelete={
          selected?.kind === 'bloqueo'
            ? async () => {
                if (!window.confirm('¿Eliminar este bloqueo?')) return
                await supabase.from('unit_blocks').delete().eq('id', selected.key.slice(2))
                setSelected(null)
                setReloadKey((k) => k + 1)
              }
            : null
        }
      />
    </div>
  )
}

/* ──────────────────────────── Panel de rango ──────────────────────────── */

function RangePanel({
  unit,
  orgId,
  selection,
  seasons,
  overrides,
  onClose,
  onChanged,
}: {
  unit: UnitDetail
  orgId: string
  selection: { from: string; to: string; nights: number; checkOut: string }
  seasons: Season[]
  overrides: RateOverride[]
  onClose: () => void
  onChanged: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newSeasonName, setNewSeasonName] = useState('')
  const [newSeasonMult, setNewSeasonMult] = useState('1.2')
  const [baseRate, setBaseRate] = useState(unit.base_rate_mxn != null ? String(unit.base_rate_mxn) : '')
  const [seasonEdits, setSeasonEdits] = useState<Record<string, { name: string; mult: string }>>({})
  const [newOverridePrice, setNewOverridePrice] = useState('')
  const [overrideEdits, setOverrideEdits] = useState<Record<string, string>>({})
  const [blockReason, setBlockReason] = useState('maintenance')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const overlapping = useMemo(
    () =>
      seasons.filter((s) => !(s.end_date < selection.from || s.start_date > selection.to)),
    [seasons, selection],
  )

  const overlappingOverrides = useMemo(
    () =>
      overrides.filter((o) => !(o.end_date < selection.from || o.start_date > selection.to)),
    [overrides, selection],
  )

  const total = useMemo(() => {
    let sum = 0
    let priced = 0
    for (let iso = selection.from; iso <= selection.to; iso = addDaysISO(iso, 1)) {
      const p = nightlyPrice(unit.base_rate_mxn, seasons, iso, overrides)
      if (p !== null) {
        sum += p
        priced++
      }
    }
    return priced > 0 ? sum : null
  }, [unit.base_rate_mxn, seasons, overrides, selection])

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setSaving(true)
    setError(null)
    const { error: err } = await action()
    setSaving(false)
    if (err) {
      setError(`No se pudo guardar: ${err.message}`)
      return false
    }
    onChanged()
    return true
  }

  async function createSeason() {
    if (!newSeasonName.trim()) {
      setError('Ponle nombre a la temporada.')
      return
    }
    const ok = await run(() =>
      supabase.from('str_seasons').insert({
        org_id: orgId,
        name: newSeasonName.trim(),
        start_date: selection.from,
        end_date: selection.to,
        price_multiplier: Number(newSeasonMult) || 1,
        notes: null,
      }),
    )
    if (ok) setNewSeasonName('')
  }

  async function saveSeason(s: Season) {
    const edit = seasonEdits[s.id]
    if (!edit) return
    await run(() =>
      supabase
        .from('str_seasons')
        .update({ name: edit.name, price_multiplier: Number(edit.mult) || 1 })
        .eq('id', s.id),
    )
  }

  async function deleteSeason(s: Season) {
    if (!window.confirm(`¿Eliminar la temporada "${s.name}"?`)) return
    await run(() => supabase.from('str_seasons').delete().eq('id', s.id))
  }

  async function saveBaseRate() {
    const value = baseRate === '' ? null : Number(baseRate)
    await run(() => supabase.from('units').update({ base_rate_mxn: value }).eq('id', unit.id))
  }

  async function createOverride() {
    const price = Number(newOverridePrice)
    if (!price || price <= 0) {
      setError('Pon un precio por noche válido para el override.')
      return
    }
    const ok = await run(() =>
      supabase.from('unit_rate_overrides').insert({
        org_id: orgId,
        unit_id: unit.id,
        start_date: selection.from,
        end_date: selection.to,
        nightly_rate_mxn: price,
        notes: null,
      }),
    )
    if (ok) setNewOverridePrice('')
  }

  async function saveOverride(o: RateOverride) {
    const edit = overrideEdits[o.id]
    if (edit === undefined) return
    const price = Number(edit)
    if (!price || price <= 0) {
      setError('Precio de override inválido.')
      return
    }
    await run(() =>
      supabase.from('unit_rate_overrides').update({ nightly_rate_mxn: price }).eq('id', o.id),
    )
  }

  async function deleteOverride(o: RateOverride) {
    if (!window.confirm(`¿Quitar el precio fijo ${formatCurrency(Number(o.nightly_rate_mxn))} (${o.start_date} → ${o.end_date})?`)) return
    await run(() => supabase.from('unit_rate_overrides').delete().eq('id', o.id))
  }

  async function createBlock() {
    await run(() =>
      supabase.from('unit_blocks').insert({
        org_id: orgId,
        unit_id: unit.id,
        start_date: selection.from,
        end_date: selection.to,
        reason: blockReason,
        notes: null,
      }),
    )
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm flex flex-col overflow-y-auto p-5 space-y-5 shadow-2xl"
      style={{ backgroundColor: 'var(--baw-surface)', borderLeft: '1px solid var(--baw-border)' }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold" style={{ color: 'var(--baw-text)' }}>
            {formatDate(selection.from)} → {formatDate(selection.to)}
          </h3>
          <p className="text-xs muted-text mt-0.5">
            {selection.nights} noche{selection.nights === 1 ? '' : 's'} · check-out{' '}
            {formatDate(selection.checkOut)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4 muted-text" />
        </button>
      </div>

      {total !== null && (
        <div className="rounded-lg p-3" style={{ border: '1px solid var(--baw-border)' }}>
          <p className="text-xs uppercase tracking-wide muted-text mb-1">Estimado del rango</p>
          <p className="text-lg font-semibold" style={{ color: 'var(--baw-text)' }}>
            {formatCurrency(total)}
            <span className="text-xs muted-text font-normal"> · base × temporada, sin limpieza/IVA</span>
          </p>
        </div>
      )}

      {/* Acciones de creación */}
      <div className="flex gap-2">
        <Link
          href={`/reservations?unit_id=${unit.id}&check_in=${selection.from}&check_out=${selection.checkOut}`}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          <BedDouble className="w-4 h-4" /> Crear reservación
        </Link>
        <Link
          href="/contracts/new"
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
          style={{ color: 'var(--baw-text)' }}
        >
          <FileText className="w-4 h-4" /> Contrato
        </Link>
      </div>

      {/* Tarifa base */}
      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-wide muted-text">Tarifa base por noche (MXN)</p>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            value={baseRate}
            onChange={(e) => setBaseRate(e.target.value)}
            placeholder="—"
            className="input-field flex-1 text-sm py-1.5"
          />
          <button
            onClick={saveBaseRate}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
            style={{ color: 'var(--baw-text)' }}
          >
            Guardar
          </button>
        </div>
      </div>

      {/* Precio fijo por unidad (override, gana sobre base × temporada) */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide muted-text">
          Precio fijo de esta unidad ({overlappingOverrides.length})
        </p>
        {overlappingOverrides.map((o) => (
          <div key={o.id} className="rounded-lg p-2.5 space-y-1.5" style={{ border: '1px solid var(--baw-border)' }}>
            <p className="text-[10px] font-mono muted-text">
              {o.start_date} → {o.end_date}
            </p>
            <div className="flex gap-2 items-center">
              <span className="text-xs muted-text">$</span>
              <input
                type="number"
                min={0}
                value={overrideEdits[o.id] ?? String(o.nightly_rate_mxn)}
                onChange={(e) =>
                  setOverrideEdits((prev) => ({ ...prev, [o.id]: e.target.value }))
                }
                className="input-field w-28 text-sm py-1"
              />
              <span className="text-xs muted-text">/noche</span>
              <button
                onClick={() => saveOverride(o)}
                disabled={saving || overrideEdits[o.id] === undefined}
                className="text-xs px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                style={{ color: 'var(--baw-text)' }}
              >
                Guardar
              </button>
              <button
                onClick={() => deleteOverride(o)}
                disabled={saving}
                className="text-xs px-2 py-1 rounded-md text-red-500 hover:bg-red-500/10 inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
        <div className="rounded-lg p-2.5 space-y-1.5" style={{ border: '1px dashed var(--baw-border)' }}>
          <p className="text-xs muted-text">Fijar precio por noche SOLO para esta unidad en el rango</p>
          <div className="flex gap-2 items-center">
            <span className="text-xs muted-text">$</span>
            <input
              type="number"
              min={0}
              value={newOverridePrice}
              onChange={(e) => setNewOverridePrice(e.target.value)}
              placeholder="p.ej. 1800"
              className="input-field w-28 text-sm py-1"
            />
            <span className="text-xs muted-text">/noche</span>
            <button
              onClick={createOverride}
              disabled={saving}
              className="text-xs px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
            >
              Fijar precio
            </button>
          </div>
          <p className="text-[10px] muted-text">
            Gana sobre tarifa base × temporada. Requiere la migración 20260703_03 aplicada.
          </p>
        </div>
      </div>

      {/* Temporadas que tocan el rango */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide muted-text">
          Temporadas en el rango ({overlapping.length})
        </p>
        {overlapping.map((s) => {
          const edit = seasonEdits[s.id] ?? { name: s.name, mult: String(s.price_multiplier) }
          return (
            <div key={s.id} className="rounded-lg p-2.5 space-y-1.5" style={{ border: '1px solid var(--baw-border)' }}>
              <p className="text-[10px] font-mono muted-text">
                {s.start_date} → {s.end_date}
              </p>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={edit.name}
                  onChange={(e) =>
                    setSeasonEdits((prev) => ({ ...prev, [s.id]: { ...edit, name: e.target.value } }))
                  }
                  className="input-field flex-1 text-sm py-1"
                />
                <span className="text-xs muted-text">×</span>
                <input
                  type="number"
                  step="0.05"
                  min={0.1}
                  value={edit.mult}
                  onChange={(e) =>
                    setSeasonEdits((prev) => ({ ...prev, [s.id]: { ...edit, mult: e.target.value } }))
                  }
                  className="input-field w-20 text-sm py-1"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => saveSeason(s)}
                  disabled={saving || !seasonEdits[s.id]}
                  className="text-xs px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                  style={{ color: 'var(--baw-text)' }}
                >
                  Guardar cambios
                </button>
                <button
                  onClick={() => deleteSeason(s)}
                  disabled={saving}
                  className="text-xs px-2 py-1 rounded-md text-red-500 hover:bg-red-500/10 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Eliminar
                </button>
              </div>
            </div>
          )
        })}

        {/* Crear temporada con el rango seleccionado */}
        <div className="rounded-lg p-2.5 space-y-1.5" style={{ border: '1px dashed var(--baw-border)' }}>
          <p className="text-xs muted-text">Nueva temporada con este rango</p>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={newSeasonName}
              onChange={(e) => setNewSeasonName(e.target.value)}
              placeholder="Nombre (ej. Alta diciembre)"
              className="input-field flex-1 text-sm py-1"
            />
            <span className="text-xs muted-text">×</span>
            <input
              type="number"
              step="0.05"
              min={0.1}
              value={newSeasonMult}
              onChange={(e) => setNewSeasonMult(e.target.value)}
              className="input-field w-20 text-sm py-1"
            />
          </div>
          <button
            onClick={createSeason}
            disabled={saving}
            className="text-xs px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
          >
            Crear temporada
          </button>
          <p className="text-[10px] muted-text">
            Aplica a TODAS las unidades (multiplicador global de la organización, mismo motor que
            el cotizador).
          </p>
        </div>
      </div>

      {/* Bloqueo operativo del rango */}
      <div className="rounded-lg p-2.5 space-y-1.5" style={{ border: '1px dashed var(--baw-border)' }}>
        <p className="text-xs uppercase tracking-wide muted-text">Bloquear este rango</p>
        <div className="flex gap-2 items-center">
          <select
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            className="input-field flex-1 text-sm py-1"
          >
            <option value="maintenance">Mantenimiento</option>
            <option value="personal">Uso personal</option>
            <option value="other">Otro</option>
          </select>
          <button
            onClick={createBlock}
            disabled={saving}
            className="text-xs px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
          >
            Bloquear
          </button>
        </div>
        <p className="text-[10px] muted-text">
          La unidad se pinta como no disponible esos días (sin tocar su status). El bloqueo se
          puede mover/quitar desde el timeline. Requiere la migración 20260703_03.
        </p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
