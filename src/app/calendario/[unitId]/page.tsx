'use client'

// BaW OS — Calendario de unidades · Vista B (mensual por unidad).
//
// Modelo Airbnb host: meses apilados con scroll vertical. Cada día muestra la
// ocupación (banda con el color del tipo de estancia) y el precio por noche
// (tarifa base de la unidad × multiplicador de temporada de str_seasons —
// misma fórmula que el cotizador). Read-only en esta fase; la edición de
// temporadas/tarifas desde el calendario llega en el siguiente PR.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useActiveContext } from '@/lib/useActiveContext'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import StayDrawer from '@/components/calendar/StayDrawer'
import {
  TYPE_BADGE,
  HOLD_STRIPES,
  SEASON_CHIP,
  barClassFor,
} from '@/components/calendar/calendar-ui'
import type { CalendarStay, Season } from '@/lib/calendar-occupancy'
import {
  todayISO,
  addDaysISO,
  contractToStay,
  reservationToStay,
  holdToStay,
  seasonForDate,
  nightlyPrice,
  monthMatrix,
  monthLabel,
  monthRange,
} from '@/lib/calendar-occupancy'
import { formatCurrency } from '@/lib/utils'
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
  const [loading, setLoading] = useState(true)
  const [monthsBack, setMonthsBack] = useState(0)
  const [monthsAhead, setMonthsAhead] = useState(6)
  const [selected, setSelected] = useState<CalendarStay | null>(null)

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

        const merged: CalendarStay[] = [
          ...((contractsRes.data ?? []) as any[]).map(contractToStay),
          ...((reservationsRes.data ?? []) as any[]).map(reservationToStay),
          ...((holdsRes.data ?? []) as any[]).map(holdToStay),
        ].filter((s): s is CalendarStay => s !== null)

        if (alive) {
          setUnit((unitRes.data as UnitDetail | null) ?? null)
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
  }, [ctxLoading, activeOrgId, unitId])

  const months = useMemo(
    () => monthRange(today, monthsBack, monthsAhead),
    [today, monthsBack, monthsAhead],
  )

  function staysCovering(iso: string): CalendarStay[] {
    return stays.filter(
      (s) => s.start <= iso && (s.endExclusive === null || iso < s.endExclusive),
    )
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
          <span
            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
              unit.type === 'STR' || unit.type === 'MTR' || unit.type === 'LTR'
                ? TYPE_BADGE[unit.type]
                : 'bg-gray-500/10 text-gray-500 border border-gray-500/20'
            }`}
          >
            {unit.type}
          </span>
        </div>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          {building ? `${building.name} · ` : ''}
          {showPrices
            ? `Tarifa base ${formatCurrency(unit.base_rate_mxn!)}/noche`
            : 'Sin tarifa base por noche configurada'}
          {unit.monthly_rate_mxn != null
            ? ` · Renta mensual ${formatCurrency(unit.monthly_rate_mxn)}/mes`
            : ''}
          {showPrices ? ' · precio/día = base × temporada' : ''}
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
      <div className="space-y-8 max-w-3xl">
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
                    <div key={d} className="text-center text-[11px] uppercase tracking-wide muted-text py-1">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {cells.map((cell) => {
                    if (!cell.inMonth) {
                      return <div key={cell.iso} className="min-h-[72px]" />
                    }
                    const covering = staysCovering(cell.iso)
                    // La banda pinta la estancia "más firme": no-hold primero
                    const band =
                      covering.find((s) => s.kind !== 'hold' && !s.tentative) ??
                      covering.find((s) => s.kind !== 'hold') ??
                      covering[0] ??
                      null
                    const isStart = band ? band.start === cell.iso : false
                    const isEnd = band
                      ? band.endExclusive !== null && addDaysISO(cell.iso, 1) === band.endExclusive
                      : false
                    const season = seasonForDate(seasons, cell.iso)
                    const price = showPrices
                      ? nightlyPrice(unit.base_rate_mxn, seasons, cell.iso)
                      : null
                    const isPast = cell.iso < today
                    const isToday = cell.iso === today

                    return (
                      <button
                        key={cell.iso}
                        onClick={() => band && setSelected(band)}
                        disabled={!band}
                        className={`relative min-h-[72px] p-1 text-left border border-black/[0.04] dark:border-white/[0.04] transition-colors ${
                          band ? 'cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.03]' : 'cursor-default'
                        } ${season ? 'bg-emerald-500/[0.06]' : ''} ${isPast ? 'opacity-55' : ''}`}
                        title={
                          band
                            ? `${band.person} · ${band.start} → ${band.moveOutDay ?? 'sin fin'}`
                            : season
                            ? `${season.name} ×${season.price_multiplier}`
                            : cell.iso
                        }
                      >
                        <span
                          className={`text-xs tabular-nums ${
                            isToday
                              ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white font-semibold'
                              : 'muted-text'
                          }`}
                        >
                          {cell.day}
                        </span>

                        {/* Banda de ocupación */}
                        {band && (
                          <span
                            className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 h-5 border text-[10px] font-medium truncate px-1 leading-[18px] ${barClassFor(
                              band.kind,
                              band.type,
                              band.tentative,
                            )} ${isStart ? 'rounded-l-md ml-0.5' : ''} ${
                              isEnd ? 'rounded-r-md mr-0.5' : ''
                            }`}
                            style={band.kind === 'hold' ? HOLD_STRIPES : undefined}
                          >
                            {isStart ? band.person : ''}
                          </span>
                        )}

                        {/* Precio por noche (solo días libres para no encimar) */}
                        {price !== null && !band && (
                          <span
                            className={`absolute bottom-1 right-1 text-[10px] tabular-nums ${
                              season
                                ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                : 'muted-text'
                            }`}
                            title={
                              season
                                ? `${formatCurrency(price)} · ${season.name} ×${season.price_multiplier}`
                                : formatCurrency(price)
                            }
                          >
                            ${price.toLocaleString('es-MX')}
                          </span>
                        )}
                      </button>
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
      <div className="flex flex-wrap items-center gap-3 text-xs muted-text">
        <span className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded ${SEASON_CHIP}`} /> Día en temporada (precio ×
          multiplicador)
        </span>
        <span className="flex items-center gap-1.5 opacity-60">
          <span className="w-3 h-3 rounded border border-dashed border-gray-400 bg-gray-400/30" />{' '}
          Tentativa / hold
        </span>
      </div>

      <StayDrawer
        stay={selected}
        unitLabel={`Unidad ${unit.number}${building ? ` · ${building.name}` : ''}`}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
