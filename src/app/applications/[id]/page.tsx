'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import { SkeletonTable } from '@/components/Skeleton'
import {
  ArrowLeft, CheckCircle2, XCircle, FileText, ExternalLink,
  Loader2, User, Shield, Save,
} from 'lucide-react'
import type { TenantApplication, ApplicationStatus, DocType } from '@/types'
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

const DOC_LABELS: Record<DocType, string> = {
  ine_front: 'INE Frente',
  ine_back: 'INE Reverso',
  income_proof: 'Comprobante ingresos',
  domicilio_proof: 'Comprobante domicilio',
  aval_ine: 'INE Aval',
  aval_domicilio_proof: 'Domicilio Aval',
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const toast = useToast()

  const [app, setApp] = useState<TenantApplication | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')

  const fetchApp = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tenant_applications')
        .select('*, unit:units(id, number, floor, type)')
        .eq('id', id)
        .single()

      if (error || !data) {
        toast.error('Expediente no encontrado')
        router.push('/applications')
        return
      }
      setApp(data as TenantApplication)
      setNotes(data.notes || '')
    } catch {
      toast.error('Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [id, toast, router])

  useEffect(() => { fetchApp() }, [fetchApp])

  async function updateStatus(status: ApplicationStatus) {
    if (!app) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('tenant_applications')
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: 'admin',
          updated_at: new Date().toISOString(),
        })
        .eq('id', app.id)

      if (error) {
        toast.error(error.message)
        return
      }
      toast.success(status === 'approved' ? 'Aplicación aprobada' : status === 'rejected' ? 'Aplicación rechazada' : 'Status actualizado')
      fetchApp()
    } catch {
      toast.error('Error al actualizar')
    } finally {
      setSaving(false)
    }
  }

  async function saveNotes() {
    if (!app) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('tenant_applications')
        .update({ notes, updated_at: new Date().toISOString() })
        .eq('id', app.id)

      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Notas guardadas')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SkeletonTable />
  if (!app) return null

  const titular = app.titulares?.[0]
  const aval = app.avales?.[0]
  const docs = app.docs || {}

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/applications')}
            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Expediente {app.unit ? `— Depto ${app.unit.number}` : ''}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={app.status} />
              <span className="text-xs text-gray-400">
                Creada {formatDate(app.created_at)}
                {app.submitted_at && ` · Enviada ${formatDate(app.submitted_at)}`}
              </span>
            </div>
          </div>
        </div>

        {/* Acciones */}
        {(app.status === 'submitted' || app.status === 'reviewing') && (
          <div className="flex items-center gap-2">
            {app.status === 'submitted' && (
              <button
                onClick={() => updateStatus('reviewing')}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Marcar en revisión
              </button>
            )}
            <button
              onClick={() => updateStatus('approved')}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Aprobar
            </button>
            <button
              onClick={() => updateStatus('rejected')}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Rechazar
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Titular */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Datos del titular</h2>
          </div>
          {titular ? (
            <div className="space-y-2 text-sm">
              <InfoRow label="Nombre" value={`${titular.nombre} ${titular.apellido_paterno} ${titular.apellido_materno}`} />
              <InfoRow label="CURP" value={titular.curp} />
              <InfoRow label="RFC" value={titular.rfc} />
              <InfoRow label="Email" value={titular.email} />
              <InfoRow label="Teléfono" value={titular.telefono} />
              <InfoRow label="Domicilio" value={titular.domicilio} />
              <InfoRow label="Estado civil" value={titular.estado_civil} />
              <InfoRow label="Nacionalidad" value={titular.nacionalidad} />
              <InfoRow label="Nacimiento" value={titular.fecha_nacimiento} />
              <InfoRow label="Tel emergencia" value={titular.telefono_emergencia} />
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sin datos de titular</p>
          )}
        </div>

        {/* Aval */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Datos del aval</h2>
          </div>
          {aval ? (
            <div className="space-y-2 text-sm">
              <InfoRow label="Nombre" value={aval.nombre} />
              <InfoRow label="RFC" value={aval.rfc} />
              <InfoRow label="CURP" value={aval.curp} />
              <InfoRow label="Domicilio" value={aval.domicilio} />
              <InfoRow label="Teléfono" value={aval.telefono} />
              <InfoRow label="Relación" value={aval.relacion} />
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sin datos de aval</p>
          )}
        </div>

        {/* Documentos */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Documentos</h2>
          </div>
          {Object.keys(docs).length > 0 ? (
            <div className="space-y-2">
              {(Object.entries(docs) as [DocType, string][]).map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {DOC_LABELS[key] || key}
                  </span>
                  <ExternalLink className="w-4 h-4 text-gray-400" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sin documentos</p>
          )}
        </div>

        {/* Notas internas */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Notas internas</h2>
            <button
              onClick={saveNotes}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Guardar
            </button>
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Agregar notas sobre esta solicitud..."
            rows={4}
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent resize-none"
          />
          {app.reviewed_at && (
            <p className="text-xs text-gray-400 mt-2">
              Revisada por {app.reviewed_by || 'admin'} el {formatDate(app.reviewed_at)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// Fila de info reutilizable
function InfoRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-gray-700 dark:text-gray-300 text-right">{value || '—'}</span>
    </div>
  )
}
