'use client'

import { useEffect, useState, useMemo } from 'react'
import { Plus, Users, Search, Pencil, Trash2, X, Save, Phone, Mail, CalendarDays, FileText, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import { formatDate } from '@/lib/utils'
import { SkeletonTable } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import type { ContactType, Reservation, Contract } from '@/types'

interface Contact {
  id: string
  org_id: string
  name: string
  phone?: string
  email?: string
  type?: ContactType
  notes?: string
  rfc?: string
  razon_social?: string
  regimen_fiscal?: string
  cp_fiscal?: string
  email_factura?: string
  requiere_factura?: boolean
  created_at: string
  updated_at: string
  reservation_count?: number
  last_reservation?: string
}

const ORG_ID = 'ed4308c7-2bdb-46f2-be69-7c59674838e2'

const TYPE_LABELS: Record<string, string> = {
  ltr: 'LTR',
  str: 'STR',
  both: 'Ambos',
}

const TYPE_BADGE: Record<string, string> = {
  ltr: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  str: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  both: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
}

export default function ContactsPage() {
  const toast = useToast()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [saving, setSaving] = useState(false)

  // Add / Edit form
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    type: 'both' as ContactType,
    notes: '',
    rfc: '',
    razon_social: '',
    regimen_fiscal: '',
    cp_fiscal: '',
    email_factura: '',
    requiere_factura: false,
  })
  const [showFiscal, setShowFiscal] = useState(false)

  // Detail view data
  const [contactReservations, setContactReservations] = useState<Reservation[]>([])
  const [contactContracts, setContactContracts] = useState<Contract[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  // ─── Fetch contacts ──────────────────────────────────────────────
  async function fetchContacts() {
    setLoading(true)
    const { data } = await supabase
      .from('occupants')
      .select('*')
      .eq('org_id', ORG_ID)
      .order('name')

    // Enrich with reservation counts
    const { data: reservations } = await supabase
      .from('reservations')
      .select('guest_name, guest_email, check_in')
      .eq('organization_id', ORG_ID)
      .order('check_in', { ascending: false })

    const enriched = (data || []).map((c) => {
      const matching = (reservations || []).filter(
        (r) => r.guest_name === c.name || (c.email && r.guest_email === c.email)
      )
      return {
        ...c,
        reservation_count: matching.length,
        last_reservation: matching[0]?.check_in || null,
      } as Contact
    })

    setContacts(enriched)
    setLoading(false)
  }

  useEffect(() => {
    fetchContacts()
  }, [])

  // ─── Filtered contacts ───────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return contacts
    const q = searchQuery.toLowerCase()
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
    )
  }, [contacts, searchQuery])

  // ─── Add contact ─────────────────────────────────────────────────
  function openAdd() {
    setForm({ name: '', phone: '', email: '', type: 'both', notes: '', rfc: '', razon_social: '', regimen_fiscal: '', cp_fiscal: '', email_factura: '', requiere_factura: false })
    setShowFiscal(false)
    setShowAddModal(true)
  }

  async function handleAdd() {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('occupants').insert({
      org_id: ORG_ID,
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      type: form.type,
      notes: form.notes || null,
      rfc: form.rfc || null,
      razon_social: form.razon_social || null,
      regimen_fiscal: form.regimen_fiscal || null,
      cp_fiscal: form.cp_fiscal || null,
      email_factura: form.email_factura || null,
      requiere_factura: form.requiere_factura,
    })
    setShowAddModal(false)
    setSaving(false)
    fetchContacts()
  }

  // ─── Edit contact ────────────────────────────────────────────────
  function openEdit(contact: Contact) {
    setEditingContact(contact)
    setForm({
      name: contact.name,
      phone: contact.phone || '',
      email: contact.email || '',
      type: (contact.type as ContactType) || 'both',
      notes: contact.notes || '',
      rfc: contact.rfc || '',
      razon_social: contact.razon_social || '',
      regimen_fiscal: contact.regimen_fiscal || '',
      cp_fiscal: contact.cp_fiscal || '',
      email_factura: contact.email_factura || '',
      requiere_factura: contact.requiere_factura || false,
    })
    setShowFiscal(!!(contact.rfc || contact.razon_social || contact.requiere_factura))
  }

  async function handleSaveEdit() {
    if (!editingContact || !form.name.trim()) return
    setSaving(true)
    await supabase
      .from('occupants')
      .update({
        name: form.name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        type: form.type,
        notes: form.notes || null,
        rfc: form.rfc || null,
        razon_social: form.razon_social || null,
        regimen_fiscal: form.regimen_fiscal || null,
        cp_fiscal: form.cp_fiscal || null,
        email_factura: form.email_factura || null,
        requiere_factura: form.requiere_factura,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingContact.id)
    setEditingContact(null)
    setSaving(false)
    fetchContacts()
  }

  // ─── Delete contact ──────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const res = await fetch(`/api/contacts?id=${deleteTarget.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) {
        toast.error('Error al eliminar contacto — intenta de nuevo')
      } else {
        toast.success('Contacto eliminado')
      }
    } catch {
      toast.error('Error al eliminar contacto — intenta de nuevo')
    }
    setDeleteTarget(null)
    setSaving(false)
    if (selectedContact?.id === deleteTarget.id) setSelectedContact(null)
    fetchContacts()
  }

  // ─── Contact detail ──────────────────────────────────────────────
  async function openDetail(contact: Contact) {
    setSelectedContact(contact)
    setLoadingDetail(true)

    const [resResult, conResult] = await Promise.all([
      supabase
        .from('reservations')
        .select('*, unit:units(*)')
        .eq('organization_id', ORG_ID)
        .or(`guest_name.eq.${contact.name}${contact.email ? `,guest_email.eq.${contact.email}` : ''}`)
        .order('check_in', { ascending: false }),
      supabase
        .from('contracts')
        .select('*, unit:units(number, floor, type)')
        .eq('occupant_id', contact.id)
        .order('start_date', { ascending: false }),
    ])

    setContactReservations(resResult.data || [])
    setContactContracts(conResult.data || [])
    setLoadingDetail(false)
  }

  // ─── Form modal (shared for add/edit) ────────────────────────────
  function renderFormModal(title: string, onSave: () => void, onClose: () => void) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="card w-full max-w-lg mx-4 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{title}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Nombre *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nombre completo"
                className="input-field w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+52 442..."
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@ejemplo.com"
                  className="input-field w-full"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as ContactType })}
                className="input-field w-full"
              >
                <option value="ltr">LTR (Largo plazo)</option>
                <option value="str">STR (Corto plazo)</option>
                <option value="both">Ambos</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Notas</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="input-field w-full"
                rows={3}
                placeholder="Notas adicionales..."
              />
            </div>

            {/* Datos Fiscales — collapsible */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowFiscal(!showFiscal)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <span>Datos Fiscales</span>
                {showFiscal ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showFiscal && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">RFC</label>
                      <input
                        type="text"
                        value={form.rfc}
                        onChange={(e) => setForm({ ...form, rfc: e.target.value })}
                        placeholder="XAXX010101000"
                        className="input-field w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">CP fiscal</label>
                      <input
                        type="text"
                        value={form.cp_fiscal}
                        onChange={(e) => setForm({ ...form, cp_fiscal: e.target.value })}
                        placeholder="76000"
                        className="input-field w-full"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Razón social</label>
                    <input
                      type="text"
                      value={form.razon_social}
                      onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
                      placeholder="Nombre o razón social"
                      className="input-field w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Régimen fiscal</label>
                    <input
                      type="text"
                      value={form.regimen_fiscal}
                      onChange={(e) => setForm({ ...form, regimen_fiscal: e.target.value })}
                      placeholder="601 - General Ley PM"
                      className="input-field w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Email factura</label>
                    <input
                      type="email"
                      value={form.email_factura}
                      onChange={(e) => setForm({ ...form, email_factura: e.target.value })}
                      placeholder="facturacion@ejemplo.com"
                      className="input-field w-full"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.requiere_factura}
                      onChange={(e) => setForm({ ...form, requiere_factura: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">¿Requiere factura?</span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={onSave}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Detail view ─────────────────────────────────────────────────
  if (selectedContact) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedContact(null)}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver a contactos
        </button>

        <div className="card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {selectedContact.name}
                </h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[selectedContact.type || 'both']}`}>
                  {TYPE_LABELS[selectedContact.type || 'both']}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                {selectedContact.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    {selectedContact.phone}
                  </span>
                )}
                {selectedContact.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    {selectedContact.email}
                  </span>
                )}
              </div>
              {selectedContact.notes && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedContact.notes}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => openEdit(selectedContact)}
                title="Editar contacto"
                className="p-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeleteTarget(selectedContact)}
                title="Eliminar contacto"
                className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {loadingDetail ? (
          <div className="text-gray-400 dark:text-gray-500">Cargando historial...</div>
        ) : (
          <>
            {/* Reservations */}
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                <CalendarDays className="w-5 h-5 text-indigo-400" />
                Reservaciones ({contactReservations.length})
              </h2>
              {contactReservations.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Sin reservaciones registradas</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="pb-2 pr-3 font-medium">Unidad</th>
                        <th className="pb-2 pr-3 font-medium">Fechas</th>
                        <th className="pb-2 pr-3 font-medium">Modo</th>
                        <th className="pb-2 pr-3 font-medium">Estado</th>
                        <th className="pb-2 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {contactReservations.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">
                            {(r.unit as { number: string } | undefined)?.number || '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">
                            {formatDate(r.check_in)} → {formatDate(r.check_out)}
                          </td>
                          <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300 capitalize">{r.mode}</td>
                          <td className="py-2.5 pr-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              r.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                              r.status === 'cancelled' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                              'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-medium text-gray-900 dark:text-white">
                            ${r.total_price?.toLocaleString() || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Contracts */}
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-indigo-400" />
                Contratos ({contactContracts.length})
              </h2>
              {contactContracts.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Sin contratos registrados</p>
              ) : (
                <div className="space-y-3">
                  {contactContracts.map((c) => (
                    <div key={c.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          Unidad {(c.unit as { number: string } | undefined)?.number || '—'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(c.start_date)} — {c.end_date ? formatDate(c.end_date) : 'Indefinido'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          c.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          c.status === 'expired' ? 'bg-gray-500/10 text-gray-400 border border-gray-500/20' :
                          'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                        }`}>
                          {c.status}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          ${c.monthly_amount?.toLocaleString()}/mes
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Edit modal from detail view */}
        {editingContact && renderFormModal(
          `Editar contacto — ${editingContact.name}`,
          handleSaveEdit,
          () => setEditingContact(null)
        )}

        {/* Delete confirmation from detail view */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="card w-full max-w-md mx-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Eliminar contacto</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                ¿Eliminar a <strong className="text-gray-900 dark:text-white">{deleteTarget.name}</strong>? Esta acción no se puede deshacer.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Main list view ──────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Contactos</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {contacts.length} contacto(s) en directorio
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nuevo contacto
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por nombre, teléfono o email..."
          className="input-field pl-10"
        />
      </div>

      {loading ? (
        <SkeletonTable />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={searchQuery ? 'No se encontraron contactos' : 'No hay contactos registrados'}
          description={searchQuery ? `Sin resultados para "${searchQuery}"` : 'Agrega inquilinos, proveedores o staff'}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((contact) => (
            <div
              key={contact.id}
              className="card hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <button
                  onClick={() => openDetail(contact)}
                  className="space-y-2 min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      {contact.name}
                    </h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[contact.type || 'both']}`}>
                      {TYPE_LABELS[contact.type || 'both']}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                    {contact.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />
                        {contact.phone}
                      </span>
                    )}
                    {contact.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        {contact.email}
                      </span>
                    )}
                    {(contact.reservation_count ?? 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {contact.reservation_count} estancia(s)
                      </span>
                    )}
                    {contact.last_reservation && (
                      <span>Última: {formatDate(contact.last_reservation)}</span>
                    )}
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(contact)}
                    title="Editar contacto"
                    className="p-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(contact)}
                    title="Eliminar contacto"
                    className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && renderFormModal(
        'Nuevo contacto',
        handleAdd,
        () => setShowAddModal(false)
      )}

      {/* Edit Modal */}
      {editingContact && renderFormModal(
        `Editar contacto — ${editingContact.name}`,
        handleSaveEdit,
        () => setEditingContact(null)
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Eliminar contacto</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              ¿Eliminar a <strong className="text-gray-900 dark:text-white">{deleteTarget.name}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
