'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface PortalData {
  contract: {
    unit_id: string
    monthly_amount: number
    water_fee?: number
    start_date: string
    end_date?: string
    status: string
    payment_day: number
    tenant_name: string
  }
  unit: {
    unit_number: string
    floor: number
    type: string
  } | null
  payments: {
    month: string
    amount: number
    water_fee?: number
    status: string
    paid_date?: string
  }[]
  incidents: {
    id: string
    title: string
    description?: string
    status: string
    created_at: string
  }[]
}

const paymentStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  late: 'Vencido',
  partial: 'Parcial',
  waived: 'Condonado',
}

const paymentStatusColors: Record<string, string> = {
  paid: 'bg-green-50 text-green-700',
  pending: 'bg-yellow-50 text-yellow-700',
  late: 'bg-red-50 text-red-700',
  partial: 'bg-orange-50 text-orange-700',
  waived: 'bg-slate-100 text-slate-500',
}

const incidentStatusLabels: Record<string, string> = {
  open: 'Abierto',
  in_progress: 'En proceso',
  waiting_parts: 'Esperando refacciones',
}

const categoryOptions = [
  { value: 'Plomería', icon: '\uD83D\uDEBF' },
  { value: 'Electricidad', icon: '\u26A1' },
  { value: 'Acceso', icon: '\uD83D\uDD11' },
  { value: 'Otro', icon: '\uD83D\uDCE6' },
]

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0 }).format(n)
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

function formatMonth(d: string): string {
  const [year, month] = d.split('T')[0].split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
  })
}

function formatRelativeDate(d: string | null | undefined): string {
  if (!d) return ''
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  return `Hace ${diff} días`
}

export default function PortalPage() {
  const params = useParams()
  const token = Array.isArray(params.token) ? params.token[0] : params.token
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<'success' | 'error' | null>(null)

  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error()
        return res.json()
      })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmitIncident(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitResult(null)
    try {
      const res = await fetch(`/api/portal/${token}/incident`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, description }),
      })
      if (!res.ok) throw new Error()
      setSubmitResult('success')
      setCategory('')
      setDescription('')
      const updated = await fetch(`/api/portal/${token}`)
      if (updated.ok) setData(await updated.json())
    } catch {
      setSubmitResult('error')
    } finally {
      setSubmitting(false)
    }
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
          <p className="text-slate-500 text-sm">Este enlace no es válido o el portal ha sido desactivado.</p>
        </div>
      </div>
    )
  }

  const { contract, unit, payments, incidents } = data

  const pendingPayments = payments.filter((p) => p.status === 'pending' || p.status === 'late')
  const totalPending = pendingPayments.reduce((sum, p) => sum + p.amount, 0)
  const openIncidents = incidents.filter((i) => i.status === 'open' || i.status === 'in_progress' || i.status === 'waiting_parts')

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
            <p className="text-xs text-slate-500">Portal Inquilino</p>
          </div>
          <div className="ml-auto">
            <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full font-medium">
              ● Activo
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Pending payment banner */}
        {totalPending > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-lg mt-0.5">⚠️</span>
            <div>
              <p className="text-red-800 font-semibold text-sm">
                Tienes un saldo pendiente de ${formatCurrency(totalPending)}
              </p>
              <a
                href="https://wa.me/524464790229"
                className="text-red-600 text-xs mt-1 block underline underline-offset-2"
              >
                Contáctanos al WhatsApp de BaW
              </a>
            </div>
          </div>
        )}

        {/* Section 1 — Mi Depto */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Tu departamento</p>
              <h1 className="text-2xl font-bold text-slate-900">Depto {unit?.unit_number || '—'}</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                {unit ? `${unit.floor}° Piso · ${unit.type}` : '—'}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
              <span className="text-2xl">🏠</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1">Renta mensual</p>
              <p className="font-bold text-slate-900">${formatCurrency(contract.monthly_amount)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1">Agua incluida</p>
              <p className="font-bold text-slate-900">${formatCurrency(contract.water_fee || 250)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1">Inicio contrato</p>
              <p className="font-semibold text-slate-700 text-sm">{formatDate(contract.start_date)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1">Vencimiento</p>
              <p className="font-semibold text-slate-700 text-sm">
                {contract.end_date ? formatDate(contract.end_date) : 'Indefinido'}
              </p>
            </div>
          </div>
        </div>

        {/* Section 2 — Mis Pagos */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Mis Pagos</p>
            <span className="text-lg">💳</span>
          </div>

          {/* Next payment info */}
          <div className="bg-blue-50 rounded-xl p-4 mb-4 border border-blue-100">
            <p className="text-blue-900 text-sm font-semibold">
              Tu próximo pago de ${formatCurrency(contract.monthly_amount + (contract.water_fee || 0))} vence el día {contract.payment_day}
            </p>
          </div>

          {payments.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">📋</span>
              </div>
              <p className="text-slate-400 text-sm">Aún no hay pagos registrados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-xl transition-all duration-200 hover:shadow-sm"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 capitalize">{formatMonth(p.month)}</p>
                    {p.paid_date && (
                      <p className="text-xs text-slate-400 mt-0.5">Pagado {formatDate(p.paid_date!)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold text-slate-900">${formatCurrency(p.amount)}</p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        paymentStatusColors[p.status] || 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {paymentStatusLabels[p.status] || p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 3 — Reportar Incidencia */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🔧</span>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">¿Algo no funciona?</p>
          </div>

          {submitResult === 'success' && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-4 flex items-start gap-2">
              <span className="text-lg">✅</span>
              <p className="text-green-700 text-sm font-medium">
                Reporte enviado. Enrique lo atenderá pronto.
              </p>
            </div>
          )}

          {submitResult === 'error' && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-4">
              <p className="text-red-700 text-sm font-medium">Ocurrió un error. Intenta de nuevo.</p>
            </div>
          )}

          <form onSubmit={handleSubmitIncident} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200"
              >
                <option value="">Selecciona una categoría</option>
                {categoryOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.icon} {c.value}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Descripción</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                minLength={10}
                rows={3}
                placeholder="Describe el problema con detalle..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none transition-all duration-200"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !category || description.length < 10}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl px-4 py-3 transition-all duration-200"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Enviando...
                </span>
              ) : (
                'Enviar reporte'
              )}
            </button>
          </form>

          {/* Active incidents */}
          {openIncidents.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                Incidencias activas
              </p>
              <div className="space-y-2">
                {openIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl border border-orange-100 transition-all duration-200"
                  >
                    <span className="text-lg">🔧</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {incident.description || incident.title}
                      </p>
                      <p className="text-xs text-slate-500">{formatRelativeDate(incident.created_at)}</p>
                    </div>
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                      {incidentStatusLabels[incident.status] || incident.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-8 px-4">
        <p className="text-xs text-slate-400">BaW · Administración de propiedades</p>
        <a
          href="https://wa.me/524464790229"
          className="text-xs text-blue-600 font-medium mt-1 block"
        >
          📞 +52 446 479 0229
        </a>
      </footer>
    </div>
  )
}
