'use client'

// BaW OS — Panel de cuentas combinadas (engagements) en /cobros.
// Muestra los pools (p.ej. Natturaly Complements = D102+D202+D201) con su
// saldo consolidado derivado de los movimientos reales, y permite crear un
// pool nuevo y ver el estado de cuenta combinado. El saldo NO es un ajuste:
// sale del mismo motor que los estados de cuenta individuales.

import { useCallback, useEffect, useState } from 'react'
import { Layers, Plus, X, FileText, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import PersonPicker, { type PickedPerson } from '@/components/PersonPicker'
import type { EstadoCuentaCombinadoDoc } from '@/lib/engagement'

interface EngagementRow {
  id: string
  name: string
  status: string
  payer: { id: string; name: string; kind?: string } | null
  contracts: Array<{
    id: string
    status: string
    monthly_amount: number
    unit: { number: string } | null
    occupant: { name: string } | null
  }>
}

interface ContractOption {
  id: string
  label: string
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export default function EngagementsPanel({
  orgId,
  selectedMonth,
}: {
  orgId: string | null | undefined
  selectedMonth: string
}) {
  const toast = useToast()
  const [engagements, setEngagements] = useState<EngagementRow[]>([])
  const [saldos, setSaldos] = useState<Map<string, number>>(new Map())
  const [loaded, setLoaded] = useState(false)

  // Modal de creación
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [payer, setPayer] = useState<PickedPerson | null>(null)
  const [contractOptions, setContractOptions] = useState<ContractOption[]>([])
  const [selectedContracts, setSelectedContracts] = useState<Set<string>>(new Set())

  // Modal de detalle (estado de cuenta consolidado)
  const [detail, setDetail] = useState<EstadoCuentaCombinadoDoc | null>(null)
  const [detailFor, setDetailFor] = useState<EngagementRow | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const fetchEngagements = useCallback(async () => {
    const res = await fetch('/api/engagements')
    if (!res.ok) return
    const json = await res.json()
    const rows = ((json.data || []) as Array<Record<string, unknown>>).map((e) => ({
      id: e.id as string,
      name: e.name as string,
      status: e.status as string,
      payer: one(e.payer as EngagementRow['payer'] | EngagementRow['payer'][] | null),
      contracts: ((e.contracts || []) as Array<Record<string, unknown>>).map((c) => ({
        id: c.id as string,
        status: c.status as string,
        monthly_amount: Number(c.monthly_amount || 0),
        unit: one(c.unit as { number: string } | { number: string }[] | null),
        occupant: one(c.occupant as { name: string } | { name: string }[] | null),
      })),
    }))
    setEngagements(rows.filter((e) => e.status === 'active'))
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!orgId) return
    fetchEngagements()
  }, [orgId, fetchEngagements])

  // Saldo consolidado por engagement para el mes de corte seleccionado.
  useEffect(() => {
    let cancelled = false
    async function loadSaldos() {
      const next = new Map<string, number>()
      for (const e of engagements) {
        const res = await fetch(`/api/engagements/${e.id}/estado-cuenta?periodo=${selectedMonth}`)
        if (!res.ok) continue
        const json = await res.json()
        if (json?.data?.data) next.set(e.id, Number(json.data.data.saldoTotal || 0))
      }
      if (!cancelled) setSaldos(next)
    }
    if (engagements.length > 0) loadSaldos()
    return () => {
      cancelled = true
    }
  }, [engagements, selectedMonth])

  async function openCreate() {
    setName('')
    setPayer(null)
    setSelectedContracts(new Set())
    setShowCreate(true)
    const { data } = await supabase
      .from('contracts')
      .select('id, monthly_amount, engagement_id, unit:units(number), occupant:occupants(name)')
      .eq('org_id', orgId)
      .in('status', ['active', 'en_renovacion'])
    setContractOptions(
      ((data || []) as Array<Record<string, unknown>>)
        .filter((c) => !c.engagement_id)
        .map((c) => {
          const unit = one(c.unit as { number: string } | { number: string }[] | null)
          const occupant = one(c.occupant as { name: string } | { name: string }[] | null)
          return {
            id: c.id as string,
            label: `${unit?.number || '—'} · ${occupant?.name || 'Sin inquilino'} · ${formatCurrency(Number(c.monthly_amount || 0))}`,
          }
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    )
  }

  async function createEngagement() {
    if (!name.trim()) {
      toast.error('Ponle nombre a la cuenta combinada')
      return
    }
    setSaving(true)
    const res = await fetch('/api/engagements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        payer_occupant_id: payer?.id ?? null,
        contract_ids: Array.from(selectedContracts),
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      toast.error(json?.error || 'No se pudo crear la cuenta combinada')
      return
    }
    toast.success('Cuenta combinada creada')
    setShowCreate(false)
    fetchEngagements()
  }

  async function openDetail(e: EngagementRow) {
    setDetailFor(e)
    setLoadingDetail(true)
    setDetail(null)
    const res = await fetch(`/api/engagements/${e.id}/estado-cuenta?periodo=${selectedMonth}`)
    setLoadingDetail(false)
    if (!res.ok) {
      toast.error('No se pudo cargar el estado de cuenta combinado')
      setDetailFor(null)
      return
    }
    const json = await res.json()
    setDetail(json.data as EstadoCuentaCombinadoDoc)
  }

  async function removeMember(engagementId: string, contractId: string) {
    const res = await fetch(`/api/engagements/${engagementId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remove_contract_ids: [contractId] }),
    })
    if (!res.ok) {
      toast.error('No se pudo quitar el contrato del pool')
      return
    }
    toast.success('Contrato fuera del pool')
    setDetailFor(null)
    setDetail(null)
    fetchEngagements()
  }

  // Sin engagements: solo el botón discreto para crear el primero.
  if (!loaded || (engagements.length === 0 && !showCreate)) {
    return (
      <div className="flex justify-end">
        {loaded && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-500 dark:text-gray-400 transition-colors"
          >
            <Layers className="w-4 h-4" /> Nueva cuenta combinada
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
          <Layers className="w-4 h-4" /> Cuentas combinadas
        </h2>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-500 dark:text-gray-400 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nueva
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {engagements.map((e) => {
          const saldo = saldos.get(e.id)
          return (
            <div key={e.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{e.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {e.payer ? `Paga: ${e.payer.name}` : 'Sin pagador asignado'} · {e.contracts.length} contrato{e.contracts.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Saldo del pool</p>
                  <p className={`font-bold ${saldo && saldo > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {saldo === undefined ? '…' : formatCurrency(saldo)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {e.contracts.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                  >
                    {c.unit?.number || '—'}
                  </span>
                ))}
              </div>
              <button
                onClick={() => openDetail(e)}
                className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-400 transition-colors"
              >
                <FileText className="w-4 h-4" /> Estado de cuenta combinado
              </button>
            </div>
          )
        })}
      </div>

      {/* Modal: crear cuenta combinada */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Nueva cuenta combinada</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nombre del pool</label>
              <input
                className="input-field w-full"
                placeholder="p. ej. Natturaly Complements"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Quién paga (persona o empresa)</label>
              <PersonPicker orgId={orgId} value={payer} onChange={setPayer} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contratos del pool</label>
              {contractOptions.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No hay contratos activos disponibles (los que ya están en otro pool no aparecen).
                </p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                  {contractOptions.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedContracts.has(c.id)}
                        onChange={() =>
                          setSelectedContracts((prev) => {
                            const next = new Set(prev)
                            if (next.has(c.id)) next.delete(c.id)
                            else next.add(c.id)
                            return next
                          })
                        }
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">
                Cancelar
              </button>
              <button onClick={createEngagement} disabled={saving} className="btn-primary">
                {saving ? 'Creando…' : 'Crear pool'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: estado de cuenta consolidado */}
      {detailFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">{detailFor.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Estado de cuenta consolidado · corte {selectedMonth}
                  {detail ? ` · ${detail.folio}` : ''}
                </p>
              </div>
              <button
                onClick={() => {
                  setDetailFor(null)
                  setDetail(null)
                }}
                className="text-gray-400 hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingDetail && <p className="text-sm text-gray-500">Cargando…</p>}

            {detail && (
              <>
                {/* Resumen del pool */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Saldo anterior', value: detail.data.saldoAnterior },
                    { label: 'Cargos del periodo', value: detail.data.cargosPeriodo },
                    { label: 'Pagos recibidos', value: detail.data.pagosRecibidos },
                    { label: 'Saldo total', value: detail.data.saldoTotal },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                      <p className={`font-bold ${s.label === 'Saldo total' && s.value > 0 ? 'text-red-500' : ''}`}>
                        {formatCurrency(s.value)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Saldo por unidad */}
                <div>
                  <p className="text-sm font-semibold mb-1">Por unidad</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.members.map((m) => (
                      <span
                        key={m.contractId}
                        className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-sm bg-gray-100 dark:bg-gray-800"
                      >
                        <strong>{m.unitNumber}</strong> {m.tenantName} ·{' '}
                        <span className={m.saldoTotal > 0 ? 'text-red-500' : 'text-emerald-500'}>
                          {formatCurrency(m.saldoTotal)}
                        </span>
                        <button
                          title="Quitar del pool"
                          onClick={() => removeMember(detailFor.id, m.contractId)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Movimientos */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="py-1.5 pr-3">Fecha</th>
                        <th className="py-1.5 pr-3">Concepto</th>
                        <th className="py-1.5 pr-3 text-right">Cargo</th>
                        <th className="py-1.5 pr-3 text-right">Abono</th>
                        <th className="py-1.5 text-right">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.data.movimientos.map((m, i) => (
                        <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-1.5 pr-3 whitespace-nowrap">{m.date}</td>
                          <td className="py-1.5 pr-3">{m.concept}</td>
                          <td className="py-1.5 pr-3 text-right">{m.charge ? formatCurrency(m.charge) : '—'}</td>
                          <td className="py-1.5 pr-3 text-right text-emerald-500">
                            {m.credit ? formatCurrency(m.credit) : '—'}
                          </td>
                          <td className="py-1.5 text-right font-medium">{formatCurrency(m.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
