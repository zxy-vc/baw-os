'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface GuestData {
  reservation: {
    id: string
    guest_name: string
    guest_email?: string
    guest_phone?: string
    check_in: string
    check_out: string
    guests_count: number
    total_price?: number
    platform?: string
    status: string
    check_in_code?: string
    wifi_name?: string
    wifi_password?: string
    house_rules?: string
    check_in_instructions?: string
    notes?: string
  }
  unit: {
    unit_number: string
    floor: number
    type: string
  } | null
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [year, month, day] = d.split('T')[0].split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0 }).format(n)
}

function diffDays(a: string, b: string): number {
  const msPerDay = 86400000
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay))
}

function isToday(d: string): boolean {
  const today = new Date()
  const [year, month, day] = d.split('T')[0].split('-').map(Number)
  return today.getFullYear() === year && today.getMonth() === month - 1 && today.getDate() === day
}

function isFuture(d: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [year, month, day] = d.split('T')[0].split('-').map(Number)
  return new Date(year, month - 1, day) > today
}

const platformLabels: Record<string, { label: string; color: string }> = {
  airbnb: { label: 'Airbnb', color: 'bg-rose-50 text-rose-700' },
  booking: { label: 'Booking', color: 'bg-blue-50 text-blue-700' },
  direct: { label: 'Directo', color: 'bg-emerald-50 text-emerald-700' },
}

export default function GuestPortalPage() {
  const params = useParams()
  const token = Array.isArray(params.token) ? params.token[0] : params.token
  const [data, setData] = useState<GuestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/portal/guest/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error()
        return res.json()
      })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [token])

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center animate-pulse">
            <span className="text-white text-sm font-bold">B</span>
          </div>
          <p className="text-slate-400 text-sm">Cargando tu portal...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🏠</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Portal no disponible</h1>
          <p className="text-slate-500 text-sm">Token inválido o expirado.</p>
        </div>
      </div>
    )
  }

  const { reservation, unit } = data
  const nights = diffDays(reservation.check_in, reservation.check_out)
  const checkInIsToday = isToday(reservation.check_in)
  const checkInIsFuture = isFuture(reservation.check_in)
  const arrivalColor = checkInIsToday
    ? 'border-green-200 bg-green-50'
    : 'border-blue-200 bg-blue-50'
  const arrivalAccent = checkInIsToday ? 'text-green-700' : 'text-blue-700'

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">B</span>
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">BaW</p>
            <p className="text-xs text-slate-500">Portal Huésped</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* 1. Header de bienvenida */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Bienvenido/a</p>
          <h1 className="text-2xl font-bold text-slate-900">
            ¡Hola, {reservation.guest_name}!
          </h1>
          <p className="text-slate-500 text-sm mt-1">Bienvenido/a a BaW</p>
          {unit && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-lg">🏠</span>
              <p className="text-slate-700 text-sm font-medium">
                Depto {unit.unit_number} · {unit.floor}° piso
              </p>
            </div>
          )}
          <p className="text-slate-500 text-sm mt-2">
            Del {formatDate(reservation.check_in)} al {formatDate(reservation.check_out)} · {nights} noches
          </p>
        </div>

        {/* 2. Card "Tu llegada" */}
        <div className={`rounded-2xl border shadow-sm p-6 ${arrivalColor}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{checkInIsToday ? '🟢' : '📅'}</span>
            <p className={`text-xs font-medium uppercase tracking-wider ${arrivalAccent}`}>
              {checkInIsToday ? 'Tu llegada es hoy' : 'Tu llegada'}
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <p className={arrivalAccent}>
              <span className="font-medium">Check-in:</span> {formatDate(reservation.check_in)}
            </p>
            <p className={arrivalAccent}>
              <span className="font-medium">Check-out:</span> {formatDate(reservation.check_out)}
            </p>
          </div>

          {reservation.check_in_code && (
            <div className="mt-4 bg-white/80 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Código de acceso</p>
              <p className="text-3xl font-bold text-slate-900 tracking-widest font-mono">
                {reservation.check_in_code}
              </p>
            </div>
          )}

          {reservation.check_in_instructions && (
            <div className="mt-4">
              <p className={`text-xs font-medium mb-2 ${arrivalAccent}`}>Instrucciones de check-in</p>
              <div className="text-sm text-slate-700 space-y-1">
                {reservation.check_in_instructions.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. Card "WiFi" */}
        {reservation.wifi_name && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📶</span>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">WiFi</p>
            </div>

            <div className="space-y-3">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 mb-1">Red</p>
                <p className="font-semibold text-slate-900">{reservation.wifi_name}</p>
              </div>
              {reservation.wifi_password && (
                <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Contraseña</p>
                    <p className="font-semibold text-slate-900 font-mono">{reservation.wifi_password}</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(reservation.wifi_password!)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. Card "Reglas de la casa" */}
        {reservation.house_rules && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📋</span>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Reglas de la casa</p>
            </div>
            <div className="text-sm text-slate-700 space-y-1">
              {reservation.house_rules.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {/* 5. Card "Tu reservación" */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🎫</span>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Tu reservación</p>
          </div>

          <div className="space-y-3">
            {reservation.platform && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Plataforma</p>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  platformLabels[reservation.platform]?.color || 'bg-slate-100 text-slate-600'
                }`}>
                  {platformLabels[reservation.platform]?.label || reservation.platform}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Huéspedes</p>
              <p className="text-sm font-medium text-slate-900">{reservation.guests_count}</p>
            </div>
            {reservation.total_price && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Total</p>
                <p className="text-sm font-bold text-slate-900">${formatCurrency(reservation.total_price)} MXN</p>
              </div>
            )}
          </div>
        </div>

        {/* 6. Card "¿Necesitas algo?" */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">💬</span>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">¿Necesitas algo?</p>
          </div>

          <a
            href="https://wa.me/524464790229"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-semibold text-sm rounded-xl px-4 py-3 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.344 0-4.521-.738-6.308-1.993l-.36-.27-3.135 1.051 1.051-3.135-.27-.36A9.955 9.955 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
            </svg>
            Contactar BaW Admin
          </a>

          <div className="mt-3 text-center">
            <p className="text-xs text-slate-500">Enrique Alanis (Conserje)</p>
            <a href="tel:+524464790229" className="text-xs text-blue-600 font-medium">
              +52 446 479 0229
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-8 px-4">
        <p className="text-xs text-slate-400">BaW · Administración de propiedades</p>
      </footer>
    </div>
  )
}
