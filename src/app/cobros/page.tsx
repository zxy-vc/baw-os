'use client'

import { useEffect, useState } from 'react'
import { Receipt, X, Save, Check, FileText, Zap, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrgContext } from '@/hooks/useOrgContext'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import { calcMoraSurcharge } from '@/lib/mora-engine'
import { mapPaymentMethod, referenceFor, resolveServiceRate, type ServiceRate } from '@/lib/cobros'
import { scheduleMonths, computeMonthStatus, rankPayment, type BillingStatus } from '@/lib/billing'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import InvoiceModal from '@/components/InvoiceModal'
import PersonPicker, { type PickedPerson } from '@/components/PersonPicker'

interface ContractRow {
  id: string
  unit_id: string
  occupant_id: string
  monthly_amount: number
  payment_day: number
  status: string
  start_date: string | null
  billing_start_date: string | null
  unit: { number: string; building_id: string | null } | null
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

// Un abono (movimiento de dinero) dentro del cargo de un mes.
interface ReceiptRow {
  id: string
  amount: number
  paid_date: string
  method: string | null
  reference: string | null
  payerName: string | null
}

interface BillingRow {
  contract: ContractRow
  payment: PaymentRow | null
  month: string // 'YYYY-MM'
  dueDate: string // 'YYYY-MM-DD'
  status: BillingStatus
  moraAmount: number
  remaining: number
  waterFee: number // cuota de agua resuelta (tarifa del edificio o fallback)
}

const WATER_FEE_DEFAULT = 250
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

// scheduleMonths, rankPayment y computeMonthStatus viven en @/lib/billing
// (fuente única que comparten Cobros, Mission Control y Morosidad).

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

  // Modal state — payForm cubre el CARGO del mes (renta/agua/mora) + el abono
  // que se está registrando (amount_paid = monto recibido en ESTE movimiento).
  const [payingRow, setPayingRow] = useState<BillingRow | null>(null)
  const [chargeId, setChargeId] = useState<string | null>(null)
  const [payForm, setPayForm] = useState({
    rent_amount: 0,
    water_fee: WATER_FEE_DEFAULT,
    late_fee: 0,
    method: 'Transferencia',
    reference: '',
    paid_date: new Date().toISOString().split('T')[0],
    amount_paid: 0,
  })
  const [payer, setPayer] = useState<PickedPerson | null>(null)
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [loadingReceipts, setLoadingReceipts] = useState(false)
  const [saving, setSaving] = useState(false)
  const [quickId, setQuickId] = useState<string | null>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [period, setPeriod] = useState<'all' | 'month' | 'year' | '12m'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkRunning, setBulkRunning] = useState(false)
  const [userLabel, setUserLabel] = useState('')
  const [confirmedBy, setConfirmedBy] = useState('alicia')
  // Ordenamiento de la tabla (encabezados clicables).
  const [sortKey, setSortKey] = useState<'depto' | 'mes' | 'inquilino' | 'total' | 'status'>('depto')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
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
        'id, unit_id, occupant_id, monthly_amount, payment_day, status, start_date, billing_start_date, unit:units(number, building_id), occupant:occupants(name)',
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

    // Tarifas de agua vigentes (Fase 1 servicios). Se resuelven por edificio/mes.
    const ratesRes = await supabase
      .from('service_rates')
      .select('building_id, service, amount, effective_from')
      .eq('org_id', orgId)
      .eq('service', 'agua')
    const waterRates = (ratesRes.data || []) as ServiceRate[]

    // Indexa pagos por contrato+mes (mes tomado del due_date).
    const paymentByKey = new Map<string, PaymentRow>()
    for (const p of payments) {
      const key = `${p.contract_id}|${p.due_date.slice(0, 7)}`
      const prev = paymentByKey.get(key)
      if (!prev || rankPayment(p.status) > rankPayment(prev.status)) paymentByKey.set(key, p)
    }

    const today = new Date()

    const billingRows: BillingRow[] = []
    for (const c of contracts) {
      const day = c.payment_day || 1
      for (const month of scheduleMonths(c.billing_start_date ?? c.start_date, selectedMonth)) {
        const dueDate = `${month}-${pad2(day)}`
        const payment = paymentByKey.get(`${c.id}|${month}`) || null

        // Cuota de agua: tarifa del edificio vigente para el mes (fallback $250).
        const waterFee =
          resolveServiceRate(waterRates, 'agua', c.unit?.building_id ?? null, month) ?? WATER_FEE_DEFAULT
        // Estatus/mora/saldo: lógica compartida con el dashboard (@/lib/billing).
        const { status, moraAmount, remaining } = computeMonthStatus({
          monthlyAmount: c.monthly_amount,
          paymentDay: c.payment_day,
          dueDate,
          waterFee,
          payment,
          today,
        })

        billingRows.push({ contract: c, payment, month, dueDate, status, moraAmount, remaining, waterFee })
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

  // "Confirmado por" arranca con el usuario logueado (no Alicia).
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      const meta = u.user_metadata as { full_name?: string; name?: string } | undefined
      const label = meta?.full_name || meta?.name || (u.email ? u.email.split('@')[0] : '') || 'Usuario'
      setUserLabel(label)
      setConfirmedBy(label)
    })
  }, [])

  function openPayModal(row: BillingRow) {
    const c = row.contract
    const today = new Date().toISOString().split('T')[0]
    const rent = row.payment?.rent_amount ?? c.monthly_amount
    const water = row.payment?.water_fee ?? row.waterFee
    const lateFee = suggestedMora(rent, row.dueDate, today, row.payment)
    const cid = row.payment?.id ?? null
    const total = rent + water + lateFee
    const alreadyPaid = Number(row.payment?.amount_paid ?? 0)
    setPayingRow(row)
    setChargeId(cid)
    setPayForm({
      rent_amount: rent,
      water_fee: water,
      late_fee: lateFee,
      method: 'Transferencia',
      reference: referenceFor(c.unit?.number, row.month),
      paid_date: today,
      amount_paid: Math.max(0, total - alreadyPaid), // sugiere la resta
    })
    setPayer(null)
    setReceipts([])
    if (cid) loadReceipts(cid)
  }

  async function loadReceipts(paymentId: string) {
    setLoadingReceipts(true)
    const { data } = await supabase
      .from('payment_receipts')
      .select('id, amount, paid_date, method, reference, payer:occupants(name)')
      .eq('payment_id', paymentId)
      .order('paid_date', { ascending: true })
    setReceipts(
      (data ?? []).map((r) => {
        const payer = Array.isArray(r.payer) ? r.payer[0] : r.payer
        return {
          id: r.id,
          amount: Number(r.amount),
          paid_date: r.paid_date,
          method: r.method,
          reference: r.reference,
          payerName: (payer as { name: string } | null)?.name ?? null,
        }
      }),
    )
    setLoadingReceipts(false)
  }

  // Recalcula la mora sugerida cuando cambia la fecha de pago (días de atraso).
  function onPaidDateChange(paid_date: string) {
    if (!payingRow) return
    const lateFee = suggestedMora(payForm.rent_amount, payingRow.dueDate, paid_date, payingRow.payment)
    setPayForm((f) => ({ ...f, paid_date, late_fee: lateFee }))
  }

  // Crea (o actualiza) el CARGO del mes con renta/agua/mora actuales. Devuelve su id.
  async function ensureCharge(): Promise<string | null> {
    if (!payingRow) return null
    const c = payingRow.contract
    const lateFee = Math.max(0, payForm.late_fee)
    const daysLate = Math.max(
      0,
      dayDiff(new Date(`${payingRow.dueDate}T00:00:00`), new Date(`${payForm.paid_date}T00:00:00`)),
    )
    const { level } = calcMoraSurcharge(payForm.rent_amount, daysLate)
    const charge = {
      amount: payForm.rent_amount + payForm.water_fee,
      rent_amount: payForm.rent_amount,
      water_fee: payForm.water_fee,
      late_fee_amount: lateFee,
      late_fee_level: lateFee > 0 ? level : null,
    }
    if (chargeId) {
      await supabase.from('payments').update(charge).eq('id', chargeId)
      return chargeId
    }
    const { data, error } = await supabase
      .from('payments')
      .insert({
        ...charge,
        org_id: orgId,
        contract_id: c.id,
        due_date: payingRow.dueDate,
        amount_paid: 0,
        status: 'pending',
      })
      .select('id')
      .single()
    if (error || !data) return null
    setChargeId(data.id)
    return data.id
  }

  // Recalcula amount_paid + status del cargo a partir de la suma de sus abonos,
  // y estampa los metadatos del último abono (método/confirmó/fecha) para que el
  // grid los muestre como hasta ahora.
  async function recomputeCharge(paymentId: string) {
    const { data: rs } = await supabase
      .from('payment_receipts')
      .select('amount, paid_date, method, payment_method, confirmed_by')
      .eq('payment_id', paymentId)
      .order('paid_date', { ascending: true })
    const list = rs ?? []
    const sum = list.reduce((s, r) => s + Number(r.amount), 0)
    const last = list[list.length - 1]
    const { data: ch } = await supabase
      .from('payments')
      .select('amount, late_fee_amount')
      .eq('id', paymentId)
      .single()
    const total = Number(ch?.amount ?? 0) + Number(ch?.late_fee_amount ?? 0)
    const status = total > 0 && sum + 0.001 >= total ? 'paid' : sum > 0 ? 'partial' : 'pending'
    await supabase
      .from('payments')
      .update({
        amount_paid: sum,
        status,
        paid_date: last?.paid_date ?? null,
        method: last?.method ?? null,
        payment_method: last?.payment_method ?? null,
        confirmed_by: last?.confirmed_by ?? null,
        confirmed_at: last ? new Date().toISOString() : null,
      })
      .eq('id', paymentId)
  }

  // Registra UN abono (movimiento). El mes acumula y deriva su estatus.
  async function addReceipt() {
    if (!payingRow || payForm.amount_paid <= 0) return
    setSaving(true)
    const cid = await ensureCharge()
    if (!cid) {
      setSaving(false)
      toast.error('No se pudo crear el cargo del mes')
      return
    }
    const c = payingRow.contract
    const { methodEnum, paymentMethodEs } = mapPaymentMethod(payForm.method)
    const { error } = await supabase.from('payment_receipts').insert({
      org_id: orgId,
      payment_id: cid,
      contract_id: c.id,
      amount: payForm.amount_paid,
      paid_date: payForm.paid_date,
      method: methodEnum,
      payment_method: paymentMethodEs,
      reference: payForm.reference || null,
      payer_occupant_id: payer?.id ?? null,
      confirmed_by: confirmedBy,
    })
    if (error) {
      setSaving(false)
      toast.error(`No se pudo registrar el abono: ${error.message}`)
      return
    }
    await recomputeCharge(cid)
    // Bitácora inmutable (auditoría): un asiento por abono.
    await supabase.from('payment_ledger').insert({
      org_id: orgId,
      payment_id: cid,
      contract_id: c.id,
      unit_id: c.unit_id,
      tenant_name: c.occupant?.name || null,
      amount: payForm.rent_amount,
      water_fee: payForm.water_fee,
      total: payForm.amount_paid,
      payment_method: paymentMethodEs,
      confirmed_by: confirmedBy,
      notes: payForm.reference || null,
    })
    await loadReceipts(cid)
    // Prepara el siguiente abono: limpia monto/quién/referencia.
    setPayer(null)
    setPayForm((f) => ({ ...f, amount_paid: 0, reference: '' }))
    setSaving(false)
    toast.success('Abono registrado')
    fetchBilling()
  }

  // Núcleo del pago rápido: marca el mes pagado completo (renta + agua, sin mora,
  // fecha = vencimiento, ref "histórico"). SIN refrescar ni toast — para poder
  // encadenarlo en lote. Devuelve true si quedó.
  async function quickPayCore(row: BillingRow): Promise<boolean> {
    const c = row.contract
    const rent = row.payment?.rent_amount ?? c.monthly_amount
    const water = row.payment?.water_fee ?? row.waterFee
    const charge = {
      amount: rent + water,
      rent_amount: rent,
      water_fee: water,
      late_fee_amount: 0,
      late_fee_level: null,
    }
    let cid = row.payment?.id ?? null
    if (cid) {
      await supabase.from('payments').update(charge).eq('id', cid)
    } else {
      const { data, error } = await supabase
        .from('payments')
        .insert({ ...charge, org_id: orgId, contract_id: c.id, due_date: row.dueDate, amount_paid: 0, status: 'pending' })
        .select('id')
        .single()
      if (error || !data) return false
      cid = data.id
    }
    const { methodEnum, paymentMethodEs } = mapPaymentMethod('Transferencia')
    const { error } = await supabase.from('payment_receipts').insert({
      org_id: orgId,
      payment_id: cid,
      contract_id: c.id,
      amount: rent + water,
      paid_date: row.dueDate,
      method: methodEnum,
      payment_method: paymentMethodEs,
      reference: 'Histórico (pago rápido)',
      payer_occupant_id: null,
      confirmed_by: confirmedBy,
    })
    if (error) return false
    await recomputeCharge(cid as string)
    await supabase.from('payment_ledger').insert({
      org_id: orgId,
      payment_id: cid,
      contract_id: c.id,
      unit_id: c.unit_id,
      tenant_name: c.occupant?.name || null,
      amount: rent,
      water_fee: water,
      total: rent + water,
      payment_method: paymentMethodEs,
      confirmed_by: confirmedBy,
      notes: 'Pago rápido (histórico)',
    })
    return true
  }

  // Pago rápido de un solo mes (con refresco y toast).
  async function quickPay(row: BillingRow) {
    const key = `${row.contract.id}|${row.month}`
    setQuickId(key)
    const ok = await quickPayCore(row)
    setQuickId(null)
    if (ok) {
      toast.success('Mes marcado pagado')
      fetchBilling()
    } else {
      toast.error('No se pudo registrar el pago')
    }
  }

  // Pago rápido en LOTE: marca todos los meses seleccionados; un solo refresco.
  async function bulkQuickPay() {
    const targets = filtered.filter(
      (r) => r.status !== 'pagado' && selected.has(`${r.contract.id}|${r.month}`),
    )
    if (!targets.length) return
    setBulkRunning(true)
    let ok = 0
    for (const row of targets) {
      if (await quickPayCore(row)) ok++
    }
    setBulkRunning(false)
    setSelected(new Set())
    toast.success(`${ok} mes(es) marcados pagados`)
    fetchBilling()
  }

  async function removeReceipt(id: string) {
    if (!chargeId) return
    const { error } = await supabase.from('payment_receipts').delete().eq('id', id)
    if (error) {
      toast.error('No se pudo eliminar el abono')
      return
    }
    await recomputeCharge(chargeId)
    await loadReceipts(chargeId)
    fetchBilling()
  }

  const nameQuery = nameFilter.trim().toLowerCase()
  // Límite inferior del periodo (relativo al mes de corte "Hasta").
  const periodFrom = (() => {
    if (period === 'all') return ''
    const [y, m] = selectedMonth.split('-').map(Number)
    if (period === 'month') return selectedMonth
    if (period === 'year') return `${y}-01`
    // últimos 12 meses
    const fromM = m === 12 ? 1 : m + 1
    const fromY = m === 12 ? y : y - 1
    return `${fromY}-${pad2(fromM)}`
  })()
  const filtered = rows.filter((r) => {
    if (filter === 'pendientes' && r.status !== 'pendiente') return false
    if (filter === 'vencidos' && !(r.status === 'vencido' || r.status === 'mora' || r.status === 'parcial')) return false
    if (filter === 'pagados' && r.status !== 'pagado') return false
    if (periodFrom && r.month < periodFrom) return false
    if (nameQuery) {
      const name = (r.contract.occupant?.name || '').toLowerCase()
      const unit = (r.contract.unit?.number || '').toLowerCase()
      if (!name.includes(nameQuery) && !unit.includes(nameQuery)) return false
    }
    return true
  })

  // Filas seleccionables (no pagadas) dentro de lo filtrado, y su estado de selección.
  const selectableKeys = filtered.filter((r) => r.status !== 'pagado').map((r) => `${r.contract.id}|${r.month}`)
  const allSelected = selectableKeys.length > 0 && selectableKeys.every((k) => selected.has(k))

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      if (selectableKeys.every((k) => prev.has(k))) return new Set()
      return new Set(selectableKeys)
    })
  }

  // Totales sobre TODO el backlog mostrado (todos los meses).
  let totalExpected = 0
  let totalCollected = 0
  for (const r of rows) {
    const rowBase = r.payment?.amount ?? r.contract.monthly_amount + r.waterFee
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

  // Orden de la tabla según el encabezado elegido.
  const STATUS_ORDER: Record<BillingStatus, number> = {
    mora: 0, vencido: 1, parcial: 2, pendiente: 3, verbal: 4, pagado: 5,
  }
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'depto') {
      cmp = (a.contract.unit?.number || '').localeCompare(b.contract.unit?.number || '')
      if (cmp === 0) cmp = a.month.localeCompare(b.month)
    } else if (sortKey === 'mes') {
      cmp = a.month.localeCompare(b.month)
    } else if (sortKey === 'inquilino') {
      cmp = (a.contract.occupant?.name || '').localeCompare(b.contract.occupant?.name || '')
    } else if (sortKey === 'total') {
      const at = (a.payment?.amount ?? a.contract.monthly_amount + a.waterFee)
      const bt = (b.payment?.amount ?? b.contract.monthly_amount + b.waterFee)
      cmp = at - bt
    } else if (sortKey === 'status') {
      cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }
  const sortArrow = (key: typeof sortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '')

  // Días de atraso del pago que se está registrando (para el hint de mora).
  const modalDaysLate = payingRow
    ? Math.max(0, dayDiff(new Date(`${payingRow.dueDate}T00:00:00`), new Date(`${payForm.paid_date}T00:00:00`)))
    : 0
  const chargeTotal = payForm.rent_amount + payForm.water_fee + payForm.late_fee
  const totalReceipts = receipts.reduce((s, r) => s + r.amount, 0)
  const remainingDue = Math.max(0, chargeTotal - totalReceipts)

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
          { key: 'pendientes', label: 'Por vencer' },
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
        <input
          type="text"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          placeholder="Filtrar por inquilino o depto…"
          className="input-field text-sm py-1.5 flex-1 min-w-[200px]"
        />
      </div>

      {/* Filtro de periodo (relativo al mes "Hasta") */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 mr-1">Periodo:</span>
        {[
          { key: 'all', label: 'Todo' },
          { key: 'month', label: 'Solo el mes' },
          { key: 'year', label: 'Año en curso' },
          { key: '12m', label: 'Últimos 12 meses' },
        ].map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key as typeof period)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              period === p.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {p.label}
          </button>
        ))}
        <span className="text-xs text-gray-400">
          {period !== 'all' && `(${filtered.length} renglón/es)`}
        </span>
      </div>

      {/* Barra de acción en lote */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2.5">
          <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
            {selected.size} mes(es) seleccionado(s)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Limpiar
            </button>
            <button
              onClick={bulkQuickPay}
              disabled={bulkRunning}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              {bulkRunning ? 'Registrando…' : `Marcar ${selected.size} pagados (rápido)`}
            </button>
          </div>
        </div>
      )}

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
          title={
            filter === 'pendientes'
              ? 'No hay meses por vencer en este rango'
              : 'No hay meses por cobrar en este rango'
          }
          description={
            filter === 'pendientes'
              ? 'Son los meses futuros aún no vencidos. Sube “Hasta” a un mes adelante (ej. dic 2026) para ver los próximos cargos.'
              : 'Los cobros se generan mes a mes desde el inicio de cada contrato activo'
          }
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="px-4 py-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    title="Seleccionar todos los pendientes visibles"
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  <button onClick={() => toggleSort('depto')} className="whitespace-nowrap hover:text-gray-900 dark:hover:text-white">Depto{sortArrow('depto')}</button>
                </th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  <button onClick={() => toggleSort('mes')} className="whitespace-nowrap hover:text-gray-900 dark:hover:text-white">Mes{sortArrow('mes')}</button>
                </th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  <button onClick={() => toggleSort('inquilino')} className="whitespace-nowrap hover:text-gray-900 dark:hover:text-white">Inquilino{sortArrow('inquilino')}</button>
                </th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Renta</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Agua</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  <button onClick={() => toggleSort('total')} className="whitespace-nowrap hover:text-gray-900 dark:hover:text-white">Total{sortArrow('total')}</button>
                </th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Vence</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                  <button onClick={() => toggleSort('status')} className="whitespace-nowrap hover:text-gray-900 dark:hover:text-white">Status{sortArrow('status')}</button>
                </th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Confirmó</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const waterFee = row.payment?.water_fee ?? row.waterFee
                const rentAmt = row.payment?.rent_amount ?? row.contract.monthly_amount
                const total = row.payment ? row.payment.amount : row.contract.monthly_amount + row.waterFee
                const rowKey = `${row.contract.id}|${row.month}`

                return (
                  <tr
                    key={`${row.contract.id}-${row.month}`}
                    className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                  >
                    <td className="px-4 py-3 text-center">
                      {row.status !== 'pagado' && (
                        <input
                          type="checkbox"
                          checked={selected.has(rowKey)}
                          onChange={() => toggleRow(rowKey)}
                          className="rounded border-gray-300"
                        />
                      )}
                    </td>
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
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
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
                          <>
                            <button
                              onClick={() => openPayModal(row)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
                            >
                              <Check className="w-3 h-3" />
                              Registrar pago
                            </button>
                            <button
                              onClick={() => quickPay(row)}
                              disabled={quickId === `${row.contract.id}|${row.month}`}
                              title="Marcar el mes pagado completo (renta + agua, sin mora)"
                              className="inline-flex items-center gap-1 px-2 py-1.5 border border-emerald-600/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              <Zap className="w-3 h-3" />
                              Rápido
                            </button>
                          </>
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
                            <button
                              onClick={() => openPayModal(row)}
                              title="Ver / editar abonos de este mes"
                              className="inline-flex items-center gap-1 px-2 py-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded text-[11px] font-medium transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                              Editar
                            </button>
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
              {/* ── Cargo del mes (renta + agua + mora) ── */}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cargo del mes</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Renta</label>
                  <input
                    type="number"
                    value={payForm.rent_amount}
                    onChange={(e) => setPayForm((f) => ({ ...f, rent_amount: Number(e.target.value) }))}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Agua</label>
                  <input
                    type="number"
                    value={payForm.water_fee}
                    onChange={(e) => setPayForm((f) => ({ ...f, water_fee: Number(e.target.value) }))}
                    className="input-field w-full"
                  />
                </div>
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
                  onChange={(e) => setPayForm((f) => ({ ...f, late_fee: Number(e.target.value) }))}
                  className="input-field w-full"
                />
                <p className="text-xs text-gray-400 mt-1">Ponlo en 0 para condonarlo.</p>
              </div>
              <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Total del mes</span>
                <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(chargeTotal)}</span>
              </div>

              {/* ── Abonos ya registrados ── */}
              {(loadingReceipts || receipts.length > 0) && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Abonos registrados
                  </p>
                  {loadingReceipts ? (
                    <p className="text-xs text-gray-400">Cargando…</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {receipts.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(r.amount)}</span>
                            <span className="text-xs text-gray-400">
                              {' · '}
                              {r.paid_date}
                              {r.payerName ? ` · ${r.payerName}` : ''}
                              {r.reference ? ` · ${r.reference}` : ''}
                            </span>
                          </div>
                          <button
                            onClick={() => removeReceipt(r.id)}
                            title="Eliminar abono"
                            className="shrink-0 p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-1.5 mt-1 text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Abonado</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatCurrency(totalReceipts)} · resta {formatCurrency(remainingDue)}
                    </span>
                  </div>
                </div>
              )}

              {/* ── Nuevo abono (un movimiento) ── */}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Nuevo abono</p>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Monto recibido</label>
                <input
                  type="number"
                  value={payForm.amount_paid}
                  onChange={(e) => setPayForm((f) => ({ ...f, amount_paid: Number(e.target.value) }))}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Pagó (quién)</label>
                <PersonPicker
                  orgId={orgId}
                  value={payer}
                  onChange={setPayer}
                  newType="both"
                  placeholder="Buscar quién pagó (opcional)…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Fecha de pago</label>
                  <input
                    type="date"
                    value={payForm.paid_date}
                    onChange={(e) => onPaidDateChange(e.target.value)}
                    className="input-field w-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Referencia / comprobante</label>
                <input
                  type="text"
                  value={payForm.reference}
                  onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))}
                  className="input-field w-full"
                  placeholder="Ej. SPEI 00169, Foto 00071…"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Confirmado por</label>
                <select
                  value={confirmedBy}
                  onChange={(e) => setConfirmedBy(e.target.value)}
                  className="input-field w-full"
                >
                  {userLabel && <option value={userLabel}>{userLabel} (tú)</option>}
                  <option value="alicia">Alicia</option>
                  <option value="enrique">Enrique</option>
                  <option value="fran">Fran</option>
                  <option value="system">Sistema</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setPayingRow(null)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cerrar
                </button>
                <button
                  onClick={addReceipt}
                  disabled={saving || payForm.amount_paid <= 0}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  Guardar abono
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
