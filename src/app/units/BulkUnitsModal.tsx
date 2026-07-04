'use client'

// BaW OS — Bulk Units Modal (Sprint 6 followup #2)
//
// Permite generar varias unidades a la vez usando el mismo patrón que el
// wizard de onboarding (`WizardFirstRun.tsx`): Cantidad / Prefijo /
// Empezar en / Tipo. El piso se infiere del número siguiendo la convención
// inmobiliaria estándar (101→piso 1, 205→piso 2, 1003→piso 10).
//
// Diferencias con el wizard:
//   - Aquí ya hay un edificio activo (se recibe `buildingId` por prop).
//   - El usuario puede iterar varios bulks (101–104, 201–204, 301–304) antes
//     de confirmar; la lista crece con append + dedupe por `number`.
//   - Al confirmar, hace una sola llamada `insert([...])` para minimizar
//     round-trips a Supabase.
//
// NO toca el flujo de "Nueva unidad" individual (UnitModal sigue igual).

import { useMemo, useState } from 'react'
import { Plus, Trash2, X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { UnitType } from '@/types'

interface BulkUnitsModalProps {
  orgId: string
  buildingId: string | null
  buildingName: string | null
  onClose: () => void
  onSuccess: (insertedCount: number) => void
}

interface UnitRow {
  number: string
  type: UnitType
  floor: number
}

interface BulkConfig {
  count: string
  prefix: string
  startNumber: string
  type: UnitType
}

// Misma regla que WizardFirstRun: piso = todos los dígitos excepto los
// últimos 2 (101→1, 205→2, 1003→10). ≤2 dígitos asume piso 1.
function inferFloor(numberStr: string): number {
  const digits = numberStr.replace(/[^0-9]/g, '')
  if (digits.length <= 2) return 1
  const floorStr = digits.slice(0, -2)
  const floor = Number(floorStr)
  return Number.isFinite(floor) && floor > 0 ? floor : 1
}

export default function BulkUnitsModal({
  orgId,
  buildingId,
  buildingName,
  onClose,
  onSuccess,
}: BulkUnitsModalProps) {
  const [config, setConfig] = useState<BulkConfig>({
    count: '4',
    prefix: '',
    startNumber: '101',
    type: 'LTR',
  })
  const [units, setUnits] = useState<UnitRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function generate() {
    const rows: UnitRow[] = []
    const count = Math.max(1, Number(config.count) || 0)
    const startNumber = Number(config.startNumber) || 101
    const { prefix, type } = config
    for (let i = 0; i < count; i++) {
      const num = `${prefix}${startNumber + i}`
      rows.push({ number: num, type, floor: inferFloor(num) })
    }
    // Append + dedupe por number (las nuevas filas ganan)
    const byNumber = new Map<string, UnitRow>()
    for (const u of units) byNumber.set(u.number, u)
    for (const u of rows) byNumber.set(u.number, u)
    setUnits(Array.from(byNumber.values()))

    // Auto-sugerir el siguiente piso para el próximo bulk
    setConfig({ ...config, startNumber: String(startNumber + 100) })
  }

  function addRow() {
    setUnits([...units, { number: '', type: 'LTR', floor: 1 }])
  }

  function removeRow(idx: number) {
    setUnits(units.filter((_, i) => i !== idx))
  }

  function updateRow(idx: number, field: keyof UnitRow, value: string | number) {
    const copy = [...units]
    copy[idx] = { ...copy[idx], [field]: value as never }
    setUnits(copy)
  }

  const validRows = useMemo(
    () => units.filter((u) => u.number.trim().length > 0),
    [units],
  )

  async function handleSubmit() {
    if (validRows.length === 0) {
      setError('Genera o agrega al menos una unidad antes de guardar.')
      return
    }
    if (!buildingId) {
      setError('Selecciona un edificio activo antes de generar unidades en bulk.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload = validRows.map((u) => ({
        org_id: orgId,
        building_id: buildingId,
        number: u.number.trim(),
        type: u.type,
        floor: Number(u.floor) || 1,
        status: 'available' as const,
      }))
      const { error: insertError, data } = await supabase
        .from('units')
        .insert(payload)
        .select('id')
      if (insertError) {
        // Conflict típico: violación de unique (org_id, building_id, number)
        // si el usuario re-intenta crear una unidad ya existente.
        throw new Error(insertError.message)
      }
      onSuccess(data?.length ?? validRows.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron crear las unidades.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl"
        style={{
          backgroundColor: 'var(--baw-surface)',
          border: '1px solid var(--baw-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--baw-border)' }}
        >
          <div className="min-w-0">
            <h2
              className="text-lg font-semibold"
              style={{ color: 'var(--baw-text)' }}
            >
              Generar varias unidades
            </h2>
            {buildingName && (
              <p
                className="text-xs mt-0.5 truncate"
                style={{ color: 'var(--baw-muted)' }}
              >
                Edificio: {buildingName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0"
            style={{ color: 'var(--baw-muted)' }}
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <p className="text-sm" style={{ color: 'var(--baw-muted)' }}>
            Genera unidades en bloques. El piso se infiere del número (101 →
            piso 1, 205 → piso 2, 1003 → piso 10). Puedes ejecutar varios
            bulks (101-104, 201-204, etc.) y se irán sumando.
          </p>

          {/* Generador bulk */}
          <div
            className="rounded-md p-4 grid grid-cols-2 md:grid-cols-4 gap-3"
            style={{
              backgroundColor: 'var(--baw-bg)',
              border: '1px solid var(--baw-border)',
            }}
          >
            <BulkField label="Cantidad">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={config.count}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    count: e.target.value.replace(/[^0-9]/g, ''),
                  })
                }
                placeholder="4"
                className="w-full input-field"
              />
            </BulkField>
            <BulkField label="Prefijo">
              <input
                type="text"
                value={config.prefix}
                onChange={(e) => setConfig({ ...config, prefix: e.target.value })}
                placeholder="(opcional)"
                className="w-full input-field"
              />
            </BulkField>
            <BulkField label="Empezar en">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={config.startNumber}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    startNumber: e.target.value.replace(/[^0-9]/g, ''),
                  })
                }
                placeholder="101"
                className="w-full input-field"
              />
            </BulkField>
            <BulkField label="Tipo">
              <select
                value={config.type}
                onChange={(e) =>
                  setConfig({ ...config, type: e.target.value as UnitType })
                }
                className="w-full input-field"
              >
                <option value="LTR">LTR — Larga estancia</option>
                <option value="MTR">MTR — Media estancia</option>
                <option value="STR">STR — Corta estancia</option>
              </select>
            </BulkField>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={generate}
              className="btn-primary text-sm"
            >
              {units.length > 0
                ? `Agregar ${config.count || 0} más`
                : `Generar ${config.count || 0} unidades`}
            </button>
            {units.length > 0 && (
              <span className="text-xs" style={{ color: 'var(--baw-muted)' }}>
                Listas para guardar: <strong>{validRows.length}</strong>
              </span>
            )}
          </div>

          {/* Lista editable */}
          {units.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span
                  className="text-sm font-medium"
                  style={{ color: 'var(--baw-text)' }}
                >
                  {units.length} unidades
                </span>
                <button
                  type="button"
                  onClick={addRow}
                  className="flex items-center gap-1 text-xs"
                  style={{ color: 'var(--baw-primary)' }}
                >
                  <Plus className="w-3 h-3" /> Agregar fila
                </button>
              </div>
              <div
                className="rounded-md overflow-x-auto"
                style={{ border: '1px solid var(--baw-border)' }}
              >
                <table className="w-full text-xs">
                  <thead
                    style={{
                      backgroundColor: 'var(--baw-bg)',
                      color: 'var(--baw-muted)',
                    }}
                  >
                    <tr>
                      <th className="text-left px-3 py-2">Número</th>
                      <th className="text-left px-3 py-2">Tipo</th>
                      <th className="text-left px-3 py-2">Piso</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u, idx) => (
                      <tr
                        key={idx}
                        style={{ borderTop: '1px solid var(--baw-border)' }}
                      >
                        <td className="px-3 py-1.5">
                          <input
                            type="text"
                            value={u.number}
                            onChange={(e) =>
                              updateRow(idx, 'number', e.target.value)
                            }
                            className="w-full input-field font-mono"
                            style={{ padding: '4px 8px' }}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            value={u.type}
                            onChange={(e) =>
                              updateRow(idx, 'type', e.target.value)
                            }
                            className="input-field"
                            style={{ padding: '4px 8px' }}
                          >
                            <option value="LTR">LTR</option>
                            <option value="MTR">MTR</option>
                            <option value="STR">STR</option>
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            value={u.floor}
                            onChange={(e) =>
                              updateRow(idx, 'floor', Number(e.target.value) || 1)
                            }
                            className="w-20 input-field"
                            style={{ padding: '4px 8px' }}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            style={{ color: 'var(--baw-danger-fg)' }}
                            aria-label="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <div
              className="rounded-md px-3 py-2 text-sm"
              style={{
                backgroundColor: 'var(--baw-danger-bg-soft)',
                color: 'var(--baw-danger-fg)',
                border: '1px solid var(--baw-danger-border)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--baw-border)' }}
        >
          <span className="text-xs" style={{ color: 'var(--baw-muted)' }}>
            {validRows.length > 0
              ? `Se crearán ${validRows.length} unidades en una sola operación.`
              : 'Genera unidades arriba o agrégalas una a una.'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || validRows.length === 0}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {submitting ? 'Creando…' : `Crear ${validRows.length || ''} unidades`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function BulkField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span
        className="block text-[11px] uppercase tracking-wider mb-1 font-medium"
        style={{ color: 'var(--baw-muted)', fontFamily: 'var(--font-mono)' }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}
