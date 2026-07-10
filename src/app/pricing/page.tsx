'use client'

// BaW OS — Administrador de Precios (fuente unificada, 2026-07-03).
//
// Antes editaba la tabla legacy `unit_prices` (sin org, $/persona/noche) que
// solo leía el cotizador. Ahora edita directamente `units.monthly_rate_mxn`
// (renta LTR) y `units.base_rate_mxn` (tarifa STR por noche) — las MISMAS
// columnas que consumen el sitio público de reservas, el calendario y el
// cotizador. Un solo lugar, una sola verdad de precio.
// Las temporadas (str_seasons, multiplicador global) siguen viviendo aquí.

import { useEffect, useState } from 'react'
import { DollarSign, Save, Check, Plus, Pencil, Trash2, X, CalendarDays } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrgContext } from '@/hooks/useOrgContext'
import { formatCurrency } from '@/lib/utils'

interface PricedUnit {
  id: string
  number: string
  floor: number | null
  type: string
  base_rate_mxn: number | null
  monthly_rate_mxn: number | null
  cleaning_fee_mxn: number | null
  building: { id: string; name: string } | { id: string; name: string }[] | null
}

interface Season {
  id: string
  org_id: string
  name: string
  start_date: string
  end_date: string
  price_multiplier: number
  notes: string | null
  created_at: string
}

type UnitEdit = {
  monthly_rate_mxn: number | null
  base_rate_mxn: number | null
  cleaning_fee_mxn: number | null
}

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

export default function PricingPage() {
  const [units, setUnits] = useState<PricedUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Record<string, UnitEdit>>({})
  const [saved, setSaved] = useState<string | null>(null)

  const { orgId, loading: orgLoading } = useOrgContext()
  // Seasons state
  const [seasons, setSeasons] = useState<Season[]>([])
  const [showSeasonModal, setShowSeasonModal] = useState(false)
  const [editingSeason, setEditingSeason] = useState<Season | null>(null)
  const [seasonForm, setSeasonForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
    price_multiplier: 1.0,
    notes: '',
  })
  const [savingSeason, setSavingSeason] = useState(false)
  const [deletingSeason, setDeletingSeason] = useState<Season | null>(null)

  async function fetchUnits(org: string) {
    setLoading(true)
    const { data } = await supabase
      .from('units')
      .select('id, number, floor, type, base_rate_mxn, monthly_rate_mxn, cleaning_fee_mxn, building:buildings(id, name)')
      .eq('org_id', org)
      .is('archived_at', null)
      .order('floor')
      .order('number')
    setUnits((data as PricedUnit[]) || [])
    setLoading(false)
  }

  async function fetchSeasons() {
    const { data } = await supabase
      .from('str_seasons')
      .select('*')
      .eq('org_id', orgId)
      .order('start_date', { ascending: true })
    setSeasons((data || []) as Season[])
  }

  useEffect(() => {
    if (orgLoading) return
    if (!orgId) {
      setLoading(false)
      return
    }
    fetchUnits(orgId)
    fetchSeasons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, orgLoading])

  function startEdit(u: PricedUnit) {
    setEditing((prev) => ({
      ...prev,
      [u.id]: {
        monthly_rate_mxn: u.monthly_rate_mxn,
        base_rate_mxn: u.base_rate_mxn,
        cleaning_fee_mxn: u.cleaning_fee_mxn,
      },
    }))
  }

  function updateField(id: string, field: keyof UnitEdit, value: string) {
    setEditing((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value === '' ? null : Number(value) },
    }))
  }

  async function saveUnit(id: string) {
    const updates = editing[id]
    if (!updates) return
    await supabase.from('units').update(updates).eq('id', id)
    setEditing((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setSaved(id)
    setTimeout(() => setSaved(null), 1500)
    if (orgId) fetchUnits(orgId)
  }

  function cancelEdit(id: string) {
    setEditing((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function openNewSeason() {
    setEditingSeason(null)
    setSeasonForm({ name: '', start_date: '', end_date: '', price_multiplier: 1.0, notes: '' })
    setShowSeasonModal(true)
  }

  function openEditSeason(s: Season) {
    setEditingSeason(s)
    setSeasonForm({
      name: s.name,
      start_date: s.start_date,
      end_date: s.end_date,
      price_multiplier: s.price_multiplier,
      notes: s.notes || '',
    })
    setShowSeasonModal(true)
  }

  async function handleSaveSeason() {
    setSavingSeason(true)
    const payload = {
      org_id: orgId,
      name: seasonForm.name,
      start_date: seasonForm.start_date,
      end_date: seasonForm.end_date,
      price_multiplier: seasonForm.price_multiplier,
      notes: seasonForm.notes || null,
    }
    if (editingSeason) {
      await supabase.from('str_seasons').update(payload).eq('id', editingSeason.id)
    } else {
      await supabase.from('str_seasons').insert(payload)
    }
    setShowSeasonModal(false)
    setSavingSeason(false)
    fetchSeasons()
  }

  async function handleDeleteSeason() {
    if (!deletingSeason) return
    setSavingSeason(true)
    await supabase.from('str_seasons').delete().eq('id', deletingSeason.id)
    setDeletingSeason(null)
    setSavingSeason(false)
    fetchSeasons()
  }

  function isSeasonActive(s: Season) {
    const today = new Date().toISOString().split('T')[0]
    return today >= s.start_date && today <= s.end_date
  }

  // Agrupar por edificio (nombre); unidades sin edificio al final
  const groups = (() => {
    const map = new Map<string, { name: string; units: PricedUnit[] }>()
    for (const u of units) {
      const b = one(u.building)
      const key = b?.id ?? '__none__'
      if (!map.has(key)) map.set(key, { name: b?.name ?? 'Sin edificio', units: [] })
      map.get(key)!.units.push(u)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  })()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Administrador de Precios</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {units.length} unidades · renta mensual (LTR) y tarifa por noche (STR). Estos precios
          alimentan el sitio público, el calendario y el cotizador.
        </p>
      </div>

      {loading || orgLoading ? (
        <div className="text-gray-400 dark:text-gray-500">Cargando precios...</div>
      ) : !orgId ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            Selecciona una organización en el switcher del sidebar.
          </p>
        </div>
      ) : (
        groups.map(({ name, units: groupUnits }) => (
          <div key={name} className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {name}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Unidad</th>
                    <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Tipo</th>
                    <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Renta $/mes</th>
                    <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">STR $/noche</th>
                    <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Limpieza $</th>
                    <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800/50">
                  {groupUnits.map((u) => {
                    const isEditing = !!editing[u.id]
                    return (
                      <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                        <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">
                          {u.number}
                          {u.floor !== null && (
                            <span className="text-xs text-gray-400 ml-2">Piso {u.floor}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{u.type}</span>
                        </td>
                        <td className="py-3 px-4">
                          {isEditing ? (
                            <input
                              type="number"
                              inputMode="decimal"
                              value={editing[u.id].monthly_rate_mxn ?? ''}
                              onChange={(e) => updateField(u.id, 'monthly_rate_mxn', e.target.value)}
                              className="input-field w-28"
                              placeholder="—"
                            />
                          ) : u.monthly_rate_mxn != null ? (
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(u.monthly_rate_mxn)}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isEditing ? (
                            <input
                              type="number"
                              inputMode="decimal"
                              value={editing[u.id].base_rate_mxn ?? ''}
                              onChange={(e) => updateField(u.id, 'base_rate_mxn', e.target.value)}
                              className="input-field w-28"
                              placeholder="—"
                            />
                          ) : u.base_rate_mxn != null ? (
                            <span className="font-medium text-blue-600 dark:text-blue-400">
                              {formatCurrency(u.base_rate_mxn)}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isEditing ? (
                            <input
                              type="number"
                              inputMode="decimal"
                              value={editing[u.id].cleaning_fee_mxn ?? ''}
                              onChange={(e) => updateField(u.id, 'cleaning_fee_mxn', e.target.value)}
                              className="input-field w-24"
                              placeholder="—"
                            />
                          ) : u.cleaning_fee_mxn != null ? (
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {formatCurrency(u.cleaning_fee_mxn)}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => saveUnit(u.id)}
                                className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-xs text-emerald-500 hover:text-emerald-400 font-medium"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => cancelEdit(u.id)}
                                className="text-xs text-gray-400 hover:text-gray-300"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : saved === u.id ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <button
                              onClick={() => startEdit(u)}
                              className="text-xs text-indigo-400 hover:text-indigo-300"
                            >
                              Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <div className="card">
        <div className="flex items-start gap-3">
          <DollarSign className="w-5 h-5 text-indigo-400 mt-0.5" />
          <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
            <p><strong className="text-gray-700 dark:text-gray-300">Renta $/mes:</strong> renta mensual LTR/MTR (incluye agua). Mín 6 meses.</p>
            <p><strong className="text-gray-700 dark:text-gray-300">STR $/noche:</strong> tarifa por noche de la unidad completa. El precio final por día = tarifa × temporada; se puede fijar un precio exacto por unidad+rango desde el calendario.</p>
            <p><strong className="text-gray-700 dark:text-gray-300">Descuento máximo:</strong> 15% negociación en el cotizador.</p>
          </div>
        </div>
      </div>

      {/* Temporadas STR */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-purple-500" />
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Temporadas STR
            </h2>
          </div>
          <button
            onClick={openNewSeason}
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva temporada
          </button>
        </div>

        {seasons.length === 0 ? (
          <div className="card text-center py-8">
            <CalendarDays className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No hay temporadas configuradas</p>
          </div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Nombre</th>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Inicio</th>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Fin</th>
                  <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Multiplicador</th>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Notas</th>
                  <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        {s.name}
                        {isSeasonActive(s) && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                            Activa ahora
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.start_date}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.end_date}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold ${s.price_multiplier > 1 ? 'text-amber-500' : s.price_multiplier < 1 ? 'text-blue-500' : 'text-gray-500'}`}>
                        {s.price_multiplier}x
                      </span>
                      {s.price_multiplier !== 1 && (
                        <span className="text-xs text-gray-400 ml-1">
                          ({s.price_multiplier > 1 ? '+' : ''}{Math.round((s.price_multiplier - 1) * 100)}%)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
                      {s.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditSeason(s)}
                          title="Editar"
                          className="p-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingSeason(s)}
                          title="Eliminar"
                          className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Season Modal */}
      {showSeasonModal && (
        <div className="modal-wrap">
          <div className="card modal-panel w-full max-w-md relative">
            <button
              onClick={() => setShowSeasonModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {editingSeason ? 'Editar temporada' : 'Nueva temporada'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Nombre</label>
                <input
                  type="text"
                  value={seasonForm.name}
                  onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })}
                  className="input-field w-full"
                  placeholder="Ej: Semana Santa 2026"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Inicio</label>
                  <input
                    type="date"
                    value={seasonForm.start_date}
                    onChange={(e) => setSeasonForm({ ...seasonForm, start_date: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Fin</label>
                  <input
                    type="date"
                    value={seasonForm.end_date}
                    onChange={(e) => setSeasonForm({ ...seasonForm, end_date: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                  Multiplicador de precio (ej: 1.5 = +50%)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.05"
                  min="0.5"
                  max="3"
                  value={seasonForm.price_multiplier}
                  onChange={(e) => setSeasonForm({ ...seasonForm, price_multiplier: Number(e.target.value) })}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Notas</label>
                <textarea
                  value={seasonForm.notes}
                  onChange={(e) => setSeasonForm({ ...seasonForm, notes: e.target.value })}
                  className="input-field w-full"
                  rows={2}
                  placeholder="Opcional"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowSeasonModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveSeason}
                  disabled={savingSeason || !seasonForm.name || !seasonForm.start_date || !seasonForm.end_date}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Season Confirmation */}
      {deletingSeason && (
        <div className="modal-wrap">
          <div className="card modal-panel w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Eliminar temporada</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              ¿Eliminar <strong className="text-gray-900 dark:text-white">{deletingSeason.name}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingSeason(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteSeason}
                disabled={savingSeason}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
