'use client'

// BaW OS — Liquidaciones a propietarios (ADR-022 §3.2, Fase 1 del flujo B)
//
// Por cada (edificio × propietario) del mes: cobrado − comisión de
// administración (management_agreements, base 10% personalizable) − gastos −
// mantenimiento = payout neto × % de propiedad. "Emitir" persiste el snapshot
// inmutable en owner_statements (el propietario lo ve en su portal);
// "Registrar pago" documenta la transferencia y cierra el statement.
// Todo el cálculo y las escrituras son server-side (/api/liquidaciones*).

import { useCallback, useEffect, useState } from 'react'
import { HandCoins, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import { SkeletonTable } from '@/components/Skeleton'

type Totals = {
  grossExpected: number
  grossCollected: number
  adminFee: number
  expenses: number
  maintenance: number
  buildingNet: number
  netPayout: number
}

type Line = {
  unitId: string
  unitNumber: string
  tenantName: string | null
  expected: number
  collected: number
  unitExpenses: number
  generalShare: number
  maintenance: number
}

type Payout = {
  id: string
  amount: number
  method: string
  reference: string | null
  paid_date: string
}

type Statement = {
  id: string
  status: 'draft' | 'issued' | 'paid' | 'void'
  gross_collected: number
  admin_fee: number
  expenses: number
  maintenance: number
  net_payout: number
  ownership_pct: number
  issued_at: string | null
  payouts: Payout[]
}

type Item = {
  buildingId: string
  buildingName: string
  ownerId: string
  ownerName: string
  ownershipPct: number
  terms: { feeType: string; feeValue: number; source: 'agreement' | 'default' }
  lines: Line[]
  totals: Totals
  statement: Statement | null
}

type Agreement = {
  id: string
  building_id: string
  owner_id: string | null
  fee_type: string
  fee_value: number
  effective_from: string
  effective_to: string | null
  building: { name: string } | null
  owner: { full_name: string } | null
}

const FEE_LABEL: Record<string, string> = {
  percent_collected: '% de lo cobrado',
  percent_billed: '% de lo facturado',
  flat_monthly: 'monto fijo mensual',
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export default function LiquidacionesPage() {
  const toast = useToast()
  const [month, setMonth] = useState(currentMonth())
  const [items, setItems] = useState<Item[]>([])
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [payoutFor, setPayoutFor] = useState<Item | null>(null)
  const [showAgreements, setShowAgreements] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/liquidaciones?month=${month}`)
      const json = await res.json()
      if (json.success) {
        setItems(json.data.items || [])
        setAgreements(json.data.agreements || [])
      } else {
        toast.error(json.error || 'No se pudieron cargar las liquidaciones')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  useEffect(() => {
    load()
  }, [load])

  async function emitir(item: Item) {
    const key = `${item.buildingId}:${item.ownerId}`
    setBusy(key)
    try {
      const res = await fetch('/api/liquidaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: item.buildingId,
          owner_id: item.ownerId,
          period: month,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('Estado de cuenta emitido')
        load()
      } else {
        toast.error(json.error || 'No se pudo emitir')
      }
    } catch {
      toast.error('Error de conexión')
    }
    setBusy(null)
  }

  async function anular(item: Item) {
    if (!item.statement) return
    const key = `${item.buildingId}:${item.ownerId}`
    setBusy(key)
    try {
      const res = await fetch(`/api/liquidaciones/${item.statement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void' }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('Estado de cuenta anulado')
        load()
      } else {
        toast.error(json.error || 'No se pudo anular')
      }
    } catch {
      toast.error('Error de conexión')
    }
    setBusy(null)
  }

  const totalNeto = items.reduce(
    (s, it) => s + (it.statement && it.statement.status !== 'void' ? Number(it.statement.net_payout) : it.totals.netPayout),
    0,
  )

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <HandCoins className="w-6 h-6 text-emerald-400" />
            Liquidaciones a propietarios
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--baw-muted)' }}>
            Cobrado − comisión − gastos − mantenimiento = payout neto por propietario.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 rounded-md text-sm"
            style={{
              backgroundColor: 'var(--baw-surface)',
              border: '1px solid var(--baw-border)',
              color: 'var(--baw-text)',
            }}
          />
          <button
            onClick={() => setShowAgreements((v) => !v)}
            className="px-3 py-2 rounded-md text-sm"
            style={{
              backgroundColor: 'var(--baw-surface)',
              border: '1px solid var(--baw-border)',
              color: 'var(--baw-text)',
            }}
          >
            Comisiones
          </button>
        </div>
      </div>

      {showAgreements && (
        <AgreementsPanel agreements={agreements} onChanged={load} />
      )}

      {loading ? (
        <SkeletonTable />
      ) : items.length === 0 ? (
        <div
          className="rounded-lg p-8 text-center text-sm"
          style={{
            backgroundColor: 'var(--baw-surface)',
            border: '1px dashed var(--baw-border)',
            color: 'var(--baw-muted)',
          }}
        >
          No hay participaciones de propietarios registradas. Captura los
          porcentajes en Portafolio → Propietarios para poder liquidar.
        </div>
      ) : (
        <>
          <div
            className="rounded-lg p-4 flex items-center justify-between"
            style={{
              backgroundColor: 'var(--baw-surface)',
              border: '1px solid var(--baw-border)',
            }}
          >
            <span className="text-sm" style={{ color: 'var(--baw-muted)' }}>
              Neto a propietarios en {month}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {formatCurrency(totalNeto)}
            </span>
          </div>

          <div className="space-y-3">
            {items.map((it) => {
              const key = `${it.buildingId}:${it.ownerId}`
              const st = it.statement
              const active = st && st.status !== 'void' ? st : null
              const paidTotal = (active?.payouts || []).reduce(
                (s, p) => s + Number(p.amount),
                0,
              )
              const t = active
                ? {
                    grossCollected: Number(active.gross_collected),
                    adminFee: Number(active.admin_fee),
                    expenses: Number(active.expenses),
                    maintenance: Number(active.maintenance),
                    netPayout: Number(active.net_payout),
                  }
                : it.totals
              return (
                <div
                  key={key}
                  className="rounded-lg overflow-hidden"
                  style={{
                    backgroundColor: 'var(--baw-surface)',
                    border: '1px solid var(--baw-border)',
                  }}
                >
                  <div className="p-4 flex flex-wrap items-center gap-3 justify-between">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {it.buildingName} · {it.ownerName}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--baw-muted)' }}>
                        {it.ownershipPct.toFixed(2)}% de propiedad · Comisión{' '}
                        {it.terms.feeType === 'flat_monthly'
                          ? formatCurrency(it.terms.feeValue)
                          : `${it.terms.feeValue}%`}{' '}
                        ({FEE_LABEL[it.terms.feeType] || it.terms.feeType}
                        {it.terms.source === 'default' ? ' · base' : ''})
                      </div>
                    </div>
                    <StatusChip status={active?.status ?? null} />
                  </div>

                  <div
                    className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm"
                    style={{ color: 'var(--baw-text)' }}
                  >
                    <Cell label="Cobrado" value={t.grossCollected} />
                    <Cell label="Comisión" value={-t.adminFee} />
                    <Cell label="Gastos" value={-t.expenses} />
                    <Cell label="Mantenimiento" value={-t.maintenance} />
                    <Cell label="Neto propietario" value={t.netPayout} strong />
                  </div>

                  {active && active.payouts.length > 0 && (
                    <div className="px-4 pb-2 text-xs" style={{ color: 'var(--baw-muted)' }}>
                      Pagado: {formatCurrency(paidTotal)} de {formatCurrency(Number(active.net_payout))}
                      {active.payouts.map((p) => (
                        <span key={p.id} className="ml-2">
                          · {p.paid_date} {formatCurrency(Number(p.amount))} ({p.method}
                          {p.reference ? ` ${p.reference}` : ''})
                        </span>
                      ))}
                    </div>
                  )}

                  <div
                    className="px-4 py-2 flex flex-wrap items-center gap-2 border-t"
                    style={{ borderColor: 'var(--baw-border)' }}
                  >
                    <button
                      onClick={() => setExpanded(expanded === key ? null : key)}
                      className="text-xs inline-flex items-center gap-1 px-2 py-1.5 rounded"
                      style={{ color: 'var(--baw-muted)' }}
                    >
                      {expanded === key ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      Desglose por unidad
                    </button>
                    <div className="flex-1" />
                    {!active && (
                      <button
                        onClick={() => emitir(it)}
                        disabled={busy === key}
                        className="text-xs px-3 py-1.5 rounded font-medium disabled:opacity-50"
                        style={{
                          backgroundColor: 'var(--baw-accent)',
                          color: 'var(--baw-on-primary)',
                        }}
                      >
                        {busy === key ? 'Emitiendo…' : 'Emitir estado de cuenta'}
                      </button>
                    )}
                    {active && active.status === 'issued' && (
                      <>
                        <button
                          onClick={() => setPayoutFor(it)}
                          className="text-xs px-3 py-1.5 rounded font-medium"
                          style={{
                            backgroundColor: 'var(--baw-accent)',
                            color: 'var(--baw-on-primary)',
                          }}
                        >
                          Registrar pago
                        </button>
                        {active.payouts.length === 0 && (
                          <button
                            onClick={() => anular(it)}
                            disabled={busy === key}
                            className="text-xs px-3 py-1.5 rounded disabled:opacity-50"
                            style={{
                              color: 'var(--baw-danger)',
                              border: '1px solid var(--baw-border)',
                            }}
                          >
                            Anular
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {expanded === key && (
                    <div className="px-4 pb-4 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ color: 'var(--baw-muted)' }}>
                            <th className="text-left py-1.5 font-medium">Unidad</th>
                            <th className="text-left py-1.5 font-medium">Inquilino</th>
                            <th className="text-right py-1.5 font-medium">Renta</th>
                            <th className="text-right py-1.5 font-medium">Cobrado</th>
                            <th className="text-right py-1.5 font-medium">Gastos</th>
                            <th className="text-right py-1.5 font-medium">Prorrateo</th>
                            <th className="text-right py-1.5 font-medium">Mant.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {it.lines.map((l) => (
                            <tr
                              key={l.unitId}
                              className="border-t"
                              style={{ borderColor: 'var(--baw-border)' }}
                            >
                              <td className="py-1.5">{l.unitNumber}</td>
                              <td className="py-1.5" style={{ color: 'var(--baw-muted)' }}>
                                {l.tenantName || '—'}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {formatCurrency(l.expected)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {formatCurrency(l.collected)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {formatCurrency(l.unitExpenses)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {formatCurrency(l.generalShare)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {formatCurrency(l.maintenance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {payoutFor && payoutFor.statement && (
        <PayoutModal
          item={payoutFor}
          onClose={() => setPayoutFor(null)}
          onSaved={() => {
            setPayoutFor(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function Cell({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--baw-muted)' }}>
        {label}
      </div>
      <div className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>
        {formatCurrency(value)}
      </div>
    </div>
  )
}

function StatusChip({ status }: { status: string | null }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    issued: { label: 'Emitida', bg: 'var(--baw-warning-bg-soft)', fg: 'var(--baw-warning-fg)' },
    paid: { label: 'Pagada', bg: 'var(--baw-success-bg-soft)', fg: 'var(--baw-success-fg)' },
  }
  const s = status ? map[status] : null
  return (
    <span
      className="text-[11px] px-2 py-1 rounded font-medium"
      style={{
        backgroundColor: s?.bg ?? 'var(--baw-elevated)',
        color: s?.fg ?? 'var(--baw-muted)',
        border: '1px solid var(--baw-border)',
      }}
    >
      {s?.label ?? 'Sin emitir'}
    </span>
  )
}

function PayoutModal({
  item,
  onClose,
  onSaved,
}: {
  item: Item
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const st = item.statement!
  const paid = (st.payouts || []).reduce((s, p) => s + Number(p.amount), 0)
  const remaining = Math.max(0, Number(st.net_payout) - paid)
  const [amount, setAmount] = useState(String(remaining || ''))
  const [method, setMethod] = useState('transfer')
  const [reference, setReference] = useState('')
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/liquidaciones/${st.id}/payouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          method,
          reference: reference || null,
          paid_date: paidDate,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('Pago al propietario registrado')
        onSaved()
      } else {
        toast.error(json.error || 'No se pudo registrar')
      }
    } catch {
      toast.error('Error de conexión')
    }
    setSaving(false)
  }

  return (
    <div className="modal-wrap">
      <div
        className="modal-panel w-full max-w-sm p-5 space-y-3"
        style={{
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
        }}
      >
        <h3 className="font-semibold">
          Pago a {item.ownerName} · {item.buildingName}
        </h3>
        <p className="text-xs" style={{ color: 'var(--baw-muted)' }}>
          Neto: {formatCurrency(Number(st.net_payout))} · Pendiente: {formatCurrency(remaining)}
        </p>
        <label className="block text-xs" style={{ color: 'var(--baw-muted)' }}>
          Monto
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-md text-sm"
            style={{
              backgroundColor: 'var(--baw-bg)',
              border: '1px solid var(--baw-border)',
              color: 'var(--baw-text)',
            }}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs" style={{ color: 'var(--baw-muted)' }}>
            Método
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md text-sm"
              style={{
                backgroundColor: 'var(--baw-bg)',
                border: '1px solid var(--baw-border)',
                color: 'var(--baw-text)',
              }}
            >
              <option value="transfer">Transferencia</option>
              <option value="spei">SPEI</option>
              <option value="cash">Efectivo</option>
              <option value="other">Otro</option>
            </select>
          </label>
          <label className="block text-xs" style={{ color: 'var(--baw-muted)' }}>
            Fecha
            <input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md text-sm"
              style={{
                backgroundColor: 'var(--baw-bg)',
                border: '1px solid var(--baw-border)',
                color: 'var(--baw-text)',
              }}
            />
          </label>
        </div>
        <label className="block text-xs" style={{ color: 'var(--baw-muted)' }}>
          Referencia (folio SPEI, etc.)
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-md text-sm"
            style={{
              backgroundColor: 'var(--baw-bg)',
              border: '1px solid var(--baw-border)',
              color: 'var(--baw-text)',
            }}
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="text-sm px-3 py-2 rounded"
            style={{ color: 'var(--baw-muted)' }}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || Number(amount) <= 0}
            className="text-sm px-4 py-2 rounded font-medium disabled:opacity-50"
            style={{
              backgroundColor: 'var(--baw-accent)',
              color: 'var(--baw-on-primary)',
            }}
          >
            {saving ? 'Guardando…' : 'Registrar pago'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AgreementsPanel({
  agreements,
  onChanged,
}: {
  agreements: Agreement[]
  onChanged: () => void
}) {
  const toast = useToast()
  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([])
  const [owners, setOwners] = useState<{ id: string; full_name: string }[]>([])
  const [buildingId, setBuildingId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [feeType, setFeeType] = useState('percent_collected')
  const [feeValue, setFeeValue] = useState('10')
  const [from, setFrom] = useState(`${currentMonth()}-01`)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Catálogos para el form — lectura ligera vía el propio endpoint de
    // liquidaciones no aplica; usamos el cliente supabase de la sesión.
    import('@/lib/supabase').then(({ supabase }) => {
      supabase
        .from('buildings')
        .select('id, name')
        .order('name')
        .then(({ data }) => setBuildings(data || []))
      supabase
        .from('property_owners')
        .select('id, full_name')
        .order('full_name')
        .then(({ data }) => setOwners(data || []))
    })
  }, [])

  async function save() {
    if (!buildingId) {
      toast.error('Elige un edificio')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/management-agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: buildingId,
          owner_id: ownerId || null,
          fee_type: feeType,
          fee_value: Number(feeValue),
          effective_from: from,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('Comisión registrada')
        onChanged()
      } else {
        toast.error(json.error || 'No se pudo guardar')
      }
    } catch {
      toast.error('Error de conexión')
    }
    setSaving(false)
  }

  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={{
        backgroundColor: 'var(--baw-surface)',
        border: '1px solid var(--baw-border)',
      }}
    >
      <h3 className="text-sm font-semibold">Comisiones de administración</h3>
      <p className="text-xs" style={{ color: 'var(--baw-muted)' }}>
        Sin acuerdo registrado aplica el <strong>10% de lo cobrado</strong> (base).
        Los acuerdos son append-only: uno nuevo con vigencia posterior sustituye al anterior.
      </p>
      {agreements.length > 0 && (
        <ul className="text-xs space-y-1" style={{ color: 'var(--baw-text)' }}>
          {agreements.map((a) => (
            <li key={a.id}>
              {a.building?.name || '—'}
              {a.owner ? ` · ${a.owner.full_name}` : ' · todos los propietarios'} —{' '}
              {a.fee_type === 'flat_monthly'
                ? formatCurrency(Number(a.fee_value))
                : `${a.fee_value}%`}{' '}
              ({FEE_LABEL[a.fee_type] || a.fee_type}) desde {a.effective_from}
              {a.effective_to ? ` hasta ${a.effective_to}` : ''}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <select
          value={buildingId}
          onChange={(e) => setBuildingId(e.target.value)}
          className="px-2 py-2 rounded-md text-xs"
          style={{
            backgroundColor: 'var(--baw-bg)',
            border: '1px solid var(--baw-border)',
            color: 'var(--baw-text)',
          }}
        >
          <option value="">Edificio…</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="px-2 py-2 rounded-md text-xs"
          style={{
            backgroundColor: 'var(--baw-bg)',
            border: '1px solid var(--baw-border)',
            color: 'var(--baw-text)',
          }}
        >
          <option value="">Todos los propietarios</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.full_name}
            </option>
          ))}
        </select>
        <select
          value={feeType}
          onChange={(e) => setFeeType(e.target.value)}
          className="px-2 py-2 rounded-md text-xs"
          style={{
            backgroundColor: 'var(--baw-bg)',
            border: '1px solid var(--baw-border)',
            color: 'var(--baw-text)',
          }}
        >
          <option value="percent_collected">% de lo cobrado</option>
          <option value="percent_billed">% de lo facturado</option>
          <option value="flat_monthly">Monto fijo</option>
        </select>
        <input
          type="number"
          min="0"
          step="0.01"
          value={feeValue}
          onChange={(e) => setFeeValue(e.target.value)}
          placeholder="Valor"
          className="px-2 py-2 rounded-md text-xs"
          style={{
            backgroundColor: 'var(--baw-bg)',
            border: '1px solid var(--baw-border)',
            color: 'var(--baw-text)',
          }}
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-2 rounded-md text-xs flex-1"
            style={{
              backgroundColor: 'var(--baw-bg)',
              border: '1px solid var(--baw-border)',
              color: 'var(--baw-text)',
            }}
          />
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-2 rounded-md text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--baw-accent)',
              color: 'var(--baw-on-primary)',
            }}
          >
            <Plus size={14} />
            {saving ? '…' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}
