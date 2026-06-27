'use client'

// BaW OS — Estancias (Fase 3a): vista 360 de ocupación.
//
// Una "Estancia" es el concepto paraguas: un Party ocupa una Unidad por un
// periodo. Se formaliza con un INSTRUMENTO: contrato (LTR/MTR) o reservación
// (STR). Esta pantalla los junta en una sola lista read-only con filtros, para
// ver "todo lo que está ocupado" sin importar el instrumento. Crear/editar sigue
// viviendo en Contratos y Reservaciones.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarRange, Search, FileText, BedDouble, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrgContext } from '@/hooks/useOrgContext'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'

type Instrument = 'contrato' | 'reservacion'
type StayType = 'STR' | 'MTR' | 'LTR'

type Stay = {
  key: string
  instrument: Instrument
  type: StayType
  person: string
  unit: string
  start: string
  end: string | null
  statusLabel: string
  statusClass: string
  amount: number
  amountSuffix: string
  href: string
}

const TYPE_BADGE: Record<StayType, string> = {
  STR: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20',
  MTR: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
  LTR: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
}

const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Activo', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  expired: { label: 'Vencido', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  terminated: { label: 'Terminado', cls: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400' },
  pending: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  renewed: { label: 'Renovado', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  en_renovacion: { label: 'En renovación', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
}

const RES_STATUS: Record<string, { label: string; cls: string }> = {
  tentative: { label: 'Tentativa', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  confirmed: { label: 'Confirmada', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  checked_in: { label: 'Check-in', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  checked_out: { label: 'Check-out', cls: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400' },
}

// Supabase devuelve los joins to-one como objeto, pero el tipo los infiere como
// array; normalizamos a un solo registro.
function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

export default function EstanciasPage() {
  const { orgId } = useOrgContext()
  const [stays, setStays] = useState<Stay[]>([])
  const [loading, setLoading] = useState(true)

  const [instrumentFilter, setInstrumentFilter] = useState<'all' | Instrument>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | StayType>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!orgId) return
    let alive = true

    async function load() {
      setLoading(true)
      const [contractsRes, reservationsRes] = await Promise.all([
        supabase
          .from('contracts')
          .select('id, rent_type, status, monthly_amount, start_date, end_date, archived_at, unit:units(number), occupant:occupants(name)')
          .eq('org_id', orgId)
          .is('archived_at', null),
        supabase
          .from('reservations')
          .select('id, guest_name, check_in, check_out, status, total_price, unit:units(number)')
          .eq('organization_id', orgId),
      ])

      const contractStays: Stay[] = (contractsRes.data ?? []).map((c) => {
        const type = (['STR', 'MTR', 'LTR'].includes(c.rent_type) ? c.rent_type : 'LTR') as StayType
        const st = CONTRACT_STATUS[c.status] ?? { label: c.status ?? '—', cls: CONTRACT_STATUS.terminated.cls }
        return {
          key: `c-${c.id}`,
          instrument: 'contrato',
          type,
          person: one<{ name: string }>(c.occupant)?.name ?? 'Sin inquilino',
          unit: one<{ number: string }>(c.unit)?.number ?? '—',
          start: c.start_date,
          end: c.end_date ?? null,
          statusLabel: st.label,
          statusClass: st.cls,
          amount: c.monthly_amount ?? 0,
          amountSuffix: '/mes',
          href: `/contracts/${c.id}`,
        }
      })

      const reservationStays: Stay[] = (reservationsRes.data ?? []).map((r) => {
        const st = RES_STATUS[r.status] ?? { label: r.status ?? '—', cls: RES_STATUS.checked_out.cls }
        return {
          key: `r-${r.id}`,
          instrument: 'reservacion',
          type: 'STR',
          person: r.guest_name ?? 'Sin huésped',
          unit: one<{ number: string }>(r.unit)?.number ?? '—',
          start: r.check_in,
          end: r.check_out ?? null,
          statusLabel: st.label,
          statusClass: st.cls,
          amount: r.total_price ?? 0,
          amountSuffix: '',
          href: `/reservations`,
        }
      })

      const all = [...contractStays, ...reservationStays].sort((a, b) =>
        (b.start ?? '').localeCompare(a.start ?? ''),
      )
      if (alive) {
        setStays(all)
        setLoading(false)
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [orgId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return stays.filter((s) => {
      if (instrumentFilter !== 'all' && s.instrument !== instrumentFilter) return false
      if (typeFilter !== 'all' && s.type !== typeFilter) return false
      if (q && !s.person.toLowerCase().includes(q) && !s.unit.toLowerCase().includes(q)) return false
      return true
    })
  }, [stays, instrumentFilter, typeFilter, query])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <CalendarRange className="w-6 h-6 text-indigo-400" />
          Estancias
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Todo lo ocupado — contratos (LTR/MTR) y reservaciones (STR) en una sola vista.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por persona o unidad…"
            className="input-field w-full pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <select
            value={instrumentFilter}
            onChange={(e) => setInstrumentFilter(e.target.value as 'all' | Instrument)}
            className="input-field text-sm py-1.5"
          >
            <option value="all">Todo instrumento</option>
            <option value="contrato">Contratos</option>
            <option value="reservacion">Reservaciones</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | StayType)}
            className="input-field text-sm py-1.5"
          >
            <option value="all">Todo tipo</option>
            <option value="STR">STR (corta)</option>
            <option value="MTR">MTR (media)</option>
            <option value="LTR">LTR (larga)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <SkeletonTable />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={stays.length === 0 ? 'No hay estancias todavía' : 'Sin resultados'}
          description={
            stays.length === 0
              ? 'Crea un contrato o una reservación para verlos aquí.'
              : 'Ajusta los filtros o la búsqueda.'
          }
        />
      ) : (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {filtered.length} estancia{filtered.length === 1 ? '' : 's'}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 pr-3 font-medium">Persona</th>
                  <th className="pb-2 pr-3 font-medium">Unidad</th>
                  <th className="pb-2 pr-3 font-medium">Instrumento</th>
                  <th className="pb-2 pr-3 font-medium">Tipo</th>
                  <th className="pb-2 pr-3 font-medium">Periodo</th>
                  <th className="pb-2 pr-3 font-medium text-right">Monto</th>
                  <th className="pb-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((s) => (
                  <tr key={s.key} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="py-2.5 pr-3">
                      <Link href={s.href} className="font-medium text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400">
                        {s.person}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">{s.unit}</td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                        {s.instrument === 'contrato' ? (
                          <><FileText className="w-3.5 h-3.5" /> Contrato</>
                        ) : (
                          <><BedDouble className="w-3.5 h-3.5" /> Reserva</>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[s.type]}`}>
                        {s.type}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <p className="text-gray-700 dark:text-gray-300">{formatDate(s.start)}</p>
                      <p className="text-xs text-gray-400">{s.end ? `→ ${formatDate(s.end)}` : '→ sin fin'}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {formatCurrency(s.amount)}<span className="text-xs text-gray-400">{s.amountSuffix}</span>
                    </td>
                    <td className="py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.statusClass}`}>
                        {s.statusLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
