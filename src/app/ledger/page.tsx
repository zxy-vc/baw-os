'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Plus, X, Lock, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'

interface LedgerEntry {
  id: string
  payment_id: string | null
  contract_id: string
  unit_id: string
  tenant_name: string | null
  amount: number
  water_fee: number
  total: number
  payment_method: string
  confirmed_by: string | null
  confirmed_at: string | null
  notes: string | null
  created_at: string
}

interface ContractOption {
  id: string
  unit_id: string
  monthly_amount: number
  unit_number: string
  tenant_name: string
}

const ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'

const METHOD_LABELS: Record<string, { icon: string; label: string }> = {
  efectivo: { icon: '💵', label: 'Efectivo' },
  transferencia: { icon: '🏦', label: 'Trans' },
  cheque: { icon: '📄', label: 'Cheque' },
  otro: { icon: '📎', label: 'Otro' },
}

const CONFIRMER_COLORS: Record<string, string> = {
  alicia: 'bg-orange-500',
  enrique: 'bg-blue-500',
  fran: 'bg-emerald-500',
  system: 'bg-gray-500',
}

function formatLedgerDate(iso: string): string {
  const d = new Date(iso)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const day = String(d.getDate()).padStart(2, '0')
  const month = months[d.getMonth()]
  const year = d.getFullYear()
  const hours = String(d.getHours() % 12 || 12).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
  return `${day} ${month} ${year} · ${hours}:${mins} ${ampm}`
}

export default function LedgerPage() {
  const toast = useToast()
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Filters
  const [filterUnit, setFilterUnit] = useState('all')
  const [filterMonth, setFilterMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [filterConfirmer, setFilterConfirmer] = useState('all')

  // Units for filter dropdown
  const [units, setUnits] = useState<{ id: string; number: string }[]>([])

  // Contracts for modal
  const [contracts, setContracts] = useState<ContractOption[]>([])

  // Form
  const [form, setForm] = useState({
    contract_id: '',
    amount: 0,
    water_fee: 250,
    payment_method: 'efectivo',
    confirmed_by: 'alicia',
    notes: '',
  })

  async function fetchEntries() {
    setLoading(true)
    const [year, month] = filterMonth.split('-').map(Number)
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`
    const nextMonth = month === 12
      ? `${year + 1}-01-01T00:00:00`
      : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00`

    let query = supabase
      .from('payment_ledger')
      .select('*')
      .eq('org_id', ORG_ID)
      .gte('created_at', monthStart)
      .lt('created_at', nextMonth)
      .order('created_at', { ascending: false })

    if (filterUnit !== 'all') query = query.eq('unit_id', filterUnit)
    if (filterConfirmer !== 'all') query = query.eq('confirmed_by', filterConfirmer)

    const { data, error } = await query
    if (error) {
      toast.error('Error al cargar bitácora')
    } else {
      setEntries((data || []) as LedgerEntry[])
    }
    setLoading(false)
  }

  async function fetchUnits() {
    const { data } = await supabase
      .from('units')
      .select('id, number')
      .eq('org_id', ORG_ID)
      .order('number')
    setUnits((data || []) as { id: string; number: string }[])
  }

  async function fetchContracts() {
    const { data } = await supabase
      .from('contracts')
      .select('id, unit_id, monthly_amount, unit:units(number), occupant:occupants(name)')
      .in('status', ['active', 'en_renovacion'])
      .eq('org_id', ORG_ID)

    const options: ContractOption[] = ((data || []) as unknown as Array<{
      id: string
      unit_id: string
      monthly_amount: number
      unit: { number: string } | null
      occupant: { name: string } | null
    }>).map((c) => ({
      id: c.id,
      unit_id: c.unit_id,
      monthly_amount: c.monthly_amount,
      unit_number: c.unit?.number || '—',
      tenant_name: c.occupant?.name || 'Sin inquilino',
    }))

    options.sort((a, b) => a.unit_number.localeCompare(b.unit_number))
    setContracts(options)
  }

  useEffect(() => {
    fetchUnits()
    fetchContracts()
  }, [])

  useEffect(() => {
    fetchEntries()
  }, [filterMonth, filterUnit, filterConfirmer])

  function openModal() {
    const first = contracts[0]
    setForm({
      contract_id: first?.id || '',
      amount: first?.monthly_amount || 0,
      water_fee: 250,
      payment_method: 'efectivo',
      confirmed_by: 'alicia',
      notes: '',
    })
    setShowModal(true)
  }

  function onContractChange(contractId: string) {
    const c = contracts.find((x) => x.id === contractId)
    setForm({ ...form, contract_id: contractId, amount: c?.monthly_amount || 0 })
  }

  async function handleSubmit() {
    if (!form.contract_id) return
    setSaving(true)

    const contract = contracts.find((c) => c.id === form.contract_id)
    if (!contract) { setSaving(false); return }

    const { data, error } = await supabase.from('payment_ledger').insert({
      org_id: ORG_ID,
      contract_id: form.contract_id,
      unit_id: contract.unit_id,
      tenant_name: contract.tenant_name,
      amount: form.amount,
      water_fee: form.water_fee,
      total: form.amount + form.water_fee,
      payment_method: form.payment_method,
      confirmed_by: form.confirmed_by,
      notes: form.notes || null,
    }).select().single()

    // Also log to audit_log
    if (data) {
      await supabase.from('audit_log').insert({
        org_id: ORG_ID,
        actor_type: 'human',
        actor_id: form.confirmed_by,
        action: 'payment.confirmed',
        entity_type: 'payment_ledger',
        entity_id: data.id,
        after_data: data,
      })
    }

    setSaving(false)
    setShowModal(false)

    if (error) {
      toast.error('Error al registrar cobro')
    } else {
      toast.success('Cobro registrado en bitácora')
      fetchEntries()
    }
  }

  const selectedContract = contracts.find((c) => c.id === form.contract_id)
  const totalEntries = entries.reduce((s, e) => s + e.total, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-indigo-500" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Bitácora de Cobros</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Lock className="w-3 h-3" />
                Registro inmutable
              </span>
              Cada entrada queda sellada con fecha y hora
            </p>
          </div>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Registrar cobro
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterUnit}
          onChange={(e) => setFilterUnit(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">Todas las unidades</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.number}</option>
          ))}
        </select>
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="input-field w-auto"
        />
        <select
          value={filterConfirmer}
          onChange={(e) => setFilterConfirmer(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">Todos</option>
          <option value="alicia">Alicia</option>
          <option value="enrique">Enrique</option>
          <option value="fran">Fran</option>
          <option value="system">Sistema</option>
        </select>
        {entries.length > 0 && (
          <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
            {entries.length} registro{entries.length !== 1 ? 's' : ''} · Total: <span className="font-semibold text-emerald-500">{formatCurrency(totalEntries)}</span>
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Sin registros en este periodo"
          description="Los cobros registrados aparecerán aquí como entradas inmutables"
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Fecha / Hora</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Unidad</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Inquilino</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Método</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Monto</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Agua</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Total</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Confirmó</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Notas</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const method = METHOD_LABELS[entry.payment_method] || METHOD_LABELS.otro
                const confirmer = entry.confirmed_by || 'system'
                const initial = confirmer.charAt(0).toUpperCase()
                const color = CONFIRMER_COLORS[confirmer] || CONFIRMER_COLORS.system
                const unitObj = units.find((u) => u.id === entry.unit_id)

                return (
                  <tr key={entry.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                      {formatLedgerDate(entry.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {unitObj?.number || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {entry.tenant_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        {method.icon} {method.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(entry.water_fee)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(entry.total)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-5 h-5 rounded-full ${color} flex items-center justify-center text-[10px] font-bold text-white`}>
                          {initial}
                        </span>
                        <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">{confirmer}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[200px] truncate">
                      {entry.notes || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal — Registrar cobro */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4 relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Registrar cobro</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Esta entrada no se puede editar ni borrar</p>

            <div className="space-y-4">
              {/* Contract select */}
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Contrato</label>
                <select
                  value={form.contract_id}
                  onChange={(e) => onContractChange(e.target.value)}
                  className="input-field w-full"
                >
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.unit_number} — {c.tenant_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Monto renta</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  className="input-field w-full"
                />
              </div>

              {/* Water fee */}
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Agua</label>
                <input
                  type="number"
                  value={form.water_fee}
                  onChange={(e) => setForm({ ...form, water_fee: Number(e.target.value) })}
                  className="input-field w-full"
                />
              </div>

              {/* Total */}
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Total</label>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(form.amount + form.water_fee)}
                </p>
              </div>

              {/* Method */}
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Método de pago</label>
                <select
                  value={form.payment_method}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                  className="input-field w-full"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="cheque">Cheque</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              {/* Confirmed by */}
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Confirmado por</label>
                <select
                  value={form.confirmed_by}
                  onChange={(e) => setForm({ ...form, confirmed_by: e.target.value })}
                  className="input-field w-full"
                >
                  <option value="alicia">Alicia</option>
                  <option value="enrique">Enrique</option>
                  <option value="fran">Fran</option>
                  <option value="system">Sistema</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Notas (opcional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="input-field w-full"
                  rows={2}
                  placeholder="Observaciones del cobro..."
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || !form.contract_id}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Registrando...' : 'Registrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
