'use client'

import { useEffect, useState } from 'react'
import { DollarSign, Save, Check, Plus, Pencil, Trash2, X, CalendarDays } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'

interface UnitPrice {
  id: string
  unit_id: string
  org_id: string
  ltr_price: number
  str_price_per_person: number | null
  category: string
  nivel: string
  notes: string | null
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

const ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'

export default function PricingPage() {
  const [prices, setPrices] = useState<UnitPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Record<string, Partial<UnitPrice>>>({})
  const [saved, setSaved] = useState<string | null>(null)

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

  async function fetchPrices() {
    setLoading(true)
    const { data } = await supabase
      .from('unit_prices')
      .select('*')
      .order('nivel')
      .order('unit_id')
    setPrices(data || [])
    setLoading(false)
  }

  async function fetchSeasons() {
    const { data } = await supabase
      .from('str_seasons')
      .select('*')
      .eq('org_id', ORG_ID)
      .order('start_date', { ascending: true })
    setSeasons((data || []) as Season[])
  }

  useEffect(() => {
    fetchPrices()
    fetchSeasons()
  }, [])

  function startEdit(price: UnitPrice) {
    setEditing((prev) => ({
      ...prev,
      [price.id]: { ltr_price: price.ltr_price, str_price_per_person: price.str_price_per_person },
    }))
  }

  function updateField(id: string, field: string, value: string) {
    setEditing((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value === '' ? null : Number(value) },
    }))
  }

  async function savePrice(id: string) {
    const updates = editing[id]
    if (!updates) return
    await supabase.from('unit_prices').update(updates).eq('id', id)
    setEditing((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setSaved(id)
    setTimeout(() => setSaved(null), 1500)
    fetchPrices()
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
      org_id: ORG_ID,
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

  const nivelOrder = ['N1', 'N2', 'N3', 'N4']
  const grouped = nivelOrder.map((nivel) => ({
    nivel,
    units: prices.filter((p) => p.nivel === nivel),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Administrador de Precios</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {prices.length} unidades · Precios LTR y STR
        </p>
      </div>

      {loading ? (
        <div className="text-gray-400 dark:text-gray-500">Cargando precios...</div>
      ) : (
        grouped.map(({ nivel, units }) =>
          units.length > 0 ? (
            <div key={nivel} className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Nivel {nivel.replace('N', '')}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Depto</th>
                      <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Categoría</th>
                      <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">LTR $/mes</th>
                      <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">STR $/pers/noche</th>
                      <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Notas</th>
                      <th className="text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider py-3 px-4">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800/50">
                    {units.map((price) => {
                      const isEditing = !!editing[price.id]
                      return (
                        <tr key={price.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                          <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{price.unit_id}</td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-gray-700 dark:text-gray-300">{price.category}</span>
                          </td>
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editing[price.id].ltr_price ?? ''}
                                onChange={(e) => updateField(price.id, 'ltr_price', e.target.value)}
                                className="input-field w-28"
                              />
                            ) : (
                              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(price.ltr_price)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editing[price.id].str_price_per_person ?? ''}
                                onChange={(e) => updateField(price.id, 'str_price_per_person', e.target.value)}
                                className="input-field w-28"
                                placeholder="—"
                              />
                            ) : price.str_price_per_person ? (
                              <span className="font-medium text-blue-600 dark:text-blue-400">
                                {formatCurrency(price.str_price_per_person)}
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-600">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                            {price.notes || '—'}
                          </td>
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => savePrice(price.id)}
                                  className="text-xs text-emerald-500 hover:text-emerald-400 font-medium"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => cancelEdit(price.id)}
                                  className="text-xs text-gray-400 hover:text-gray-300"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : saved === price.id ? (
                              <Check className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <button
                                onClick={() => startEdit(price)}
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
          ) : null
        )
      )}

      <div className="card">
        <div className="flex items-start gap-3">
          <DollarSign className="w-5 h-5 text-indigo-400 mt-0.5" />
          <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
            <p><strong className="text-gray-700 dark:text-gray-300">LTR:</strong> Renta mensual (incluye agua $250). Mín 6 meses.</p>
            <p><strong className="text-gray-700 dark:text-gray-300">STR:</strong> Precio por persona/noche. Mín 4 personas, mín 3 noches. Extra persona &gt;4: +$250/noche.</p>
            <p><strong className="text-gray-700 dark:text-gray-300">Descuento máximo:</strong> 15% negociación. Colaboradores: 15–20%.</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4 relative">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4">
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
