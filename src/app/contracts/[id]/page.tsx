'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils'
import type { Contract, Payment } from '@/types'
import Link from 'next/link'

export default function ContractDetailPage() {
  const params = useParams()
  const [contract, setContract] = useState<Contract | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const [contractRes, paymentsRes] = await Promise.all([
        supabase
          .from('contracts')
          .select('*, unit:units(number, floor, type), occupant:occupants(name, phone, email)')
          .eq('id', params.id)
          .single(),
        supabase
          .from('payments')
          .select('*')
          .eq('contract_id', params.id)
          .order('due_date', { ascending: false }),
      ])
      setContract(contractRes.data)
      setPayments(paymentsRes.data || [])
      setLoading(false)
    }
    fetch()
  }, [params.id])

  if (loading) return <div className="text-gray-500">Cargando contrato...</div>
  if (!contract) return <div className="text-gray-500">Contrato no encontrado.</div>

  const unit = contract.unit as { number: string; floor: number; type: string } | null
  const occupant = contract.occupant as { name: string; phone?: string; email?: string } | null
  const days = contract.end_date ? daysUntil(contract.end_date) : null
  const isExpiring = days !== null && days <= 30 && days > 0 && contract.status === 'active'

  const statusLabels: Record<string, string> = {
    active: 'Activo',
    expired: 'Vencido',
    terminated: 'Terminado',
    pending: 'Pendiente',
    renewed: 'Renovado',
  }

  const paymentStatusLabels: Record<string, string> = {
    pending: 'Pendiente',
    paid: 'Pagado',
    late: 'En mora',
    partial: 'Parcial',
    waived: 'Condonado',
  }

  const paymentStatusBadge: Record<string, string> = {
    pending: 'badge-pending',
    paid: 'badge-paid',
    late: 'badge-late',
    partial: 'badge-maintenance',
    waived: 'badge-expired',
  }

  const totalPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount_paid || p.amount), 0)

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/contracts"
          className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">
            Contrato — {occupant?.name || 'Sin inquilino'}
          </h1>
          <p className="text-gray-400 mt-1">
            Unidad {unit?.number || '—'} · {statusLabels[contract.status]}
          </p>
        </div>
      </div>

      {isExpiring && (
        <div className="card border-amber-500/30">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <p className="text-sm text-amber-400">
              Este contrato vence en {days} días ({formatDate(contract.end_date!)}).
              Contactar al inquilino para renovación.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Inquilino
          </h3>
          <p className="text-white font-medium">{occupant?.name || '—'}</p>
          {occupant?.phone && <p className="text-sm text-gray-400">{occupant.phone}</p>}
          {occupant?.email && <p className="text-sm text-gray-400">{occupant.email}</p>}
        </div>
        <div className="card space-y-3">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Unidad
          </h3>
          <p className="text-white font-medium">
            {unit?.number || '—'} — Piso {unit?.floor ?? '—'}
          </p>
          <p className="text-sm text-gray-400">Tipo: {unit?.type || '—'}</p>
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
          Detalles del contrato
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Renta mensual</p>
            <p className="text-lg font-semibold text-white">{formatCurrency(contract.monthly_amount)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Depósito</p>
            <p className="text-lg font-semibold text-white">
              {contract.deposit_amount ? formatCurrency(contract.deposit_amount) : '—'}
            </p>
            {contract.deposit_amount && (
              <p className={`text-xs ${contract.deposit_paid ? 'text-emerald-400' : 'text-amber-400'}`}>
                {contract.deposit_paid ? 'Pagado' : 'Pendiente'}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">Período</p>
            <p className="text-sm text-white">{formatDate(contract.start_date)}</p>
            <p className="text-sm text-gray-400">
              {contract.end_date ? formatDate(contract.end_date) : 'Indefinido'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Día de pago</p>
            <p className="text-lg font-semibold text-white">{contract.payment_day}</p>
          </div>
        </div>
        {contract.notes && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-500 mb-1">Notas</p>
            <p className="text-sm text-gray-300">{contract.notes}</p>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Historial de pagos
          </h3>
          <div className="text-sm text-gray-400">
            Total cobrado: <span className="text-white font-medium">{formatCurrency(totalPaid)}</span>
          </div>
        </div>
        {payments.length === 0 ? (
          <p className="text-gray-500 text-sm">No hay pagos registrados para este contrato.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-xs font-medium text-gray-500 uppercase py-2">Vencimiento</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase py-2">Monto</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase py-2">Pagado</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase py-2">Estado</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase py-2">Fecha pago</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase py-2">Método</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 text-sm text-gray-300">{formatDate(p.due_date)}</td>
                  <td className="py-2 text-sm text-white">{formatCurrency(p.amount)}</td>
                  <td className="py-2 text-sm text-white">
                    {p.amount_paid ? formatCurrency(p.amount_paid) : '—'}
                  </td>
                  <td className="py-2">
                    <span className={paymentStatusBadge[p.status] || 'badge-expired'}>
                      {paymentStatusLabels[p.status] || p.status}
                    </span>
                  </td>
                  <td className="py-2 text-sm text-gray-400">
                    {p.paid_date ? formatDate(p.paid_date) : '—'}
                  </td>
                  <td className="py-2 text-sm text-gray-400">{p.method || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
