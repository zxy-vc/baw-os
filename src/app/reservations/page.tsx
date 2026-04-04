'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, X, Search,
  Check, Ban, BedDouble, Home, Users, Filter, Copy, Link2, ExternalLink
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SkeletonTable } from '@/components/Skeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Unit, Reservation, BookingMode, ReservationStatus, ReservationPaymentStatus } from '@/types'

// ─── Pricing defaults ────────────────────────────────────────────────
const DEFAULT_PRICES: Record<BookingMode, number> = {
  full: 1800,
  room: 3500,
  bed: 2000,
}

const MODE_LABELS: Record<BookingMode, string> = {
  full: 'Depto completo',
  room: 'Por recámara',
  bed: 'Por cama',
}

const STATUS_LABELS: Record<ReservationStatus, string> = {
  tentative: 'Tentativa',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  checked_in: 'Check-in',
  checked_out: 'Check-out',
}

const STATUS_COLORS: Record<ReservationStatus, string> = {
  tentative: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  checked_in: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  checked_out: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

const PAY_STATUS_LABELS: Record<ReservationPaymentStatus, string> = {
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
}

const PAY_STATUS_COLORS: Record<ReservationPaymentStatus, string> = {
  pending: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
}

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  airbnb: { label: 'Airbnb', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' },
  booking: { label: 'Booking', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  direct: { label: 'Directo', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
}

// ─── Helpers ─────────────────────────────────────────────────────────
function diffDays(a: string, b: string): number {
  const msPerDay = 86400000
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay))
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ─── Main Component ──────────────────────────────────────────────────
export default function ReservationsPage() {
  const [units, setUnits] = useState<Unit[]>([])
  const [reservations, setReservations] = useState<(Reservation & { guest_token?: string; platform?: string; check_in_code?: string; wifi_name?: string; wifi_password?: string; house_rules?: string; check_in_instructions?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Calendar state
  const now = new Date()
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())
  const [calUnitFilter, setCalUnitFilter] = useState<string>('all')

  // Quoter state
  const [unitId, setUnitId] = useState('')
  const [mode, setMode] = useState<BookingMode>('full')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [roomsCount, setRoomsCount] = useState(1)
  const [bedsCount, setBedsCount] = useState(1)
  const [guestsCount, setGuestsCount] = useState(1)

  // Form state
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [status, setStatus] = useState<ReservationStatus>('confirmed')
  const [paymentStatus, setPaymentStatus] = useState<ReservationPaymentStatus>('pending')
  const [amountPaid, setAmountPaid] = useState(0)
  const [agreedPrice, setAgreedPrice] = useState<number | null>(null)
  const [notes, setNotes] = useState('')

  // Guest portal fields
  const [platform, setPlatform] = useState<string>('')
  const [checkInCode, setCheckInCode] = useState('')
  const [wifiName, setWifiName] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [houseRules, setHouseRules] = useState('')
  const [checkInInstructions, setCheckInInstructions] = useState('')

  // Autocomplete state
  const [allContacts, setAllContacts] = useState<{ id: string; name: string; phone?: string; email?: string }[]>([])
  const [acResults, setAcResults] = useState<{ id: string; name: string; phone?: string; email?: string }[]>([])
  const [showAc, setShowAc] = useState(false)
  const [saveAsContact, setSaveAsContact] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  // List filters
  const [filterUnit, setFilterUnit] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // ─── Data loading ────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [unitsRes, resRes, contactsRes] = await Promise.all([
      supabase.from('units').select('*').order('number'),
      supabase.from('reservations').select('*, unit:units(*)').order('check_in', { ascending: false }),
      supabase.from('occupants').select('id, name, phone, email').order('name'),
    ])
    setUnits(unitsRes.data || [])
    setReservations(resRes.data || [])
    setAllContacts(contactsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── Pricing calc ───────────────────────────────────────────────
  const nights = checkIn && checkOut ? diffDays(checkIn, checkOut) : 0
  const selectedUnit = units.find((u) => u.id === unitId)

  const pricePerNight = useMemo(() => {
    if (mode === 'full') return DEFAULT_PRICES.full
    if (mode === 'room') return DEFAULT_PRICES.room * roomsCount
    if (mode === 'bed') return DEFAULT_PRICES.bed * bedsCount
    return 0
  }, [mode, roomsCount, bedsCount])

  const totalPrice = nights * pricePerNight

  // ─── Calendar helpers ───────────────────────────────────────────
  const calReservations = useMemo(() => {
    return reservations.filter((r) => {
      if (r.status === 'cancelled') return false
      if (calUnitFilter !== 'all' && r.unit_id !== calUnitFilter) return false
      return true
    })
  }, [reservations, calUnitFilter])

  function getDateStatus(day: number): { color: string; reservations: typeof reservations } {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const matching = calReservations.filter((r) => r.check_in <= dateStr && r.check_out > dateStr)
    if (matching.length === 0) return { color: 'bg-emerald-100 dark:bg-emerald-900/30', reservations: [] }
    const hasTentative = matching.some((r) => r.status === 'tentative')
    const hasConfirmed = matching.some((r) => r.status !== 'tentative')
    if (hasTentative && !hasConfirmed) return { color: 'bg-yellow-100 dark:bg-yellow-900/30', reservations: matching }
    return { color: 'bg-red-100 dark:bg-red-900/30', reservations: matching }
  }

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) }
    else setCalMonth(calMonth - 1)
  }

  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) }
    else setCalMonth(calMonth + 1)
  }

  // Calendar date click → pre-fill quoter
  const [calSelectStart, setCalSelectStart] = useState<string | null>(null)

  function handleCalClick(day: number) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (!calSelectStart) {
      setCalSelectStart(dateStr)
      setCheckIn(dateStr)
      setCheckOut('')
    } else {
      if (dateStr > calSelectStart) {
        setCheckOut(dateStr)
      } else {
        setCheckIn(dateStr)
        setCheckOut(calSelectStart)
      }
      setCalSelectStart(null)
    }
  }

  // ─── Autocomplete handler ──────────────────────────────────────
  function handleGuestNameChange(value: string) {
    setGuestName(value)
    setSelectedContactId(null)
    if (value.length >= 2) {
      const q = value.toLowerCase()
      const matches = allContacts.filter((c) => c.name.toLowerCase().includes(q))
      setAcResults(matches.slice(0, 5))
      setShowAc(matches.length > 0)
    } else {
      setAcResults([])
      setShowAc(false)
    }
  }

  function selectContact(contact: { id: string; name: string; phone?: string; email?: string }) {
    setGuestName(contact.name)
    setGuestPhone(contact.phone || '')
    setGuestEmail(contact.email || '')
    setSelectedContactId(contact.id)
    setShowAc(false)
    setSaveAsContact(false)
  }

  // ─── Save reservation ──────────────────────────────────────────
  async function handleSave() {
    if (!unitId || !guestName || !checkIn || !checkOut || !nights) return
    setSaving(true)

    const { error } = await supabase.from('reservations').insert({
      unit_id: unitId,
      organization_id: 'ed4308c7-2bdb-46f2-be69-7c59674838e2',
      guest_name: guestName,
      guest_phone: guestPhone || null,
      guest_email: guestEmail || null,
      check_in: checkIn,
      check_out: checkOut,
      mode,
      rooms_count: roomsCount,
      beds_count: bedsCount,
      guests_count: guestsCount,
      price_per_night: agreedPrice !== null ? agreedPrice / Math.max(nights, 1) : pricePerNight,
      total_price: agreedPrice !== null ? agreedPrice : totalPrice,
      status,
      payment_status: paymentStatus,
      amount_paid: amountPaid,
      notes: notes || null,
      platform: platform || null,
      check_in_code: checkInCode || null,
      wifi_name: wifiName || null,
      wifi_password: wifiPassword || null,
      house_rules: houseRules || null,
      check_in_instructions: checkInInstructions || null,
    })

    if (error) {
      alert('Error al guardar: ' + error.message)
    } else {
      // Create contact if checkbox was checked
      if (saveAsContact && !selectedContactId && guestName) {
        await supabase.from('occupants').insert({
          org_id: 'ed4308c7-2bdb-46f2-be69-7c59674838e2',
          name: guestName,
          phone: guestPhone || null,
          email: guestEmail || null,
          type: 'str',
        })
      }
      // Reset form
      setGuestName('')
      setGuestPhone('')
      setGuestEmail('')
      setCheckIn('')
      setCheckOut('')
      setRoomsCount(1)
      setBedsCount(1)
      setGuestsCount(1)
      setAmountPaid(0)
      setAgreedPrice(null)
      setNotes('')
      setStatus('confirmed')
      setPaymentStatus('pending')
      setSaveAsContact(false)
      setSelectedContactId(null)
      setPlatform('')
      setCheckInCode('')
      setWifiName('')
      setWifiPassword('')
      setHouseRules('')
      setCheckInInstructions('')
      await loadData()
    }
    setSaving(false)
  }

  // ─── Actions ────────────────────────────────────────────────────
  async function markPaid(id: string, total: number) {
    await supabase
      .from('reservations')
      .update({ payment_status: 'paid', amount_paid: total, updated_at: new Date().toISOString() })
      .eq('id', id)
    await loadData()
  }

  async function cancelReservation(id: string) {
    await supabase
      .from('reservations')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
    await loadData()
  }

  async function updateStatus(id: string, newStatus: ReservationStatus) {
    await supabase
      .from('reservations')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
    await loadData()
  }

  function copyPortalLink(guestToken: string) {
    const url = `${window.location.origin}/portal/guest/${guestToken}`
    navigator.clipboard.writeText(url)
    setCopiedId(guestToken)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // ─── Filtered list ──────────────────────────────────────────────
  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => {
      if (filterUnit !== 'all' && r.unit_id !== filterUnit) return false
      if (filterStatus !== 'all' && r.status !== filterStatus) return false
      return true
    })
  }, [reservations, filterUnit, filterStatus])

  // ─── Render ─────────────────────────────────────────────────────
  if (loading) {
    return <SkeletonTable />
  }

  const totalDays = daysInMonth(calYear, calMonth)
  const startDay = firstDayOfWeek(calYear, calMonth)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Booking Engine</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Reservaciones STR · BaW ALM809P
        </p>
      </div>

      {/* ═══ A) AVAILABILITY CALENDAR ═══ */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-indigo-400" />
            Calendario de Disponibilidad
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={calUnitFilter}
              onChange={(e) => setCalUnitFilter(e.target.value)}
              className="input-field text-sm py-1.5"
            >
              <option value="all">Todas las unidades</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.number}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {MONTH_NAMES[calMonth]} {calYear}
          </h3>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex gap-4 mb-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700" /> Disponible</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700" /> Tentativa</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700" /> Ocupado</span>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-1">{d}</div>
          ))}
          {/* Empty cells before month starts */}
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {/* Day cells */}
          {Array.from({ length: totalDays }).map((_, i) => {
            const day = i + 1
            const { color, reservations: dayRes } = getDateStatus(day)
            const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isSelected = dateStr === checkIn || dateStr === checkOut
            const isInRange = checkIn && checkOut && dateStr >= checkIn && dateStr <= checkOut
            const isToday = toISO(now) === dateStr

            return (
              <button
                key={day}
                onClick={() => handleCalClick(day)}
                className={`relative p-1.5 sm:p-2 rounded-lg text-xs sm:text-sm transition-colors cursor-pointer
                  ${color}
                  ${isSelected ? 'ring-2 ring-indigo-500' : ''}
                  ${isInRange ? 'ring-1 ring-indigo-300 dark:ring-indigo-600' : ''}
                  ${isToday ? 'font-bold' : ''}
                  hover:ring-2 hover:ring-indigo-400
                `}
                title={dayRes.length > 0 ? dayRes.map((r) => `${r.guest_name} (${r.unit?.number || ''})`).join(', ') : 'Disponible'}
              >
                <span className={`${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {day}
                </span>
                {dayRes.length > 0 && (
                  <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                    {dayRes.slice(0, 3).map((r, idx) => (
                      <span key={idx} className={`w-1 h-1 rounded-full ${r.status === 'tentative' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {calSelectStart && (
          <p className="text-xs text-indigo-500 mt-2">Selecciona la fecha de check-out...</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══ B) STR QUOTER ═══ */}
        <div className="card space-y-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Home className="w-5 h-5 text-indigo-400" />
            Cotizador STR
          </h2>

          <div className="space-y-4">
            {/* Unit */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Departamento</label>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="input-field">
                <option value="">Seleccionar unidad</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.number} — {u.type} · {u.bedrooms || 0} rec · {u.status}
                  </option>
                ))}
              </select>
            </div>

            {/* Booking mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Modo de reserva</label>
              <div className="flex gap-2">
                {(['full', 'room', 'bed'] as BookingMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      mode === m
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Check-in</label>
                <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Check-out</label>
                <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="input-field" />
              </div>
            </div>

            {/* Mode-specific fields */}
            {mode === 'room' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Recámaras</label>
                <input type="number" min={1} max={5} value={roomsCount} onChange={(e) => setRoomsCount(Math.max(1, Number(e.target.value)))} className="input-field w-24" />
                <p className="text-xs text-gray-400 mt-1">D303: 3 recámaras disponibles</p>
              </div>
            )}
            {mode === 'bed' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Camas</label>
                <input type="number" min={1} max={15} value={bedsCount} onChange={(e) => setBedsCount(Math.max(1, Number(e.target.value)))} className="input-field w-24" />
                <p className="text-xs text-gray-400 mt-1">D201: 11 camas disponibles</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Huéspedes</label>
              <input type="number" min={1} max={20} value={guestsCount} onChange={(e) => setGuestsCount(Math.max(1, Number(e.target.value)))} className="input-field w-24" />
            </div>

            {/* Price breakdown */}
            {nights > 0 && unitId && (
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Modo</span>
                  <span className="text-gray-900 dark:text-white font-medium">{MODE_LABELS[mode]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Noches</span>
                  <span className="text-gray-900 dark:text-white font-medium">{nights}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Precio / noche</span>
                  <span className="text-gray-900 dark:text-white font-medium">{formatCurrency(pricePerNight)}</span>
                </div>
                {mode === 'room' && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{roomsCount} recámara(s) × {formatCurrency(DEFAULT_PRICES.room)}</span>
                    <span className="text-gray-500">{formatCurrency(pricePerNight)}/noche</span>
                  </div>
                )}
                {mode === 'bed' && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{bedsCount} cama(s) × {formatCurrency(DEFAULT_PRICES.bed)}</span>
                    <span className="text-gray-500">{formatCurrency(pricePerNight)}/noche</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2">
                  <span className="text-gray-900 dark:text-white font-bold">TOTAL</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-lg">
                    {formatCurrency(totalPrice)}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {nights} noches × {formatCurrency(pricePerNight)} = {formatCurrency(totalPrice)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ═══ C) RESERVATION FORM ═══ */}
        <div className="card space-y-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-400" />
            Datos del Huésped
          </h2>

          <div className="space-y-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del huésped *</label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => handleGuestNameChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowAc(false), 200)}
                onFocus={() => { if (guestName.length >= 2 && acResults.length > 0) setShowAc(true) }}
                placeholder="Nombre completo"
                className="input-field"
                autoComplete="off"
              />
              {showAc && acResults.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                  {acResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => selectContact(c)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</p>
                      {c.phone && <p className="text-xs text-gray-500 dark:text-gray-400">{c.phone}</p>}
                    </button>
                  ))}
                </div>
              )}
              {!selectedContactId && guestName.length >= 2 && (
                <label className="flex items-center gap-2 mt-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveAsContact}
                    onChange={(e) => setSaveAsContact(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                  />
                  Guardar como contacto
                </label>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono</label>
                <input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="+52 442..." className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="email@ejemplo.com" className="input-field" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as ReservationStatus)} className="input-field">
                  <option value="tentative">Tentativa</option>
                  <option value="confirmed">Confirmada</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pago</label>
                <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as ReservationPaymentStatus)} className="input-field">
                  <option value="pending">Pendiente</option>
                  <option value="partial">Parcial</option>
                  <option value="paid">Pagado</option>
                </select>
              </div>
            </div>

            {/* Guest Portal fields */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <p className="text-xs font-medium text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                <Link2 className="w-3.5 h-3.5" />
                Portal Huésped
              </p>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plataforma</label>
                    <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="input-field">
                      <option value="">Sin plataforma</option>
                      <option value="airbnb">Airbnb</option>
                      <option value="booking">Booking</option>
                      <option value="direct">Directo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Código acceso</label>
                    <input type="text" value={checkInCode} onChange={(e) => setCheckInCode(e.target.value)} placeholder="1234" className="input-field" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">WiFi red</label>
                    <input type="text" value={wifiName} onChange={(e) => setWifiName(e.target.value)} placeholder="BaW_ALM809P" className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">WiFi contraseña</label>
                    <input type="text" value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} placeholder="password" className="input-field" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reglas de la casa</label>
                  <textarea value={houseRules} onChange={(e) => setHouseRules(e.target.value)} rows={2} placeholder="• No fumar&#10;• No mascotas" className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Instrucciones check-in</label>
                  <textarea value={checkInInstructions} onChange={(e) => setCheckInInstructions(e.target.value)} rows={2} placeholder="1. El código de acceso es...&#10;2. El depto está en..." className="input-field" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Precio acordado <span className="text-gray-400 font-normal">(opcional — sobreescribe el calculado)</span>
              </label>
              <input
                type="number"
                min={0}
                placeholder={String(totalPrice)}
                value={agreedPrice ?? ''}
                onChange={(e) => setAgreedPrice(e.target.value === '' ? null : Number(e.target.value))}
                className="input-field w-40"
              />
            </div>

            {(paymentStatus === 'partial' || paymentStatus === 'paid') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monto pagado</label>
                <input
                  type="number"
                  min={0}
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Number(e.target.value))}
                  className="input-field w-40"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notas adicionales..." className="input-field" />
            </div>

            {/* Summary before saving */}
            {unitId && guestName && nights > 0 && (
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium text-indigo-900 dark:text-indigo-300">Resumen</p>
                <p className="text-indigo-700 dark:text-indigo-400">
                  {guestName} · {selectedUnit?.number} · {MODE_LABELS[mode]}
                  {platform && ` · ${PLATFORM_LABELS[platform]?.label || platform}`}
                </p>
                <p className="text-indigo-700 dark:text-indigo-400">
                  {checkIn} → {checkOut} ({nights} noches) · {formatCurrency(totalPrice)}
                </p>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving || !unitId || !guestName || !checkIn || !checkOut || nights <= 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors w-full justify-center"
            >
              {saving ? (
                'Guardando...'
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Crear Reservación
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ D) RESERVATIONS LIST ═══ */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BedDouble className="w-5 h-5 text-indigo-400" />
            Reservaciones ({filteredReservations.length})
          </h2>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} className="input-field text-sm py-1.5">
              <option value="all">Todas las unidades</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.number}</option>
              ))}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field text-sm py-1.5">
              <option value="all">Todos los estados</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredReservations.length === 0 ? (
          <div className="text-center py-12">
            <CalendarDays className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No hay reservaciones</p>
            <p className="mt-2 text-sm text-indigo-400">Usa el formulario de arriba para crear una reservación</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 pr-3 font-medium">Huésped</th>
                  <th className="pb-2 pr-3 font-medium">Unidad</th>
                  <th className="pb-2 pr-3 font-medium">Fechas</th>
                  <th className="pb-2 pr-3 font-medium">Plataforma</th>
                  <th className="pb-2 pr-3 font-medium text-right">Total</th>
                  <th className="pb-2 pr-3 font-medium">Estado</th>
                  <th className="pb-2 pr-3 font-medium">Pago</th>
                  <th className="pb-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredReservations.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="py-2.5 pr-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{r.guest_name}</p>
                        {r.guest_phone && <p className="text-xs text-gray-400">{r.guest_phone}</p>}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">
                      {r.unit?.number || '—'}
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="text-gray-700 dark:text-gray-300">{formatDate(r.check_in)}</p>
                      <p className="text-xs text-gray-400">→ {formatDate(r.check_out)} · {diffDays(r.check_in, r.check_out)}n</p>
                    </td>
                    <td className="py-2.5 pr-3">
                      {r.platform ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PLATFORM_LABELS[r.platform]?.color || 'bg-gray-100 text-gray-800'}`}>
                          {PLATFORM_LABELS[r.platform]?.label || r.platform}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(r.total_price)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status]}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PAY_STATUS_COLORS[r.payment_status]}`}>
                        {PAY_STATUS_LABELS[r.payment_status]}
                      </span>
                      {r.payment_status === 'partial' && (
                        <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(r.amount_paid)} pagado</p>
                      )}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1">
                        {/* Copy portal link */}
                        {r.guest_token && (
                          <button
                            onClick={() => copyPortalLink(r.guest_token!)}
                            title="Copiar link portal huésped"
                            className="p-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 transition-colors"
                          >
                            {copiedId === r.guest_token ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        {/* Status transitions */}
                        {r.status === 'confirmed' && (
                          <button
                            onClick={() => updateStatus(r.id, 'checked_in')}
                            title="Marcar check-in"
                            className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        )}
                        {r.status === 'checked_in' && (
                          <button
                            onClick={() => updateStatus(r.id, 'checked_out')}
                            title="Marcar check-out"
                            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        )}
                        {r.payment_status !== 'paid' && r.status !== 'cancelled' && (
                          <button
                            onClick={() => markPaid(r.id, r.total_price)}
                            title="Marcar como pagado"
                            className="p-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 transition-colors"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        {r.status !== 'cancelled' && r.status !== 'checked_out' && (
                          <button
                            onClick={() => cancelReservation(r.id)}
                            title="Cancelar"
                            className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
