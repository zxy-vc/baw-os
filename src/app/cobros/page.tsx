'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Receipt, Check, FileText, Zap, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrgContext } from '@/hooks/useOrgContext'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import { resolveServiceRate, WATER_FEE_DEFAULT, type ServiceRate } from '@/lib/cobros'
import { quickPayMonth } from '@/lib/cobros-actions'
import { scheduleMonths, computeMonthStatus, rankPayment, type BillingStatus } from '@/lib/billing'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import InvoiceModal from '@/components/InvoiceModal'
import AbonoModal from '@/components/cobros/AbonoModal'
import EngagementsPanel from './EngagementsPanel'

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

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function pad2(n: number) {
  return String(n).padStart(2, '0')
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

  // Modal de abonos: aquí solo vive el mes objetivo; el formulario, los
  // receipts y la escritura viven en <AbonoModal> (compartido con la cuenta
  // del inquilino /cobros/[contractId]).
  const [payingRow, setPayingRow] = useState<BillingRow | null>(null)
  const [quickId, setQuickId] = useState<string | null>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [fromMonth, setFromMonth] = useState('') // 'YYYY-MM' · '' = sin límite (Todo)
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

  // Pago rápido de un solo mes (con refresco y toast).
  async function quickPay(row: BillingRow) {
    const key = `${row.contract.id}|${row.month}`
    setQuickId(key)
    const res = orgId
      ? await quickPayMonth(orgId, row, confirmedBy)
      : { ok: false, recomputeOk: true }
    setQuickId(null)
    if (res.ok) {
      if (!res.recomputeOk) toast.error('No se pudo recalcular el cargo del mes')
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
      if (orgId && (await quickPayMonth(orgId, row, confirmedBy)).ok) ok++
    }
    setBulkRunning(false)
    setSelected(new Set())
    toast.success(`${ok} mes(es) marcados pagados`)
    fetchBilling()
  }

  const nameQuery = nameFilter.trim().toLowerCase()
  // "Desde" = límite inferior del rango (fromMonth). Atajos relativos a "Hasta".
  const [cutY, cutM] = selectedMonth.split('-').map(Number)
  const fromShortcuts: { key: string; label: string; value: string }[] = [
    { key: 'todo', label: 'Todo', value: '' },
    { key: 'mes', label: 'Solo el mes', value: selectedMonth },
    { key: 'ano', label: 'Año en curso', value: `${cutY}-01` },
    { key: 'doce', label: 'Últimos 12 meses', value: `${cutM === 12 ? cutY : cutY - 1}-${pad2(cutM === 12 ? 1 : cutM + 1)}` },
  ]
  const periodFrom = fromMonth
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

  // Acciones por mes — compartidas entre la fila de la tabla (desktop) y la
  // tarjeta (móvil) para no duplicar la lógica de estados.
  function rowActions(row: BillingRow) {
    return (
      <>
        {row.status !== 'pagado' ? (
          <>
            <button
              onClick={() => setPayingRow(row)}
              className="inline-flex items-center gap-1 px-3 py-2.5 sm:py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Check className="w-3 h-3" />
              Registrar pago
            </button>
            <button
              onClick={() => quickPay(row)}
              disabled={quickId === `${row.contract.id}|${row.month}`}
              title="Marcar el mes pagado completo (renta + agua, sin mora)"
              className="inline-flex items-center gap-1 px-2 py-2.5 sm:py-1.5 border border-emerald-600/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Zap className="w-3 h-3" />
              Rápido
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
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
                className="inline-flex items-center gap-1 px-2 py-2.5 sm:py-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-gray-400 rounded text-[11px] font-medium transition-colors"
                title="Generar factura CFDI"
              >
                <FileText className="w-3 h-3" />
                Facturar
              </button>
            )}
            <button
              onClick={() => setPayingRow(row)}
              title="Ver / editar abonos de este mes"
              className="inline-flex items-center gap-1 px-2 py-2.5 sm:py-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded text-[11px] font-medium transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Editar
            </button>
          </div>
        )}
        <Link
          href={`/cobros/${row.contract.id}`}
          className="inline-flex items-center gap-1 px-2 py-2.5 sm:py-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded text-[11px] font-medium transition-colors"
          title="Cuenta del inquilino (estado de cuenta editable + PDF)"
        >
          <Receipt className="w-3 h-3" />
          Cuenta
        </Link>
      </>
    )
  }

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
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-gray-500 dark:text-gray-400">Desde</label>
          <input
            type="month"
            value={fromMonth}
            max={selectedMonth}
            onChange={(e) => setFromMonth(e.target.value)}
            className="input-field w-auto"
          />
          <label className="text-sm text-gray-500 dark:text-gray-400">Hasta</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input-field w-auto"
          />
        </div>
      </div>

      {/* Cuentas combinadas (pools tipo Natturaly Complements) */}
      <EngagementsPanel orgId={orgId} selectedMonth={selectedMonth} />

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

      {/* Atajos de "Desde" (ajustan el rango relativo a "Hasta") */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 mr-1">Atajos:</span>
        {fromShortcuts.map((p) => (
          <button
            key={p.key}
            onClick={() => setFromMonth(p.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              fromMonth === p.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {p.label}
          </button>
        ))}
        <span className="text-xs text-gray-400">
          {fromMonth && `(${filtered.length} renglón/es)`}
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
        <>
          {/* Móvil: tarjetas (la tabla de 11 columnas es ilegible en teléfono) */}
          <div className="md:hidden space-y-3">
            {sorted.map((row) => {
              const waterFee = row.payment?.water_fee ?? row.waterFee
              const rentAmt = row.payment?.rent_amount ?? row.contract.monthly_amount
              const total = row.payment ? row.payment.amount : row.contract.monthly_amount + row.waterFee
              const rowKey = `${row.contract.id}|${row.month}`
              return (
                <div key={`${row.contract.id}-${row.month}`} className="card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {row.status !== 'pagado' && (
                        <input
                          type="checkbox"
                          checked={selected.has(rowKey)}
                          onChange={() => toggleRow(rowKey)}
                          className="w-5 h-5 rounded border-gray-300 shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {row.contract.unit?.number || '—'}
                          {row.contract.status === 'en_renovacion' && (
                            <span
                              className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/15 text-yellow-500 border border-yellow-500/20"
                              title="Contrato en renovación"
                            >
                              &#9888;
                            </span>
                          )}
                          <span className="ml-2 font-normal text-gray-500 dark:text-gray-400 capitalize">{monthLabel(row.month)}</span>
                        </div>
                        <Link
                          href={`/cobros/${row.contract.id}`}
                          className="block text-sm text-gray-600 dark:text-gray-300 truncate hover:underline"
                        >
                          {row.contract.occupant?.name || 'Sin inquilino'}
                        </Link>
                      </div>
                    </div>
                    <div className="shrink-0">{statusBadge(row.status, row.moraAmount, row.remaining)}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[13px]">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Renta</p>
                      <p className="text-gray-700 dark:text-gray-300">{formatCurrency(rentAmt)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Agua</p>
                      <p className="text-gray-700 dark:text-gray-300">{formatCurrency(waterFee)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Total</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(total)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Vence día {row.contract.payment_day || '—'}</span>
                    {row.payment?.confirmed_by && <span className="capitalize">Confirmó: {row.payment.confirmed_by}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-800/60">
                    {rowActions(row)}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop: tabla completa */}
          <div className="hidden md:block card overflow-x-auto p-0">
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
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/cobros/${row.contract.id}`}
                        className="text-gray-700 dark:text-gray-300 hover:underline"
                        title="Abrir cuenta del inquilino"
                      >
                        {row.contract.occupant?.name || 'Sin inquilino'}
                      </Link>
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
                      <div className="flex items-center justify-center gap-2">{rowActions(row)}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </>
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

      {/* Pay Modal (compartido con /cobros/[contractId]) */}
      {payingRow && (
        <AbonoModal
          orgId={orgId}
          target={payingRow}
          confirmedBy={confirmedBy}
          userLabel={userLabel}
          onConfirmedByChange={setConfirmedBy}
          onClose={() => setPayingRow(null)}
          onChanged={fetchBilling}
        />
      )}
    </div>
  )
}
