'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Globe, User } from 'lucide-react'

const STEPS = [
  { label: 'Bienvenida', icon: User },
  { label: 'Propiedad', icon: Building2 },
  { label: 'Configuración', icon: Globe },
  { label: 'Completado', icon: CheckCircle2 },
]

interface FormData {
  pmName: string
  portfolioName: string
  city: string
  buildingName: string
  address: string
  unitCount: string
  currency: string
  timezone: string
  logoUrl: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>({
    pmName: '',
    portfolioName: '',
    city: '',
    buildingName: '',
    address: '',
    unitCount: '',
    currency: 'MXN',
    timezone: 'America/Mexico_City',
    logoUrl: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  function update(field: keyof FormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  function validate(): boolean {
    const newErrors: typeof errors = {}
    if (step === 0) {
      if (!form.pmName.trim()) newErrors.pmName = 'Nombre requerido'
      if (!form.portfolioName.trim()) newErrors.portfolioName = 'Nombre del portafolio requerido'
    }
    if (step === 1) {
      if (!form.buildingName.trim()) newErrors.buildingName = 'Nombre del edificio requerido'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function next() {
    if (!validate()) return
    if (step < STEPS.length - 1) setStep(s => s + 1)
  }

  function prev() {
    if (step > 0) setStep(s => s - 1)
  }

  function finish() {
    localStorage.setItem('baw-onboarding-complete', 'true')
    localStorage.setItem('baw-onboarding-data', JSON.stringify(form))
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
      {/* Stepper */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                i <= step
                  ? 'bg-[#2563EB] text-white'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`hidden sm:inline text-sm ${
                i <= step ? 'text-[#2563EB] font-medium' : 'text-gray-400'
              }`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`w-8 h-0.5 ${
                  i < step ? 'bg-[#2563EB]' : 'bg-gray-200 dark:bg-gray-800'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-8">
        {/* Step 0: Bienvenida */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Bienvenido a BaW OS</h2>
              <p className="text-gray-500 mt-1">Cuéntanos sobre ti y tu portafolio.</p>
            </div>
            <div className="space-y-4">
              <Field
                label="Tu nombre"
                value={form.pmName}
                onChange={v => update('pmName', v)}
                error={errors.pmName}
                placeholder="Ej: Andrea López"
              />
              <Field
                label="Nombre del portafolio"
                value={form.portfolioName}
                onChange={v => update('portfolioName', v)}
                error={errors.portfolioName}
                placeholder="Ej: Grupo Inmobiliario XYZ"
              />
              <Field
                label="Ciudad"
                value={form.city}
                onChange={v => update('city', v)}
                placeholder="Ej: CDMX"
              />
            </div>
          </div>
        )}

        {/* Step 1: Primera propiedad */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Tu primera propiedad</h2>
              <p className="text-gray-500 mt-1">Agrega el edificio o propiedad principal.</p>
            </div>
            <div className="space-y-4">
              <Field
                label="Nombre del edificio"
                value={form.buildingName}
                onChange={v => update('buildingName', v)}
                error={errors.buildingName}
                placeholder="Ej: Torre Reforma 123"
              />
              <Field
                label="Dirección"
                value={form.address}
                onChange={v => update('address', v)}
                placeholder="Ej: Av. Reforma 123, Col. Juárez"
              />
              <Field
                label="Número de unidades"
                value={form.unitCount}
                onChange={v => update('unitCount', v)}
                placeholder="Ej: 24"
                type="number"
              />
            </div>
          </div>
        )}

        {/* Step 2: Configuración */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración básica</h2>
              <p className="text-gray-500 mt-1">Ajusta las preferencias de tu workspace.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Moneda
                </label>
                <select
                  value={form.currency}
                  onChange={e => update('currency', e.target.value)}
                  className="input-field w-full"
                >
                  <option value="MXN">MXN — Peso Mexicano</option>
                  <option value="USD">USD — Dólar Americano</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="COP">COP — Peso Colombiano</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Zona horaria
                </label>
                <select
                  value={form.timezone}
                  onChange={e => update('timezone', e.target.value)}
                  className="input-field w-full"
                >
                  <option value="America/Mexico_City">Ciudad de México (GMT-6)</option>
                  <option value="America/Cancun">Cancún (GMT-5)</option>
                  <option value="America/Tijuana">Tijuana (GMT-8)</option>
                  <option value="America/Bogota">Bogotá (GMT-5)</option>
                  <option value="America/New_York">Nueva York (GMT-5)</option>
                </select>
              </div>
              <Field
                label="Logo (URL, opcional)"
                value={form.logoUrl}
                onChange={v => update('logoUrl', v)}
                placeholder="https://ejemplo.com/logo.png"
              />
            </div>
          </div>
        )}

        {/* Step 3: Completado */}
        {step === 3 && (
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                ¡Listo! Tu workspace está configurado
              </h2>
              <p className="text-gray-500 mt-2">
                <span className="font-medium text-gray-900 dark:text-white">{form.portfolioName}</span>
                {' '}ya está listo para usarse.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-left">
              <QuickLink href="/units" label="Unidades" desc="Gestiona tus departamentos" />
              <QuickLink href="/contracts" label="Contratos" desc="Crea tu primer contrato" />
              <QuickLink href="/payments" label="Pagos" desc="Registra cobros" />
              <QuickLink href="/tasks" label="Tareas" desc="Organiza pendientes" />
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between mt-8">
          {step > 0 && step < 3 ? (
            <button
              onClick={prev}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
          ) : (
            <div />
          )}
          {step < 3 ? (
            <button
              onClick={next}
              className="flex items-center gap-1 px-6 py-2.5 text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1d4ed8] rounded-lg transition-colors"
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={finish}
              className="w-full px-6 py-2.5 text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1d4ed8] rounded-lg transition-colors"
            >
              Ir al dashboard
            </button>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-400">Paso {step + 1} de {STEPS.length}</p>
    </div>
  )
}

/* ---- Helper components ---- */

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input-field w-full ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}

function QuickLink({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <a
      href={href}
      className="block p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-[#2563EB] hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
    >
      <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
      <p className="text-xs text-gray-500">{desc}</p>
    </a>
  )
}
