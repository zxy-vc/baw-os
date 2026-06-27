'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useActiveContext } from '@/lib/useActiveContext'
import { useToast } from '@/components/Toast'
import Breadcrumbs from '@/components/Breadcrumbs'
import PersonPicker, { type PickedPerson } from '@/components/PersonPicker'
import type { Unit } from '@/types'
import Link from 'next/link'

export default function NewContractPage() {
  const router = useRouter()
  const { activeOrgId } = useActiveContext()
  const toast = useToast()
  const [units, setUnits] = useState<Unit[]>([])
  const [tenant, setTenant] = useState<PickedPerson | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    unit_id: '',
    start_date: '',
    end_date: '',
    monthly_amount: '',
    deposit_amount: '',
    deposit_paid: false,
    payment_day: '1',
    rent_type: 'LTR' as 'LTR' | 'MTR' | 'STR',
    notes: '',
    drive_folder_url: '',
  })

  useEffect(() => {
    supabase
      .from('units')
      .select('*')
      .order('number')
      .then(({ data }) => setUnits(data || []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // El contrato (y el inquilino) pertenecen a la misma org que la unidad
    // seleccionada; respaldo a la org activa del switcher.
    const selectedUnit = units.find((u) => u.id === form.unit_id)
    const orgId = selectedUnit?.org_id ?? activeOrgId
    if (!orgId) {
      toast.error('No se pudo resolver tu organización; recarga la página e intenta de nuevo')
      return
    }
    if (!tenant) {
      toast.error('Selecciona o crea un inquilino')
      return
    }
    setSaving(true)

    const { error } = await supabase.from('contracts').insert({
      org_id: orgId,
      unit_id: form.unit_id,
      occupant_id: tenant.id,
      start_date: form.start_date,
      end_date: form.end_date || null,
      monthly_amount: Number(form.monthly_amount),
      deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : null,
      deposit_paid: form.deposit_paid,
      payment_day: Number(form.payment_day),
      rent_type: form.rent_type,
      status: 'active',
      notes: form.notes || null,
      drive_folder_url: form.drive_folder_url || null,
    })

    if (error) {
      setSaving(false)
      toast.error(`Error al crear el contrato: ${error.message}`)
      return
    }

    await supabase.from('units').update({ status: 'occupied' }).eq('id', form.unit_id)
    toast.success('Contrato creado')
    router.push('/contracts')
    setSaving(false)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Contratos', href: '/contracts' },
        { label: 'Nuevo contrato' },
      ]} />
      <div className="flex items-center gap-4">
        <Link
          href="/contracts"
          className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Nuevo contrato</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Registrar contrato LTR / MTR</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Unidad</label>
          <select
            required
            value={form.unit_id}
            onChange={(e) => {
              const unit = units.find((u) => u.id === e.target.value)
              const inferred = unit && ['LTR', 'MTR', 'STR'].includes(unit.type) ? (unit.type as 'LTR' | 'MTR' | 'STR') : form.rent_type
              setForm({ ...form, unit_id: e.target.value, rent_type: inferred })
            }}
            className="input-field"
          >
            <option value="">Seleccionar unidad...</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.number} — Piso {u.floor} ({u.type}) — {u.status === 'available' ? 'Disponible' : u.status}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Tipo de renta</label>
          <select
            value={form.rent_type}
            onChange={(e) => setForm({ ...form, rent_type: e.target.value as 'LTR' | 'MTR' | 'STR' })}
            className="input-field"
          >
            <option value="LTR">Larga (LTR) — renta mensual</option>
            <option value="MTR">Media (MTR) — renta mensual</option>
            <option value="STR">Corta (STR) — se cobra por reserva</option>
          </select>
          {form.rent_type === 'STR' && (
            <p className="text-xs text-amber-500 mt-1">La renta corta no genera cobro mensual automático; se factura por reserva.</p>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Inquilino</label>
          <PersonPicker
            orgId={activeOrgId}
            value={tenant}
            onChange={setTenant}
            newType={form.rent_type === 'STR' ? 'str' : 'ltr'}
            placeholder="Buscar inquilino por nombre, teléfono o email…"
          />
          <p className="mt-1 text-xs text-gray-400">
            Busca primero; si no existe, créalo desde aquí (se agrega al directorio y al CRM).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Fecha inicio</label>
            <input
              type="date"
              required
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Fecha fin</label>
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className="input-field"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Renta mensual</label>
            <input
              type="number"
              required
              step="0.01"
              value={form.monthly_amount}
              onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })}
              className="input-field"
              placeholder="$0.00"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Depósito</label>
            <input
              type="number"
              step="0.01"
              value={form.deposit_amount}
              onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })}
              className="input-field"
              placeholder="$0.00"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Día de pago</label>
            <input
              type="number"
              min="1"
              max="31"
              value={form.payment_day}
              onChange={(e) => setForm({ ...form, payment_day: e.target.value })}
              className="input-field"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="deposit_paid"
            checked={form.deposit_paid}
            onChange={(e) => setForm({ ...form, deposit_paid: e.target.checked })}
            className="rounded border-gray-300 bg-gray-100 text-indigo-600 dark:border-gray-700 dark:bg-gray-800"
          />
          <label htmlFor="deposit_paid" className="text-sm text-gray-500 dark:text-gray-400">
            Depósito pagado
          </label>
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Link carpeta Drive (opcional)</label>
          <input
            type="url"
            value={form.drive_folder_url}
            onChange={(e) => setForm({ ...form, drive_folder_url: e.target.value })}
            className="input-field"
            placeholder="https://drive.google.com/drive/folders/..."
          />
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Notas</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="input-field"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/contracts"
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Guardando...' : 'Crear contrato'}
          </button>
        </div>
      </form>
    </div>
  )
}
