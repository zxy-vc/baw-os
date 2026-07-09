'use client'

// BaW OS — Modal "Registrar pago" (cargo del mes + abonos) compartido entre
// /cobros y la cuenta del inquilino /cobros/[contractId]. Extraído literal de
// cobros/page.tsx (AGENTS.md §1.3: no duplicar infraestructura).
//
// Escritura por mes: fila `payments` (cargo: renta + agua + mora) + N
// `payment_receipts` (abonos, pagador ≠ inquilino permitido) + asiento
// `payment_ledger` por abono. amount_paid/status del cargo lo recalcula el
// server con POST /api/payments/[id]/recompute (fuente única).

import { useEffect, useState } from 'react'
import { X, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import { calcMoraSurcharge } from '@/lib/mora-engine'
import { mapPaymentMethod, referenceFor } from '@/lib/cobros'
import { recomputeCharge } from '@/lib/cobros-actions'
import PersonPicker, { type PickedPerson } from '@/components/PersonPicker'

export interface AbonoContract {
  id: string
  unit_id: string
  monthly_amount: number
  unit: { number: string } | null
  occupant: { name: string } | null
}

export interface AbonoPayment {
  id: string
  rent_amount: number | null
  water_fee: number | null
  amount_paid: number | null
  late_fee_amount: number | null
}

/** El mes sobre el que se registra: cargo existente (payment) o proyectado. */
export interface AbonoTarget {
  contract: AbonoContract
  payment: AbonoPayment | null
  month: string // 'YYYY-MM'
  dueDate: string // 'YYYY-MM-DD'
  waterFee: number
}

interface ReceiptRow {
  id: string
  amount: number
  paid_date: string
  method: string | null
  reference: string | null
  payerName: string | null
}

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

// Mora sugerida: respeta la mora ya guardada en el cargo; si no hay, la
// calcula por días de atraso a la fecha del abono.
function suggestedMora(rent: number, dueDate: string, paidDate: string, payment: AbonoPayment | null): number {
  if (payment && payment.late_fee_amount != null) return Number(payment.late_fee_amount)
  const days = Math.max(0, dayDiff(new Date(`${dueDate}T00:00:00`), new Date(`${paidDate}T00:00:00`)))
  return calcMoraSurcharge(rent, days).amount
}

export default function AbonoModal({
  orgId,
  target,
  confirmedBy,
  userLabel,
  onConfirmedByChange,
  onClose,
  onChanged,
}: {
  orgId: string | null | undefined
  target: AbonoTarget
  confirmedBy: string
  userLabel: string
  onConfirmedByChange: (value: string) => void
  onClose: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [chargeId, setChargeId] = useState<string | null>(target.payment?.id ?? null)
  const [payForm, setPayForm] = useState(() => {
    const today = new Date().toISOString().split('T')[0]
    const rent = target.payment?.rent_amount ?? target.contract.monthly_amount
    const water = target.payment?.water_fee ?? target.waterFee
    const lateFee = suggestedMora(rent, target.dueDate, today, target.payment)
    const total = rent + water + lateFee
    const alreadyPaid = Number(target.payment?.amount_paid ?? 0)
    return {
      rent_amount: rent,
      water_fee: water,
      late_fee: lateFee,
      method: 'Transferencia',
      reference: referenceFor(target.contract.unit?.number, target.month),
      paid_date: today,
      amount_paid: Math.max(0, total - alreadyPaid), // sugiere la resta
    }
  })
  const [payer, setPayer] = useState<PickedPerson | null>(null)
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [loadingReceipts, setLoadingReceipts] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (target.payment?.id) loadReceipts(target.payment.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadReceipts(paymentId: string) {
    setLoadingReceipts(true)
    const { data } = await supabase
      .from('payment_receipts')
      .select('id, amount, paid_date, method, reference, payer:occupants(name)')
      .eq('payment_id', paymentId)
      .order('paid_date', { ascending: true })
    setReceipts(
      (data ?? []).map((r) => {
        const payerRow = Array.isArray(r.payer) ? r.payer[0] : r.payer
        return {
          id: r.id,
          amount: Number(r.amount),
          paid_date: r.paid_date,
          method: r.method,
          reference: r.reference,
          payerName: (payerRow as { name: string } | null)?.name ?? null,
        }
      }),
    )
    setLoadingReceipts(false)
  }

  // Recalcula la mora sugerida al mover la fecha del abono.
  function onPaidDateChange(paidDate: string) {
    setPayForm((f) => ({
      ...f,
      paid_date: paidDate,
      late_fee: suggestedMora(f.rent_amount, target.dueDate, paidDate, target.payment),
    }))
  }

  // Crea/actualiza la fila `payments` (cargo) del mes y devuelve su id.
  async function ensureCharge(): Promise<string | null> {
    const c = target.contract
    const lateFee = Math.max(0, payForm.late_fee)
    const daysLate = Math.max(
      0,
      dayDiff(new Date(`${target.dueDate}T00:00:00`), new Date(`${payForm.paid_date}T00:00:00`)),
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
        due_date: target.dueDate,
        amount_paid: 0,
        status: 'pending',
      })
      .select('id')
      .single()
    if (error || !data) return null
    setChargeId(data.id)
    return data.id
  }

  async function addReceipt() {
    if (payForm.amount_paid <= 0) return
    setSaving(true)
    const cid = await ensureCharge()
    if (!cid) {
      setSaving(false)
      toast.error('No se pudo crear el cargo del mes')
      return
    }
    const c = target.contract
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
    const recomputed = await recomputeCharge(cid)
    if (!recomputed) toast.error('No se pudo recalcular el cargo del mes')
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
    setPayer(null)
    setPayForm((f) => ({ ...f, amount_paid: 0, reference: '' }))
    setSaving(false)
    toast.success('Abono registrado')
    onChanged()
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
    onChanged()
  }

  // Días de atraso del abono que se está registrando (hint de mora).
  const modalDaysLate = Math.max(
    0,
    dayDiff(new Date(`${target.dueDate}T00:00:00`), new Date(`${payForm.paid_date}T00:00:00`)),
  )
  const chargeTotal = payForm.rent_amount + payForm.water_fee + payForm.late_fee
  const totalReceipts = receipts.reduce((s, r) => s + r.amount, 0)
  const remainingDue = Math.max(0, chargeTotal - totalReceipts)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md mx-4 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
          Registrar pago — {target.contract.unit?.number || ''}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {target.contract.occupant?.name || 'Sin inquilino'} ·{' '}
          <span className="capitalize">{monthLabel(target.month)}</span> · vence {target.dueDate}
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
                        className="shrink-0 p-2 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
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
              onChange={(e) => onConfirmedByChange(e.target.value)}
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
              onClick={onClose}
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
  )
}
