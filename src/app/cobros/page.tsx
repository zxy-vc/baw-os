'use client'

import { useEffect, useState } from 'react'
import { Receipt, X, Save, Check, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrgContext } from '@/hooks/useOrgContext'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import { calcMoraSurcharge } from '@/lib/mora-engine'
import { mapPaymentMethod, referenceFor } from '@/lib/cobros'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import InvoiceModal from '@/components/InvoiceModal'

interface ContractRow {
  id: string
  unit_id: string
  occupant_id: string
  monthly_amount: number
  payment_day: number
  status: string
  start_date: string | null
  unit: { number: string } | null
  occupant: { name: string } | null
}

interface PaymentRow {
  id: string
  contract_id: string
  status: string
  due_date: string
  paid_date: string | null
  amount: number
  amount_paid: number | null
  rent_amount: number | null
  water_fee: number | null
  late_fee_amount: number | null
  late_fee_level: string | null
  method: string | null
  reference: string | null
  confirmed_by: string | null
}

type BillingStatus = 'pagado' | 'parcial' | 'pendiente' | 'vencido' | 'mora' | 'verbal'

interface BillingRow {
  contract: ContractRow
  payment: PaymentRow | null
  month: string // 'YYYY-MM'
  dueDate: string // 'YYYY-MM-DD'
  status: BillingStatus
  moraAmount: number
  remaining: number
}

const WATER_FEE_DEFAULT = 250
const MAX_MONTHS_BACK = 24
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function dayDiff(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

function methodLabel(method: string | null | undefined): string {
  switch (method) {
    case 'cash':
      return 'Efectivo'
    case 'transfer':
      return 'Transferencia'
    case 'stripe':
      return 'Stripe'
    default:
      return method || '—'
  }
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

// Meses 'YYYY-MM' desde el inicio del contrato hasta el mes de corte (inclusive),
// acotado a los últimos MAX_MONTHS_BACK meses para no generar listas gigantes.
function scheduleMonths(startISO: string | null, cutoff: string): string[] {
  const [cy, cm] = cutoff.split('-').map(Number)
  let y: number
  let m: number
  if (startISO) {
    // Derivar el mes directo del string 'YYYY-MM-DD' para no desfasar por zona
    // horaria (new Date('2026-02-01') retrocede a ene 31 en husos UTC negativos).
    const [sy, sm] = startISO.slice(0, 7).split('-').map(Number)
    y = sy
    m = sm
  } else {
    y = cy
    m = cm
  }
  const out: string[] = []
  while (y < cy || (y === cy && m <= cm)) {
    out.push(`${y}-${pad2(m)}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out.slice(-MAX_MONTHS_BACK)
}

// Prioridad de pago cuando hay más de un registro en el mismo mes.
function rankPayment(p: PaymentRow): number {
  if (p.status === 'paid') return 3
  if (p.status === 'partial') return 2
  return 1
}

// Mora sugerida al registrar: respeta una mora ya guardada; si no, la calcula por
// los días entre el vencimiento y la fecha de pago.
function suggestedMora(rent: number, dueDate: string, paidDate: string, payment: PaymentRow | null): number {
  if (payment && payment.late_fee_amount != null) return Number(payment.late_fee_amount)
  const days = Math.max(0, dayDiff(new Date(`${dueDate}T00:00:00`), new Date(`${paidDate}T00:00:00`)))
  return calcMoraSurcharge(rent, days).amount
}

export default function CobrosPage() {
  const toast = useToast()
  const [rows, setRows] = useState<BillingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  })
  const { orgId } = useOrgContext()

  // Modal state
  const [payingRow, setPayingRow] = useState<BillingRow | null>(null)
  const [payForm, setPayForm] = useState({
    rent_amount: 0,
    water_fee: WATER_FEE_DEFAULT,
    late_fee: 0,
    method: 'Transferencia',
    reference: '',
    paid_date: new Date().toISOString().split('T')[0],
    is_partial: false,
    amount_paid: 0,
  })
  const [saving, setSaving] = useState(false)
  const [confirmedBy, setConfirmedBy] = useState('alicia')
  const [chronicDebtors, setChronicDebtors] = useState<{ name: string; count: number }[]>([])
  const [invoicingRow, setInvoicingRow] = useState<BillingRow | null>(null)

  async function fetchBilling() {
    setLoading(true)
    const [cutYear, cutMonth] = selectedMonth.split('-').map(Number)
    // Límite superior exclusivo: primer día del mes siguiente al de corte.
    const upperExcl = cutMonth === 12 ? `${cutYear + 1}-01-01` : `${cutYear}-${pad2(cutMonth + 1)}-01`

    const contractsRes = await supabase
      .from('contracts')
      .select(
        'id, unit_id, occupant_id, monthly_amount, payment_day, status, start_date, unit:units(number), occupant:occupants(name)',
      )
      .in('status', ['active', 'en_renovacion'])
      .eq('org_id', orgId)

    const contracts = (contractsRes.data || []) as unknown as ContractRow[]
    const contractIds = contracts.map((c) => c.id)

    const paymentsRes = contractIds.length
      ? await supabase
          .from('payments')
          .select(
            'id, contract_id, status, due_date, paid_date, amount, amount_paid, rent_amount, water_fee, late_fee_amount, late_fee_level, method, reference, confirmed_by',
          )
          .in('contract_id', contractIds)
          .lt('due_date', upperExcl)
      : { data: [] as PaymentRow[] }

    const payments = (paymentsRes.data || []) as PaymentRow[]

    // Indexa pagos por contrato+mes (mes tomado del due_date).
    const paymentByKey = new Map<string, PaymentRow>()
    for (const p of payments) {
      const key = `${p.contract_id}|${p.due_date.slice(0, 7)}`
      const prev = paymentByKey.get(key)
      if (!prev || rankPayment(p) > rankPayment(prev)) paymentByKey.set(key, p)
    }

    const today = new Date()
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    const billingRows: BillingRow[] = []
    for (const c of contracts) {
      const day = c.payment_day || 1
      for (const month of scheduleMonths(c.start_date, selectedMonth)) {
        const dueDate = `${month}-${pad2(day)}`
        const payment = paymentByKey.get(`${c.id}|${month}`) || null

        const base = payment?.amount ?? c.monthly_amount + WATER_FEE_DEFAULT
        const fee = Number(payment?.late_fee_amount || 0)
        const paid = Number(payment?.amount_paid || 0)
        const hasCollection = payment != null && (payment.status === 'paid' || payment.status === 'partial')

        let status: BillingStatus = 'pendiente'
        let moraAmount = 0
        let remaining = 0

        if (hasCollection) {
          remaining = Math.max(0, base + fee - paid)
          status = remaining > 0.001 ? 'parcial' : 'pagado'
        } else if (!c.payment_day) {
          status = 'verbal'
        } else {
          const due = new Date(`${dueDate}T00:00:00`)
          if (todayMid < due) {
            status = 'pendiente'
          } else {
            // Recargo escalonado (motor de mora): 0% gracia (1-5d), 5% (6-15d), 10% (16+).
            const daysPastDue = dayDiff(due, todayMid)
            const { amount: surcharge } = calcMoraSurcharge(c.monthly_amount, daysPastDue)
            if (surcharge > 0) {
              status = 'mora'
              moraAmount = surcharge
            } else {
              status = 'vencido'
            }
          }
        }

        billingRows.push({ contract: c, payment, month, dueDate, status, moraAmount, remaining })
      }
    }

    // Orden: por unidad y luego por mes ascendente.
    billingRows.sort((a, b) => {
      const u = (a.contract.unit?.number || '').localeCompare(b.contract.unit?.number || '')
      if (u !== 0) return u
      return a.month.localeCompare(b.month)
    })

    // Deudores crónicos: contratos con ≥2 meses pendientes/vencidos/parciales.
    const debtorMap = new Map<string, { name: string; count: number }>()
    for (const r of billingRows) {
      if (r.status === 'vencido' || r.status === 'mora' || r.status === 'parcial') {
        const name = r.contract.occupant?.name || 'Sin nombre'
        const e = debtorMap.get(r.contract.id)
        if (e) e.count++
        else debtorMap.set(r.contract.id, { name, count: 1 })
      }
    }
    setChronicDebtors(
      Array.from(debtorMap.values())
        .filter((d) => d.count >= 2)
        .sort((a, b) => b.count - a.count),
    )

    setRows(billingRows)
    setLoading(false)
  }

  useEffect(() => {
    if (!orgId) return
    fetchBilling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, orgId])

  function openPayModal(row: BillingRow) {
    const c = row.contract
    const today = new Date().toISOString().split('T')[0]
    const rent = row.payment?.rent_amount ?? c.monthly_amount
    const water = row.payment?.water_fee ?? WATER_FEE_DEFAULT
    const lateFee = suggestedMora(rent, row.dueDate, today, row.payment)
    setPayingRow(row)
    setPayForm({
      rent_amount: rent,
      water_fee: water,
      late_fee: lateFee,
      method: 'Transferencia',
      reference: row.payment?.reference || referenceFor(c.unit?.number, row.month),
      paid_date: today,
      is_partial: false,
      amount_paid: rent + water + lateFee,
    })
  }

  // Recalcula la mora sugerida cuando cambia la fecha de pago (días de atraso).
  function onPaidDateChange(paid_date: string) {
    if (!payingRow) return
    const lateFee = suggestedMora(payForm.rent_amount, payingRow.dueDate, paid_date, payingRow.payment)
    setPayForm((f) => ({
      ...f,
      paid_date,
      late_fee: lateFee,
      amount_paid: f.is_partial ? f.amount_paid : f.rent_amount + f.water_fee + lateFee,
    }))
  }

  async function handleMarkPaid() {
    if (!payingRow) return
    setSaving(true)
    const c = payingRow.contract

    const dueDate = payingRow.dueDate
    const lateFee = Math.max(0, payForm.late_fee)
    const baseAmount = payForm.rent_amount + payForm.water_fee
    const totalDue = baseAmount + lateFee // renta + agua + mora
    const amountReceived = payForm.is_partial
      ? Math.max(0, Math.min(payForm.amount_paid, totalDue))
      : totalDue

    const daysLate = Math.max(
      0,
      dayDiff(new Date(`${dueDate}T00:00:00`), new Date(`${payForm.paid_date}T00:00:00`)),
    )
    const { level: lateLevel } = calcMoraSurcharge(payForm.rent_amount, daysLate)
    // Dos columnas, dos vocabularios (ver src/lib/cobros.ts):
    //  - payments.method         → enum en inglés (transfer/cash/stripe…)
    //  - payments.payment_method → TEXT en español (efectivo/transferencia/otro)
    const { methodEnum, paymentMethodEs } = mapPaymentMethod(payForm.method)

    const existing = payingRow.payment
    let paymentData: { id: string } | null = null
    let error: { message: string } | null = null
    let isPartial = false

    const common = {
      amount: baseAmount,
      rent_amount: payForm.rent_amount,
      water_fee: payForm.water_fee,
      late_fee_amount: lateFee,
      late_fee_level: lateFee > 0 ? lateLevel : null,
      paid_date: payForm.paid_date,
      method: methodEnum,
      reference: payForm.reference || null,
      confirmed_by: confirmedBy,
      confirmed_at: new Date().toISOString(),
      payment_method: paymentMethodEs,
    }

    if (existing) {
      // Suma el abono al renglón del periodo en vez de duplicar el cargo.
      const prevPaid = Number(existing.amount_paid || 0)
      const newPaid = payForm.is_partial ? Math.min(prevPaid + amountReceived, totalDue) : totalDue
      isPartial = newPaid + 0.001 < totalDue
      const res = await supabase
        .from('payments')
        .update({ ...common, amount_paid: newPaid, status: isPartial ? 'partial' : 'paid' })
        .eq('id', existing.id)
        .select()
        .single()
      paymentData = res.data
      error = res.error
    } else {
      isPartial = amountReceived + 0.001 < totalDue
      const res = await supabase
        .from('payments')
        .insert({
          ...common,
          org_id: orgId,
          contract_id: c.id,
          due_date: dueDate,
          amount_paid: amountReceived,
          status: isPartial ? 'partial' : 'paid',
        })
        .select()
        .single()
      paymentData = res.data
      error = res.error
    }

    if (paymentData && !error) {
      // Comprobante por WhatsApp (fire-and-forget; gateado por el flag de cobranza).
      fetch(`/api/payments/${paymentData.id}/receipt`, { method: 'POST' }).catch(() => {})
      // Asiento en el ledger.
      await supabase.from('payment_ledger').insert({
        org_id: orgId,
        payment_id: paymentData.id,
        contract_id: c.id,
        unit_id: c.unit_id,
        tenant_name: c.occupant?.name || null,
        amount: payForm.rent_amount,
        water_fee: payForm.water_fee,
        total: amountReceived,
        payment_method: paymentMethodEs,
        confirmed_by: confirmedBy,
        notes: isPartial
          ? `Pago parcial${payForm.reference ? ` · ${payForm.reference}` : ''}`
          : payForm.reference || null,
      })
    }

    setPayingRow(null)
    setSaving(false)
    if (error) {
      toast.error(`Error al guardar: ${error.message}`)
    } else {
      toast.success(isPartial ? 'Pago parcial registrado' : 'Pago registrado correctamente')
    }
    fetchBilling()
  }

  const filtered =
    filter === 'all'
      ? rows
      : rows.filter((r) => {
          if (filter === 'pendientes') return r.status === 'pendiente'
          if (filter === 'vencidos') return r.status === 'vencido' || r.status === 'mora' || r.status === 'parcial'
          if (filter === 'pagados') return r.status === 'pagado'
          return true
        })

  // Totales sobre TODO el backlog mostrado (todos los meses).
  let totalExpected = 0
  let totalCollected = 0
  for (const r of rows) {
    const rowBase = r.payment?.amount ?? r.contract.monthly_amount + WATER_FEE_DEFAULT
    const rowFee = r.status === 'mora' ? r.moraAmount : Number(r.payment?.late_fee_amount || 0)
    totalExpected += rowBase + rowFee
    totalCollected += Number(r.payment?.amount_paid || 0)
  }
  const totalPending = totalExpected - totalCollected

  const statusBadge = (status: BillingStatus, moraAmount: number, remaining: number) => {
    switch (status) {
      case 'pagado':
        return <span className="badge-available">Pagado</span>
      case 'parcial':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/30">
            Parcial · restan {formatCurrency(remaining)}
          </span>
        )
      case 'pendiente':
        return <span className="badge-pending">Pendiente</span>
      case 'vencido':
        return <span className="badge-late">Vencido</span>
      case 'mora':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border-2 border-red-500/40">
            Mora activa · +{formatCurrency(moraAmount)}
          </span>
        )
      case 'verbal':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30">
            Acuerdo verbal
          </span>
        )
    }
  }

  // Días de atraso del pago que se está registrando (para el hint de mora).
  const modalDaysLate = payingRow
    ? Math.max(0, dayDiff(new Date(`${payingRow.dueDate}T00:00:00`), new Date(`${payForm.paid_date}T00:00:00`)))
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Receipt className="w-6 h-6 text-gray-400" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Cobros</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Estado de pagos mes a mes — Contratos LTR / MTR
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 dark:text-gray-400">Hasta</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input-field w-auto"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: 'all', label: 'Todos' },
          { key: 'pendientes', label: 'Pendientes' },
          { key: 'vencidos', label: 'Vencidos' },
          { key: 'pagados', label: 'Pagados' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total esperado</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalExpected)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total cobrado</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCollected)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Pendiente</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(totalPending)}</p>
        </div>
      </div>

      {/* Deudores crónicos */}
      {chronicDebtors.length > 0 && (
        <div className="card border-red-500/30">
          <h3 className="text-sm font-semibold text-red-400 mb-2">
            Deudores crónicos — {chronicDebtors.length} inquilino(s) con 2+ meses atrasados
          </h3>
          <div className="flex flex-wrap gap-2">
            {chronicDebtors.map((d, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20"
              >
                {d.name} ({d.count} mes{d.count > 1 ? 'es' : ''})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <SkeletonTable />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No hay meses por cobrar en este rango"
          description="Los cobros se generan mes a mes desde el inicio de cada contrato activo"
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Depto</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Mes</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Inquilino</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Renta</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Agua</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Total</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Vence</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Confirmó</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const waterFee = row.payment?.water_fee ?? WATER_FEE_DEFAULT
                const rentAmt = row.payment?.rent_amount ?? row.contract.monthly_amount
                const total = row.payment ? row.payment.amount : row.contract.monthly_amount + WATER_FEE_DEFAULT

                return (
                  <tr
                    key={`${row.contract.id}-${row.month}`}
                    className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {row.contract.unit?.number || '—'}
                      {row.contract.status === 'en_renovacion' && (
                        <span
                          className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/15 text-yellow-500 border border-yellow-500/20"
                          title="Contrato en renovación"
                        >
                          &#9888;
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 capitalize whitespace-nowrap">
                      {monthLabel(row.month)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {row.contract.occupant?.name || 'Sin inquilino'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{formatCurrency(rentAmt)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{formatCurrency(waterFee)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(total)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{row.contract.payment_day || '—'}</td>
                    <td className="px-4 py-3 text-center">{statusBadge(row.status, row.moraAmount, row.remaining)}</td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {row.payment?.confirmed_by || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {row.status !== 'pagado' ? (
                          <button
                            onClick={() => openPayModal(row)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
                          >
                            <Check className="w-3 h-3" />
                            Registrar pago
                          </button>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            {row.payment?.method === 'stripe' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                                Pagado por Stripe
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-gray-500">{methodLabel(row.payment?.method)}</span>
                            )}
                            {row.payment && (
                              <button
                                onClick={() => setInvoicingRow(row)}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-gray-400 rounded text-[11px] font-medium transition-colors"
                                title="Generar factura CFDI"
                              >
                                <FileText className="w-3 h-3" />
                                Facturar
                              </button>
                            )}
                          </div>
                        )}
                        <a
                          href={`/api/contracts/${row.contract.id}/estado-cuenta?periodo=${row.month}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded text-[11px] font-medium transition-colors"
                          title="Estado de cuenta (PDF)"
                        >
                          <Receipt className="w-3 h-3" />
                          Estado
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice Modal */}
      {invoicingRow && invoicingRow.payment && (
        <InvoiceModal
          paymentId={invoicingRow.payment.id}
          paymentAmount={invoicingRow.payment.amount}
          unitNumber={invoicingRow.contract.unit?.number}
          tenantName={invoicingRow.contract.occupant?.name}
          onClose={() => setInvoicingRow(null)}
          onCreated={() => fetchBilling()}
        />
      )}

      {/* Pay Modal */}
      {payingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setPayingRow(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              Registrar pago — {payingRow.contract.unit?.number || ''}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {payingRow.contract.occupant?.name || 'Sin inquilino'} ·{' '}
              <span className="capitalize">{monthLabel(payingRow.month)}</span> · vence {payingRow.dueDate}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Renta</label>
                <input
                  type="number"
                  value={payForm.rent_amount}
                  onChange={(e) =>
                    setPayForm((f) => ({
                      ...f,
                      rent_amount: Number(e.target.value),
                      amount_paid: f.is_partial ? f.amount_paid : Number(e.target.value) + f.water_fee + f.late_fee,
                    }))
                  }
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Agua</label>
                <input
                  type="number"
                  value={payForm.water_fee}
                  onChange={(e) =>
                    setPayForm((f) => ({
                      ...f,
                      water_fee: Number(e.target.value),
                      amount_paid: f.is_partial ? f.amount_paid : f.rent_amount + Number(e.target.value) + f.late_fee,
                    }))
                  }
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                  Mora{' '}
                  <span className="text-xs text-gray-400">
                    ({modalDaysLate} día{modalDaysLate === 1 ? '' : 's'} de atraso · editable)
                  </span>
                </label>
                <input
                  type="number"
                  value={payForm.late_fee}
                  onChange={(e) =>
                    setPayForm((f) => ({
                      ...f,
                      late_fee: Number(e.target.value),
                      amount_paid: f.is_partial ? f.amount_paid : f.rent_amount + f.water_fee + Number(e.target.value),
                    }))
                  }
                  className="input-field w-full"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Recargo calculado por días entre el vencimiento y la fecha de pago. Ponlo en 0 para condonarlo.
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Total a cobrar</label>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(payForm.rent_amount + payForm.water_fee + payForm.late_fee)}
                </p>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payForm.is_partial}
                    onChange={(e) =>
                      setPayForm((f) => ({
                        ...f,
                        is_partial: e.target.checked,
                        amount_paid: e.target.checked ? f.amount_paid : f.rent_amount + f.water_fee + f.late_fee,
                      }))
                    }
                    className="rounded border-gray-300"
                  />
                  Pago parcial (fuera de fecha)
                </label>
              </div>
              {payForm.is_partial && (
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Monto recibido</label>
                  <input
                    type="number"
                    value={payForm.amount_paid}
                    onChange={(e) => setPayForm((f) => ({ ...f, amount_paid: Number(e.target.value) }))}
                    className="input-field w-full"
                  />
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    Restante:{' '}
                    {formatCurrency(
                      Math.max(0, payForm.rent_amount + payForm.water_fee + payForm.late_fee - payForm.amount_paid),
                    )}{' '}
                    · queda vivo en el estado de cuenta hasta cubrirse
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Método</label>
                <select
                  value={payForm.method}
                  onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                  className="input-field w-full"
                >
                  <option value="Transferencia">Transferencia</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Deposito">Depósito</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Referencia</label>
                <input
                  type="text"
                  value={payForm.reference}
                  onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))}
                  className="input-field w-full"
                  placeholder="Número de referencia"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Confirmado por</label>
                <select
                  value={confirmedBy}
                  onChange={(e) => setConfirmedBy(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="alicia">Alicia</option>
                  <option value="enrique">Enrique</option>
                  <option value="fran">Fran</option>
                  <option value="system">Sistema</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Fecha de pago</label>
                <input
                  type="date"
                  value={payForm.paid_date}
                  onChange={(e) => onPaidDateChange(e.target.value)}
                  className="input-field w-full"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setPayingRow(null)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleMarkPaid}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {payForm.is_partial ? 'Guardar pago parcial' : 'Guardar pago'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
