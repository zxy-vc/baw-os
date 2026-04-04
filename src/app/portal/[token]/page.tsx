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

const statusLabels: Record<string, string> = {
  active: 'Activo',
  expired: 'Vencido',
  terminated: 'Terminado',
  pending: 'Pendiente',
  renewed: 'Renovado',
  en_renovacion: 'En renovación',
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-red-100 text-red-700',
  terminated: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-700',
  renewed: 'bg-blue-100 text-blue-700',
  en_renovacion: 'bg-amber-100 text-amber-700',
}

const paymentStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  late: 'Vencido',
  partial: 'Parcial',
  waived: 'Condonado',
}

const paymentStatusColors: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-yellow-100 text-yellow-700',
  late: 'bg-red-100 text-red-700',
  partial: 'bg-orange-100 text-orange-700',
  waived: 'bg-gray-100 text-gray-700',
}

const incidentStatusLabels: Record<string, string> = {
  open: 'Abierto',
  in_progress: 'En proceso',
  waiting_parts: 'Esperando refacciones',
  resolved: 'Resuelto',
  cancelled: 'Cancelado',
}

const categories = ['Plomería', 'Electricidad', 'Acceso', 'Otro']

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount)
}

function formatDate(date: string): string {
  const [year, month, day] = date.split('T')[0].split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatMonth(date: string): string {
  const [year, month] = date.split('T')[0].split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
  })
}

export default function PortalPage() {
  const params = useParams()
  const token = Array.isArray(params.token) ? params.token[0] : params.token
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Incident form state
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
      // Refresh data to show new incident
      const updated = await fetch(`/api/portal/${token}`)
      if (updated.ok) setData(await updated.json())
    } catch {
      setSubmitResult('error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-lg">Cargando portal...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-6xl mb-4">🏠</p>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Portal no disponible</h1>
          <p className="text-gray-500">Este enlace no es válido o el portal ha sido desactivado.</p>
        </div>
      </div>
    )
  }

  const { contract, unit, payments, incidents } = data

  const pendingPayments = payments.filter(
    (p) => p.status === 'pending' || p.status === 'late'
  )
  const totalPending = pendingPayments.reduce((sum, p) => sum + p.amount, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏠</span>
            <span className="font-bold text-gray-900 text-lg">BaW</span>
          </div>
          {unit && (
            <span className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
              Depto {unit.unit_number}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Hola, {contract.tenant_name}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Bienvenido a tu portal de inquilino</p>
        </div>

        {/* Pending payment banner */}
        {totalPending > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-xl">🔴</span>
            <div>
              <p className="text-red-800 font-medium">
                Tienes un saldo pendiente de {formatCurrency(totalPending)}
              </p>
              <p className="text-red-600 text-sm mt-1">
                Contáctanos al WhatsApp de BaW para resolver tu pago
              </p>
            </div>
          </div>
        )}

        {/* Section 1 — Mi Depto */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Mi Departamento
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400">Unidad</p>
              <p className="text-sm font-medium text-gray-900">
                {unit?.unit_number || '—'} — Piso {unit?.floor ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Tipo</p>
              <p className="text-sm font-medium text-gray-900">{unit?.type || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Renta mensual</p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(contract.monthly_amount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Agua</p>
              <p className="text-lg font-bold text-gray-900">
                {contract.water_fee ? formatCurrency(contract.water_fee) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Período</p>
              <p className="text-sm text-gray-900">
                {formatDate(contract.start_date)} —{' '}
                {contract.end_date ? formatDate(contract.end_date) : 'Indefinido'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Estado</p>
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                  statusColors[contract.status] || 'bg-gray-100 text-gray-700'
                }`}
              >
                {statusLabels[contract.status] || contract.status}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Tu próximo pago de{' '}
              <span className="font-medium text-gray-700">
                {formatCurrency(contract.monthly_amount + (contract.water_fee || 0))}
              </span>{' '}
              vence el día <span className="font-medium text-gray-700">{contract.payment_day}</span>
            </p>
          </div>
        </div>

        {/* Section 2 — Mis Pagos */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Mis Pagos
          </h2>
          {payments.length === 0 ? (
            <p className="text-gray-400 text-sm">No hay pagos registrados aún.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-400 uppercase py-2">
                      Mes
                    </th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase py-2">
                      Monto
                    </th>
                    <th className="text-left text-xs font-medium text-gray-400 uppercase py-2">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {payments.map((p, i) => (
                    <tr key={i}>
                      <td className="py-2.5 text-sm text-gray-700 capitalize">
                        {formatMonth(p.month)}
                      </td>
                      <td className="py-2.5 text-sm font-medium text-gray-900">
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            paymentStatusColors[p.status] || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {paymentStatusLabels[p.status] || p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 3 — Reportar Incidencia */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Reportar Incidencia
          </h2>

          {submitResult === 'success' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
              <p className="text-emerald-700 text-sm font-medium">
                ✅ Tu reporte fue recibido. Enrique lo atenderá pronto.
              </p>
            </div>
          )}

          {submitResult === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-700 text-sm font-medium">
                Ocurrió un error. Intenta de nuevo.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmitIncident} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">Selecciona una categoría</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                minLength={10}
                rows={3}
                placeholder="Describe el problema con detalle (mín. 10 caracteres)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !category || description.length < 10}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg px-4 py-2.5 transition-colors"
            >
              {submitting ? 'Enviando...' : 'Enviar reporte'}
            </button>
          </form>

          {/* Active incidents */}
          {incidents.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-100">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Incidencias activas
              </h3>
              <div className="space-y-3">
                {incidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="bg-gray-50 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-900">{inc.title}</p>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        {incidentStatusLabels[inc.status] || inc.status}
                      </span>
                    </div>
                    {inc.description && (
                      <p className="text-xs text-gray-500">{inc.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{formatDate(inc.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-8">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <p className="text-sm text-gray-500">
            BaW — Administración de propiedades
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Contacto: +52 446 479 0229
          </p>
        </div>
      </footer>
    </div>
  )
}
