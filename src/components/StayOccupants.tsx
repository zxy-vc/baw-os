'use client'

// BaW OS — Ocupantes de una estancia (Fase 3b).
//
// Lista y administra quién OCUPA un contrato (o reservación), aparte del titular
// y del pagador. Soporta varios ocupantes y rangos de fecha para rotación (ej.
// una empresa cuyos empleados se turnan semana a semana). Usa el PersonPicker
// para no duplicar personas.

import { useCallback, useEffect, useState } from 'react'
import { Users, Trash2, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import PersonPicker, { type PickedPerson } from '@/components/PersonPicker'
import { formatDate } from '@/lib/utils'

type StayRole = 'titular' | 'ocupante' | 'dependiente'

type Row = {
  id: string
  role: StayRole
  start_date: string | null
  end_date: string | null
  occupant: { name: string; phone: string | null } | null
}

const ROLE_LABELS: Record<StayRole, string> = {
  titular: 'Titular',
  ocupante: 'Ocupante',
  dependiente: 'Dependiente',
}

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

export default function StayOccupants({
  contractId,
  orgId,
}: {
  contractId: string
  orgId: string | null | undefined
}) {
  const toast = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const [adding, setAdding] = useState(false)
  const [person, setPerson] = useState<PickedPerson | null>(null)
  const [role, setRole] = useState<StayRole>('ocupante')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('stay_occupants')
      .select('id, role, start_date, end_date, occupant:occupants(name, phone)')
      .eq('contract_id', contractId)
      .order('created_at')
    const normalized: Row[] = (data ?? []).map((r) => ({
      id: r.id,
      role: r.role as StayRole,
      start_date: r.start_date ?? null,
      end_date: r.end_date ?? null,
      occupant: one<{ name: string; phone: string | null }>(r.occupant),
    }))
    setRows(normalized)
    setLoading(false)
  }, [contractId])

  useEffect(() => {
    load()
  }, [load])

  function resetForm() {
    setPerson(null)
    setRole('ocupante')
    setStart('')
    setEnd('')
    setAdding(false)
  }

  async function handleAdd() {
    if (!person || !orgId) return
    if (start && end && end < start) {
      toast.error('La fecha de fin no puede ser anterior a la de inicio')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('stay_occupants').insert({
      org_id: orgId,
      contract_id: contractId,
      occupant_id: person.id,
      role,
      start_date: start || null,
      end_date: end || null,
    })
    setSaving(false)
    if (error) {
      // Violación de UNIQUE (misma persona dos veces en la estancia) u otra.
      toast.error(
        error.code === '23505'
          ? 'Esa persona ya está en la estancia'
          : `No se pudo agregar: ${error.message}`,
      )
      return
    }
    resetForm()
    load()
  }

  async function handleRemove(id: string) {
    const { error } = await supabase.from('stay_occupants').delete().eq('id', id)
    if (error) {
      toast.error('No se pudo quitar')
      return
    }
    load()
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <Users className="w-4 h-4" />
          Ocupantes de la estancia
        </h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Quién usa la unidad (aparte del titular y del pagador). Soporta varios y rotación por fechas.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : rows.length === 0 && !adding ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Sin ocupantes declarados.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {r.occupant?.name ?? '—'}
                  <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {ROLE_LABELS[r.role]}
                  </span>
                </p>
                <p className="text-xs text-gray-400">
                  {r.start_date || r.end_date
                    ? `${r.start_date ? formatDate(r.start_date) : '…'} → ${r.end_date ? formatDate(r.end_date) : '…'}`
                    : 'Sin rango de fechas'}
                  {r.occupant?.phone ? ` · ${r.occupant.phone}` : ''}
                </p>
              </div>
              <button
                onClick={() => handleRemove(r.id)}
                title="Quitar ocupante"
                className="shrink-0 p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Nuevo ocupante
            </p>
            <button onClick={resetForm} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <X className="w-4 h-4" />
            </button>
          </div>
          <PersonPicker
            orgId={orgId}
            value={person}
            onChange={setPerson}
            newType="ltr"
            placeholder="Buscar o crear ocupante…"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StayRole)}
              className="input-field text-sm"
            >
              <option value="ocupante">Ocupante</option>
              <option value="titular">Titular</option>
              <option value="dependiente">Dependiente</option>
            </select>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="input-field text-sm"
              title="Desde (opcional)"
            />
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="input-field text-sm"
              title="Hasta (opcional)"
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleAdd}
              disabled={saving || !person}
              className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium"
            >
              {saving ? 'Agregando…' : 'Agregar a la estancia'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
