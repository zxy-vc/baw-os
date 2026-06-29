'use client'

// BaW OS — Servicios (Fase 1): tarifa de agua por edificio con historial.
//
// El agua dejó de ser un $250 fijo. Aquí registras "actualizaciones de precio":
// una cuota por edificio vigente desde un mes. Cobros la resuelve al generar cada
// cargo, así un cambio aplica a todas las unidades del edificio sin tocar contratos.
// El helper de prorrateo calcula la cuota = recibo del edificio ÷ unidades.

import { useEffect, useState, useCallback } from 'react'
import { Droplets, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrgContext } from '@/hooks/useOrgContext'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import { SkeletonTable } from '@/components/Skeleton'

type Building = { id: string; name: string }
type Rate = { id: string; building_id: string | null; amount: number; effective_from: string; notes: string | null }

function monthLabel(iso: string): string {
  const [y, m] = iso.slice(0, 7).split('-')
  const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${names[Number(m) - 1]} ${y}`
}

export default function ServiciosPage() {
  const { orgId } = useOrgContext()
  const toast = useToast()
  const [buildings, setBuildings] = useState<Building[]>([])
  const [unitsByBuilding, setUnitsByBuilding] = useState<Record<string, number>>({})
  const [rates, setRates] = useState<Rate[]>([])
  const [loading, setLoading] = useState(true)

  // Form "actualización de precio"
  const [buildingId, setBuildingId] = useState('') // '' = toda la org
  const [month, setMonth] = useState('')
  const [useProrrateo, setUseProrrateo] = useState(true)
  const [totalBill, setTotalBill] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [bRes, uRes, rRes] = await Promise.all([
      supabase.from('buildings').select('id, name').eq('org_id', orgId).order('name'),
      supabase.from('units').select('id, building_id').eq('org_id', orgId),
      supabase
        .from('service_rates')
        .select('id, building_id, amount, effective_from, notes')
        .eq('org_id', orgId)
        .eq('service', 'agua')
        .order('effective_from', { ascending: false }),
    ])
    setBuildings((bRes.data || []) as Building[])
    const counts: Record<string, number> = {}
    for (const u of (uRes.data || []) as { building_id: string | null }[]) {
      if (u.building_id) counts[u.building_id] = (counts[u.building_id] || 0) + 1
    }
    setUnitsByBuilding(counts)
    setRates((rRes.data || []) as Rate[])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  const unitsForBuilding = buildingId
    ? unitsByBuilding[buildingId] || 0
    : Object.values(unitsByBuilding).reduce((a, b) => a + b, 0)

  const computedAmount = useProrrateo
    ? Number(totalBill) > 0 && unitsForBuilding > 0
      ? Number(totalBill) / unitsForBuilding
      : 0
    : Number(amount)

  function buildingName(id: string | null): string {
    if (!id) return 'Toda la organización'
    return buildings.find((b) => b.id === id)?.name || '—'
  }

  async function handleSave() {
    if (!orgId || !month || computedAmount <= 0) {
      toast.error('Completa el mes y el monto')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('service_rates').insert({
      org_id: orgId,
      building_id: buildingId || null,
      service: 'agua',
      amount: Math.round(computedAmount * 100) / 100,
      effective_from: `${month}-01`,
      notes:
        notes ||
        (useProrrateo ? `Prorrateo: ${formatCurrency(Number(totalBill))} ÷ ${unitsForBuilding} unidades` : null),
    })
    setSaving(false)
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`)
      return
    }
    setMonth('')
    setTotalBill('')
    setAmount('')
    setNotes('')
    toast.success('Tarifa de agua actualizada')
    load()
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Droplets className="w-6 h-6 text-blue-400" />
          Servicios — Cuota de agua
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          La cuota de agua por edificio. Cobros usa la vigente para cada mes; un cambio aplica a todas las
          unidades del edificio sin tocar contratos.
        </p>
      </div>

      {/* Nueva actualización */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Actualizar cuota
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Edificio</label>
            <select
              value={buildingId}
              onChange={(e) => setBuildingId(e.target.value)}
              className="input-field w-full"
            >
              <option value="">Toda la organización</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({unitsByBuilding[b.id] || 0} u.)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Vigente desde (mes)</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input-field w-full" />
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={useProrrateo} onChange={() => setUseProrrateo(true)} />
            Prorratear recibo
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={!useProrrateo} onChange={() => setUseProrrateo(false)} />
            Cuota fija
          </label>
        </div>

        {useProrrateo ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Total del recibo</label>
              <input
                type="number"
                value={totalBill}
                onChange={(e) => setTotalBill(e.target.value)}
                placeholder="$0.00"
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                Cuota por unidad ({unitsForBuilding} unidades)
              </label>
              <p className="input-field w-full bg-gray-50 dark:bg-gray-800/50 font-semibold">
                {formatCurrency(computedAmount || 0)}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Cuota por unidad</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="$0.00"
              className="input-field w-full sm:w-1/2"
            />
          </div>
        )}

        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Nota (opcional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. recibo CMAPA marzo"
            className="input-field w-full"
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !month || computedAmount <= 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Guardando…' : 'Guardar actualización'}
          </button>
        </div>
      </div>

      {/* Historial */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
          Historial de cuotas
        </h2>
        {loading ? (
          <SkeletonTable />
        ) : rates.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sin cuotas registradas. Cobros usa $250 por defecto hasta que registres una.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 pr-3 font-medium">Edificio</th>
                  <th className="pb-2 pr-3 font-medium">Vigente desde</th>
                  <th className="pb-2 pr-3 font-medium text-right">Cuota / unidad</th>
                  <th className="pb-2 font-medium">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rates.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2.5 pr-3 text-gray-900 dark:text-white">{buildingName(r.building_id)}</td>
                    <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300 capitalize">{monthLabel(r.effective_from)}</td>
                    <td className="py-2.5 pr-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="py-2.5 text-gray-500 dark:text-gray-400">{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
