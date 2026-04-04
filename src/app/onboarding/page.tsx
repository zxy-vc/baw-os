'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Trash2, CheckCircle, ArrowLeft, ArrowRight, SkipForward } from 'lucide-react'

// Tipos del wizard
interface BuildingData {
  name: string
  address: string
  city: string
  total_units: number
}

interface UnitRow {
  number: string
  type: 'STR' | 'MTR' | 'LTR'
  floor: number
}

interface TenantRow {
  name: string
  phone: string
  unit_number: string
  monthly_amount: number
  start_date: string
}

const STEPS = ['Edificio', 'Unidades', 'Inquilinos', 'Listo']

export default function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ units_created: number; contracts_created: number } | null>(null)

  // Paso 1 — Edificio
  const [building, setBuilding] = useState<BuildingData>({
    name: '',
    address: '',
    city: '',
    total_units: 4,
  })

  // Paso 2 — Unidades
  const [units, setUnits] = useState<UnitRow[]>([])

  // Paso 3 — Inquilinos
  const [tenants, setTenants] = useState<TenantRow[]>([])

  // Al avanzar del paso 1 al 2, precarga filas vacías
  function goToStep2() {
    if (!building.name || !building.address || !building.city || building.total_units < 1) return
    if (units.length === 0) {
      const rows: UnitRow[] = Array.from({ length: building.total_units }, (_, i) => ({
        number: String(i + 1),
        type: 'LTR',
        floor: 1,
      }))
      setUnits(rows)
    }
    setStep(1)
  }

  function addUnit() {
    setUnits([...units, { number: '', type: 'LTR', floor: 1 }])
  }

  function removeUnit(idx: number) {
    setUnits(units.filter((_, i) => i !== idx))
  }

  function updateUnit(idx: number, field: keyof UnitRow, value: string | number) {
    const copy = [...units]
    copy[idx] = { ...copy[idx], [field]: value }
    setUnits(copy)
  }

  function addTenant() {
    setTenants([...tenants, { name: '', phone: '', unit_number: '', monthly_amount: 0, start_date: '' }])
  }

  function removeTenant(idx: number) {
    setTenants(tenants.filter((_, i) => i !== idx))
  }

  function updateTenant(idx: number, field: keyof TenantRow, value: string | number) {
    const copy = [...tenants]
    copy[idx] = { ...copy[idx], [field]: value }
    setTenants(copy)
  }

  // Enviar todo al API en el paso final
  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building: { name: building.name, address: building.address, city: building.city },
          units: units.map((u) => ({ number: u.number, type: u.type, floor: u.floor })),
          tenants: tenants.filter((t) => t.name && t.unit_number),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al guardar')
      setResult(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSubmitting(false)
    }
  }

  // Validaciones por paso
  const step1Valid = building.name && building.address && building.city && building.total_units >= 1
  const step2Valid = units.length >= 1 && units.every((u) => u.number)

  return (
    <div className="min-h-screen flex items-start justify-center pt-12 px-4 bg-black">
      <div className="w-full max-w-2xl">
        {/* Progress bar */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
                  i < step
                    ? 'bg-emerald-500 text-white'
                    : i === step
                    ? 'bg-white text-black'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={`text-xs font-medium hidden sm:block ${
                  i <= step ? 'text-white' : 'text-gray-500'
                }`}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 rounded ${
                    i < step ? 'bg-emerald-500' : 'bg-gray-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Card principal */}
        <div className="bg-[#111] border border-[#333] rounded-xl p-6">
          {/* ── Paso 1: Edificio ── */}
          {step === 0 && (
            <div className="space-y-6">
              <div className="text-center">
                <Building2 className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bienvenido a BaW OS</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Configura tu propiedad en BaW OS en menos de 5 minutos.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Nombre del edificio</label>
                  <input
                    className="input-field"
                    placeholder="Ej: ALM809P"
                    value={building.name}
                    onChange={(e) => setBuilding({ ...building, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Dirección completa</label>
                  <input
                    className="input-field"
                    placeholder="Calle, número, colonia, CP"
                    value={building.address}
                    onChange={(e) => setBuilding({ ...building, address: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Ciudad</label>
                  <input
                    className="input-field"
                    placeholder="Ej: León, GTO"
                    value={building.city}
                    onChange={(e) => setBuilding({ ...building, city: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Número total de unidades</label>
                  <input
                    className="input-field"
                    type="number"
                    min={1}
                    value={building.total_units}
                    onChange={(e) => setBuilding({ ...building, total_units: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  disabled={!step1Valid}
                  onClick={goToStep2}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Continuar <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Paso 2: Unidades ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Agregar unidades</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Define las unidades de tu propiedad. Puedes ajustar el número, tipo y piso.
                </p>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {units.map((u, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="input-field w-24"
                      placeholder="No."
                      value={u.number}
                      onChange={(e) => updateUnit(i, 'number', e.target.value)}
                    />
                    <select
                      className="input-field w-28"
                      value={u.type}
                      onChange={(e) => updateUnit(i, 'type', e.target.value)}
                    >
                      <option value="LTR">LTR</option>
                      <option value="MTR">MTR</option>
                      <option value="STR">STR</option>
                    </select>
                    <input
                      className="input-field w-20"
                      type="number"
                      min={0}
                      placeholder="Piso"
                      value={u.floor}
                      onChange={(e) => updateUnit(i, 'floor', parseInt(e.target.value) || 0)}
                    />
                    <button
                      onClick={() => removeUnit(i)}
                      className="p-2 text-red-400 hover:text-red-300 transition-colors shrink-0"
                      title="Eliminar unidad"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={addUnit}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> Agregar unidad
              </button>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(0)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Atrás
                </button>
                <button
                  disabled={!step2Valid}
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Continuar <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Paso 3: Inquilinos (opcional) ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Agregar inquilinos</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Agrega tus inquilinos actuales. Puedes hacerlo después desde Contratos.
                </p>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                {tenants.map((t, i) => (
                  <div key={i} className="p-3 rounded-lg bg-gray-800/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        className="input-field flex-1"
                        placeholder="Nombre del inquilino"
                        value={t.name}
                        onChange={(e) => updateTenant(i, 'name', e.target.value)}
                      />
                      <button
                        onClick={() => removeTenant(i)}
                        className="p-2 text-red-400 hover:text-red-300 transition-colors shrink-0"
                        title="Eliminar inquilino"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="input-field"
                        placeholder="Teléfono (opcional)"
                        value={t.phone}
                        onChange={(e) => updateTenant(i, 'phone', e.target.value)}
                      />
                      <select
                        className="input-field"
                        value={t.unit_number}
                        onChange={(e) => updateTenant(i, 'unit_number', e.target.value)}
                      >
                        <option value="">Seleccionar unidad</option>
                        {units.map((u) => (
                          <option key={u.number} value={u.number}>
                            Unidad {u.number}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="input-field"
                        type="number"
                        min={0}
                        placeholder="Renta mensual"
                        value={t.monthly_amount || ''}
                        onChange={(e) => updateTenant(i, 'monthly_amount', parseFloat(e.target.value) || 0)}
                      />
                      <input
                        className="input-field"
                        type="date"
                        value={t.start_date}
                        onChange={(e) => updateTenant(i, 'start_date', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addTenant}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> Agregar inquilino
              </button>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Atrás
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setTenants([]); setStep(3); handleSubmit() }}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                  >
                    <SkipForward className="w-4 h-4" /> Omitir por ahora
                  </button>
                  <button
                    onClick={() => { setStep(3); handleSubmit() }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-100 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Continuar <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Paso 4: Listo ── */}
          {step === 3 && (
            <div className="space-y-6 text-center py-4">
              {submitting && (
                <div className="space-y-3">
                  <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-gray-400">Guardando configuración...</p>
                </div>
              )}

              {error && (
                <div className="space-y-4">
                  <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
                    <span className="text-2xl">!</span>
                  </div>
                  <h2 className="text-xl font-bold text-red-400">Error al guardar</h2>
                  <p className="text-sm text-gray-400">{error}</p>
                  <button
                    onClick={handleSubmit}
                    className="px-5 py-2.5 bg-white hover:bg-gray-100 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Tu propiedad está configurada
                  </h2>
                  <div className="flex justify-center gap-4 text-sm text-gray-400">
                    <span>{result.units_created} unidades creadas</span>
                    <span>·</span>
                    <span>{result.contracts_created} contratos creados</span>
                  </div>
                  <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
                    <button
                      onClick={() => router.push('/')}
                      className="px-6 py-2.5 bg-white hover:bg-gray-100 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Ir al Dashboard →
                    </button>
                    <button
                      onClick={() => router.push('/units')}
                      className="px-6 py-2.5 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Ver mis unidades
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
