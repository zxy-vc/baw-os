'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import Breadcrumbs from '@/components/Breadcrumbs'
import Link from 'next/link'

interface ContractWithDetails {
  id: string
  monthly_amount: number
  unit: { number: string } | null
  occupant: { name: string } | null
}

const initialForm = {
  contract_id: '',
  rent_amount: '',
  water_fee: '250',
  amount_paid: '',
  due_date: new Date().toISOString().split('T')[0],
  paid_date: new Date().toISOString().split('T')[0],
  status: 'paid' as string,
  method: 'transfer' as string,
  reference: '',
  notes: '',
}

export default function NewPaymentPage() {
  const router = useRouter()
  const [contracts, setContracts] = useState<ContractWithDetails[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(initialForm)

  const totalAmount = (Number(form.rent_amount) || 0) + (Number(form.water_fee) || 0)
  const needsAmountPaid = form.status === 'paid' || form.status === 'partial'

  useEffect(() => {
    supabase
      .from('contracts')
      .select('*, unit:units(number), occupant:occupants(name)')
      .in('status', ['active', 'en_renovacion'])
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
      rent_amount: contract ? String(contract.monthly_amount) : '',
      amount_paid: contract ? String(contract.monthly_amount + 250) : '',
    })
  }

  async function handleSave(andAnother: boolean) {
    setSaving(true)

    if (needsAmountPaid && !form.amount_paid) {
      setSaving(false)
      return
    }

    const { error } = await supabase.from('payments').insert({
      contract_id: form.contract_id,
      rent_amount: Number(form.rent_amount),
      water_fee: Number(form.water_fee),
      amount: totalAmount,
      amount_paid: needsAmountPaid ? Number(form.amount_paid) : null,
      due_date: form.due_date,
      paid_date: needsAmountPaid ? form.paid_date : null,
      status: form.status,
      method: form.method || null,
      reference: form.reference || null,
      notes: form.notes || null,
    })

    if (!error) {
      if (andAnother) {
        setForm({
          ...initialForm,
          due_date: new Date().toISOString().split('T')[0],
          paid_date: new Date().toISOString().split('T')[0],
        })
      } else {
        router.push('/payments')
      }
    }
    setSaving(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await handleSave(false)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Pagos', href: '/payments' },
        { label: 'Nuevo pago' },
      ]} />
      <div className="flex items-center gap-4">
        <Link
          href="/payments"
          className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Registrar pago</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Registrar pago recibido o pendiente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Contrato</label>
          <select
            required
            value={form.contract_id}
            onChange={(e) => handleContractChange(e.target.value)}
            className="input-field"
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Renta</label>
            <input
              type="number"
              required
              step="0.01"
              value={form.rent_amount}
              onChange={(e) => setForm({ ...form, rent_amount: e.target.value })}
              className="input-field"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Agua</label>
            <input
              type="number"
              step="0.01"
              value={form.water_fee}
              onChange={(e) => setForm({ ...form, water_fee: e.target.value })}
              className="input-field"
              placeholder="250"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Total</label>
            <div className="input-field bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white font-semibold flex items-center">
              {formatCurrency(totalAmount)}
            </div>
            {form.rent_amount && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {formatCurrency(Number(form.rent_amount))} + {formatCurrency(Number(form.water_fee) || 0)} = {formatCurrency(totalAmount)}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
              Monto pagado {needsAmountPaid && <span className="text-red-500">*</span>}
            </label>
            <input
              type="number"
              required={needsAmountPaid}
              step="0.01"
              value={form.amount_paid}
              onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Fecha vencimiento</label>
            <input
              type="date"
              required
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="input-field"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Fecha de pago</label>
            <input
              type="date"
              value={form.paid_date}
              onChange={(e) => setForm({ ...form, paid_date: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Estado</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="input-field"
            >
              <option value="paid">Pagado</option>
              <option value="pending">Pendiente</option>
              <option value="late">En mora</option>
              <option value="partial">Parcial</option>
              <option value="waived">Condonado</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Método de pago</label>
            <select
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
              className="input-field"
            >
              <option value="transfer">Transferencia</option>
              <option value="cash">Efectivo</option>
              <option value="spei">SPEI</option>
              <option value="stripe">Stripe</option>
              <option value="other">Otro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Referencia</label>
            <input
              type="text"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              className="input-field"
              placeholder="No. de transferencia, folio, etc."
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Notas</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="input-field"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/payments"
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(true)}
            className="px-4 py-2 border border-indigo-600 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar y registrar otro'}
          </button>
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
