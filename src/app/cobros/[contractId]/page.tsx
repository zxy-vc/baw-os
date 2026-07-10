'use client'

// BaW OS — Cuenta del inquilino (estado de cuenta operativo por contrato).
//
// Una sola pantalla por inquilino/contrato para la gestión financiera diaria:
// calendario completo de cargos (proyectado con @/lib/billing, la misma fuente
// única que /cobros, Mission Control y Morosidad), vencimientos, saldo vivo,
// abonos totales/parciales con fecha/método/referencia/pagador (AbonoModal
// compartido con /cobros), pago rápido, factura CFDI, comprobante WhatsApp y
// el PDF de estado de cuenta por periodo (/api/contracts/[id]/estado-cuenta).

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  MessageCircle,
  Pencil,
  Receipt,
  X,
  Zap,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrgContext } from '@/hooks/useOrgContext'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import { resolveServiceRate, WATER_FEE_DEFAULT, type ServiceRate } from '@/lib/cobros'
import { quickPayMonth, recomputeCharge } from '@/lib/cobros-actions'
import { computeMonthStatus, rankPayment, scheduleMonths, type BillingStatus } from '@/lib/billing'
import { SkeletonTable } from '@/components/Skeleton'
import AbonoModal, { type AbonoTarget } from '@/components/cobros/AbonoModal'
import InvoiceModal from '@/components/InvoiceModal'

interface ContractDetail {
  id: string
  unit_id: string
  occupant_id: string | null
  payer_occupant_id: string | null
  monthly_amount: number
  payment_day: number
  status: string
  start_date: string | null
  end_date: string | null
  billing_start_date: string | null
  portal_enabled: boolean | null
  engagement_id: string | null
  unit: { number: string; building_id: string | null } | null
  occupant: { name: string; phone: string | null; email: string | null } | null
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

interface ReceiptItem {
  id: string
  payment_id: string
  amount: number
  paid_date: string
  method: string | null
  reference: string | null
  confirmed_by: string | null
  payerName: string | null
}

interface MonthRow {
  month: string
  dueDate: string
  payment: PaymentRow | null
  status: BillingStatus
  moraAmount: number
  remaining: number
  owed: number
  waterFee: number
  receipts: ReceiptItem[]
}

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
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

function statusBadge(status: BillingStatus, moraAmount: number, remaining: number) {
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

export default function CuentaInquilinoPage() {
  const params = useParams()
  const contractId = Array.isArray(params.contractId) ? params.contractId[0] : params.contractId
  const { orgId } = useOrgContext()
  const toast = useToast()

  const [contract, setContract] = useState<ContractDetail | null>(null)
  const [payerName, setPayerName] = useState<string | null>(null)
  const [rows, setRows] = useState<MonthRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [payingRow, setPayingRow] = useState<MonthRow | null>(null)
  const [invoicingRow, setInvoicingRow] = useState<MonthRow | null>(null)
  const [quickMonth, setQuickMonth] = useState<string | null>(null)
  const [sendingReceipt, setSendingReceipt] = useState<string | null>(null)
  const [pdfPeriodo, setPdfPeriodo] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  })
  const [userLabel, setUserLabel] = useState('')
  const [confirmedBy, setConfirmedBy] = useState('alicia')

  const fetchAll = useCallback(async () => {
    if (!orgId || !contractId) return
    const now = new Date()
    const cutoff = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
    const upperExcl =
      now.getMonth() === 11
        ? `${now.getFullYear() + 1}-01-01`
        : `${now.getFullYear()}-${pad2(now.getMonth() + 2)}-01`

    const { data: c, error: cErr } = await supabase
      .from('contracts')
      .select(
        'id, unit_id, occupant_id, payer_occupant_id, monthly_amount, payment_day, status, start_date, end_date, billing_start_date, portal_enabled, engagement_id, unit:units(number, building_id), occupant:occupants(name, phone, email)',
      )
      .eq('id', contractId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (cErr) toast.error(`No se pudo cargar el contrato: ${cErr.message}`)
    if (!c) {
      setNotFound(true)
      setLoading(false)
      return
    }
    const detail = c as unknown as ContractDetail
    setContract(detail)

    const [paymentsRes, ratesRes, receiptsRes] = await Promise.all([
      supabase
        .from('payments')
        .select(
          'id, contract_id, status, due_date, paid_date, amount, amount_paid, rent_amount, water_fee, late_fee_amount, late_fee_level, method, reference, confirmed_by',
        )
        .eq('contract_id', contractId)
        .lt('due_date', upperExcl),
      supabase
        .from('service_rates')
        .select('building_id, service, amount, effective_from')
        .eq('org_id', orgId)
        .eq('service', 'agua'),
      supabase
        .from('payment_receipts')
        .select('id, payment_id, amount, paid_date, method, reference, confirmed_by, payer:occupants(name)')
        .eq('contract_id', contractId)
        .order('paid_date', { ascending: true }),
    ])

    // Pagador distinto del inquilino (party/payer): se carga aparte porque
    // payer_occupant_id es columna simple sin FK (evita embeds ambiguos).
    if (detail.payer_occupant_id && detail.payer_occupant_id !== detail.occupant_id) {
      const { data: payer } = await supabase
        .from('occupants')
        .select('name')
        .eq('id', detail.payer_occupant_id)
        .maybeSingle()
      setPayerName(payer?.name ?? null)
    } else {
      setPayerName(null)
    }

    const payments = (paymentsRes.data || []) as PaymentRow[]
    const waterRates = (ratesRes.data || []) as ServiceRate[]

    // Pago representativo por mes (mismo criterio que /cobros y el portal).
    const paymentByMonth = new Map<string, PaymentRow>()
    for (const p of payments) {
      const key = p.due_date.slice(0, 7)
      const prev = paymentByMonth.get(key)
      if (!prev || rankPayment(p.status) > rankPayment(prev.status)) paymentByMonth.set(key, p)
    }

    // Abonos agrupados por MES (no por el pago representativo): si un mes
    // tiene 2+ filas payments (el caso que rankPayment resuelve), los abonos
    // de la fila no-representativa también deben verse — esta pantalla existe
    // para auditar dinero recibido.
    const monthByPaymentId = new Map<string, string>()
    for (const p of payments) monthByPaymentId.set(p.id, p.due_date.slice(0, 7))
    const receiptsByMonth = new Map<string, ReceiptItem[]>()
    for (const r of receiptsRes.data || []) {
      const month = monthByPaymentId.get(r.payment_id)
      if (!month) continue
      const payerRow = Array.isArray(r.payer) ? r.payer[0] : r.payer
      const item: ReceiptItem = {
        id: r.id,
        payment_id: r.payment_id,
        amount: Number(r.amount),
        paid_date: r.paid_date,
        method: r.method,
        reference: r.reference,
        confirmed_by: r.confirmed_by,
        payerName: (payerRow as { name: string } | null)?.name ?? null,
      }
      const list = receiptsByMonth.get(month) || []
      list.push(item)
      receiptsByMonth.set(month, list)
    }

    const today = new Date()
    const day = detail.payment_day || 1
    const monthRows: MonthRow[] = []
    for (const month of scheduleMonths(detail.billing_start_date ?? detail.start_date, cutoff)) {
      const dueDate = `${month}-${pad2(day)}`
      const payment = paymentByMonth.get(month) || null
      const waterFee =
        resolveServiceRate(waterRates, 'agua', detail.unit?.building_id ?? null, month) ??
        WATER_FEE_DEFAULT
      const { status, moraAmount, remaining, owed } = computeMonthStatus({
        monthlyAmount: detail.monthly_amount,
        paymentDay: detail.payment_day,
        dueDate,
        waterFee,
        payment,
        today,
      })
      monthRows.push({
        month,
        dueDate,
        payment,
        status,
        moraAmount,
        remaining,
        owed,
        waterFee,
        receipts: receiptsByMonth.get(month) || [],
      })
    }
    // Más reciente primero: lo operativo (el mes en curso) queda arriba.
    monthRows.sort((a, b) => b.month.localeCompare(a.month))
    setRows(monthRows)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, contractId])

  useEffect(() => {
    if (!orgId) return
    fetchAll()
  }, [fetchAll, orgId])

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

  async function quickPay(row: MonthRow) {
    if (!orgId || !contract) return
    setQuickMonth(row.month)
    const res = await quickPayMonth(
      orgId,
      { contract, payment: row.payment, dueDate: row.dueDate, waterFee: row.waterFee },
      confirmedBy,
    )
    setQuickMonth(null)
    if (res.ok) {
      if (!res.recomputeOk) toast.error('No se pudo recalcular el cargo del mes')
      toast.success('Mes marcado pagado')
      fetchAll()
    } else {
      toast.error('No se pudo registrar el pago')
    }
  }

  // Borra un abono del libro (misma escritura que la ✕ del modal): delete del
  // receipt + recompute server-side del cargo. La bitácora conserva su asiento.
  async function deleteReceipt(receipt: ReceiptItem) {
    const { error } = await supabase.from('payment_receipts').delete().eq('id', receipt.id)
    if (error) {
      toast.error('No se pudo eliminar el abono')
      return
    }
    const ok = await recomputeCharge(receipt.payment_id)
    if (!ok) toast.error('No se pudo recalcular el cargo del mes')
    toast.success('Abono eliminado')
    fetchAll()
  }

  // Quita un "pago directo en el cargo" (histórico pre-abonos / Stripe /
  // conserje): limpia los campos de pago de la fila `payments` y recalcula —
  // el mes queda listo para re-registrarse con el formato nuevo, sin SQL.
  async function clearDirectPayment(row: MonthRow) {
    if (!row.payment) return
    const { error } = await supabase
      .from('payments')
      .update({
        amount_paid: 0,
        status: 'pending',
        paid_date: null,
        method: null,
        payment_method: null,
        reference: null,
        confirmed_by: null,
        confirmed_at: null,
      })
      .eq('id', row.payment.id)
    if (error) {
      toast.error('No se pudo quitar el pago directo')
      return
    }
    const ok = await recomputeCharge(row.payment.id)
    if (!ok) toast.error('No se pudo recalcular el cargo del mes')
    toast.success('Pago directo eliminado — re-regístralo con "Registrar pago"')
    fetchAll()
  }

  // Comprobante de pago por WhatsApp (POST /api/payments/[id]/receipt) —
  // gateado en el server por credenciales de Meta + COBRANZA_WHATSAPP_ENABLED.
  async function sendReceipt(row: MonthRow) {
    if (!row.payment) return
    setSendingReceipt(row.month)
    try {
      const res = await fetch(`/api/payments/${row.payment.id}/receipt`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        toast.success('Comprobante enviado por WhatsApp')
      } else if (json.reason === 'whatsapp_disabled') {
        toast.error('WhatsApp no está activo (credenciales de Meta / COBRANZA_WHATSAPP_ENABLED)')
      } else if (json.reason === 'no_phone') {
        toast.error('El inquilino no tiene teléfono registrado')
      } else {
        toast.error(`No se pudo enviar: ${json.reason || 'error'}`)
      }
    } catch {
      toast.error('Error de conexión')
    }
    setSendingReceipt(null)
  }

  if (loading) return <SkeletonTable />

  if (notFound || !contract) {
    return (
      <div className="space-y-4">
        <Link href="/cobros" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
          <ArrowLeft className="w-4 h-4" /> Cobros
        </Link>
        <div className="card p-8 text-center text-gray-400">Contrato no encontrado en tu organización.</div>
      </div>
    )
  }

  // KPIs sobre todo el historial proyectado.
  let totalExpected = 0
  let totalCollected = 0
  let saldoHoy = 0
  let moraActiva = 0
  for (const r of rows) {
    const base = r.payment?.amount ?? contract.monthly_amount + r.waterFee
    const fee = r.status === 'mora' ? r.moraAmount : Number(r.payment?.late_fee_amount || 0)
    totalExpected += base + fee
    totalCollected += Number(r.payment?.amount_paid || 0)
    saldoHoy += r.owed
    if (r.status === 'mora') moraActiva += r.moraAmount
  }

  // Próximo vencimiento: el mes pendiente más próximo; si no hay, el día de
  // pago del mes siguiente al corte.
  const pendientes = rows.filter((r) => r.status === 'pendiente')
  const nextDue = pendientes.length
    ? pendientes[pendientes.length - 1].dueDate
    : (() => {
        const now = new Date()
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(contract.payment_day || 1)}`
      })()

  const mesesAtrasados = rows.filter((r) => r.status === 'vencido' || r.status === 'mora' || r.status === 'parcial').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/cobros" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 mb-2">
            <ArrowLeft className="w-4 h-4" /> Cobros
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold">
            {contract.occupant?.name || 'Sin inquilino'}{' '}
            <span className="text-gray-400 font-normal">· Depto {contract.unit?.number || '—'}</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Renta {formatCurrency(contract.monthly_amount)} · paga el día {contract.payment_day || '—'} de cada mes
            {contract.occupant?.phone ? ` · ${contract.occupant.phone}` : ''}
            {payerName ? (
              <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                Paga: {payerName}
              </span>
            ) : null}
            {contract.status === 'en_renovacion' && (
              <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-yellow-500/15 text-yellow-500 border border-yellow-500/20">
                En renovación
              </span>
            )}
          </p>
        </div>
        {/* PDF del estado de cuenta por periodo */}
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={pdfPeriodo}
            onChange={(e) => setPdfPeriodo(e.target.value)}
            className="input-field w-auto"
            title="Periodo del estado de cuenta"
          />
          <a
            href={`/api/contracts/${contract.id}/estado-cuenta?periodo=${pdfPeriodo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Receipt className="w-4 h-4" />
            Estado de cuenta PDF
          </a>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Saldo pendiente hoy</p>
          <p className={`text-2xl font-bold ${saldoHoy > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            {formatCurrency(saldoHoy)}
          </p>
          {mesesAtrasados > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {mesesAtrasados} mes{mesesAtrasados === 1 ? '' : 'es'} con adeudo
              {moraActiva > 0 ? ` · mora ${formatCurrency(moraActiva)}` : ''}
            </p>
          )}
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Próximo vencimiento</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{nextDue}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total esperado</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalExpected)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total cobrado</p>
          <p className="text-2xl font-bold text-emerald-500">{formatCurrency(totalCollected)}</p>
        </div>
      </div>

      {/* Calendario de cargos */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase w-6" />
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Mes</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Vence</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase text-right">Cargo</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase text-right">Abonado</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase text-right">Saldo</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase text-center">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const base = row.payment?.amount ?? contract.monthly_amount + row.waterFee
                const fee = row.status === 'mora' ? row.moraAmount : Number(row.payment?.late_fee_amount || 0)
                const paid = Number(row.payment?.amount_paid || 0)
                const isOpen = expanded === row.month
                return (
                  <FragmentRow
                    key={row.month}
                    row={row}
                    base={base}
                    fee={fee}
                    paid={paid}
                    isOpen={isOpen}
                    quickBusy={quickMonth === row.month}
                    receiptBusy={sendingReceipt === row.month}
                    onToggle={() => setExpanded(isOpen ? null : row.month)}
                    onPay={() => setPayingRow(row)}
                    onQuick={() => quickPay(row)}
                    onInvoice={() => setInvoicingRow(row)}
                    onReceipt={() => sendReceipt(row)}
                    onDeleteReceipt={deleteReceipt}
                    onClearDirect={() => clearDirectPayment(row)}
                    contractId={contract.id}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Registrar / editar abonos del mes */}
      {payingRow && (
        <AbonoModal
          orgId={orgId}
          target={
            {
              contract,
              payment: payingRow.payment,
              month: payingRow.month,
              dueDate: payingRow.dueDate,
              waterFee: payingRow.waterFee,
            } satisfies AbonoTarget
          }
          confirmedBy={confirmedBy}
          userLabel={userLabel}
          onConfirmedByChange={setConfirmedBy}
          onClose={() => setPayingRow(null)}
          onChanged={fetchAll}
        />
      )}

      {/* Factura CFDI del mes pagado */}
      {invoicingRow && invoicingRow.payment && (
        <InvoiceModal
          paymentId={invoicingRow.payment.id}
          paymentAmount={invoicingRow.payment.amount}
          unitNumber={contract.unit?.number}
          tenantName={contract.occupant?.name}
          onClose={() => setInvoicingRow(null)}
          onCreated={() => fetchAll()}
        />
      )}
    </div>
  )
}

function FragmentRow({
  row,
  base,
  fee,
  paid,
  isOpen,
  quickBusy,
  receiptBusy,
  onToggle,
  onPay,
  onQuick,
  onInvoice,
  onReceipt,
  onDeleteReceipt,
  onClearDirect,
  contractId,
}: {
  row: MonthRow
  base: number
  fee: number
  paid: number
  isOpen: boolean
  quickBusy: boolean
  receiptBusy: boolean
  onToggle: () => void
  onPay: () => void
  onQuick: () => void
  onInvoice: () => void
  onReceipt: () => void
  onDeleteReceipt: (receipt: ReceiptItem) => void
  onClearDirect: () => void
  contractId: string
}) {
  return (
    <>
      <tr
        className="border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-gray-400">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </td>
        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white capitalize whitespace-nowrap">
          {monthLabel(row.month)}
        </td>
        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.dueDate}</td>
        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{formatCurrency(base + fee)}</td>
        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{formatCurrency(paid)}</td>
        <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
          {formatCurrency(row.owed)}
        </td>
        <td className="px-4 py-3 text-center">{statusBadge(row.status, row.moraAmount, row.remaining)}</td>
        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-2">
            {row.status !== 'pagado' ? (
              <>
                <button
                  onClick={onPay}
                  className="inline-flex items-center gap-1 px-3 py-2.5 sm:py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <Check className="w-3 h-3" />
                  Registrar pago
                </button>
                <button
                  onClick={onQuick}
                  disabled={quickBusy}
                  title="Marcar el mes pagado completo (renta + agua, sin mora)"
                  className="inline-flex items-center gap-1 px-2 py-2.5 sm:py-1.5 border border-emerald-600/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <Zap className="w-3 h-3" />
                  Rápido
                </button>
              </>
            ) : (
              <>
                <span className="text-xs text-gray-400 dark:text-gray-500">{methodLabel(row.payment?.method)}</span>
                {row.payment && (
                  <>
                    <button
                      onClick={onInvoice}
                      className="inline-flex items-center gap-1 px-2 py-2.5 sm:py-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-gray-400 rounded text-[11px] font-medium transition-colors"
                      title="Generar factura CFDI"
                    >
                      <FileText className="w-3 h-3" />
                      Facturar
                    </button>
                    <button
                      onClick={onReceipt}
                      disabled={receiptBusy}
                      className="inline-flex items-center gap-1 px-2 py-2.5 sm:py-1 text-gray-400 hover:text-emerald-500 rounded text-[11px] font-medium transition-colors disabled:opacity-50"
                      title="Enviar comprobante por WhatsApp"
                    >
                      <MessageCircle className="w-3 h-3" />
                      {receiptBusy ? 'Enviando…' : 'Comprobante'}
                    </button>
                  </>
                )}
                <button
                  onClick={onPay}
                  title="Ver / editar abonos de este mes"
                  className="inline-flex items-center gap-1 px-2 py-2.5 sm:py-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded text-[11px] font-medium transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Editar
                </button>
              </>
            )}
            <a
              href={`/api/contracts/${contractId}/estado-cuenta?periodo=${row.month}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-2.5 sm:py-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded text-[11px] font-medium transition-colors"
              title="PDF del estado de cuenta a este periodo"
            >
              <Receipt className="w-3 h-3" />
              PDF
            </a>
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-gray-100 dark:border-gray-800/60 bg-gray-50/60 dark:bg-gray-900/40">
          <td />
          <td colSpan={7} className="px-4 py-3">
            <MonthDetail
              row={row}
              paid={paid}
              onDeleteReceipt={onDeleteReceipt}
              onClearDirect={onClearDirect}
            />
            {row.payment?.late_fee_amount ? (
              <p className="text-xs text-gray-400 mt-2">
                Mora registrada en el cargo: {formatCurrency(Number(row.payment.late_fee_amount))}
                {row.payment.late_fee_level ? ` (${row.payment.late_fee_level})` : ''}
              </p>
            ) : null}
          </td>
        </tr>
      )}
    </>
  )
}

// Detalle expandido del mes: abonos del libro (payment_receipts) + el "pago
// directo" cuando hay dinero registrado en el cargo SIN abonos que lo
// desglosen — pagos anteriores al libro de abonos (PR #131, jun 2026), Stripe
// y conserje marcan `payments` directo. Ese dinero es real y debe verse con
// su fecha/método/referencia/confirmó, que viven en la fila del cargo.
function MonthDetail({
  row,
  paid,
  onDeleteReceipt,
  onClearDirect,
}: {
  row: MonthRow
  paid: number
  onDeleteReceipt: (receipt: ReceiptItem) => void
  onClearDirect: () => void
}) {
  // Confirmación en dos pasos: primer clic arma el botón, segundo ejecuta.
  // ('__direct__' = el pago directo del cargo)
  const [confirming, setConfirming] = useState<string | null>(null)
  const receiptsSum = row.receipts.reduce((s, r) => s + r.amount, 0)
  const directPaid = Math.max(0, paid - receiptsSum)
  const p = row.payment
  const hasDirect = directPaid > 0.005 && p

  if (row.receipts.length === 0 && !hasDirect) {
    return <p className="text-xs text-gray-400">Sin abonos registrados en este mes.</p>
  }

  const confirmButtons = (key: string, onConfirm: () => void, title: string) =>
    confirming === key ? (
      <span className="inline-flex items-center gap-1">
        <button
          onClick={onConfirm}
          className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white text-[11px] font-medium"
        >
          Confirmar borrar
        </button>
        <button
          onClick={() => setConfirming(null)}
          className="px-1.5 py-0.5 rounded text-[11px] text-gray-400 hover:text-gray-200"
        >
          Cancelar
        </button>
      </span>
    ) : (
      <button
        onClick={() => setConfirming(key)}
        title={title}
        className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    )

  return (
    <>
      {row.receipts.length > 0 && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {row.receipts.map((r) => (
            <li key={r.id} className="py-1.5 text-sm flex flex-wrap items-center gap-x-2">
              <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(r.amount)}</span>
              <span className="text-xs text-gray-400">
                {r.paid_date} · {methodLabel(r.method)}
                {r.payerName ? ` · pagó ${r.payerName}` : ''}
                {r.reference ? ` · ${r.reference}` : ''}
                {r.confirmed_by ? ` · confirmó ${r.confirmed_by}` : ''}
              </span>
              {confirmButtons(r.id, () => onDeleteReceipt(r), 'Eliminar este abono')}
            </li>
          ))}
        </ul>
      )}
      {hasDirect && (
        <div className={row.receipts.length > 0 ? 'mt-2 pt-2 border-t border-gray-100 dark:border-gray-800' : ''}>
          <p className="py-1 text-sm flex flex-wrap items-center gap-x-2">
            <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(directPaid)}</span>
            <span className="text-xs text-gray-400">
              {p!.paid_date || 'sin fecha'} · {methodLabel(p!.method)}
              {p!.reference ? ` · ${p!.reference}` : ''}
              {p!.confirmed_by ? ` · confirmó ${p!.confirmed_by}` : ''}
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">
              pago directo en el cargo
            </span>
            {confirmButtons(
              '__direct__',
              onClearDirect,
              'Quitar el pago directo (el mes queda sin pagar, para re-registrarlo con abonos)',
            )}
          </p>
          <p className="text-[11px] text-gray-400">
            Registrado sin desglose de abonos (histórico anterior al libro de abonos, Stripe o conserje).
            Para migrarlo al formato nuevo: bórralo con la ✕ y re-regístralo con &quot;Registrar pago&quot;.
          </p>
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-2">
        Para corregir un abono: bórralo y vuelve a registrarlo (los abonos no se editan — la bitácora
        conserva el rastro de ambos movimientos).
      </p>
    </>
  )
}
