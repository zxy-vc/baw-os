'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface GuestData {
  reservation: {
    id: string
    guest_name: string
    check_in: string
    check_out: string
    guests_count: number
    status: string
  }
  unit: { number: string; floor: number; type: string } | null
  portal_info: {
    wifi_name: string | null
    wifi_password: string | null
    access_code: string | null
    arrival_instructions: string | null
    checkin_time: string
    checkout_time: string
  }
}

function formatDate(d: string): string {
  const [year, month, day] = d.split('T')[0].split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function GuestPortalPage() {
  const params = useParams()
  const token = Array.isArray(params.token) ? params.token[0] : params.token
  const [data, setData] = useState<GuestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [copiedWifi, setCopiedWifi] = useState(false)

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

  function copyWifiPassword() {
    if (data?.portal_info.wifi_password) {
      navigator.clipboard.writeText(data.portal_info.wifi_password)
      setCopiedWifi(true)
      setTimeout(() => setCopiedWifi(false), 2000)
    }
  }

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

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🏨</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Portal no disponible</h1>
          <p className="text-slate-500 text-sm">Este enlace no es válido o la reservación ha finalizado.</p>
        </div>
      </div>
    )
  }

  const { reservation, unit, portal_info } = data

  return (
    <div className="min-h-screen bg-slate-50">
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
          <div className="ml-auto">
            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-medium">
              {reservation.status === 'checked_in' ? 'Hospedado' : 'Confirmada'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Tu Reservación */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Tu reservación</p>
              <h1 className="text-2xl font-bold text-slate-900">
                {reservation.guest_name}
              </h1>
              {unit && (
                <p className="text-slate-500 text-sm mt-0.5">
                  Depto {unit.number} · {unit.floor}° Piso
                </p>
              )}
            </div>
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
              <span className="text-2xl">🏨</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1">Check-in</p>
              <p className="font-semibold text-slate-900 text-sm">{formatDate(reservation.check_in)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1">Check-out</p>
              <p className="font-semibold text-slate-900 text-sm">{formatDate(reservation.check_out)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 col-span-2">
              <p className="text-xs text-slate-400 mb-1">Huéspedes</p>
              <p className="font-semibold text-slate-900 text-sm">{reservation.guests_count} persona(s)</p>
            </div>
          </div>
        </div>

        {/* Acceso */}
        {(portal_info.access_code || portal_info.arrival_instructions) && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🔑</span>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Acceso</p>
            </div>

            {portal_info.access_code && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center mb-4">
                <p className="text-xs text-blue-600 mb-1">Código de acceso</p>
                <p className="text-3xl font-bold text-blue-900 tracking-widest font-mono">
                  {portal_info.access_code}
                </p>
              </div>
            )}

            {portal_info.arrival_instructions && (
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-2">Instrucciones de llegada</p>
                <p className="text-sm text-slate-700 whitespace-pre-line">
                  {portal_info.arrival_instructions}
                </p>
              </div>
            )}
          </div>
        )}

        {/* WiFi */}
        {(portal_info.wifi_name || portal_info.wifi_password) && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">📶</span>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">WiFi</p>
            </div>

            <div className="space-y-3">
              {portal_info.wifi_name && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Red</p>
                  <p className="font-semibold text-slate-900">{portal_info.wifi_name}</p>
                </div>
              )}
              {portal_info.wifi_password && (
                <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Contraseña</p>
                    <p className="font-semibold text-slate-900 font-mono">{portal_info.wifi_password}</p>
                  </div>
                  <button
                    onClick={copyWifiPassword}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    {copiedWifi ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Horarios */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🕐</span>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Horarios</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
              <p className="text-xs text-green-600 mb-1">Check-in</p>
              <p className="text-2xl font-bold text-green-900">{portal_info.checkin_time}</p>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-center">
              <p className="text-xs text-orange-600 mb-1">Check-out</p>
              <p className="text-2xl font-bold text-orange-900">{portal_info.checkout_time}</p>
            </div>
          </div>
        </div>

        {/* Soporte */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">💬</span>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">¿Algo no funciona?</p>
          </div>
          <a
            href="https://wa.me/524464790229"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold text-sm rounded-xl px-4 py-3 transition-colors"
          >
            <span>📱</span>
            Contactar por WhatsApp
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-8 px-4">
        <p className="text-xs text-slate-400">BaW · Administración de propiedades</p>
      </footer>
    </div>
  )
}
