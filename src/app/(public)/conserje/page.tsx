'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Home,
  Wrench,
  DollarSign,
  LogOut,
  Phone,
  ChevronLeft,
  Check,
  Loader2,
} from 'lucide-react'

const ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'
const VALID_PIN = '1234'
const SESSION_KEY = 'conserje_pin'

type Tab = 'deptos' | 'incidencias' | 'cobros'

// --------------- Types ---------------

interface Unit {
  id: string
  number: string
  floor: number | null
  type: string
  status: string
}

interface Occupant {
  id: string
  first_name: string
  last_name: string
  phone: string | null
}

interface Contract {
  id: string
  unit_id: string
  unit: Unit | null
  occupant: Occupant | null
}

interface Payment {
  id: string
  amount: number
  status: string
  due_date: string
  contract: Contract | null
}

interface Incident {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  created_at: string
  unit: { number: string; type: string } | null
}

// --------------- PIN Login ---------------

function PinLogin({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pin === VALID_PIN) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      onSuccess()
    } else {
      setError(true)
      setPin('')
      inputRef.current?.focus()
      setTimeout(() => setError(false), 600)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className={`bg-white rounded-2xl shadow-lg p-8 w-full max-w-xs text-center ${
          error ? 'animate-shake' : ''
        }`}
      >
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Home className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">Conserje</h1>
        <p className="text-sm text-slate-500 mb-6">ALM809P</p>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          maxLength={4}
          pattern="[0-9]*"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className="w-full h-14 text-center text-2xl tracking-[0.5em] font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
          autoFocus
        />

        {error && (
          <p className="text-red-500 text-sm mb-3">PIN incorrecto</p>
        )}

        <button
          type="submit"
          disabled={pin.length < 4}
          className="w-full h-12 bg-blue-600 text-white font-semibold rounded-xl disabled:opacity-40 active:bg-blue-700 transition-colors"
        >
          Entrar
        </button>
      </form>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  )
}

// --------------- Tab: Deptos ---------------

function TabDeptos() {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Unit | null>(null)
  const [occupant, setOccupant] = useState<Occupant | null>(null)
  const [loadingOccupant, setLoadingOccupant] = useState(false)

  useEffect(() => {
    supabase
      .from('units')
      .select('*')
      .eq('org_id', ORG_ID)
      .order('floor')
      .order('number')
      .then(({ data }) => {
        setUnits(data || [])
        setLoading(false)
      })
  }, [])

  async function handleSelect(unit: Unit) {
    setSelected(unit)
    setOccupant(null)
    if (unit.status === 'occupied') {
      setLoadingOccupant(true)
      const { data } = await supabase
        .from('contracts')
        .select('occupant:occupants(first_name, last_name, phone)')
        .eq('unit_id', unit.id)
        .eq('status', 'active')
        .limit(1)
        .single()
      setOccupant((data as any)?.occupant || null)
      setLoadingOccupant(false)
    }
  }

  if (loading) return <LoadingSpinner />

  if (selected) {
    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1 text-blue-600 font-medium mb-4 active:opacity-70"
        >
          <ChevronLeft className="w-5 h-5" /> Volver
        </button>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-slate-900">
              Depto {selected.number}
            </h3>
            <StatusChip status={selected.status} unitType={selected.type} />
          </div>
          {selected.floor != null && (
            <p className="text-sm text-slate-500 mb-4">Piso {selected.floor}</p>
          )}

          {loadingOccupant && (
            <p className="text-sm text-slate-400">Cargando inquilino...</p>
          )}
          {occupant && (
            <div className="border-t border-slate-100 pt-4">
              <p className="font-medium text-slate-900">
                {occupant.first_name} {occupant.last_name}
              </p>
              {occupant.phone && (
                <a
                  href={`tel:${occupant.phone}`}
                  className="mt-2 inline-flex items-center gap-2 text-blue-600 font-medium active:opacity-70"
                >
                  <Phone className="w-4 h-4" />
                  {occupant.phone}
                </a>
              )}
            </div>
          )}
          {!loadingOccupant && !occupant && selected.status === 'occupied' && (
            <p className="text-sm text-slate-400">Sin inquilino registrado</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {units.map((u) => (
        <button
          key={u.id}
          onClick={() => handleSelect(u)}
          className="w-full bg-white rounded-xl p-4 shadow-sm flex items-center justify-between active:bg-slate-50 transition-colors text-left"
        >
          <div>
            <span className="font-semibold text-slate-900">
              {u.number}
            </span>
            {u.floor != null && (
              <span className="text-slate-400 text-sm ml-2">
                Piso {u.floor}
              </span>
            )}
          </div>
          <StatusChip status={u.status} unitType={u.type} />
        </button>
      ))}
      {units.length === 0 && (
        <p className="text-center text-slate-400 py-8">Sin departamentos</p>
      )}
    </div>
  )
}

// --------------- Tab: Incidencias ---------------

const CATEGORIES = ['Plomería', 'Electricidad', 'Acceso', 'Otro'] as const

function TabIncidencias() {
  const [units, setUnits] = useState<Pick<Unit, 'id' | 'number'>[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [unitId, setUnitId] = useState('')
  const [category, setCategory] = useState<string>('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    Promise.all([
      supabase
        .from('units')
        .select('id, number')
        .eq('org_id', ORG_ID)
        .order('number'),
      supabase
        .from('incidents')
        .select('*, unit:units(number, type)')
        .eq('org_id', ORG_ID)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(10),
    ]).then(([unitsRes, incidentsRes]) => {
      setUnits(unitsRes.data || [])
      setIncidents(incidentsRes.data || [])
      setLoading(false)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!unitId || !category) return
    setSaving(true)

    const { error } = await supabase.from('incidents').insert({
      org_id: ORG_ID,
      unit_id: unitId,
      title: category,
      description: description || null,
      status: 'open',
      priority: 'medium',
      reported_by: 'conserje',
    })

    setSaving(false)
    if (!error) {
      setToast('Incidencia reportada')
      setShowForm(false)
      setUnitId('')
      setCategory('')
      setDescription('')
      // Refresh list
      const { data } = await supabase
        .from('incidents')
        .select('*, unit:units(number, type)')
        .eq('org_id', ORG_ID)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(10)
      setIncidents(data || [])
    } else {
      setToast('Error al reportar')
    }
    setTimeout(() => setToast(''), 3000)
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      {toast && <Toast message={toast} />}

      {!showForm ? (
        <>
          <button
            onClick={() => setShowForm(true)}
            className="w-full h-12 bg-blue-600 text-white font-semibold rounded-xl mb-4 active:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <Wrench className="w-5 h-5" /> Nueva incidencia
          </button>

          <div className="space-y-2">
            {incidents.map((inc) => (
              <div
                key={inc.id}
                className="bg-white rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-900">
                    {inc.title}
                  </span>
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                    Abierto
                  </span>
                </div>
                {inc.unit && (
                  <p className="text-sm text-slate-500">
                    Depto {inc.unit.number}
                  </p>
                )}
                {inc.description && (
                  <p className="text-sm text-slate-600 mt-1">
                    {inc.description}
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-2">
                  {new Date(inc.created_at).toLocaleDateString('es-MX')}
                </p>
              </div>
            ))}
            {incidents.length === 0 && (
              <p className="text-center text-slate-400 py-8">
                Sin incidencias abiertas
              </p>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="flex items-center gap-1 text-blue-600 font-medium active:opacity-70"
          >
            <ChevronLeft className="w-5 h-5" /> Volver
          </button>

          {/* Depto select */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Departamento
            </label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="w-full h-12 border border-slate-200 rounded-xl px-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Seleccionar...</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.number}
                </option>
              ))}
            </select>
          </div>

          {/* Category buttons */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Categoría
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`h-12 rounded-xl font-medium text-base transition-colors ${
                    category === cat
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 active:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Descripción (opcional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Detalles del problema..."
            />
          </div>

          <button
            type="submit"
            disabled={!unitId || !category || saving}
            className="w-full h-12 bg-blue-600 text-white font-semibold rounded-xl disabled:opacity-40 active:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Reportar'
            )}
          </button>
        </form>
      )}
    </div>
  )
}

// --------------- Tab: Cobros ---------------

function TabCobros() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetchPayments()
  }, [])

  async function fetchPayments() {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0]
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0]

    const { data } = await supabase
      .from('payments')
      .select(
        '*, contract:contracts(*, unit:units(*), occupant:occupants(*))'
      )
      .eq('org_id', ORG_ID)
      .eq('status', 'pending')
      .gte('due_date', monthStart)
      .lte('due_date', monthEnd)
      .order('due_date')

    setPayments(data || [])
    setLoading(false)
  }

  async function markPaid(payment: Payment) {
    setMarking(payment.id)
    const { error } = await supabase
      .from('payments')
      .update({
        status: 'paid',
        method: 'cash',
        paid_date: new Date().toISOString().split('T')[0],
        amount_paid: payment.amount,
        confirmed_by: 'enrique-alanis',
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', payment.id)

    setMarking(null)
    if (!error) {
      setToast('Pago registrado')
      setPayments((prev) => prev.filter((p) => p.id !== payment.id))
    } else {
      setToast('Error al registrar pago')
    }
    setTimeout(() => setToast(''), 3000)
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      {toast && <Toast message={toast} />}

      <div className="space-y-2">
        {payments.map((p) => {
          const unit = p.contract?.unit
          const occ = p.contract?.occupant
          return (
            <div
              key={p.id}
              className="bg-white rounded-xl p-4 shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-slate-900">
                    {unit ? `Depto ${unit.number}` : '—'}
                  </span>
                  {occ && (
                    <p className="text-sm text-slate-500">
                      {occ.first_name} {occ.last_name}
                    </p>
                  )}
                </div>
                <span className="text-lg font-bold text-slate-900">
                  ${p.amount.toLocaleString('es-MX')}
                </span>
              </div>
              <button
                onClick={() => markPaid(p)}
                disabled={marking === p.id}
                className="w-full h-12 bg-green-600 text-white font-semibold rounded-xl active:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {marking === p.id ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" /> Marcar Pagado
                  </>
                )}
              </button>
            </div>
          )
        })}
        {payments.length === 0 && (
          <p className="text-center text-slate-400 py-8">
            Sin cobros pendientes este mes
          </p>
        )}
      </div>
    </div>
  )
}

// --------------- Shared Components ---------------

function StatusChip({ status, unitType }: { status: string; unitType?: string }) {
  const isOccupied = status === 'occupied'
  const isStr = unitType === 'str' || unitType === 'STR'
  if (!isOccupied && isStr) {
    return (
      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-600">
        STR
      </span>
    )
  }
  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
        isOccupied
          ? 'bg-green-100 text-green-700'
          : 'bg-slate-100 text-slate-500'
      }`}
    >
      {isOccupied ? 'Ocupado' : 'Libre'}
    </span>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
    </div>
  )
}

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in">
      {message}
    </div>
  )
}

// --------------- Main Page ---------------

export default function ConserjePage() {
  const [authed, setAuthed] = useState(false)
  const [tab, setTab] = useState<Tab>('deptos')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === 'true') {
      setAuthed(true)
    }
    setReady(true)
  }, [])

  if (!ready) return null

  if (!authed) {
    return <PinLogin onSuccess={() => setAuthed(true)} />
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 h-14 flex items-center justify-between">
        <h1 className="font-bold text-slate-900 text-base">
          Conserje · ALM809P
        </h1>
        <button
          onClick={() => {
            sessionStorage.removeItem(SESSION_KEY)
            setAuthed(false)
          }}
          className="text-slate-400 active:text-slate-600 p-2 -mr-2"
          aria-label="Cerrar sesión"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Content */}
      <main className="p-4 max-w-lg mx-auto">
        {tab === 'deptos' && <TabDeptos />}
        {tab === 'incidencias' && <TabIncidencias />}
        {tab === 'cobros' && <TabCobros />}
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex h-16 safe-area-bottom">
        <TabButton
          icon={<Home className="w-5 h-5" />}
          label="Deptos"
          active={tab === 'deptos'}
          onClick={() => setTab('deptos')}
        />
        <TabButton
          icon={<Wrench className="w-5 h-5" />}
          label="Incidencias"
          active={tab === 'incidencias'}
          onClick={() => setTab('incidencias')}
        />
        <TabButton
          icon={<DollarSign className="w-5 h-5" />}
          label="Cobros"
          active={tab === 'cobros'}
          onClick={() => setTab('cobros')}
        />
      </nav>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translate(-50%, -8px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        .safe-area-bottom {
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
      `}</style>
    </div>
  )
}

function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
        active ? 'text-blue-600' : 'text-slate-400 active:text-slate-600'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}
