'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'

interface ContractWithDetails {
  id: string
  monthly_amount: number
  unit: { number: string } | null
  occupant: { name: string } | null
}

export default function NewPaymentPage() {
  const router = useRouter()
  const [contracts, setContracts] = useState<ContractWithDetails[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    contract_id: '',
    amount: '',
    amount_paid: '',
    due_date: new Date().toISOString().split('T')[0],
    paid_date: new Date().toISOString().split('T')[0],
    status: 'paid' as string,
    method: 'transfer' as string,
    reference: '',
    notes: '',
  })

  useEffect(() => {
    supabase
      .from('contracts')
      .select('*, unit:units(number), occupant:occupants(name)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setContracts((data as ContractWithDetails[]) || [])
      })
  }, [])

  function handleContractChange(contractId: string) {
    const contract = contracts.find((c) => c.id === contractId)
    setForm({
      ...form,
      contract_id: contractId,
      amount: contract ? String(contract.monthly_amount) : '',
      amount_paid: contract ? String(contract.monthly_amount) : '',
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const { error } = await supabase.from('payments').insert({
      contract_id: form.contract_id,
      amount: Number(form.amount),
      amount_paid: form.status === 'paid' || form.status === 'partial' ? Number(form.amount_paid) : null,
      due_date: form.due_date,
      paid_date: form.status === 'paid' || form.status === 'partial' ? form.paid_date : null,
      status: form.status,
      method: form.method || null,
      reference: form.reference || null,
      notes: form.notes || null,
    })

    if (!error) {
      router.push('/payments')
    }
    setSaving(false)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/payments"
          className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Registrar pago</h1>
          <p className="text-gray-400 mt-1">Registrar pago recibido o pendiente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Contrato</label>
          <select
            required
            value={form.contract_id}
            onChange={(e) => handleContractChange(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="">Seleccionar contrato...</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.occupant as { name: string } | null)?.name || 'Sin nombre'} — Unidad{' '}
                {(c.unit as { number: string } | null)?.number || '—'} ({formatCurrency(c.monthly_amount)}/mes)
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Monto esperado</label>
            <input
              type="number"
              required
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Monto pagado</label>
            <input
              type="number"
              step="0.01"
              value={form.amount_paid}
              onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Fecha vencimiento</label>
            <input
              type="date"
              required
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Fecha de pago</label>
            <input
              type="date"
              value={form.paid_date}
              onChange={(e) => setForm({ ...form, paid_date: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Estado</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="paid">Pagado</option>
              <option value="pending">Pendiente</option>
              <option value="late">En mora</option>
              <option value="partial">Parcial</option>
              <option value="waived">Condonado</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Método de pago</label>
            <select
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="transfer">Transferencia</option>
              <option value="cash">Efectivo</option>
              <option value="spei">SPEI</option>
              <option value="stripe">Stripe</option>
              <option value="other">Otro</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Referencia</label>
          <input
            type="text"
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            placeholder="No. de transferencia, folio, etc."
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Notas</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/payments"
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Guardando...' : 'Registrar pago'}
          </button>
        </div>
      </form>
    </div>
  )
}
