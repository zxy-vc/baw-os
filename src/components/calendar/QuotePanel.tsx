'use client'

// BaW OS — Panel "Cotizar y apartar" (flujo de llamada telefónica).
//
// Se abre al seleccionar entrada→salida en el calendario. Cotiza con el motor
// unificado, busca o crea el CONTACTO CRM (el prospecto NO se vuelve occupant
// aquí — eso pasa al confirmar), crea la reservación tentativa con hold de
// 24-72h + la oportunidad 'cotizado', y arma la propuesta para WhatsApp/correo.

import { useEffect, useMemo, useState } from 'react'
import { X, Search, MessageCircle, Mail, Copy, Check, PhoneCall } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Season, RateOverride } from '@/lib/calendar-occupancy'
import { diffDaysISO } from '@/lib/calendar-occupancy'
import {
  buildQuoteBreakdown,
  buildProposalText,
  createQuote,
  whatsappLink,
  mailtoLink,
  type QuoteUnitInfo,
} from '@/lib/quote-flow'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { CrmTemperature } from '@/types'

interface ContactHit {
  id: string
  name: string
  phone: string | null
  email: string | null
  is_client: boolean
}

const HOLD_OPTIONS = [24, 48, 72]
const TEMP_OPTIONS: Array<{ value: CrmTemperature; label: string }> = [
  { value: 'caliente', label: '🔥 Caliente' },
  { value: 'tibio', label: '🌤 Tibio' },
  { value: 'frio', label: '❄️ Frío' },
]

export default function QuotePanel({
  orgId,
  unit,
  checkIn,
  checkOut,
  seasons,
  onClose,
  onCreated,
}: {
  orgId: string
  unit: QuoteUnitInfo
  checkIn: string
  /** exclusivo (día de salida) */
  checkOut: string
  seasons: Season[]
  onClose: () => void
  onCreated: () => void
}) {
  const [guests, setGuests] = useState(2)
  const [holdHours, setHoldHours] = useState(48)
  const [temperature, setTemperature] = useState<CrmTemperature>('caliente')
  const [overrides, setOverrides] = useState<RateOverride[]>([])

  // Contacto: buscar en CRM o capturar nuevo
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ContactHit[]>([])
  const [picked, setPicked] = useState<ContactHit | null>(null)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ reservationId: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const nights = diffDaysISO(checkIn, checkOut)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Overrides de precio de esta unidad (si la tabla no existe, seguimos sin ellos)
  useEffect(() => {
    let cancelled = false
    supabase
      .from('unit_rate_overrides')
      .select('id, unit_id, start_date, end_date, nightly_rate_mxn, notes')
      .eq('unit_id', unit.id)
      .then(({ data }) => {
        if (!cancelled) setOverrides((data ?? []) as RateOverride[])
      })
    return () => {
      cancelled = true
    }
  }, [unit.id])

  // Búsqueda de contactos CRM (nombre / teléfono / correo)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      supabase
        .from('crm_contacts')
        .select('id, name, phone, email, is_client')
        .eq('org_id', orgId)
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(6)
        .then(({ data }) => {
          if (!cancelled) setHits((data ?? []) as ContactHit[])
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, orgId])

  const breakdown = useMemo(
    () => buildQuoteBreakdown(unit, checkIn, checkOut, guests, seasons, overrides),
    [unit, checkIn, checkOut, guests, seasons, overrides],
  )

  const contactName = picked?.name ?? newName
  const contactPhone = picked?.phone ?? newPhone
  const contactEmail = picked?.email ?? newEmail

  const proposalText = useMemo(
    () =>
      breakdown
        ? buildProposalText({
            contactName: contactName || 'buen día',
            unit,
            checkIn,
            checkOut,
            breakdown,
            holdHours,
          })
        : '',
    [breakdown, contactName, unit, checkIn, checkOut, holdHours],
  )

  async function handleCreate() {
    if (!breakdown) return
    if (!contactName.trim()) {
      setError('Ponle nombre al contacto (o busca uno existente).')
      return
    }
    setSaving(true)
    setError(null)
    const result = await createQuote({
      orgId,
      unit,
      checkIn,
      checkOut,
      breakdown,
      contact: {
        id: picked?.id ?? null,
        name: contactName,
        phone: contactPhone ?? '',
        email: contactEmail ?? '',
      },
      holdHours,
      temperature,
    })
    setSaving(false)
    if (result.error) setError(result.error)
    if (result.reservationId) {
      setCreated({ reservationId: result.reservationId })
      onCreated()
    }
  }

  async function copyProposal() {
    try {
      await navigator.clipboard.writeText(proposalText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('No se pudo copiar — selecciona el texto manualmente.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside
        className="relative h-full w-full max-w-md overflow-y-auto p-5 space-y-4 shadow-2xl"
        style={{ backgroundColor: 'var(--baw-surface)', borderLeft: '1px solid var(--baw-border)' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--baw-text)' }}>
              <PhoneCall className="w-4 h-4 text-indigo-400" />
              Cotizar y apartar
            </h3>
            <p className="text-xs muted-text mt-0.5">
              Unidad {unit.number}
              {unit.buildingName ? ` · ${unit.buildingName}` : ''} · {formatDate(checkIn)} →{' '}
              {formatDate(checkOut)} ({nights} noche{nights === 1 ? '' : 's'})
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Cerrar">
            <X className="w-4 h-4 muted-text" />
          </button>
        </div>

        {created ? (
          /* ── Paso 2: propuesta lista para enviar ── */
          <>
            <div
              className="rounded-lg p-3 text-sm"
              style={{
                color: 'var(--baw-success-fg)',
                backgroundColor: 'var(--baw-success-bg)',
                border: '1px solid var(--baw-success-border)',
              }}
            >
              ✓ Fechas apartadas por {holdHours}h y oportunidad creada en el CRM. Si el cliente no
              confirma, se liberan solas.
            </div>
            <textarea
              readOnly
              value={proposalText}
              rows={12}
              className="input-field w-full text-xs font-mono leading-relaxed"
            />
            <div className="grid grid-cols-3 gap-2">
              <a
                href={whatsappLink(contactPhone, proposalText)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
              <a
                href={mailtoLink(contactEmail, `Cotización · Unidad ${unit.number}`, proposalText)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Mail className="w-4 h-4" /> Correo
              </a>
              <button
                onClick={copyProposal}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                style={{ color: 'var(--baw-text)' }}
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full px-3 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 muted-text"
            >
              Cerrar
            </button>
          </>
        ) : (
          /* ── Paso 1: armar la cotización ── */
          <>
            {/* Desglose */}
            {breakdown ? (
              <div className="rounded-lg p-3 space-y-1 text-sm" style={{ border: '1px solid var(--baw-border)' }}>
                <div className="flex justify-between">
                  <span className="muted-text">
                    Hospedaje ({formatCurrency(breakdown.avgNight)}/noche prom. × {breakdown.nights})
                  </span>
                  <span style={{ color: 'var(--baw-text)' }}>{formatCurrency(breakdown.base)}</span>
                </div>
                {breakdown.extraFee > 0 && (
                  <div className="flex justify-between">
                    <span className="muted-text">
                      Huéspedes extra ({guests - breakdown.includedGuests})
                    </span>
                    <span className="text-amber-500">+{formatCurrency(breakdown.extraFee)}</span>
                  </div>
                )}
                {breakdown.cleaning > 0 && (
                  <div className="flex justify-between">
                    <span className="muted-text">Limpieza</span>
                    <span style={{ color: 'var(--baw-text)' }}>{formatCurrency(breakdown.cleaning)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="muted-text">IVA (16%)</span>
                  <span style={{ color: 'var(--baw-text)' }}>{formatCurrency(breakdown.iva)}</span>
                </div>
                <div className="flex justify-between pt-1 font-semibold" style={{ borderTop: '1px solid var(--baw-border)' }}>
                  <span style={{ color: 'var(--baw-text)' }}>Total</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(breakdown.total)}
                  </span>
                </div>
              </div>
            ) : (
              <p
                className="text-sm rounded-lg p-3"
                style={{
                  color: 'var(--baw-warning-fg)',
                  backgroundColor: 'var(--baw-warning-bg)',
                  border: '1px solid var(--baw-warning-border)',
                }}
              >
                Esta unidad no tiene tarifa por noche configurada — captúrala en Finanzas → Precios
                o fija un precio para el rango desde su calendario.
              </p>
            )}

            {/* Huéspedes + hold + temperatura */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide muted-text mb-1">Huéspedes</p>
                <input
                  type="number"
                  min={1}
                  value={guests}
                  onChange={(e) => setGuests(Math.max(1, Number(e.target.value)))}
                  className="input-field w-full text-sm py-1.5"
                />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide muted-text mb-1">Apartar por</p>
                <select
                  value={holdHours}
                  onChange={(e) => setHoldHours(Number(e.target.value))}
                  className="input-field w-full text-sm py-1.5"
                >
                  {HOLD_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {h} horas
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide muted-text mb-1">Temperatura</p>
                <select
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value as CrmTemperature)}
                  className="input-field w-full text-sm py-1.5"
                >
                  {TEMP_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Contacto CRM */}
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide muted-text">Contacto (CRM)</p>
              {picked ? (
                <div
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid var(--baw-border)' }}
                >
                  <div>
                    <p style={{ color: 'var(--baw-text)' }} className="font-medium">
                      {picked.name} {picked.is_client && <span className="text-[10px] text-emerald-500">cliente</span>}
                    </p>
                    <p className="text-xs muted-text">{picked.phone ?? '—'} · {picked.email ?? '—'}</p>
                  </div>
                  <button onClick={() => setPicked(null)} className="text-xs text-indigo-500 hover:text-indigo-400">
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar contacto por nombre, teléfono o correo…"
                      className="input-field w-full pl-9 text-sm py-1.5"
                    />
                  </div>
                  {hits.length > 0 && (
                    <div className="rounded-lg divide-y divide-gray-100 dark:divide-gray-800" style={{ border: '1px solid var(--baw-border)' }}>
                      {hits.map((h) => (
                        <button
                          key={h.id}
                          onClick={() => {
                            setPicked(h)
                            setQuery('')
                            setHits([])
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <span style={{ color: 'var(--baw-text)' }}>{h.name}</span>{' '}
                          <span className="text-xs muted-text">{h.phone ?? h.email ?? ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Nombre del interesado *"
                      className="input-field w-full text-sm py-1.5"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="tel"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="Teléfono (WhatsApp)"
                        className="input-field w-full text-sm py-1.5"
                      />
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="Correo"
                        className="input-field w-full text-sm py-1.5"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={handleCreate}
              disabled={saving || !breakdown}
              className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
            >
              {saving ? 'Apartando…' : `Cotizar y apartar ${holdHours}h`}
            </button>
            <p className="text-[10px] muted-text">
              Crea contacto + oportunidad "cotizado" en el CRM y una reservación tentativa que
              bloquea el sitio público hasta que venza el apartado. El interesado se vuelve
              ocupante solo al confirmar.
            </p>
          </>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}
      </aside>
    </div>
  )
}
