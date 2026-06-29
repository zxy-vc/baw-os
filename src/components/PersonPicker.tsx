'use client'

// BaW OS — PersonPicker: "buscar antes de crear".
//
// Componente único de selección de personas para todos los formularios que
// necesitan ligar a alguien del directorio (contratos, reservaciones, etc.).
// Busca sobre `occupants` (la identidad durable / Party) por nombre, teléfono o
// email; si la persona ya existe la reusa (no duplica). Solo cuando NO hay match
// ofrece crearla, avisando antes si el teléfono/email ya pertenece a alguien.
//
// El alta nueva dispara el trigger de DB que mantiene el CRM 1:1 (migración
// 20260625_crm_occupant_sync), así que toda persona creada aquí aparece sola en
// Contactos y en el CRM.

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, UserPlus, X, AlertTriangle, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { OccupantType, OccupantKind } from '@/types'

export type PickedPerson = {
  id: string
  name: string
  phone: string | null
  email: string | null
}

type Props = {
  orgId: string | null | undefined
  /** Persona ligada actualmente (null = ninguna). */
  value: PickedPerson | null
  onChange: (person: PickedPerson | null) => void
  /**
   * Texto libre tecleado cuando aún no se liga a una persona del directorio.
   * Para casos STR donde un huésped de una noche no debe ensuciar el directorio:
   * el consumidor conserva el nombre aunque no haya Party ligada.
   */
  allowFreeText?: boolean
  freeText?: string
  onFreeTextChange?: (name: string) => void
  /** Tipo de renta que se asigna al occupant si se crea uno nuevo. */
  newType?: OccupantType
  placeholder?: string
  inputId?: string
}

// Limpia el texto para el filtro .or() de PostgREST (la coma separa filtros).
function sanitize(s: string): string {
  return s.replace(/[,%()]/g, ' ').trim()
}

export default function PersonPicker({
  orgId,
  value,
  onChange,
  allowFreeText = false,
  freeText = '',
  onFreeTextChange,
  newType = 'both',
  placeholder = 'Buscar por nombre, teléfono o email…',
  inputId,
}: Props) {
  // En modo free-text el texto lo posee el consumidor; si no, es interno.
  const [internalQuery, setInternalQuery] = useState('')
  const query = allowFreeText ? freeText : internalQuery
  const setQuery = useCallback(
    (v: string) => {
      if (allowFreeText) onFreeTextChange?.(v)
      else setInternalQuery(v)
    },
    [allowFreeText, onFreeTextChange],
  )

  const [results, setResults] = useState<PickedPerson[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)

  // Panel de "crear persona"
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', phone: '', email: '', kind: 'persona' as OccupantKind })
  const [creating, setCreating] = useState(false)
  const [dup, setDup] = useState<PickedPerson | null>(null)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  // Contador de petición: descarta respuestas que llegan fuera de orden.
  const reqRef = useRef(0)

  // ─── Búsqueda (debounced, org-scoped, sin archivados) ─────────────
  const runSearch = useCallback(
    async (raw: string, reqId: number) => {
      const q = sanitize(raw)
      if (!orgId || q.length < 2) {
        if (reqRef.current === reqId) {
          setResults([])
          setSearching(false)
        }
        return
      }
      const { data } = await supabase
        .from('occupants')
        .select('id, name, phone, email')
        .eq('org_id', orgId)
        .is('archived_at', null)
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
        .order('name')
        .limit(8)
      if (reqRef.current !== reqId) return // respuesta obsoleta
      setResults((data as PickedPerson[]) ?? [])
      setSearching(false)
    },
    [orgId],
  )

  useEffect(() => {
    if (value) return // ya hay persona ligada; no buscamos
    const q = sanitize(query)
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const reqId = ++reqRef.current
    const t = setTimeout(() => runSearch(query, reqId), 220)
    return () => clearTimeout(t)
  }, [query, value, runSearch])

  // Cerrar dropdown al hacer click fuera.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreateOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const trimmed = sanitize(query)
  const exactNameMatch = results.some(
    (r) => r.name.trim().toLowerCase() === query.trim().toLowerCase(),
  )

  function pick(person: PickedPerson) {
    onChange(person)
    if (allowFreeText) onFreeTextChange?.(person.name)
    setOpen(false)
    setResults([])
  }

  function clear() {
    const keep = value?.name ?? ''
    onChange(null)
    if (allowFreeText) onFreeTextChange?.(keep)
    else setInternalQuery('')
  }

  function openCreate() {
    setCreateForm({ name: query.trim(), phone: '', email: '', kind: 'persona' })
    setDup(null)
    setCreateErr(null)
    setCreateOpen(true)
    setOpen(false)
  }

  // Busca un occupant con el mismo teléfono o email exacto (para no duplicar).
  async function findDuplicate(): Promise<PickedPerson | null> {
    if (!orgId) return null
    const phone = createForm.phone.trim()
    const email = createForm.email.trim()
    const ors: string[] = []
    if (phone) ors.push(`phone.eq.${phone}`)
    if (email) ors.push(`email.eq.${email}`)
    if (!ors.length) return null
    const { data } = await supabase
      .from('occupants')
      .select('id, name, phone, email')
      .eq('org_id', orgId)
      .is('archived_at', null)
      .or(ors.join(','))
      .limit(1)
    return (data?.[0] as PickedPerson) ?? null
  }

  async function insertPerson() {
    if (!orgId) return
    const name = createForm.name.trim()
    const { data, error } = await supabase
      .from('occupants')
      .insert({
        org_id: orgId,
        name,
        phone: createForm.phone.trim() || null,
        email: createForm.email.trim() || null,
        type: newType,
        kind: createForm.kind,
      })
      .select('id, name, phone, email')
      .single()
    if (error || !data) {
      setCreateErr(error?.message ?? 'No se pudo crear la persona')
      return
    }
    setCreateOpen(false)
    pick(data as PickedPerson)
  }

  async function handleCreate() {
    const name = createForm.name.trim()
    if (!name || !orgId) return
    setCreating(true)
    setCreateErr(null)
    const found = await findDuplicate()
    if (found) {
      setDup(found)
      setCreating(false)
      return
    }
    await insertPerson()
    setCreating(false)
  }

  async function forceCreate() {
    setCreating(true)
    setDup(null)
    await insertPerson()
    setCreating(false)
  }

  // ─── Persona ya ligada → chip ─────────────────────────────────────
  if (value) {
    return (
      <div
        ref={wrapRef}
        className="flex items-center justify-between gap-2 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{value.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {value.phone || value.email || 'Sin datos de contacto'}
          </p>
        </div>
        <button
          type="button"
          onClick={clear}
          className="shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Quitar persona seleccionada"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // ─── Sin ligar → buscador (+ crear) ──────────────────────────────
  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="input-field w-full pl-9"
        />
      </div>

      {open && !createOpen && trimmed.length >= 2 && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => pick(r)}
              className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-white">{r.name}</p>
              {(r.phone || r.email) && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {[r.phone, r.email].filter(Boolean).join(' · ')}
                </p>
              )}
            </button>
          ))}

          {results.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
              {searching ? 'Buscando…' : 'Sin coincidencias en el directorio.'}
            </p>
          )}

          {!exactNameMatch && (
            <button
              type="button"
              onClick={openCreate}
              className="w-full flex items-center gap-2 px-3 py-2 border-t border-gray-100 dark:border-gray-700 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Crear persona «{query.trim()}»
            </button>
          )}
        </div>
      )}

      {createOpen && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 space-y-3">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {createForm.kind === 'empresa' ? 'Nueva empresa' : 'Nueva persona'}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {(['persona', 'empresa'] as OccupantKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setCreateForm({ ...createForm, kind: k })}
                className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  createForm.kind === k
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {k === 'persona' ? 'Persona' : 'Empresa'}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            placeholder={createForm.kind === 'empresa' ? 'Razón social / Nombre' : 'Nombre completo'}
            className="input-field w-full"
            autoFocus
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="tel"
              value={createForm.phone}
              onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
              placeholder="Teléfono (+52…)"
              className="input-field w-full"
            />
            <input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              placeholder="Email"
              className="input-field w-full"
            />
          </div>

          {dup && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-2.5 space-y-2">
              <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Ya existe <strong>{dup.name}</strong> con ese teléfono/email. ¿Es la misma persona?
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => pick(dup)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                >
                  <Check className="w-3.5 h-3.5" />
                  Usar a {dup.name}
                </button>
                <button
                  type="button"
                  onClick={forceCreate}
                  disabled={creating}
                  className="px-2.5 py-1 rounded-md border border-amber-400 dark:border-amber-600 text-amber-800 dark:text-amber-300 text-xs font-medium disabled:opacity-50"
                >
                  Crear otra de todos modos
                </button>
              </div>
            </div>
          )}

          {createErr && <p className="text-xs text-red-500">{createErr}</p>}

          {!dup && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !createForm.name.trim()}
                className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium"
              >
                {creating ? 'Creando…' : 'Crear y seleccionar'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
