'use client'

// BaW OS — Cotizador (fuente de precio unificada, 2026-07-03).
//
// Antes leía la tabla legacy `unit_prices` (unit_id texto, $/persona/noche,
// sin org) mientras el sitio público y el calendario usaban `units
// .base_rate_mxn` — dos verdades de precio conviviendo. Ahora TODO cotiza
// desde `units` (org-filtrado) con la misma fórmula que el booking público y
// /calendario:
//
//   STR: base_rate_mxn ($/noche, unidad completa) × noches × temporada
//        + huéspedes extra sobre max_guests (+$250/pers/noche)
//        + limpieza (cleaning_fee_mxn) + IVA 16%
//   LTR: monthly_rate_mxn × meses (agua incluida, depósito 1 mes)
//
// `unit_prices` queda como tabla legacy sin lectores (deprecada, no borrada).

import { useEffect, useState, useRef } from 'react'
import { Calculator, Printer, FileText, CalendarPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrgContext } from '@/hooks/useOrgContext'
import { addDaysISO, nightlyPrice, type RateOverride } from '@/lib/calendar-occupancy'
import { formatCurrency } from '@/lib/utils'

interface QuoteUnit {
  id: string
  number: string
  floor: number | null
  type: string
  base_rate_mxn: number | null
  monthly_rate_mxn: number | null
  cleaning_fee_mxn: number | null
  max_guests: number | null
  min_nights: number | null
  building?: { name: string } | { name: string }[] | null
}

interface Season {
  id: string
  name: string
  start_date: string
  end_date: string
  price_multiplier: number
  notes: string | null
}

type Modality = 'LTR' | 'STR' | 'Corporativo'

interface Breakdown {
  basePrice: number
  extraPersonsFee: number
  subtotal: number
  discountAmount: number
  cleaningFee: number
  iva: number
  total: number
  label: string
  details: string[]
}

const EXTRA_PERSON_FEE = 250 // $/persona/noche sobre max_guests

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

export default function QuotesPage() {
  const { orgId, loading: orgLoading } = useOrgContext()
  const [units, setUnits] = useState<QuoteUnit[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [overrides, setOverrides] = useState<RateOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUnit, setSelectedUnit] = useState('')
  const [modality, setModality] = useState<Modality>('LTR')
  const [persons, setPersons] = useState(4)
  const [nights, setNights] = useState(3)
  const [months, setMonths] = useState(6)
  const [discount, setDiscount] = useState(0)
  const [checkInDate, setCheckInDate] = useState('')
  const [checkOutDate, setCheckOutDate] = useState('')
  const [showQuote, setShowQuote] = useState(false)
  const quoteRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (checkInDate && checkOutDate) {
      const inDate = new Date(checkInDate + 'T00:00:00')
      const outDate = new Date(checkOutDate + 'T00:00:00')
      const diffDays = Math.round((outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays >= 1) {
        setNights(diffDays)
      }
    }
  }, [checkInDate, checkOutDate])

  useEffect(() => {
    if (orgLoading) return
    if (!orgId) {
      setLoading(false)
      return
    }
    async function fetchData(org: string) {
      const [unitsRes, seasonsRes] = await Promise.all([
        supabase
          .from('units')
          .select('id, number, floor, type, base_rate_mxn, monthly_rate_mxn, cleaning_fee_mxn, max_guests, min_nights, building:buildings(name)')
          .eq('org_id', org)
          .is('archived_at', null)
          .order('floor')
          .order('number'),
        supabase.from('str_seasons').select('*').order('start_date'),
      ])
      setUnits((unitsRes.data as QuoteUnit[]) || [])
      setSeasons(seasonsRes.data || [])
      setLoading(false)
    }
    fetchData(orgId)
  }, [orgId, orgLoading])

  // Precios fijos por unidad+rango (unit_rate_overrides, fase 3 del
  // calendario): ganan sobre base × temporada, igual que en /calendario.
  // Si la tabla no existe aún en prod, la query falla y cotizamos sin ellos.
  useEffect(() => {
    if (!selectedUnit) {
      setOverrides([])
      return
    }
    let cancelled = false
    supabase
      .from('unit_rate_overrides')
      .select('id, unit_id, start_date, end_date, nightly_rate_mxn, notes')
      .eq('unit_id', selectedUnit)
      .then(({ data }) => {
        if (!cancelled) setOverrides((data ?? []) as RateOverride[])
      })
    return () => {
      cancelled = true
    }
  }, [selectedUnit])

  function getActiveSeason(date: string): Season | null {
    if (!date) return null
    return seasons.find((s) => date >= s.start_date && date <= s.end_date) || null
  }

  const unit = units.find((u) => u.id === selectedUnit)

  const strUnits = units.filter((u) => u.base_rate_mxn !== null)
  const ltrUnits = units.filter((u) => u.monthly_rate_mxn !== null)
  const availableUnits = modality === 'LTR' ? ltrUnits : strUnits

  const minNights = unit?.min_nights ?? 1
  const includedGuests = unit?.max_guests ?? 4

  function calculate(): Breakdown | null {
    if (!unit) return null

    if (modality === 'LTR') {
      if (unit.monthly_rate_mxn == null) return null
      const basePrice = unit.monthly_rate_mxn
      const subtotal = basePrice * months
      const discountAmount = subtotal * (discount / 100)
      const total = subtotal - discountAmount

      return {
        basePrice,
        extraPersonsFee: 0,
        subtotal,
        discountAmount,
        cleaningFee: 0,
        iva: 0,
        total,
        label: `${months} meses`,
        details: [
          `Renta mensual: ${formatCurrency(basePrice)} (agua incluida)`,
          `Período: ${months} meses`,
          `Depósito: ${formatCurrency(basePrice)} (1 mes)`,
        ],
      }
    }

    if (modality === 'STR' || modality === 'Corporativo') {
      if (unit.base_rate_mxn == null) return null

      const activeSeason = getActiveSeason(checkInDate)
      const seasonMultiplier = activeSeason ? Number(activeSeason.price_multiplier) : 1

      // Con fechas concretas: suma NOCHE POR NOCHE — cada día aplica su propia
      // temporada y sus precios fijos de unidad (misma resolución que el
      // calendario y el panel de rango). Sin fechas: base × temporada del
      // check-in × noches (estimación rápida).
      let basePrice: number
      let perDay = false
      if (checkInDate && checkOutDate && checkOutDate > checkInDate) {
        basePrice = 0
        for (let iso = checkInDate; iso < checkOutDate; iso = addDaysISO(iso, 1)) {
          basePrice += nightlyPrice(unit.base_rate_mxn, seasons, iso, overrides) ?? 0
        }
        perDay = true
      } else {
        basePrice = Math.round(unit.base_rate_mxn * seasonMultiplier) * nights
      }
      const pricePerNight = Math.round(basePrice / Math.max(1, nights))

      const extraPersons = Math.max(0, persons - includedGuests)
      const extraPersonsFee = extraPersons * EXTRA_PERSON_FEE * nights
      const subtotal = basePrice + extraPersonsFee
      const discountAmount = subtotal * (discount / 100)
      const cleaningFee = unit.cleaning_fee_mxn ?? 0
      const iva = (subtotal - discountAmount + cleaningFee) * 0.16
      const total = subtotal - discountAmount + cleaningFee + iva

      const hasOverrideInRange =
        perDay &&
        overrides.some((o) => !(o.end_date < checkInDate || o.start_date >= checkOutDate))

      return {
        basePrice,
        extraPersonsFee,
        subtotal,
        discountAmount,
        cleaningFee,
        iva,
        total,
        label: `${nights} noches · ${persons} personas${activeSeason ? ` · 🗓️ ${activeSeason.name}` : ''}`,
        details: [
          ...(activeSeason
            ? [`✨ Temporada: ${activeSeason.name} (×${activeSeason.price_multiplier})`]
            : []),
          ...(hasOverrideInRange
            ? ['📌 Incluye precio fijo de esta unidad en parte del rango']
            : []),
          `Tarifa${perDay ? ' promedio' : ''}: ${formatCurrency(pricePerNight)}/noche (unidad completa, hasta ${includedGuests} huéspedes)`,
          perDay
            ? `Base: suma noche por noche del ${checkInDate} al ${checkOutDate} (temporadas y precios fijos aplicados por día)`
            : `Base: ${formatCurrency(pricePerNight)} × ${nights} noches`,
          ...(extraPersons > 0
            ? [`+${extraPersons} persona(s) extra: ${formatCurrency(EXTRA_PERSON_FEE)}/pers/noche`]
            : []),
        ],
      }
    }

    return null
  }

  const breakdown = calculate()

  function handlePrint() {
    setShowQuote(true)
    setTimeout(() => window.print(), 300)
  }

  const today = new Date().toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const unitLabel = (u: QuoteUnit) => {
    const b = one(u.building)
    return `${u.number}${b ? ` · ${b.name}` : ''}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Cotizador</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Misma fuente de precio que el sitio público y el calendario: tarifa por noche de la
          unidad × temporada. Precios en <span className="font-medium">Finanzas → Precios</span> y
          overrides por unidad en el calendario.
        </p>
      </div>

      {loading || orgLoading ? (
        <div className="text-gray-400 dark:text-gray-500">Cargando precios...</div>
      ) : !orgId ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            Selecciona una organización en el switcher del sidebar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <div className="card space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Calculator className="w-5 h-5 text-indigo-400" />
              Parámetros
            </h2>

            <div className="space-y-4">
              {/* Modality */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Modalidad
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['LTR', 'STR', 'Corporativo'] as Modality[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setModality(m)
                        setSelectedUnit('')
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        modality === m
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      {m === 'LTR' ? 'Renta mensual' : m === 'STR' ? 'Corta estancia' : 'Corporativo'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Unit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Unidad
                </label>
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="input-field"
                >
                  <option value="">Seleccionar unidad</option>
                  {availableUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {unitLabel(u)}
                      {modality === 'LTR'
                        ? ` · ${formatCurrency(u.monthly_rate_mxn!)}/mes`
                        : ` · ${formatCurrency(u.base_rate_mxn!)}/noche`}
                    </option>
                  ))}
                </select>
                {availableUnits.length === 0 && (
                  <p className="text-xs text-amber-500 mt-1">
                    Ninguna unidad tiene {modality === 'LTR' ? 'renta mensual' : 'tarifa por noche'}{' '}
                    configurada — se captura en Finanzas → Precios.
                  </p>
                )}
              </div>

              {/* LTR: Months */}
              {modality === 'LTR' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Meses (mín. 6)
                  </label>
                  <input
                    type="number"
                    min={6}
                    value={months}
                    onChange={(e) => setMonths(Math.max(6, Number(e.target.value)))}
                    className="input-field"
                  />
                </div>
              )}

              {/* STR: Persons + Nights */}
              {(modality === 'STR' || modality === 'Corporativo') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Personas
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={persons}
                      onChange={(e) => setPersons(Math.max(1, Number(e.target.value)))}
                      className="input-field"
                    />
                    {unit && persons > includedGuests && (
                      <p className="text-xs text-amber-500 mt-1">
                        +{persons - includedGuests} persona(s) sobre la capacidad incluida (
                        {includedGuests}) → +${EXTRA_PERSON_FEE}/persona/noche
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Noches{unit ? ` (mín. ${minNights})` : ''}
                    </label>
                    <input
                      type="number"
                      min={minNights}
                      value={nights}
                      onChange={(e) => setNights(Math.max(minNights, Number(e.target.value)))}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Fecha check-in
                    </label>
                    <input
                      type="date"
                      value={checkInDate}
                      onChange={(e) => setCheckInDate(e.target.value)}
                      className="input-field"
                    />
                    {checkInDate &&
                      (() => {
                        const s = getActiveSeason(checkInDate)
                        return s ? (
                          <p className="text-xs text-amber-500 mt-1">
                            ✨ Temporada: {s.name} (×{s.price_multiplier})
                          </p>
                        ) : (
                          <p className="text-xs text-gray-400 mt-1">Sin temporada especial</p>
                        )
                      })()}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Fecha check-out
                    </label>
                    <input
                      type="date"
                      value={checkOutDate}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                      min={checkInDate || undefined}
                      className="input-field"
                    />
                  </div>
                </>
              )}

              {/* Discount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Descuento negociación (máx. 15%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={discount}
                    onChange={(e) => setDiscount(Math.min(15, Math.max(0, Number(e.target.value))))}
                    className="input-field w-24"
                  />
                  <span className="text-gray-500 dark:text-gray-400">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Output Panel */}
          <div className="space-y-4">
            {unit && breakdown ? (
              <>
                <div className="card space-y-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Desglose — {unitLabel(unit)}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {unit.type} ·{' '}
                    {modality === 'LTR'
                      ? 'Renta mensual'
                      : modality === 'STR'
                      ? 'Corta estancia'
                      : 'Corporativo'}
                  </p>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Precio base</span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {formatCurrency(breakdown.basePrice)}
                      </span>
                    </div>

                    {breakdown.extraPersonsFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          + Personas extra ({persons - includedGuests} × ${EXTRA_PERSON_FEE} ×{' '}
                          {nights} noches)
                        </span>
                        <span className="text-amber-500 font-medium">
                          +{formatCurrency(breakdown.extraPersonsFee)}
                        </span>
                      </div>
                    )}

                    {modality === 'LTR' && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Agua (incluida en precio)
                        </span>
                        <span className="text-gray-400">incl.</span>
                      </div>
                    )}

                    <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2">
                      <span className="text-gray-600 dark:text-gray-400">
                        Subtotal ({breakdown.label})
                      </span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {formatCurrency(breakdown.subtotal)}
                      </span>
                    </div>

                    {breakdown.discountAmount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          - Descuento ({discount}%)
                        </span>
                        <span className="text-red-500 font-medium">
                          -{formatCurrency(breakdown.discountAmount)}
                        </span>
                      </div>
                    )}

                    {breakdown.cleaningFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Servicio de limpieza</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {formatCurrency(breakdown.cleaningFee)}
                        </span>
                      </div>
                    )}

                    {breakdown.iva > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">IVA (16%)</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {formatCurrency(breakdown.iva)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between border-t-2 border-gray-300 dark:border-gray-600 pt-3">
                      <span className="text-gray-900 dark:text-white font-bold text-base">TOTAL</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xl">
                        {formatCurrency(breakdown.total)}
                      </span>
                    </div>
                  </div>

                  {modality === 'LTR' && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5 mt-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <p>Depósito: {formatCurrency(unit.monthly_rate_mxn ?? 0)} (1 mes)</p>
                      <p>Pago día 5 · Mora +3% desde día 10</p>
                      <p>Incremento anual: INPC o 5% (el mayor)</p>
                    </div>
                  )}

                  {(modality === 'STR' || modality === 'Corporativo') && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5 mt-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <p>
                        Tarifa por unidad completa (hasta {includedGuests} huéspedes) · mínimo{' '}
                        {minNights} noche{minNights === 1 ? '' : 's'}
                      </p>
                      {modality === 'Corporativo' && (
                        <p>Tarifa corporativa con respaldo de renta mensual mínima garantizada</p>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors w-full justify-center"
                >
                  <Printer className="w-4 h-4" />
                  Generar cotización
                </button>

                <button
                  onClick={() => {
                    window.location.href = `/reservations?unit_id=${unit.id}${
                      checkInDate ? `&check_in=${checkInDate}` : ''
                    }${checkOutDate ? `&check_out=${checkOutDate}` : ''}`
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors w-full justify-center"
                >
                  <CalendarPlus className="w-4 h-4" />
                  Crear reservación
                </button>
              </>
            ) : (
              <div className="card text-center py-12">
                <FileText className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">
                  Selecciona una unidad para ver el desglose
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Printable Quote */}
      {showQuote && unit && breakdown && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center print:bg-white print:static"
          onClick={() => setShowQuote(false)}
        >
          <div
            ref={quoteRef}
            className="bg-white rounded-xl p-8 max-w-lg w-full mx-4 print:max-w-none print:rounded-none print:shadow-none print:mx-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-indigo-600">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white">
                  B
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">BaW Living</h2>
                  <p className="text-xs text-gray-500">
                    {one(unit.building)?.name ?? 'DuVa ReEs'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">Cotización</p>
                <p className="text-xs text-gray-500">{today}</p>
              </div>
            </div>

            {/* Unit Info */}
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900">Unidad {unit.number}</h3>
              <p className="text-sm text-gray-600">
                {unit.type} ·{' '}
                {modality === 'LTR'
                  ? 'Renta Mensual'
                  : modality === 'STR'
                  ? 'Corta Estancia'
                  : 'Corporativo'}
              </p>
            </div>

            {/* Breakdown */}
            <div className="space-y-2 text-sm mb-6">
              {breakdown.details.map((d, i) => (
                <p key={i} className="text-gray-600">
                  {d}
                </p>
              ))}
            </div>

            <div className="space-y-2 text-sm border-t border-gray-200 pt-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Precio base</span>
                <span className="font-medium">{formatCurrency(breakdown.basePrice)}</span>
              </div>
              {breakdown.extraPersonsFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Personas extra</span>
                  <span className="font-medium">+{formatCurrency(breakdown.extraPersonsFee)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal ({breakdown.label})</span>
                <span className="font-medium">{formatCurrency(breakdown.subtotal)}</span>
              </div>
              {breakdown.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Descuento ({discount}%)</span>
                  <span className="text-red-600">-{formatCurrency(breakdown.discountAmount)}</span>
                </div>
              )}
              {breakdown.cleaningFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Servicio de limpieza</span>
                  <span className="font-medium">{formatCurrency(breakdown.cleaningFee)}</span>
                </div>
              )}
              {breakdown.iva > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">IVA (16%)</span>
                  <span className="font-medium">{formatCurrency(breakdown.iva)}</span>
                </div>
              )}
              <div className="flex justify-between border-t-2 border-gray-900 pt-3 mt-2">
                <span className="font-bold text-gray-900 text-base">TOTAL</span>
                <span className="font-bold text-indigo-600 text-xl">
                  {formatCurrency(breakdown.total)}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-400 space-y-1">
              <p>Cotización válida por 15 días. Precios en MXN. Sujeto a disponibilidad.</p>
              <p>Built by ZXY Ventures · baw-os.vercel.app</p>
            </div>

            {/* Close button (not printed) */}
            <button
              onClick={() => setShowQuote(false)}
              className="mt-4 w-full py-2 text-sm text-gray-500 hover:text-gray-700 print:hidden"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
