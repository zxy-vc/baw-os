'use client'

// BaW OS — CRM de clientes (v1).
// Directorio unificado de clientes (los que ya rentaron) y leads fríos, con
// historial de rentas por cliente y oportunidades de recompra/migración de
// producto. El producto es texto libre: cubre residencial (larga/media/corta)
// y activos especiales (espectacular, agropecuario, estacionamiento, etc.).

import { useEffect, useState, useCallback } from 'react'
import { Users, Plus, X, Phone, Mail, Download, Search, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrgContext } from '@/hooks/useOrgContext'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import { CRM_PRODUCT_OPTIONS } from '@/types'
import type { CrmContact, CrmOpportunity, CrmStatus, CrmSource, CrmOppStage, CrmOppKind } from '@/types'

const STATUS_META: Record<CrmStatus, { label: string; cls: string }> = {
  nuevo: { label: 'Nuevo', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  contactado: { label: 'Contactado', cls: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  activo: { label: 'Activo', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  inactivo: { label: 'Inactivo', cls: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
  en_seguimiento: { label: 'En seguimiento', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  recompro: { label: 'Recompró', cls: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  descartado: { label: 'Descartado', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
}
const STATUS_ORDER: CrmStatus[] = ['nuevo', 'contactado', 'activo', 'inactivo', 'en_seguimiento', 'recompro', 'descartado']
const SOURCE_OPTIONS: CrmSource[] = ['llamada', 'whatsapp', 'referido', 'portal', 'anuncio', 'manual', 'otro']

const STAGE_META: Record<CrmOppStage, { label: string }> = {
  identificado: { label: 'Identificado' },
  contactado: { label: 'Contactado' },
  interesado: { label: 'Interesado' },
  negociacion: { label: 'Negociación' },
  ganado: { label: 'Ganado' },
  perdido: { label: 'Perdido' },
}
const STAGE_ORDER: CrmOppStage[] = ['identificado', 'contactado', 'interesado', 'negociacion', 'ganado', 'perdido']

interface RentalRow {
  id: string
  start_date: string
  end_date: string | null
  monthly_amount: number
  status: string
  rent_type: string | null
  unit: { number: string } | null
}

export default function ClientesPage() {
  const { orgId, loading: orgLoading } = useOrgContext()
  const toast = useToast()

  const [tab, setTab] = useState<'directorio' | 'recompra'>('directorio')
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [opps, setOpps] = useState<CrmOpportunity[]>([])
  const [loading, setLoading] = useState(true)

  const [typeFilter, setTypeFilter] = useState<'todos' | 'clientes' | 'leads'>('todos')
  const [statusFilter, setStatusFilter] = useState<CrmStatus | 'all'>('all')
  const [q, setQ] = useState('')

  const [selected, setSelected] = useState<CrmContact | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [importing, setImporting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [contactsRes, oppsRes] = await Promise.all([
      supabase.from('crm_contacts').select('*').eq('org_id', orgId).order('updated_at', { ascending: false }),
      supabase.from('crm_opportunities').select('*').eq('org_id', orgId).order('updated_at', { ascending: false }),
    ])
    setContacts((contactsRes.data as CrmContact[]) || [])
    setOpps((oppsRes.data as CrmOpportunity[]) || [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    fetchData()
  }, [orgId, fetchData])

  // Importa inquilinos (occupants) que aún no están en el CRM como clientes.
  async function importOccupants() {
    if (!orgId) return
    setImporting(true)
    const [occRes, existingRes] = await Promise.all([
      supabase.from('occupants').select('id, name, phone, email').eq('org_id', orgId),
      supabase.from('crm_contacts').select('occupant_id').eq('org_id', orgId).not('occupant_id', 'is', null),
    ])
    const existing = new Set(((existingRes.data as { occupant_id: string }[]) || []).map((r) => r.occupant_id))
    const occupants = ((occRes.data as { id: string; name: string; phone: string | null; email: string | null }[]) || [])
      .filter((o) => !existing.has(o.id))
    if (occupants.length === 0) {
      setImporting(false)
      toast.success('No hay inquilinos nuevos por importar')
      return
    }
    const rows = occupants.map((o) => ({
      org_id: orgId,
      occupant_id: o.id,
      name: o.name,
      phone: o.phone,
      email: o.email,
      source: 'manual' as CrmSource,
      is_client: true,
      status: 'activo' as CrmStatus,
    }))
    const { error } = await supabase.from('crm_contacts').insert(rows)
    setImporting(false)
    if (error) {
      toast.error('Error al importar inquilinos')
    } else {
      toast.success(`${rows.length} inquilino(s) importados como clientes`)
      fetchData()
    }
  }

  const filtered = contacts.filter((c) => {
    if (typeFilter === 'clientes' && !c.is_client) return false
    if (typeFilter === 'leads' && c.is_client) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (q.trim()) {
      const needle = q.toLowerCase()
      const hay = [c.name, c.phone, c.email, c.interest_product].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })

  const clientCount = contacts.filter((c) => c.is_client).length
  const leadCount = contacts.length - clientCount

  if (orgLoading || (loading && contacts.length === 0)) {
    return (
      <div className="p-6">
        <SkeletonTable />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-indigo-500" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">CRM</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {clientCount} clientes · {leadCount} leads · {opps.length} oportunidades
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={importOccupants}
            disabled={importing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {importing ? 'Importando…' : 'Importar inquilinos'}
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo contacto
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-800">
        {(['directorio', 'recompra'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === t
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t === 'directorio' ? 'Directorio' : 'Recompra'}
          </button>
        ))}
      </div>

      {tab === 'directorio' ? (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar nombre, teléfono, email…"
                className="input-field w-full pl-9"
              />
            </div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className="input-field">
              <option value="todos">Todos</option>
              <option value="clientes">Clientes</option>
              <option value="leads">Leads</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as CrmStatus | 'all')} className="input-field">
              <option value="all">Todos los estados</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Sin contactos"
              description="Registra un contacto nuevo o importa a tus inquilinos para empezar tu CRM."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Nombre</th>
                    <th className="px-4 py-3 text-left font-medium">Contacto</th>
                    <th className="px-4 py-3 text-left font-medium">Producto</th>
                    <th className="px-4 py-3 text-center font-medium">Estado</th>
                    <th className="px-4 py-3 text-left font-medium">Próx. seguimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelected(c)}
                      className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {c.name}
                        {!c.is_client && <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">lead</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        <div className="flex flex-col gap-0.5">
                          {c.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                          {c.email && <span className="inline-flex items-center gap-1 text-xs text-gray-400"><Mail className="w-3 h-3" />{c.email}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.interest_product || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_META[c.status].cls}`}>
                          {STATUS_META[c.status].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.next_followup_at || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <RecompraBoard opps={opps} contacts={contacts} onOpen={(c) => setSelected(c)} />
      )}

      {/* Drawer de detalle */}
      {selected && (
        <ContactDrawer
          contact={selected}
          opps={opps.filter((o) => o.contact_id === selected.id)}
          orgId={orgId!}
          onClose={() => setSelected(null)}
          onChanged={() => {
            fetchData()
          }}
          onContactUpdated={(c) => setSelected(c)}
        />
      )}

      {/* Modal nuevo contacto */}
      {showNew && orgId && (
        <NewContactModal
          orgId={orgId}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

// ── Tablero de recompra (oportunidades por etapa) ───────────────────────────
function RecompraBoard({
  opps,
  contacts,
  onOpen,
}: {
  opps: CrmOpportunity[]
  contacts: CrmContact[]
  onOpen: (c: CrmContact) => void
}) {
  const byId = new Map(contacts.map((c) => [c.id, c]))
  const open = opps.filter((o) => o.stage !== 'ganado' && o.stage !== 'perdido')
  const board = STAGE_ORDER.filter((s) => s !== 'perdido')

  if (opps.length === 0) {
    return (
      <EmptyState
        icon={ArrowRight}
        title="Sin oportunidades"
        description="Abre una oportunidad de recompra o migración desde la ficha de un cliente."
      />
    )
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {board.map((stage) => {
        const items = open.filter((o) => o.stage === stage)
        return (
          <div key={stage} className="min-w-[220px] flex-1">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 px-1 flex items-center justify-between">
              <span>{STAGE_META[stage].label}</span>
              <span className="text-gray-400">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((o) => {
                const c = byId.get(o.contact_id)
                return (
                  <button
                    key={o.id}
                    onClick={() => c && onOpen(c)}
                    className="w-full text-left card p-3 hover:border-indigo-500/50 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{c?.name || 'Cliente'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {o.kind === 'recompra' ? 'Recompra' : o.kind === 'migracion' ? 'Migración' : 'Nueva'}
                      {o.target_product ? ` · ${o.target_product}` : ''}
                    </p>
                    {o.est_monthly ? (
                      <p className="text-xs text-gray-400 mt-1">{formatCurrency(o.est_monthly)}/mes</p>
                    ) : null}
                  </button>
                )
              })}
              {items.length === 0 && <p className="text-xs text-gray-400 px-1">—</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Drawer de detalle del contacto ──────────────────────────────────────────
function ContactDrawer({
  contact,
  opps,
  orgId,
  onClose,
  onChanged,
  onContactUpdated,
}: {
  contact: CrmContact
  opps: CrmOpportunity[]
  orgId: string
  onClose: () => void
  onChanged: () => void
  onContactUpdated: (c: CrmContact) => void
}) {
  const toast = useToast()
  const [rentals, setRentals] = useState<RentalRow[]>([])
  const [showNewOpp, setShowNewOpp] = useState(false)
  const [form, setForm] = useState({
    status: contact.status,
    owner: contact.owner || '',
    next_followup_at: contact.next_followup_at || '',
    interest_product: contact.interest_product || '',
    notes: contact.notes || '',
  })

  useEffect(() => {
    setForm({
      status: contact.status,
      owner: contact.owner || '',
      next_followup_at: contact.next_followup_at || '',
      interest_product: contact.interest_product || '',
      notes: contact.notes || '',
    })
  }, [contact])

  useEffect(() => {
    if (!contact.occupant_id) {
      setRentals([])
      return
    }
    supabase
      .from('contracts')
      .select('id, start_date, end_date, monthly_amount, status, rent_type, unit:units(number)')
      .eq('occupant_id', contact.occupant_id)
      .eq('org_id', orgId)
      .order('start_date', { ascending: false })
      .then(({ data }) => setRentals((data as unknown as RentalRow[]) || []))
  }, [contact.occupant_id, orgId])

  async function saveContact() {
    const { data, error } = await supabase
      .from('crm_contacts')
      .update({
        status: form.status,
        owner: form.owner || null,
        next_followup_at: form.next_followup_at || null,
        interest_product: form.interest_product || null,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id)
      .select()
      .single()
    if (error) {
      toast.error('Error al guardar')
    } else {
      toast.success('Contacto actualizado')
      if (data) onContactUpdated(data as CrmContact)
      onChanged()
    }
  }

  async function advanceOpp(opp: CrmOpportunity, stage: CrmOppStage) {
    const closed = stage === 'ganado' || stage === 'perdido'
    const { error } = await supabase
      .from('crm_opportunities')
      .update({
        stage,
        closed_at: closed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opp.id)
    if (error) toast.error('Error al mover la etapa')
    else {
      toast.success(`Oportunidad → ${STAGE_META[stage].label}`)
      onChanged()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-white dark:bg-gray-900 overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{contact.name}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {contact.is_client ? 'Cliente' : 'Lead'} · {contact.source}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Contacto */}
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
            {contact.phone && <p className="inline-flex items-center gap-2"><Phone className="w-4 h-4" />{contact.phone}</p>}
            {contact.email && <p className="inline-flex items-center gap-2"><Mail className="w-4 h-4" />{contact.email}</p>}
          </div>

          {/* Edición */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Estado</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CrmStatus })} className="input-field w-full">
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Producto de interés</label>
              <input list="crm-products" value={form.interest_product} onChange={(e) => setForm({ ...form, interest_product: e.target.value })} className="input-field w-full" placeholder="Residencial larga, Agropecuario…" />
              <datalist id="crm-products">
                {CRM_PRODUCT_OPTIONS.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Responsable</label>
                <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Próx. seguimiento</label>
                <input type="date" value={form.next_followup_at} onChange={(e) => setForm({ ...form, next_followup_at: e.target.value })} className="input-field w-full" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Notas</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="input-field w-full" />
            </div>
            <button onClick={saveContact} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
              Guardar
            </button>
          </div>

          {/* Historial de rentas */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Historial de rentas</h3>
            {rentals.length === 0 ? (
              <p className="text-xs text-gray-400">
                {contact.occupant_id ? 'Sin contratos registrados.' : 'Contacto no ligado a un inquilino del sistema.'}
              </p>
            ) : (
              <div className="space-y-2">
                {rentals.map((r) => (
                  <div key={r.id} className="text-xs border border-gray-200 dark:border-gray-800 rounded-lg p-2">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700 dark:text-gray-200">
                        {r.unit?.number ? `Unidad ${r.unit.number}` : 'Contrato'} · {r.rent_type || '—'}
                      </span>
                      <span className="text-gray-500">{formatCurrency(r.monthly_amount)}/mes</span>
                    </div>
                    <div className="text-gray-400 mt-0.5">
                      {r.start_date}{r.end_date ? ` → ${r.end_date}` : ' → vigente'} · {r.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Oportunidades */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Oportunidades</h3>
              <button onClick={() => setShowNewOpp(true)} className="text-xs text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1">
                <Plus className="w-3 h-3" /> Nueva
              </button>
            </div>
            {opps.length === 0 ? (
              <p className="text-xs text-gray-400">Sin oportunidades.</p>
            ) : (
              <div className="space-y-2">
                {opps.map((o) => (
                  <div key={o.id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {o.kind === 'recompra' ? 'Recompra' : o.kind === 'migracion' ? 'Migración' : 'Nueva'}
                        {o.target_product ? ` · ${o.target_product}` : ''}
                      </span>
                      {o.est_monthly ? <span className="text-xs text-gray-400">{formatCurrency(o.est_monthly)}/mes</span> : null}
                    </div>
                    <div className="mt-2">
                      <select
                        value={o.stage}
                        onChange={(e) => advanceOpp(o, e.target.value as CrmOppStage)}
                        className="input-field w-full text-xs py-1"
                      >
                        {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showNewOpp && (
        <NewOppModal
          orgId={orgId}
          contactId={contact.id}
          defaultProduct={contact.interest_product || ''}
          onClose={() => setShowNewOpp(false)}
          onCreated={() => {
            setShowNewOpp(false)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

// ── Modal nuevo contacto ────────────────────────────────────────────────────
function NewContactModal({ orgId, onClose, onCreated }: { orgId: string; onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState({
    name: '',
    phone: '',
    email: '',
    source: 'llamada' as CrmSource,
    is_client: false,
    interest_product: '',
    owner: '',
    next_followup_at: '',
    notes: '',
  })

  async function save() {
    if (!f.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('crm_contacts').insert({
      org_id: orgId,
      name: f.name.trim(),
      phone: f.phone || null,
      email: f.email || null,
      source: f.source,
      is_client: f.is_client,
      status: f.is_client ? 'activo' : 'nuevo',
      interest_product: f.interest_product || null,
      owner: f.owner || null,
      next_followup_at: f.next_followup_at || null,
      notes: f.notes || null,
    })
    setSaving(false)
    if (error) toast.error('Error al guardar')
    else {
      toast.success('Contacto creado')
      onCreated()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-md relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"><X className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Nuevo contacto</h2>
        <div className="space-y-3">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="input-field w-full" placeholder="Nombre *" />
          <div className="grid grid-cols-2 gap-3">
            <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="input-field w-full" placeholder="Teléfono" />
            <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="input-field w-full" placeholder="Email" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fuente</label>
              <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as CrmSource })} className="input-field w-full capitalize">
                {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Producto</label>
              <input list="crm-products-new" value={f.interest_product} onChange={(e) => setF({ ...f, interest_product: e.target.value })} className="input-field w-full" placeholder="Residencial, Agropecuario…" />
              <datalist id="crm-products-new">
                {CRM_PRODUCT_OPTIONS.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={f.is_client} onChange={(e) => setF({ ...f, is_client: e.target.checked })} className="rounded border-gray-300" />
            Ya es cliente (rentó antes)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} className="input-field w-full" placeholder="Responsable" />
            <input type="date" value={f.next_followup_at} onChange={(e) => setF({ ...f, next_followup_at: e.target.value })} className="input-field w-full" />
          </div>
          <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} className="input-field w-full" placeholder="Notas" />
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancelar</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {saving ? 'Guardando…' : 'Crear'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal nueva oportunidad ─────────────────────────────────────────────────
function NewOppModal({
  orgId,
  contactId,
  defaultProduct,
  onClose,
  onCreated,
}: {
  orgId: string
  contactId: string
  defaultProduct: string
  onClose: () => void
  onCreated: () => void
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState({
    kind: 'recompra' as CrmOppKind,
    target_product: defaultProduct,
    est_monthly: '',
    next_followup_at: '',
    notes: '',
  })

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('crm_opportunities').insert({
      org_id: orgId,
      contact_id: contactId,
      kind: f.kind,
      target_product: f.target_product || null,
      est_monthly: f.est_monthly ? Number(f.est_monthly) : null,
      stage: 'identificado',
      next_followup_at: f.next_followup_at || null,
      notes: f.notes || null,
    })
    setSaving(false)
    if (error) toast.error('Error al crear oportunidad')
    else {
      toast.success('Oportunidad creada')
      onCreated()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-sm relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"><X className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Nueva oportunidad</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as CrmOppKind })} className="input-field w-full">
              <option value="recompra">Recompra</option>
              <option value="migracion">Migración de producto</option>
              <option value="nueva">Nueva renta</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Producto objetivo</label>
            <input list="crm-products-opp" value={f.target_product} onChange={(e) => setF({ ...f, target_product: e.target.value })} className="input-field w-full" placeholder="Residencial media, Espectacular…" />
            <datalist id="crm-products-opp">
              {CRM_PRODUCT_OPTIONS.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={f.est_monthly} onChange={(e) => setF({ ...f, est_monthly: e.target.value })} type="number" className="input-field w-full" placeholder="Renta est./mes" />
            <input type="date" value={f.next_followup_at} onChange={(e) => setF({ ...f, next_followup_at: e.target.value })} className="input-field w-full" />
          </div>
          <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} className="input-field w-full" placeholder="Notas" />
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancelar</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {saving ? 'Guardando…' : 'Crear'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
