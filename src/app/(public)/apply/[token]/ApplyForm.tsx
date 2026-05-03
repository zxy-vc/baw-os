'use client'

// BaW OS — Formulario público de solicitud de arrendamiento (Client Component).
//
// - Estilo visual: BaW design tokens (`--baw-*`) + BawMark + BawGrid (regla
//   canónica Sprint 6, ver AGENTS.md §2.2 y docs/PROJECT_STATE.md §4).
// - Soporta los 5 tipos de contrato A/B/C/D/E:
//     A — Individual                       (1 titular + aval)
//     B — Coarrendatarios                  (2-4 titulares + aval)
//     C — Empresa                          (empresa + representante)
//     D — Tercero pagador                  (titular + tercero pagador)
//     E — Institucional                    (empresa)
// - Status:
//     draft     → editable, botones "Guardar borrador" / "Enviar solicitud"
//     submitted | reviewing | approved | rejected → pantalla read-only.
// - Validación inline: nombre, apellido_paterno, email, telefono, RFC son
//   obligatorios para CADA titular antes de permitir submit.
// - Upload usa el endpoint existente `/api/intake/upload` que sube al bucket
//   `tenant-docs` con service role; aquí no creamos buckets nuevos.

import { useState, useCallback, useMemo } from 'react'
import {
  Loader2,
  Upload,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  FileText,
  Send,
  Save,
} from 'lucide-react'
import BawGrid from '@/components/BawGrid'
import BawMark from '@/components/BawMark'
import type {
  TenantApplication,
  Titular,
  Aval,
  ContractTypeCode,
  DocType,
} from '@/types'

// ──────────────────────────────────────────────────────────────────────────
// Tipos y constantes locales
// ──────────────────────────────────────────────────────────────────────────

interface Empresa {
  rfc: string
  razon_social: string
  representante_legal: string
  domicilio_fiscal: string
}

interface TerceroPagador {
  nombre: string
  rfc: string
  telefono: string
  relacion: string
}

const EMPTY_TITULAR: Titular = {
  nombre: '',
  apellido_paterno: '',
  apellido_materno: '',
  curp: '',
  rfc: '',
  email: '',
  telefono: '',
  domicilio: '',
  estado_civil: '',
  nacionalidad: 'Mexicana',
  fecha_nacimiento: '',
  telefono_emergencia: '',
}

const EMPTY_AVAL: Aval = {
  nombre: '',
  rfc: '',
  curp: '',
  domicilio: '',
  telefono: '',
  relacion: '',
}

const EMPTY_EMPRESA: Empresa = {
  rfc: '',
  razon_social: '',
  representante_legal: '',
  domicilio_fiscal: '',
}

const EMPTY_TERCERO: TerceroPagador = {
  nombre: '',
  rfc: '',
  telefono: '',
  relacion: '',
}

const CONTRACT_TYPES: { code: ContractTypeCode; label: string; desc: string }[] = [
  { code: 'A', label: 'A · Individual', desc: '1 titular con aval' },
  { code: 'B', label: 'B · Coarrendatarios', desc: '2 a 4 titulares + aval' },
  { code: 'C', label: 'C · Empresa', desc: 'Persona moral arrendataria' },
  { code: 'D', label: 'D · Tercero pagador', desc: 'Titular + tercero que paga' },
  { code: 'E', label: 'E · Institucional', desc: 'Empresa institucional' },
]

const DOC_BASE: { key: DocType; label: string; required: boolean }[] = [
  { key: 'ine_front', label: 'INE — Frente', required: true },
  { key: 'ine_back', label: 'INE — Reverso', required: true },
  { key: 'income_proof', label: 'Comprobante de ingresos', required: false },
  { key: 'domicilio_proof', label: 'Comprobante de domicilio', required: false },
]

const DOC_AVAL: { key: DocType; label: string; required: boolean }[] = [
  { key: 'aval_ine', label: 'INE del aval', required: true },
  { key: 'aval_domicilio_proof', label: 'Comprobante de domicilio del aval', required: false },
]

const READONLY_STATUSES: TenantApplication['status'][] = [
  'submitted',
  'reviewing',
  'approved',
  'rejected',
]

// ──────────────────────────────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────────────────────────────

export default function ApplyForm({
  initialData,
}: {
  initialData: TenantApplication
}) {
  const isReadonly = READONLY_STATUSES.includes(initialData.status)

  const [contractType, setContractType] = useState<ContractTypeCode | null>(
    initialData.contract_type
  )
  const [titulares, setTitulares] = useState<Titular[]>(
    initialData.titulares?.length ? initialData.titulares : [{ ...EMPTY_TITULAR }]
  )
  const [avales, setAvales] = useState<Aval[]>(
    initialData.avales?.length ? initialData.avales : [{ ...EMPTY_AVAL }]
  )
  const [empresa, setEmpresa] = useState<Empresa>(
    (initialData.empresa as unknown as Empresa) ?? { ...EMPTY_EMPRESA }
  )
  const [tercero, setTercero] = useState<TerceroPagador>(
    (initialData.tercero_pagador as unknown as TerceroPagador) ?? { ...EMPTY_TERCERO }
  )
  const [docs, setDocs] = useState<Partial<Record<DocType, string>>>(
    initialData.docs ?? {}
  )

  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(initialData.status !== 'draft')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const showAvales = contractType === 'A' || contractType === 'B'
  const showEmpresa = contractType === 'C' || contractType === 'E'
  const showTercero = contractType === 'D'
  const titulareLimit = contractType === 'B' ? 4 : 1

  // ────────────────────────────────────────────────────────────────────
  // Handlers de mutación
  // ────────────────────────────────────────────────────────────────────

  function updateTitular(idx: number, field: keyof Titular, value: string) {
    setTitulares((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t))
    )
  }

  function addTitular() {
    if (titulares.length >= titulareLimit) return
    setTitulares((prev) => [...prev, { ...EMPTY_TITULAR }])
  }

  function removeTitular(idx: number) {
    if (titulares.length <= 1) return
    setTitulares((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateAval(idx: number, field: keyof Aval, value: string) {
    setAvales((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a))
    )
  }

  // ────────────────────────────────────────────────────────────────────
  // Validación
  // ────────────────────────────────────────────────────────────────────

  function validate(): boolean {
    const next: Record<string, string> = {}

    if (!contractType) {
      next['contract_type'] = 'Selecciona el tipo de contrato'
    }

    titulares.forEach((t, i) => {
      if (!t.nombre.trim()) next[`titular.${i}.nombre`] = 'Requerido'
      if (!t.apellido_paterno.trim())
        next[`titular.${i}.apellido_paterno`] = 'Requerido'
      if (!t.email.trim()) next[`titular.${i}.email`] = 'Requerido'
      if (!t.telefono.trim()) next[`titular.${i}.telefono`] = 'Requerido'
      if (!t.rfc.trim()) next[`titular.${i}.rfc`] = 'Requerido'
    })

    if (showEmpresa) {
      if (!empresa.rfc.trim()) next['empresa.rfc'] = 'Requerido'
      if (!empresa.razon_social.trim()) next['empresa.razon_social'] = 'Requerido'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  // ────────────────────────────────────────────────────────────────────
  // Persistencia (API /api/intake)
  // ────────────────────────────────────────────────────────────────────

  const buildPayload = useCallback(
    (submit = false) => ({
      titulares,
      avales: showAvales ? avales : [],
      contract_type: contractType,
      contract_data: {},
      docs,
      ...(showEmpresa ? { empresa } : {}),
      ...(showTercero ? { tercero_pagador: tercero } : {}),
      submit,
    }),
    [titulares, avales, showAvales, contractType, docs, empresa, showEmpresa, tercero, showTercero]
  )

  async function handleSaveDraft() {
    if (isReadonly) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/intake?token=${encodeURIComponent(initialData.token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(false)),
        }
      )
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || 'No se pudo guardar el borrador')
        return
      }
      setSavedAt(new Date())
    } catch {
      setError('Error de conexión al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    if (isReadonly) return
    if (!validate()) {
      setError('Completa los campos marcados antes de enviar')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/intake?token=${encodeURIComponent(initialData.token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(true)),
        }
      )
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || 'No se pudo enviar la solicitud')
        return
      }
      setSubmitted(true)
    } catch {
      setError('Error de conexión al enviar')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpload(docType: DocType, file: File) {
    if (isReadonly) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('docType', docType)
    fd.append('token', initialData.token)
    try {
      const res = await fetch('/api/intake/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || `No se pudo subir ${docType}`)
        return
      }
      setDocs((prev) => ({ ...prev, [docType]: json.data.url }))
    } catch {
      setError('Error de conexión al subir el archivo')
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────

  if (submitted) {
    return <SubmittedScreen status={initialData.status} />
  }

  return (
    <div
      className="relative min-h-screen"
      style={{ backgroundColor: 'var(--baw-bg)', color: 'var(--baw-text)' }}
    >
      <BawGrid position="fixed" />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header — mismo tratamiento que /login: BawMark A + wordmark + tagline */}
        <header className="flex flex-col items-center text-center mb-10">
          <div style={{ color: 'var(--baw-text)' }} className="mb-3">
            <BawMark size={48} withWordmark wordmarkSize="lg" />
          </div>
          <p
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--baw-muted)' }}
            className="text-[11px] uppercase tracking-[0.18em]"
          >
            Solicitud de Arrendamiento
          </p>
        </header>

        {/* Sección: Tipo de contrato */}
        <Section title="Tipo de contrato" subtitle="Selecciona el escenario que aplica a tu solicitud">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CONTRACT_TYPES.map((opt) => {
              const active = contractType === opt.code
              return (
                <button
                  key={opt.code}
                  type="button"
                  disabled={isReadonly}
                  onClick={() => setContractType(opt.code)}
                  className="text-left rounded-md px-4 py-3 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: active
                      ? 'var(--baw-info-bg-soft)'
                      : 'var(--baw-surface)',
                    border: `1px solid ${
                      active ? 'var(--baw-info-fg)' : 'var(--baw-border)'
                    }`,
                  }}
                >
                  <div
                    className="text-sm font-semibold"
                    style={{ color: 'var(--baw-text)' }}
                  >
                    {opt.label}
                  </div>
                  <div
                    className="text-[12px] mt-0.5"
                    style={{ color: 'var(--baw-muted)' }}
                  >
                    {opt.desc}
                  </div>
                </button>
              )
            })}
          </div>
          {errors['contract_type'] && (
            <FieldError msg={errors['contract_type']} />
          )}
        </Section>

        {/* Sección: Titulares */}
        {contractType && (
          <Section
            title={contractType === 'B' ? 'Titulares (1 a 4)' : 'Titular'}
            subtitle={
              contractType === 'B'
                ? 'Agrega cada coarrendatario que firmará el contrato'
                : 'Datos personales de la persona que firmará el contrato'
            }
            action={
              contractType === 'B' && titulares.length < titulareLimit && !isReadonly ? (
                <button
                  type="button"
                  onClick={addTitular}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
                  style={{
                    backgroundColor: 'var(--baw-surface)',
                    color: 'var(--baw-text)',
                    border: '1px solid var(--baw-border)',
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar titular
                </button>
              ) : undefined
            }
          >
            <div className="space-y-6">
              {titulares.map((t, idx) => (
                <TitularBlock
                  key={idx}
                  idx={idx}
                  titular={t}
                  errors={errors}
                  readonly={isReadonly}
                  showRemove={titulares.length > 1 && !isReadonly}
                  onChange={(field, value) => updateTitular(idx, field, value)}
                  onRemove={() => removeTitular(idx)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Sección: Empresa (Tipo C/E) */}
        {contractType && showEmpresa && (
          <Section
            title="Datos de la empresa"
            subtitle="Persona moral que figura como arrendataria"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="RFC empresa"
                required
                value={empresa.rfc}
                error={errors['empresa.rfc']}
                readonly={isReadonly}
                onChange={(v) => setEmpresa({ ...empresa, rfc: v })}
              />
              <Field
                label="Razón social"
                required
                value={empresa.razon_social}
                error={errors['empresa.razon_social']}
                readonly={isReadonly}
                onChange={(v) => setEmpresa({ ...empresa, razon_social: v })}
              />
              <Field
                label="Representante legal"
                value={empresa.representante_legal}
                readonly={isReadonly}
                onChange={(v) =>
                  setEmpresa({ ...empresa, representante_legal: v })
                }
              />
              <Field
                label="Domicilio fiscal"
                value={empresa.domicilio_fiscal}
                readonly={isReadonly}
                onChange={(v) => setEmpresa({ ...empresa, domicilio_fiscal: v })}
                colSpan={2}
              />
            </div>
          </Section>
        )}

        {/* Sección: Tercero pagador (Tipo D) */}
        {contractType && showTercero && (
          <Section
            title="Tercero pagador"
            subtitle="Persona o entidad que cubre las rentas en nombre del titular"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Nombre / razón social"
                value={tercero.nombre}
                readonly={isReadonly}
                onChange={(v) => setTercero({ ...tercero, nombre: v })}
              />
              <Field
                label="RFC"
                value={tercero.rfc}
                readonly={isReadonly}
                onChange={(v) => setTercero({ ...tercero, rfc: v })}
              />
              <Field
                label="Teléfono"
                value={tercero.telefono}
                readonly={isReadonly}
                onChange={(v) => setTercero({ ...tercero, telefono: v })}
              />
              <Field
                label="Relación con el titular"
                value={tercero.relacion}
                readonly={isReadonly}
                onChange={(v) => setTercero({ ...tercero, relacion: v })}
              />
            </div>
          </Section>
        )}

        {/* Sección: Avales (Tipo A/B) */}
        {contractType && showAvales && (
          <Section
            title="Aval"
            subtitle="Persona que respalda solidariamente el contrato"
          >
            {avales.map((a, idx) => (
              <AvalBlock
                key={idx}
                aval={a}
                readonly={isReadonly}
                onChange={(field, value) => updateAval(idx, field, value)}
              />
            ))}
          </Section>
        )}

        {/* Sección: Documentos */}
        {contractType && (
          <Section
            title="Documentos"
            subtitle="Sube fotografías o PDFs claros y legibles"
          >
            <div className="space-y-3">
              {DOC_BASE.map((d) => (
                <DocUploader
                  key={d.key}
                  docKey={d.key}
                  label={d.label}
                  required={d.required}
                  uploaded={!!docs[d.key]}
                  readonly={isReadonly}
                  onUpload={(file) => handleUpload(d.key, file)}
                />
              ))}
              {showAvales &&
                DOC_AVAL.map((d) => (
                  <DocUploader
                    key={d.key}
                    docKey={d.key}
                    label={d.label}
                    required={d.required}
                    uploaded={!!docs[d.key]}
                    readonly={isReadonly}
                    onUpload={(file) => handleUpload(d.key, file)}
                  />
                ))}
            </div>
          </Section>
        )}

        {/* Banner de error global */}
        {error && (
          <div
            className="mb-6 rounded-md px-4 py-3 text-sm flex items-start gap-2"
            style={{
              backgroundColor: 'var(--baw-danger-bg-soft)',
              border: '1px solid var(--baw-danger-border)',
              color: 'var(--baw-danger-fg)',
            }}
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        {!isReadonly && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-2">
            <div
              className="text-[11px]"
              style={{ color: 'var(--baw-faint)', fontFamily: 'var(--font-mono)' }}
            >
              {savedAt
                ? `Borrador guardado · ${savedAt.toLocaleTimeString('es-MX')}`
                : 'Tus cambios no se guardan automáticamente'}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || submitting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--baw-surface)',
                  color: 'var(--baw-text)',
                  border: '1px solid var(--baw-border)',
                }}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Guardar borrador
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || submitting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-sm font-semibold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--baw-text)',
                  color: 'var(--baw-bg)',
                }}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Enviar solicitud
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <p
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--baw-faint)' }}
          className="text-center text-[10px] uppercase tracking-[0.2em] mt-12"
        >
          BaW Design Lab · ZXY Ventures
        </p>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Subcomponentes presentacionales
// ──────────────────────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      className="rounded-md mb-6 p-5 sm:p-6"
      style={{
        backgroundColor: 'var(--baw-surface)',
        border: '1px solid var(--baw-border)',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: 'var(--baw-text)' }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className="text-[12px] mt-0.5"
              style={{ color: 'var(--baw-muted)' }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function TitularBlock({
  idx,
  titular,
  errors,
  readonly,
  showRemove,
  onChange,
  onRemove,
}: {
  idx: number
  titular: Titular
  errors: Record<string, string>
  readonly: boolean
  showRemove: boolean
  onChange: (field: keyof Titular, value: string) => void
  onRemove: () => void
}) {
  const fields = useMemo<
    { key: keyof Titular; label: string; required?: boolean; type?: string }[]
  >(
    () => [
      { key: 'nombre', label: 'Nombre(s)', required: true },
      { key: 'apellido_paterno', label: 'Apellido paterno', required: true },
      { key: 'apellido_materno', label: 'Apellido materno' },
      { key: 'email', label: 'Email', required: true, type: 'email' },
      { key: 'telefono', label: 'Teléfono', required: true, type: 'tel' },
      { key: 'rfc', label: 'RFC', required: true },
      { key: 'curp', label: 'CURP' },
      { key: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date' },
      { key: 'estado_civil', label: 'Estado civil' },
      { key: 'nacionalidad', label: 'Nacionalidad' },
    ],
    []
  )

  return (
    <div
      className="rounded-md p-4"
      style={{
        backgroundColor: 'var(--baw-elevated)',
        border: '1px solid var(--baw-border)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--baw-muted)',
          }}
          className="text-[11px] uppercase tracking-wider"
        >
          Titular {idx + 1}
        </span>
        {showRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--baw-danger-fg)' }}
            title="Quitar titular"
          >
            <Trash2 className="w-3.5 h-3.5" /> Quitar
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            required={f.required}
            type={f.type ?? 'text'}
            value={titular[f.key] as string}
            readonly={readonly}
            error={errors[`titular.${idx}.${f.key}`]}
            onChange={(v) => onChange(f.key, v)}
          />
        ))}
        <Field
          label="Domicilio actual"
          value={titular.domicilio}
          readonly={readonly}
          onChange={(v) => onChange('domicilio', v)}
          colSpan={2}
        />
      </div>
    </div>
  )
}

function AvalBlock({
  aval,
  readonly,
  onChange,
}: {
  aval: Aval
  readonly: boolean
  onChange: (field: keyof Aval, value: string) => void
}) {
  const fields: { key: keyof Aval; label: string; required?: boolean }[] = [
    { key: 'nombre', label: 'Nombre completo', required: true },
    { key: 'rfc', label: 'RFC' },
    { key: 'curp', label: 'CURP' },
    { key: 'telefono', label: 'Teléfono', required: true },
    { key: 'relacion', label: 'Relación con el titular' },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fields.map((f) => (
        <Field
          key={f.key}
          label={f.label}
          required={f.required}
          value={aval[f.key]}
          readonly={readonly}
          onChange={(v) => onChange(f.key, v)}
        />
      ))}
      <Field
        label="Domicilio del aval"
        value={aval.domicilio}
        readonly={readonly}
        onChange={(v) => onChange('domicilio', v)}
        colSpan={2}
      />
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  error,
  readonly,
  colSpan,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
  error?: string
  readonly?: boolean
  colSpan?: 1 | 2
}) {
  return (
    <div className={colSpan === 2 ? 'sm:col-span-2' : ''}>
      <label
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--baw-muted)' }}
        className="block text-[10px] uppercase tracking-wider mb-1.5"
      >
        {label}
        {required && (
          <span style={{ color: 'var(--baw-danger-fg)' }} className="ml-1">
            *
          </span>
        )}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={readonly}
        className="w-full px-3 py-2 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 disabled:opacity-70"
        style={{
          backgroundColor: 'var(--baw-bg)',
          color: 'var(--baw-text)',
          border: `1px solid ${
            error ? 'var(--baw-danger-border)' : 'var(--baw-border)'
          }`,
        }}
      />
      {error && <FieldError msg={error} />}
    </div>
  )
}

function FieldError({ msg }: { msg: string }) {
  return (
    <p
      className="mt-1 text-[11px]"
      style={{ color: 'var(--baw-danger-fg)' }}
    >
      {msg}
    </p>
  )
}

function DocUploader({
  docKey,
  label,
  required,
  uploaded,
  readonly,
  onUpload,
}: {
  docKey: DocType
  label: string
  required: boolean
  uploaded: boolean
  readonly: boolean
  onUpload: (file: File) => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <label
      className="flex items-center gap-3 px-4 py-3 rounded-md cursor-pointer transition-colors"
      style={{
        backgroundColor: uploaded
          ? 'var(--baw-success-bg-soft)'
          : 'var(--baw-elevated)',
        border: `1px solid ${
          uploaded ? 'var(--baw-success-border)' : 'var(--baw-border)'
        }`,
        opacity: readonly ? 0.7 : 1,
        cursor: readonly ? 'not-allowed' : 'pointer',
      }}
    >
      <div
        className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
        style={{
          backgroundColor: uploaded ? 'var(--baw-success-bg)' : 'var(--baw-surface)',
          color: uploaded ? 'var(--baw-success-fg)' : 'var(--baw-muted)',
        }}
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : uploaded ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: 'var(--baw-text)' }}
        >
          {label}
          {required && (
            <span style={{ color: 'var(--baw-danger-fg)' }} className="ml-1">
              *
            </span>
          )}
        </p>
        <p
          className="text-[11px]"
          style={{ color: 'var(--baw-muted)' }}
        >
          {uploaded ? 'Archivo cargado' : 'PDF, JPG o PNG'}
        </p>
      </div>
      <input
        type="file"
        className="hidden"
        accept="image/*,.pdf"
        disabled={readonly || busy}
        data-doc-key={docKey}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          setBusy(true)
          try {
            await onUpload(file)
          } finally {
            setBusy(false)
          }
        }}
      />
    </label>
  )
}

function SubmittedScreen({
  status,
}: {
  status: TenantApplication['status']
}) {
  const messages: Record<TenantApplication['status'], { title: string; body: string }> = {
    draft: {
      title: 'Solicitud guardada',
      body: 'Tu borrador está guardado. Vuelve cuando estés listo para enviar.',
    },
    submitted: {
      title: 'Recibimos tu solicitud',
      body: 'Tus datos llegaron correctamente. Te contactaremos pronto para los siguientes pasos.',
    },
    reviewing: {
      title: 'Tu solicitud está en revisión',
      body: 'Estamos analizando los documentos. Te avisaremos en cuanto tengamos novedades.',
    },
    approved: {
      title: 'Solicitud aprobada',
      body: 'Tu solicitud fue aprobada. El property manager se pondrá en contacto contigo para firmar el contrato.',
    },
    rejected: {
      title: 'Solicitud no aprobada',
      body: 'Tu solicitud no procedió en esta ocasión. Si tienes dudas, contacta al property manager.',
    },
  }
  const msg = messages[status] ?? messages.submitted
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: 'var(--baw-bg)' }}
    >
      <BawGrid position="absolute" />
      <div className="relative w-full max-w-md mx-auto px-6 text-center">
        <div
          className="flex justify-center mb-10"
          style={{ color: 'var(--baw-text)' }}
        >
          <BawMark size={48} withWordmark wordmarkSize="lg" />
        </div>
        <div
          className="w-12 h-12 rounded-full mx-auto mb-5 flex items-center justify-center"
          style={{
            backgroundColor: 'var(--baw-success-bg)',
            color: 'var(--baw-success-fg)',
          }}
        >
          <FileText className="w-5 h-5" />
        </div>
        <h1
          className="text-[20px] font-semibold mb-3 tracking-tight"
          style={{ color: 'var(--baw-text)' }}
        >
          {msg.title}
        </h1>
        <p
          className="text-sm leading-relaxed mb-8"
          style={{ color: 'var(--baw-muted)' }}
        >
          {msg.body}
        </p>
        <p
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--baw-faint)' }}
          className="text-[10px] uppercase tracking-[0.2em]"
        >
          BaW OS · Property Management
        </p>
      </div>
    </div>
  )
}
