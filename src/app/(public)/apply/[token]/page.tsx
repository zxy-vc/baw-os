'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Upload, CheckCircle2, Loader2, AlertCircle, User, FileText, Shield, Send } from 'lucide-react'
import type { Titular, Aval, DocType } from '@/types'

// --------------- Tipos locales ---------------

type Step = 1 | 2 | 3 | 4

interface FormState {
  titular: Titular
  docs: Partial<Record<DocType, string>>
  aval: Aval
}

const EMPTY_TITULAR: Titular = {
  nombre: '', apellido_paterno: '', apellido_materno: '',
  curp: '', rfc: '', email: '', telefono: '',
  domicilio: '', estado_civil: '', nacionalidad: 'Mexicana',
  fecha_nacimiento: '', telefono_emergencia: '',
}

const EMPTY_AVAL: Aval = {
  nombre: '', rfc: '', curp: '', domicilio: '', telefono: '', relacion: '',
}

const STEPS: { num: Step; label: string; icon: typeof User }[] = [
  { num: 1, label: 'Datos personales', icon: User },
  { num: 2, label: 'Documentos', icon: FileText },
  { num: 3, label: 'Datos del aval', icon: Shield },
  { num: 4, label: 'Confirmación', icon: Send },
]

// --------------- Componente principal ---------------

export default function ApplyPage() {
  const { token } = useParams<{ token: string }>()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appId, setAppId] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    titular: { ...EMPTY_TITULAR },
    docs: {},
    aval: { ...EMPTY_AVAL },
  })

  // Cargar datos existentes
  const fetchApp = useCallback(async () => {
    try {
      const res = await fetch(`/api/intake?token=${token}`)
      const json = await res.json()
      if (!json.success) {
        setError(json.error || 'No se pudo cargar la aplicación')
        setLoading(false)
        return
      }
      setAppId(json.data.id)
      // Pre-llenar si hay datos previos
      if (json.data.titulares?.length > 0) {
        setForm(prev => ({ ...prev, titular: json.data.titulares[0] }))
      }
      if (json.data.avales?.length > 0) {
        setForm(prev => ({ ...prev, aval: json.data.avales[0] }))
      }
      if (json.data.docs) {
        setForm(prev => ({ ...prev, docs: json.data.docs }))
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchApp() }, [fetchApp])

  // --------------- Handlers ---------------

  function updateTitular(field: keyof Titular, value: string) {
    setForm(prev => ({ ...prev, titular: { ...prev.titular, [field]: value } }))
  }

  function updateAval(field: keyof Aval, value: string) {
    setForm(prev => ({ ...prev, aval: { ...prev.aval, [field]: value } }))
  }

  async function handleUpload(docType: DocType, file: File) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('docType', docType)
    fd.append('token', token)

    try {
      const res = await fetch('/api/intake/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (json.success) {
        setForm(prev => ({ ...prev, docs: { ...prev.docs, [docType]: json.data.url } }))
      }
    } catch {
      // silently fail, user can retry
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/intake?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulares: [form.titular],
          avales: [form.aval],
          contract_data: {},
          docs: form.docs,
          submit: true,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setSubmitted(true)
      } else {
        setError(json.error || 'Error al enviar')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  function canAdvance(): boolean {
    if (step === 1) {
      const t = form.titular
      return !!(t.nombre && t.apellido_paterno && t.curp && t.email && t.telefono)
    }
    if (step === 2) {
      return !!(form.docs.ine_front && form.docs.ine_back)
    }
    if (step === 3) {
      const a = form.aval
      return !!(a.nombre && a.telefono)
    }
    return true
  }

  // --------------- Loading / Error / Submitted states ---------------

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error && !appId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No se pudo cargar</h2>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Solicitud enviada</h2>
          <p className="text-sm text-gray-500">
            Tus datos han sido recibidos. Nos pondremos en contacto contigo pronto.
          </p>
        </div>
      </div>
    )
  }

  // --------------- Render ---------------

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center font-bold text-sm text-white">B</div>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Solicitud de Arrendamiento</h1>
            <p className="text-xs text-gray-400">BaW Property Management</p>
          </div>
        </div>
      </header>

      {/* Stepper */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          {STEPS.map((s) => (
            <button
              key={s.num}
              onClick={() => s.num < step && setStep(s.num)}
              className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                s.num === step
                  ? 'text-gray-900'
                  : s.num < step
                    ? 'text-emerald-600 cursor-pointer'
                    : 'text-gray-300'
              }`}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                s.num === step
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : s.num < step
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-gray-200 text-gray-300'
              }`}>
                {s.num < step ? <CheckCircle2 className="w-4 h-4" /> : s.num}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto p-4 pt-6">
        {step === 1 && <StepDatosPersonales titular={form.titular} onChange={updateTitular} />}
        {step === 2 && <StepDocumentos docs={form.docs} onUpload={handleUpload} />}
        {step === 3 && <StepAval aval={form.aval} onChange={updateAval} docs={form.docs} onUpload={handleUpload} />}
        {step === 4 && <StepConfirmacion form={form} />}

        {/* Error banner */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6 pb-8">
          {step > 1 ? (
            <button
              onClick={() => setStep((step - 1) as Step)}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Anterior
            </button>
          ) : <div />}

          {step < 4 ? (
            <button
              onClick={() => setStep((step + 1) as Step)}
              disabled={!canAdvance()}
              className="px-5 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-40 flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar solicitud
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// --------------- Step 1: Datos personales ---------------

function StepDatosPersonales({ titular, onChange }: { titular: Titular; onChange: (f: keyof Titular, v: string) => void }) {
  const fields: { key: keyof Titular; label: string; type?: string; required?: boolean; placeholder?: string }[] = [
    { key: 'nombre', label: 'Nombre(s)', required: true, placeholder: 'Juan Carlos' },
    { key: 'apellido_paterno', label: 'Apellido paterno', required: true, placeholder: 'García' },
    { key: 'apellido_materno', label: 'Apellido materno', placeholder: 'López' },
    { key: 'curp', label: 'CURP', required: true, placeholder: 'XXXX000000XXXXXX00' },
    { key: 'rfc', label: 'RFC', placeholder: 'XXXX000000XXX' },
    { key: 'email', label: 'Correo electrónico', type: 'email', required: true, placeholder: 'correo@ejemplo.com' },
    { key: 'telefono', label: 'Teléfono', type: 'tel', required: true, placeholder: '55 1234 5678' },
    { key: 'domicilio', label: 'Domicilio actual', placeholder: 'Calle, número, colonia, CP, ciudad' },
    { key: 'estado_civil', label: 'Estado civil', placeholder: 'Soltero/a, Casado/a, etc.' },
    { key: 'nacionalidad', label: 'Nacionalidad', placeholder: 'Mexicana' },
    { key: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date' },
    { key: 'telefono_emergencia', label: 'Teléfono de emergencia', type: 'tel', placeholder: '55 9876 5432' },
  ]

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Datos personales</h2>
      <p className="text-sm text-gray-400 mb-6">Información del titular del contrato</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map(f => (
          <div key={f.key} className={f.key === 'domicilio' ? 'sm:col-span-2' : ''}>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {f.label} {f.required && <span className="text-red-400">*</span>}
            </label>
            <input
              type={f.type || 'text'}
              value={titular[f.key]}
              onChange={e => onChange(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// --------------- Step 2: Documentos ---------------

function StepDocumentos({ docs, onUpload }: { docs: Partial<Record<DocType, string>>; onUpload: (t: DocType, f: File) => void }) {
  const docFields: { key: DocType; label: string; required?: boolean }[] = [
    { key: 'ine_front', label: 'INE — Frente', required: true },
    { key: 'ine_back', label: 'INE — Reverso', required: true },
    { key: 'domicilio_proof', label: 'Comprobante de domicilio' },
    { key: 'income_proof', label: 'Comprobante de ingresos (3 meses)' },
  ]

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Documentos de identidad</h2>
      <p className="text-sm text-gray-400 mb-6">Sube fotografías claras de tus documentos</p>

      <div className="space-y-4">
        {docFields.map(d => (
          <FileUploadField
            key={d.key}
            label={d.label}
            required={d.required}
            uploaded={!!docs[d.key]}
            onChange={file => onUpload(d.key, file)}
          />
        ))}
      </div>
    </div>
  )
}

// --------------- Step 3: Aval ---------------

function StepAval({ aval, onChange, docs, onUpload }: {
  aval: Aval
  onChange: (f: keyof Aval, v: string) => void
  docs: Partial<Record<DocType, string>>
  onUpload: (t: DocType, f: File) => void
}) {
  const fields: { key: keyof Aval; label: string; required?: boolean; placeholder?: string }[] = [
    { key: 'nombre', label: 'Nombre completo', required: true, placeholder: 'Nombre del aval' },
    { key: 'rfc', label: 'RFC', placeholder: 'XXXX000000XXX' },
    { key: 'curp', label: 'CURP', placeholder: 'XXXX000000XXXXXX00' },
    { key: 'domicilio', label: 'Domicilio', placeholder: 'Dirección completa' },
    { key: 'telefono', label: 'Teléfono', required: true, placeholder: '55 1234 5678' },
    { key: 'relacion', label: 'Relación con el titular', placeholder: 'Padre, hermano, amigo, etc.' },
  ]

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Datos del aval</h2>
      <p className="text-sm text-gray-400 mb-6">Persona que respalde tu solicitud</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {fields.map(f => (
          <div key={f.key} className={f.key === 'domicilio' ? 'sm:col-span-2' : ''}>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {f.label} {f.required && <span className="text-red-400">*</span>}
            </label>
            <input
              type="text"
              value={aval[f.key]}
              onChange={e => onChange(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        ))}
      </div>

      <h3 className="text-sm font-semibold text-gray-700 mb-3">Documentos del aval</h3>
      <div className="space-y-4">
        <FileUploadField label="INE del aval" uploaded={!!docs.aval_ine} onChange={file => onUpload('aval_ine', file)} />
        <FileUploadField label="Comprobante de domicilio del aval" uploaded={!!docs.aval_domicilio_proof} onChange={file => onUpload('aval_domicilio_proof', file)} />
      </div>
    </div>
  )
}

// --------------- Step 4: Confirmación ---------------

function StepConfirmacion({ form }: { form: FormState }) {
  const t = form.titular
  const a = form.aval
  const docCount = Object.keys(form.docs).length

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Confirmar y enviar</h2>
      <p className="text-sm text-gray-400 mb-6">Revisa que tus datos sean correctos antes de enviar</p>

      <div className="space-y-6">
        {/* Titular */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Titular</h3>
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 space-y-1">
            <p><span className="text-gray-400">Nombre:</span> {t.nombre} {t.apellido_paterno} {t.apellido_materno}</p>
            <p><span className="text-gray-400">CURP:</span> {t.curp}</p>
            {t.rfc && <p><span className="text-gray-400">RFC:</span> {t.rfc}</p>}
            <p><span className="text-gray-400">Email:</span> {t.email}</p>
            <p><span className="text-gray-400">Tel:</span> {t.telefono}</p>
            {t.domicilio && <p><span className="text-gray-400">Domicilio:</span> {t.domicilio}</p>}
            {t.estado_civil && <p><span className="text-gray-400">Estado civil:</span> {t.estado_civil}</p>}
            {t.fecha_nacimiento && <p><span className="text-gray-400">Nacimiento:</span> {t.fecha_nacimiento}</p>}
          </div>
        </div>

        {/* Documentos */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Documentos</h3>
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700">
            <p>{docCount} documento{docCount !== 1 ? 's' : ''} subido{docCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Aval */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Aval</h3>
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 space-y-1">
            <p><span className="text-gray-400">Nombre:</span> {a.nombre || '—'}</p>
            <p><span className="text-gray-400">Tel:</span> {a.telefono || '—'}</p>
            {a.relacion && <p><span className="text-gray-400">Relación:</span> {a.relacion}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// --------------- FileUploadField ---------------

function FileUploadField({ label, required, uploaded, onChange }: {
  label: string
  required?: boolean
  uploaded: boolean
  onChange: (file: File) => void
}) {
  const [uploading, setUploading] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    await onChange(file)
    setUploading(false)
  }

  return (
    <label className={`flex items-center gap-4 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
      uploaded ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
    }`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
        uploaded ? 'bg-emerald-100' : 'bg-gray-100'
      }`}>
        {uploading ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        ) : uploaded ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        ) : (
          <Upload className="w-5 h-5 text-gray-400" />
        )}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-400">*</span>}
        </p>
        <p className="text-xs text-gray-400">
          {uploaded ? 'Archivo subido' : 'PDF, JPG o PNG'}
        </p>
      </div>
      <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleChange} />
    </label>
  )
}
