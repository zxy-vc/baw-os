'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import { FileCheck, Plus, Eye, Copy, Loader2, Search } from 'lucide-react'
import type { TenantApplication, ApplicationStatus, ContractTypeCode } from '@/types'
import { formatDate } from '@/lib/utils'

// Badge por status
function StatusBadge({ status }: { status: ApplicationStatus }) {
  const map: Record<ApplicationStatus, { class: string; label: string }> = {
    draft: { class: 'badge-pending', label: 'Borrador' },
    submitted: { class: 'badge-occupied', label: 'Enviada' },
    reviewing: { class: 'badge-reserved', label: 'En revisión' },
    approved: { class: 'badge-active', label: 'Aprobada' },
    rejected: { class: 'badge-late', label: 'Rechazada' },
  }
  const badge = map[status] || map.draft
  return <span className={badge.class}>{badge.label}</span>
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'draft', label: 'Borrador' },
  { value: 'submitted', label: 'Enviada' },
  { value: 'reviewing', label: 'En revisión' },
  { value: 'approved', label: 'Aprobada' },
  { value: 'rejected', label: 'Rechazada' },
]

const CONTRACT_TYPE_LABELS: Record<ContractTypeCode, string> = {
  A: 'A — Individual',
  B: 'B — Coarrendatarios',
  C: 'C — Empresa',
  D: 'D — Tercero pagador',
  E: 'E — Institucional',
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<TenantApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [schemaMissing, setSchemaMissing] = useState(false)
  const toast = useToast()

  const fetchApps = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/applications', { cache: 'no-store' })
      const json = await res.json()

      if (!res.ok || !json.success) {
        const message = json.error || 'Error al cargar expedientes'
        const missingSchema = message.includes("tenant_applications")
        setSchemaMissing(Boolean(missingSchema))
        toast.error(
          missingSchema
            ? 'Expedientes no está habilitado en esta base de datos todavía. Falta aplicar la migración tenant_applications.'
            : message
        )
        return
      }
      setSchemaMissing(false)
      setApps((json.data as TenantApplication[]) || [])
    } catch {
      toast.error('Error al cargar aplicaciones')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { fetchApps() }, [fetchApps])

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        const message = json.error || 'Error al crear aplicación'
        const missingSchema = message.includes("tenant_applications")
        if (missingSchema) {
          setSchemaMissing(true)
          toast.error('No se puede crear la solicitud porque falta la tabla tenant_applications en la base de datos.')
        } else {
          toast.error(message)
        }
        return
      }

      const data = json.data
      const appUrl = window.location.origin
      const link = `${appUrl}/apply/${data.token}`
      await navigator.clipboard.writeText(link)
      toast.success('Link copiado al portapapeles')
      fetchApps()
    } catch {
      toast.error('Error al crear aplicación')
    } finally {
      setCreating(false)
    }
  }

  function copyLink(token: string) {
    const link = `${window.location.origin}/apply/${token}`
    navigator.clipboard.writeText(link)
    toast.success('Link copiado')
  }

  // Nombre del titular
  function getTitularName(app: TenantApplication): string {
    if (app.titulares?.length > 0) {
      const t = app.titulares[0]
      return `${t.nombre} ${t.apellido_paterno}`.trim() || '—'
    }
    return '—'
  }

  // Filtrado por status y búsqueda por nombre
  const filtered = apps.filter(a => {
    if (filter && a.status !== filter) return false
    if (search) {
      const name = getTitularName(a).toLowerCase()
      if (!name.includes(search.toLowerCase())) return false
    }
    return true
  })

  if (loading) return <SkeletonTable />

  if (schemaMissing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Expedientes</h1>
          <button
            onClick={handleCreate}
            disabled
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white dark:text-gray-900 text-white rounded-lg text-sm font-medium opacity-50 cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Nueva solicitud
          </button>
        </div>
        <div className="card p-6 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">Expedientes no está habilitado en prod</h2>
          <p className="text-sm text-red-600 dark:text-red-400">
            La app está intentando leer <code>public.tenant_applications</code>, pero esa tabla no existe en la base de datos conectada.
            Falta aplicar la migración de tenant intake.
          </p>
        </div>
      </div>
    )
  }

  if (!apps.length) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Expedientes</h1>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white dark:text-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Nueva solicitud
          </button>
        </div>
        <EmptyState
          icon={FileCheck}
          title="Sin expedientes"
          description="Crea una nueva solicitud para generar un link y enviárselo al inquilino."
        />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Expedientes</h1>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white dark:text-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Nueva solicitud
        </button>
      </div>

      {/* Filtros y búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === opt.value
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent w-full sm:w-56"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              <th className="text-left">Depto</th>
              <th className="text-left">Inquilino</th>
              <th className="text-left">Tipo contrato</th>
              <th className="text-left">Status</th>
              <th className="text-left">Enviada</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(app => (
              <tr key={app.id} className="table-row border-t border-gray-100 dark:border-gray-800">
                <td className="py-3 px-4 text-gray-500 dark:text-gray-400">
                  {app.unit ? app.unit.number : '—'}
                </td>
                <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">
                  {getTitularName(app)}
                </td>
                <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">
                  {app.contract_type ? CONTRACT_TYPE_LABELS[app.contract_type] : '—'}
                </td>
                <td className="py-3 px-4">
                  <StatusBadge status={app.status} />
                </td>
                <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">
                  {app.submitted_at ? formatDate(app.submitted_at) : '—'}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => copyLink(app.token)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white"
                      title="Copiar link"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <Link
                      href={`/applications/${app.id}`}
                      className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white"
                      title="Ver expediente"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-600 mt-3">
        {filtered.length} de {apps.length} expediente{apps.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}
