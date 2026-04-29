'use client'

// BaW OS — Onboarding Wizard v2 (Sprint 3 / S3)
// Modelo de 5 capas: PM Company → PM Users → Buildings → Units → Property Owners
// 4 pasos: PM Company · Edificio · Unidades · Property Owner

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  Building2,
  Briefcase,
  Home,
  UserCog,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  AlertTriangle,
} from 'lucide-react'

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

interface PMCompanyData {
  name: string
  slug: string
}

interface BuildingData {
  name: string
  address: string
  city: string
  state: string
  country: string
  postal_code: string
}

interface UnitRow {
  number: string
  type: 'STR' | 'MTR' | 'LTR'
  floor: number
}

type OwnerMode = 'self' | 'client' | 'skip'

interface OwnerData {
  full_name: string
  email: string
  phone: string
  rfc: string
  percentage: number
}

const STEPS = [
  { key: 'pm', label: 'PM Company', icon: Briefcase },
  { key: 'building', label: 'Edificio', icon: Building2 },
  { key: 'units', label: 'Unidades', icon: Home },
  { key: 'owner', label: 'Property Owner', icon: UserCog },
]

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
}

// -----------------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------------

export default function OnboardingWizardV2() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  // Paso 1 — PM Company (pre-poblado)
  const [pm, setPM] = useState<PMCompanyData>({
    name: 'BaW Operations',
    slug: 'baw-operations',
  })

  // Paso 2 — Edificio
  const [building, setBuilding] = useState<BuildingData>({
    name: '',
    address: '',
    city: '',
    state: '',
    country: 'MX',
    postal_code: '',
  })

  // Paso 3 — Unidades (bulk)
  // Sprint 3 / S7: campos numéricos guardados como string para permitir
  // edición libre (vaciar el campo, borrar y reescribir).  Se coercen a number
  // sólo en el momento de generar.
  const [unitConfig, setUnitConfig] = useState({
    count: '4',
    prefix: '',
    startNumber: '101',
    floors: '4',
    type: 'LTR' as UnitRow['type'],
  })
  const [units, setUnits] = useState<UnitRow[]>([])

  // Paso 4 — Property Owner
  const [ownerMode, setOwnerMode] = useState<OwnerMode>('self')
  const [owner, setOwner] = useState<OwnerData>({
    full_name: '',
    email: '',
    phone: '',
    rfc: '',
    percentage: 100,
  })

  // Resultado final
  const [result, setResult] = useState<{
    org_id: string
    building_id: string
    units_created: number
  } | null>(null)

  // Auth gate (client-side: requiere usuario autenticado)
  useEffect(() => {
    async function checkAuth() {
      const { data } = await supabase.auth.getSession()
      const session = data.session
      if (!session) {
        router.replace('/login?redirect=/onboarding')
        return
      }
      setUserId(session.user.id)
      setUserEmail(session.user.email ?? null)
      // Pre-poblar email del owner si modo "self"
      setOwner((o) => ({ ...o, email: session.user.email ?? '' }))
      setAuthChecked(true)
    }
    checkAuth()
  }, [router])

  // Mantener slug sincronizado mientras el usuario teclea el name
  useEffect(() => {
    setPM((p) => ({ ...p, slug: slugify(p.name) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pm.name])

  // ---------------------------------------------------------------------------
  // Handlers de navegación
  // ---------------------------------------------------------------------------

  function validateStep(idx: number): string | null {
    if (idx === 0) {
      if (!pm.name.trim()) return 'El nombre del PM Company es obligatorio.'
      if (!pm.slug.trim()) return 'El slug es obligatorio (se genera automáticamente).'
      return null
    }
    if (idx === 1) {
      if (!building.name.trim()) return 'El nombre del edificio es obligatorio.'
      if (!building.city.trim()) return 'La ciudad es obligatoria.'
      return null
    }
    if (idx === 2) {
      if (units.length === 0)
        return 'Genera o agrega al menos una unidad antes de continuar.'
      const numbers = units.map((u) => u.number.trim())
      if (numbers.some((n) => !n)) return 'Todas las unidades deben tener número.'
      const dup = numbers.find((n, i) => numbers.indexOf(n) !== i)
      if (dup) return `Hay números duplicados: ${dup}`
      return null
    }
    if (idx === 3) {
      if (ownerMode === 'self') return null
      if (ownerMode === 'skip') return null
      if (!owner.full_name.trim())
        return 'El nombre del propietario es obligatorio.'
      if (owner.percentage <= 0 || owner.percentage > 100)
        return 'El porcentaje debe estar entre 1 y 100.'
      return null
    }
    return null
  }

  function next() {
    const err = validateStep(step)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setStep(step + 1)
  }

  function back() {
    setError(null)
    if (step > 0) setStep(step - 1)
  }

  // ---------------------------------------------------------------------------
  // Generación de unidades en bulk
  // ---------------------------------------------------------------------------

  // Sprint 3 / S7 — Bug #4 fix: en lugar de REEMPLAZAR la lista de unidades,
  // ahora hacemos APPEND con deduplicación por `number`.  Permite ejecutar
  // múltiples bulks (p.ej. 101-104, 201-204, 301-304) en sesiones distintas
  // del mismo paso.
  function generateUnits() {
    const rows: UnitRow[] = []
    const count = Math.max(1, Number(unitConfig.count) || 0)
    const startNumber = Number(unitConfig.startNumber) || 101
    const floors = Math.max(1, Number(unitConfig.floors) || 1)
    const { prefix, type } = unitConfig
    const perFloor = Math.ceil(count / floors)
    for (let i = 0; i < count; i++) {
      const floor = Math.min(floors, Math.floor(i / perFloor) + 1)
      const num = `${prefix}${startNumber + i}`
      rows.push({ number: num, type, floor })
    }
    // Deduplicar por number: las nuevas filas ganan sobre las existentes
    const byNumber = new Map<string, UnitRow>()
    for (const u of units) byNumber.set(u.number, u)
    for (const u of rows) byNumber.set(u.number, u)
    setUnits(Array.from(byNumber.values()))

    // Auto-sugerir el siguiente piso/secuencia para el siguiente bulk
    // (p.ej. tras generar 101-104, deja 201 listo para el siguiente).
    const nextStart = startNumber + 100
    setUnitConfig({
      ...unitConfig,
      startNumber: String(nextStart),
    })
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

  // ---------------------------------------------------------------------------
  // Submit final
  // ---------------------------------------------------------------------------

  async function handleSubmit() {
    const err = validateStep(3)
    if (err) {
      setError(err)
      return
    }
    if (!userId) {
      setError('Sesión expirada. Vuelve a iniciar sesión.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        user_id: userId,
        pm: { name: pm.name.trim(), slug: pm.slug.trim() },
        building: {
          name: building.name.trim(),
          address: building.address.trim() || null,
          city: building.city.trim(),
          state: building.state.trim() || null,
          country: building.country.trim() || 'MX',
          postal_code: building.postal_code.trim() || null,
        },
        units: units.map((u) => ({
          number: u.number.trim(),
          type: u.type,
          floor: Number(u.floor) || 1,
        })),
        owner_mode: ownerMode,
        owner:
          ownerMode === 'self'
            ? {
                full_name: pm.name,
                email: userEmail,
                phone: null,
                rfc: null,
                percentage: 100,
                user_id: userId,
              }
            : ownerMode === 'client'
            ? {
                full_name: owner.full_name.trim(),
                email: owner.email.trim() || null,
                phone: owner.phone.trim() || null,
                rfc: owner.rfc.trim() || null,
                percentage: Number(owner.percentage),
                user_id: null,
              }
            : null,
      }

      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      setResult(json.data)
      // Mover al paso 5 (resumen)
      setStep(4)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado.')
    } finally {
      setSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="muted-text text-[13px]">Cargando sesión…</span>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen px-4 py-10"
      style={{ backgroundColor: 'var(--baw-bg)', color: 'var(--baw-text)' }}
    >
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <header className="mb-8 text-center">
          <h1 className="text-[28px] font-semibold tracking-tight">
            Bienvenido a BaW OS
          </h1>
          <p className="muted-text text-[14px] mt-2">
            Configura tu PM Company en cuatro pasos. BaW empieza a operar contigo
            desde el primer edificio.
          </p>
        </header>

        {/* Stepper */}
        <Stepper currentStep={step} />

        {/* Error banner */}
        {error && (
          <div
            className="mt-6 px-4 py-3 rounded-md flex items-start gap-2 text-[13px]"
            style={{
              backgroundColor: 'rgba(248, 113, 113, 0.08)',
              border: '1px solid rgba(248, 113, 113, 0.3)',
              color: '#fca5a5',
            }}
          >
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step content */}
        <div
          className="mt-6 rounded-lg p-6"
          style={{
            backgroundColor: 'var(--baw-surface)',
            border: '1px solid var(--baw-border)',
          }}
        >
          {step === 0 && <StepPMCompany pm={pm} setPM={setPM} />}
          {step === 1 && (
            <StepBuilding building={building} setBuilding={setBuilding} />
          )}
          {step === 2 && (
            <StepUnits
              unitConfig={unitConfig}
              setUnitConfig={setUnitConfig}
              units={units}
              setUnits={setUnits}
              generateUnits={generateUnits}
              addUnit={addUnit}
              removeUnit={removeUnit}
              updateUnit={updateUnit}
            />
          )}
          {step === 3 && (
            <StepOwner
              ownerMode={ownerMode}
              setOwnerMode={setOwnerMode}
              owner={owner}
              setOwner={setOwner}
              userEmail={userEmail}
              pmName={pm.name}
            />
          )}
          {step === 4 && result && (
            <StepDone
              pmName={pm.name}
              buildingName={building.name}
              unitsCreated={result.units_created}
              ownerMode={ownerMode}
              onContinue={() => router.replace('/')}
            />
          )}
        </div>

        {/* Nav */}
        {step < 4 && (
          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={back}
              disabled={step === 0 || submitting}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px]"
              style={{
                color: 'var(--baw-muted)',
                border: '1px solid var(--baw-border)',
                opacity: step === 0 || submitting ? 0.4 : 1,
                cursor: step === 0 || submitting ? 'not-allowed' : 'pointer',
              }}
            >
              <ArrowLeft size={14} />
              Atrás
            </button>
            {step < 3 ? (
              <button
                type="button"
                onClick={next}
                className="flex items-center gap-2 px-5 py-2 rounded-md text-[13px] font-medium"
                style={{
                  backgroundColor: 'var(--baw-primary)',
                  color: '#fff',
                }}
              >
                Continuar
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-md text-[13px] font-medium"
                style={{
                  backgroundColor: 'var(--baw-primary)',
                  color: '#fff',
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                {submitting ? 'Creando…' : 'Crear PM Company'}
                <CheckCircle2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Stepper
// -----------------------------------------------------------------------------

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <ol className="flex items-center justify-between gap-2 max-w-xl mx-auto">
      {STEPS.map((s, idx) => {
        const Icon = s.icon
        const active = idx === currentStep
        const done = idx < currentStep || currentStep === 4
        return (
          <li key={s.key} className="flex-1 flex flex-col items-center">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: active
                  ? 'var(--baw-primary)'
                  : done
                  ? 'rgba(74, 222, 128, 0.15)'
                  : 'var(--baw-surface)',
                border: '1px solid var(--baw-border)',
                color: active ? '#fff' : done ? '#86efac' : 'var(--baw-muted)',
              }}
            >
              {done ? <CheckCircle2 size={16} /> : <Icon size={16} />}
            </div>
            <span
              className="text-[11px] mt-2 text-center"
              style={{
                color: active ? 'var(--baw-text)' : 'var(--baw-muted)',
                fontWeight: active ? 600 : 400,
              }}
            >
              {s.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// -----------------------------------------------------------------------------
// Paso 1 — PM Company
// -----------------------------------------------------------------------------

function StepPMCompany({
  pm,
  setPM,
}: {
  pm: PMCompanyData
  setPM: (p: PMCompanyData) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[18px] font-semibold">¿Quién opera este sistema?</h2>
        <p className="muted-text text-[13px] mt-1">
          La PM Company es la organización administradora que va a usar BaW. Si
          eres administrador independiente, puedes dejar el nombre por defecto.
        </p>
      </div>
      <Field label="Nombre del PM Company" required>
        <input
          type="text"
          value={pm.name}
          onChange={(e) => setPM({ ...pm, name: e.target.value })}
          placeholder="BaW Operations"
          className="w-full"
          style={inputStyle}
        />
      </Field>
      <Field
        label="Slug (identificador URL)"
        hint="Se genera automáticamente del nombre. Lo verás en URLs internas."
      >
        <input
          type="text"
          value={pm.slug}
          onChange={(e) => setPM({ ...pm, slug: slugify(e.target.value) })}
          placeholder="baw-operations"
          className="w-full font-mono"
          style={inputStyle}
        />
      </Field>
      <p
        className="text-[12px] px-3 py-2 rounded-md"
        style={{
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          color: 'var(--baw-muted)',
        }}
      >
        Quedarás registrado como{' '}
        <strong style={{ color: 'var(--baw-text)' }}>pm_owner</strong> de esta
        organización. Podrás invitar a tu equipo más adelante con roles{' '}
        <code>pm_admin</code>, <code>pm_operator</code> o <code>pm_viewer</code>.
      </p>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Paso 2 — Edificio
// -----------------------------------------------------------------------------

function StepBuilding({
  building,
  setBuilding,
}: {
  building: BuildingData
  setBuilding: (b: BuildingData) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[18px] font-semibold">Tu primer edificio</h2>
        <p className="muted-text text-[13px] mt-1">
          BaW administra activos físicos. Necesitamos al menos un edificio para
          empezar. Podrás agregar más después.
        </p>
      </div>
      <Field label="Nombre del edificio" required>
        <input
          type="text"
          value={building.name}
          onChange={(e) => setBuilding({ ...building, name: e.target.value })}
          placeholder="Mateos 809"
          className="w-full"
          style={inputStyle}
        />
      </Field>
      <Field label="Dirección">
        <input
          type="text"
          value={building.address}
          onChange={(e) =>
            setBuilding({ ...building, address: e.target.value })
          }
          placeholder="Adolfo López Mateos 809"
          className="w-full"
          style={inputStyle}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Ciudad" required>
          <input
            type="text"
            value={building.city}
            onChange={(e) => setBuilding({ ...building, city: e.target.value })}
            placeholder="CDMX"
            className="w-full"
            style={inputStyle}
          />
        </Field>
        <Field label="Estado">
          <input
            type="text"
            value={building.state}
            onChange={(e) =>
              setBuilding({ ...building, state: e.target.value })
            }
            placeholder="Ciudad de México"
            className="w-full"
            style={inputStyle}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="País">
          <input
            type="text"
            value={building.country}
            onChange={(e) =>
              setBuilding({ ...building, country: e.target.value.toUpperCase() })
            }
            placeholder="MX"
            maxLength={2}
            className="w-full font-mono"
            style={inputStyle}
          />
        </Field>
        <Field label="Código postal">
          <input
            type="text"
            value={building.postal_code}
            onChange={(e) =>
              setBuilding({ ...building, postal_code: e.target.value })
            }
            placeholder="03100"
            className="w-full font-mono"
            style={inputStyle}
          />
        </Field>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Paso 3 — Unidades
// -----------------------------------------------------------------------------

function StepUnits({
  unitConfig,
  setUnitConfig,
  units,
  setUnits,
  generateUnits,
  addUnit,
  removeUnit,
  updateUnit,
}: {
  unitConfig: {
    count: string
    prefix: string
    startNumber: string
    floors: string
    type: UnitRow['type']
  }
  setUnitConfig: (c: typeof unitConfig) => void
  units: UnitRow[]
  setUnits: (u: UnitRow[]) => void
  generateUnits: () => void
  addUnit: () => void
  removeUnit: (i: number) => void
  updateUnit: (i: number, f: keyof UnitRow, v: string | number) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[18px] font-semibold">Estructura de unidades</h2>
        <p className="muted-text text-[13px] mt-1">
          Genera las unidades en bulk con el patrón típico (101–404) o agrégalas
          una por una. Podrás editarlas después.
        </p>
      </div>

      {/* Generador bulk */}
      <div
        className="rounded-md p-4 grid grid-cols-2 md:grid-cols-5 gap-3"
        style={{
          backgroundColor: 'var(--baw-bg)',
          border: '1px solid var(--baw-border)',
        }}
      >
        <Field label="Cantidad">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={unitConfig.count}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '')
              setUnitConfig({ ...unitConfig, count: v })
            }}
            placeholder="4"
            className="w-full"
            style={inputStyle}
          />
        </Field>
        <Field label="Prefijo">
          <input
            type="text"
            value={unitConfig.prefix}
            onChange={(e) =>
              setUnitConfig({ ...unitConfig, prefix: e.target.value })
            }
            placeholder="(opcional)"
            className="w-full"
            style={inputStyle}
          />
        </Field>
        <Field label="Empezar en">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={unitConfig.startNumber}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '')
              setUnitConfig({ ...unitConfig, startNumber: v })
            }}
            placeholder="101"
            className="w-full"
            style={inputStyle}
          />
        </Field>
        <Field label="Pisos">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={unitConfig.floors}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '')
              setUnitConfig({ ...unitConfig, floors: v })
            }}
            placeholder="1"
            className="w-full"
            style={inputStyle}
          />
        </Field>
        <Field label="Tipo">
          <select
            value={unitConfig.type}
            onChange={(e) =>
              setUnitConfig({
                ...unitConfig,
                type: e.target.value as UnitRow['type'],
              })
            }
            className="w-full"
            style={inputStyle}
          >
            <option value="LTR">LTR</option>
            <option value="MTR">MTR</option>
            <option value="STR">STR</option>
          </select>
        </Field>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={generateUnits}
          className="px-4 py-2 rounded-md text-[13px]"
          style={{
            backgroundColor: 'var(--baw-bg)',
            border: '1px solid var(--baw-border)',
            color: 'var(--baw-text)',
          }}
        >
          {units.length > 0
            ? `Agregar ${unitConfig.count || 0} unidades más`
            : `Generar ${unitConfig.count || 0} unidades`}
        </button>
        {units.length > 0 && (
          <span className="text-[12px] muted-text">
            Puedes ejecutar varios bulks (101–104, 201–204, etc.) y se irán
            sumando.
          </span>
        )}
      </div>

      {/* Lista editable */}
      {units.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">
              {units.length} unidades
            </span>
            <button
              type="button"
              onClick={addUnit}
              className="flex items-center gap-1 text-[12px]"
              style={{ color: 'var(--baw-primary)' }}
            >
              <Plus size={12} /> Agregar
            </button>
          </div>
          <div
            className="rounded-md overflow-hidden"
            style={{ border: '1px solid var(--baw-border)' }}
          >
            <table className="w-full text-[12px]">
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
                          updateUnit(idx, 'number', e.target.value)
                        }
                        className="w-full font-mono"
                        style={{ ...inputStyle, padding: '4px 8px' }}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={u.type}
                        onChange={(e) =>
                          updateUnit(idx, 'type', e.target.value)
                        }
                        style={{ ...inputStyle, padding: '4px 8px' }}
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
                          updateUnit(idx, 'floor', Number(e.target.value) || 1)
                        }
                        className="w-20"
                        style={{ ...inputStyle, padding: '4px 8px' }}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeUnit(idx)}
                        style={{ color: '#f87171' }}
                      >
                        <Trash2 size={14} />
                      </button>
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

// -----------------------------------------------------------------------------
// Paso 4 — Property Owner
// -----------------------------------------------------------------------------

function StepOwner({
  ownerMode,
  setOwnerMode,
  owner,
  setOwner,
  userEmail,
  pmName,
}: {
  ownerMode: OwnerMode
  setOwnerMode: (m: OwnerMode) => void
  owner: OwnerData
  setOwner: (o: OwnerData) => void
  userEmail: string | null
  pmName: string
}) {
  const options: Array<{ key: OwnerMode; title: string; desc: string }> = [
    {
      key: 'self',
      title: 'Yo soy el dueño',
      desc: `${pmName} administra su propio edificio. Quedarás registrado como Property Owner con 100% del building.`,
    },
    {
      key: 'client',
      title: 'Es de un cliente',
      desc: 'Administras este edificio para un tercero. Captura los datos del propietario y se le creará portal de acceso.',
    },
    {
      key: 'skip',
      title: 'Configurarlo más tarde',
      desc: 'El edificio queda sin Property Owner. Podrás asignarlo después en la pestaña de Configuración.',
    },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[18px] font-semibold">¿De quién es este edificio?</h2>
        <p className="muted-text text-[13px] mt-1">
          La capa de Property Owners distingue entre quien opera (PM Company) y
          quien posee el inmueble. Esto define cuentas claras y portales
          separados.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {options.map((opt) => {
          const active = ownerMode === opt.key
          return (
            <button
              type="button"
              key={opt.key}
              onClick={() => setOwnerMode(opt.key)}
              className="text-left rounded-md p-4 transition"
              style={{
                backgroundColor: active
                  ? 'rgba(59, 130, 246, 0.08)'
                  : 'var(--baw-bg)',
                border: active
                  ? '1px solid var(--baw-primary)'
                  : '1px solid var(--baw-border)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div
                    className="text-[14px] font-semibold"
                    style={{ color: 'var(--baw-text)' }}
                  >
                    {opt.title}
                  </div>
                  <div className="muted-text text-[12px] mt-1">{opt.desc}</div>
                </div>
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0 mt-1"
                  style={{
                    backgroundColor: active ? 'var(--baw-primary)' : 'transparent',
                    border: active
                      ? '2px solid var(--baw-primary)'
                      : '2px solid var(--baw-border)',
                  }}
                />
              </div>
            </button>
          )
        })}
      </div>

      {ownerMode === 'self' && (
        <div
          className="text-[12px] px-3 py-2 rounded-md"
          style={{
            backgroundColor: 'rgba(74, 222, 128, 0.08)',
            color: 'var(--baw-muted)',
          }}
        >
          Se creará un Property Owner con tu email{' '}
          <code style={{ color: 'var(--baw-text)' }}>{userEmail}</code> y un
          ownership stake del 100% sobre el edificio.
        </div>
      )}

      {ownerMode === 'client' && (
        <div className="space-y-4 pt-2">
          <Field label="Nombre completo del propietario" required>
            <input
              type="text"
              value={owner.full_name}
              onChange={(e) =>
                setOwner({ ...owner, full_name: e.target.value })
              }
              placeholder="Juan Pérez García"
              className="w-full"
              style={inputStyle}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email">
              <input
                type="email"
                value={owner.email}
                onChange={(e) => setOwner({ ...owner, email: e.target.value })}
                placeholder="cliente@ejemplo.com"
                className="w-full"
                style={inputStyle}
              />
            </Field>
            <Field label="Teléfono">
              <input
                type="tel"
                value={owner.phone}
                onChange={(e) => setOwner({ ...owner, phone: e.target.value })}
                placeholder="+52 55..."
                className="w-full"
                style={inputStyle}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="RFC (opcional)">
              <input
                type="text"
                value={owner.rfc}
                onChange={(e) =>
                  setOwner({ ...owner, rfc: e.target.value.toUpperCase() })
                }
                placeholder="XAXX010101000"
                maxLength={13}
                className="w-full font-mono"
                style={inputStyle}
              />
            </Field>
            <Field label="% del building" hint="Entre 1 y 100">
              <input
                type="number"
                min={1}
                max={100}
                value={owner.percentage}
                onChange={(e) =>
                  setOwner({ ...owner, percentage: Number(e.target.value) || 0 })
                }
                className="w-full tabular-nums"
                style={inputStyle}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Paso final — Done
// -----------------------------------------------------------------------------

function StepDone({
  pmName,
  buildingName,
  unitsCreated,
  ownerMode,
  onContinue,
}: {
  pmName: string
  buildingName: string
  unitsCreated: number
  ownerMode: OwnerMode
  onContinue: () => void
}) {
  return (
    <div className="text-center py-6">
      <div
        className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-4"
        style={{
          backgroundColor: 'rgba(74, 222, 128, 0.15)',
          color: '#86efac',
        }}
      >
        <CheckCircle2 size={28} />
      </div>
      <h2 className="text-[20px] font-semibold">¡Listo!</h2>
      <p className="muted-text text-[13px] mt-2 max-w-md mx-auto">
        BaW Operations ha registrado a <strong>{pmName}</strong> con el edificio{' '}
        <strong>{buildingName}</strong> y <strong>{unitsCreated}</strong>{' '}
        unidades. Property Owner:{' '}
        {ownerMode === 'self'
          ? 'tú mismo, 100%'
          : ownerMode === 'client'
          ? 'cliente capturado'
          : 'pendiente de configurar'}
        .
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="mt-6 px-5 py-2 rounded-md text-[13px] font-medium"
        style={{ backgroundColor: 'var(--baw-primary)', color: '#fff' }}
      >
        Ir a Mission Control
      </button>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers UI
// -----------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--baw-bg)',
  border: '1px solid var(--baw-border)',
  color: 'var(--baw-text)',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '13px',
  outline: 'none',
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium block mb-1.5">
        {label}
        {required && <span style={{ color: '#f87171' }}> *</span>}
      </span>
      {children}
      {hint && (
        <span className="muted-text text-[11px] mt-1 block">{hint}</span>
      )}
    </label>
  )
}
