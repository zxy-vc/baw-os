'use client'

import { useEffect, useState } from 'react'
import { DollarSign, Save, Check } from 'lucide-react'
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

export default function PricingPage() {
  const [prices, setPrices] = useState<UnitPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Record<string, Partial<UnitPrice>>>({})
  const [saved, setSaved] = useState<string | null>(null)

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

  useEffect(() => {
    fetchPrices()
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
    </div>
  )
}
