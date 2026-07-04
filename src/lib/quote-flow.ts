// BaW OS — Flujo de cotización telefónica (user story Fran 2026-07-03).
//
// Llamada → seleccionar fechas en el calendario → cotizar → crear contacto CRM
// + oportunidad 'cotizado' + reservación TENTATIVA con hold de 24-72h → enviar
// propuesta (WhatsApp/correo). La tentativa aparta las fechas en el sitio
// público hasta hold_expires_at; si vence, se libera sola (la disponibilidad
// pública ignora tentativas vencidas — migración 20260704).
//
// Modelo CRM: el prospecto vive SOLO en crm_contacts (occupant_id NULL).
// Se convierte en occupant únicamente al CONFIRMAR (cierre de venta).

import { supabase } from '@/lib/supabase'
import type { Season, RateOverride, CalendarStay } from '@/lib/calendar-occupancy'
import { addDaysISO, diffDaysISO, nightlyPrice } from '@/lib/calendar-occupancy'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { CrmTemperature } from '@/types'

export const EXTRA_PERSON_FEE = 250 // $/persona/noche sobre max_guests (regla vigente del cotizador)

export interface QuoteUnitInfo {
  id: string
  number: string
  type: string
  base_rate_mxn: number | null
  cleaning_fee_mxn: number | null
  max_guests: number | null
  buildingName?: string | null
}

export interface QuoteBreakdown {
  nights: number
  guests: number
  includedGuests: number
  base: number
  extraFee: number
  cleaning: number
  iva: number
  total: number
  avgNight: number
}

/** Desglose noche por noche — mismo motor que /quotes y el calendario. */
export function buildQuoteBreakdown(
  unit: QuoteUnitInfo,
  checkIn: string,
  checkOut: string, // exclusivo
  guests: number,
  seasons: Season[],
  overrides: RateOverride[],
): QuoteBreakdown | null {
  const nights = diffDaysISO(checkIn, checkOut)
  if (nights < 1) return null
  let base = 0
  for (let iso = checkIn; iso < checkOut; iso = addDaysISO(iso, 1)) {
    const p = nightlyPrice(unit.base_rate_mxn, seasons, iso, overrides)
    if (p === null) return null // sin tarifa configurada: no se puede cotizar
    base += p
  }
  const includedGuests = unit.max_guests ?? 4
  const extraFee = Math.max(0, guests - includedGuests) * EXTRA_PERSON_FEE * nights
  const cleaning = unit.cleaning_fee_mxn ?? 0
  const iva = (base + extraFee + cleaning) * 0.16
  const total = base + extraFee + cleaning + iva
  return {
    nights,
    guests,
    includedGuests,
    base,
    extraFee,
    cleaning,
    iva,
    total,
    avgNight: Math.round(base / nights),
  }
}

/** Mensaje de propuesta listo para WhatsApp / correo. */
export function buildProposalText(opts: {
  contactName: string
  unit: QuoteUnitInfo
  checkIn: string
  checkOut: string
  breakdown: QuoteBreakdown
  holdHours: number
}): string {
  const { contactName, unit, checkIn, checkOut, breakdown: b, holdHours } = opts
  const lugar = unit.buildingName ? `${unit.buildingName}, unidad ${unit.number}` : `unidad ${unit.number}`
  const lines = [
    `Hola ${contactName}, gracias por tu interés. Esta es tu cotización:`,
    ``,
    `🏠 ${lugar}`,
    `📅 Entrada ${formatDate(checkIn)} · Salida ${formatDate(checkOut)} (${b.nights} noche${b.nights === 1 ? '' : 's'})`,
    `👥 ${b.guests} huésped${b.guests === 1 ? '' : 'es'}`,
    ``,
    `Hospedaje: ${formatCurrency(b.base)} (${formatCurrency(b.avgNight)}/noche prom.)`,
    ...(b.extraFee > 0 ? [`Huéspedes extra: ${formatCurrency(b.extraFee)}`] : []),
    ...(b.cleaning > 0 ? [`Limpieza: ${formatCurrency(b.cleaning)}`] : []),
    `IVA (16%): ${formatCurrency(b.iva)}`,
    `*Total: ${formatCurrency(b.total)}*`,
    ``,
    `Te apartamos estas fechas por ${holdHours} horas. Confirma antes para asegurarlas 🙌`,
  ]
  return lines.join('\n')
}

export function whatsappLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  const encoded = encodeURIComponent(text)
  return digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`
}

export function mailtoLink(email: string | null | undefined, subject: string, body: string): string {
  return `mailto:${email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** "expira en 36h" / "expiró hace 2h" / null si no hay hold. */
export function holdCountdownLabel(holdExpiresAt: string | null | undefined): string | null {
  if (!holdExpiresAt) return null
  const ms = new Date(holdExpiresAt).getTime() - Date.now()
  const hours = Math.round(Math.abs(ms) / 3_600_000)
  const label = hours >= 48 ? `${Math.round(hours / 24)}d` : `${hours}h`
  return ms > 0 ? `apartado expira en ${label}` : `apartado expiró hace ${label}`
}

/* ───────────────────────────── Escrituras ───────────────────────────── */

export interface QuoteContactInput {
  /** id de crm_contacts existente, o null para crear uno nuevo */
  id: string | null
  name: string
  phone: string
  email: string
}

export interface CreateQuoteResult {
  reservationId?: string
  contactId?: string
  error?: string
}

/** Crea contacto CRM (si es nuevo) + reservación tentativa con hold +
 *  oportunidad 'cotizado'. El prospecto NO se vuelve occupant aquí. */
export async function createQuote(opts: {
  orgId: string
  unit: QuoteUnitInfo
  checkIn: string
  checkOut: string
  breakdown: QuoteBreakdown
  contact: QuoteContactInput
  holdHours: number
  temperature: CrmTemperature
}): Promise<CreateQuoteResult> {
  const { orgId, unit, checkIn, checkOut, breakdown, contact, holdHours, temperature } = opts

  let contactId = contact.id
  if (!contactId) {
    const { data, error } = await supabase
      .from('crm_contacts')
      .insert({
        org_id: orgId,
        name: contact.name.trim(),
        phone: contact.phone.trim() || null,
        email: contact.email.trim() || null,
        source: 'llamada',
        status: 'contactado',
        interest_product: 'Residencial corta',
      })
      .select('id')
      .single()
    if (error) return { error: `No se pudo crear el contacto: ${error.message}` }
    contactId = data.id
  }

  const holdExpiresAt = new Date(Date.now() + holdHours * 3_600_000).toISOString()
  const { data: res, error: resError } = await supabase
    .from('reservations')
    .insert({
      organization_id: orgId,
      unit_id: unit.id,
      guest_name: contact.name.trim(),
      guest_phone: contact.phone.trim() || null,
      guest_email: contact.email.trim() || null,
      check_in: checkIn,
      check_out: checkOut,
      mode: 'full',
      guests_count: breakdown.guests,
      price_per_night: breakdown.avgNight,
      total_price: Math.round(breakdown.total),
      status: 'tentative',
      payment_status: 'pending',
      channel: 'direct',
      hold_expires_at: holdExpiresAt,
      notes: `Cotización telefónica · apartado ${holdHours}h`,
    })
    .select('id')
    .single()
  if (resError) return { error: `No se pudo apartar: ${resError.message}`, contactId: contactId! }

  const { error: oppError } = await supabase.from('crm_opportunities').insert({
    org_id: orgId,
    contact_id: contactId,
    kind: 'nueva',
    target_product: 'Residencial corta',
    unit_id: unit.id,
    stage: 'cotizado',
    temperature,
    reservation_id: res.id,
    est_monthly: Math.round(breakdown.total),
    notes: `Cotización ${formatDate(checkIn)} → ${formatDate(checkOut)} · ${breakdown.nights} noches · total ${formatCurrency(breakdown.total)}`,
  })
  // Si el CRM aún no tiene la migración 20260704 (temperature/cotizado), la
  // reserva tentativa ya quedó: reportamos el error sin tirar el flujo.
  if (oppError) {
    return {
      reservationId: res.id,
      contactId: contactId!,
      error: `Fechas apartadas, pero la oportunidad CRM falló: ${oppError.message}`,
    }
  }
  return { reservationId: res.id, contactId: contactId! }
}

/** Confirma la cotización: reserva → confirmed, oportunidad → ganado, y el
 *  contacto CRM se PROMUEVE a occupant (aquí nace la identidad operativa). */
export async function confirmQuote(stay: CalendarStay, orgId: string): Promise<string | null> {
  if (stay.kind !== 'reservacion') return 'Solo aplica a reservaciones.'
  const reservationId = stay.key.slice(2)

  const { error: resErr } = await supabase
    .from('reservations')
    .update({ status: 'confirmed', hold_expires_at: null })
    .eq('id', reservationId)
  if (resErr) return `No se pudo confirmar: ${resErr.message}`

  // Oportunidad ligada (si existe): ganado + cierre
  const { data: opp } = await supabase
    .from('crm_opportunities')
    .select('id, contact_id')
    .eq('reservation_id', reservationId)
    .maybeSingle()
  if (!opp) return null
  await supabase
    .from('crm_opportunities')
    .update({ stage: 'ganado', closed_at: new Date().toISOString() })
    .eq('id', opp.id)

  // Promoción contacto → occupant
  const { data: contact } = await supabase
    .from('crm_contacts')
    .select('id, occupant_id, name, phone, email')
    .eq('id', opp.contact_id)
    .maybeSingle()
  if (!contact) return null

  let occupantId = contact.occupant_id as string | null
  if (!occupantId) {
    const { data: occ, error: occErr } = await supabase
      .from('occupants')
      .insert({
        org_id: orgId,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        type: 'str',
      })
      .select('id')
      .single()
    if (occErr) return `Confirmada, pero no se pudo crear el ocupante: ${occErr.message}`
    occupantId = occ.id
    // El trigger crm_contact_for_occupant crea un contacto espejo para el
    // occupant nuevo; lo quitamos y ligamos NUESTRO contacto (que tiene la
    // historia de la cotización) para no duplicar personas en el CRM.
    await supabase
      .from('crm_contacts')
      .delete()
      .eq('org_id', orgId)
      .eq('occupant_id', occupantId)
      .neq('id', contact.id)
    await supabase
      .from('crm_contacts')
      .update({ occupant_id: occupantId, is_client: true, status: 'activo' })
      .eq('id', contact.id)
  } else {
    await supabase
      .from('crm_contacts')
      .update({ is_client: true, status: 'activo' })
      .eq('id', contact.id)
  }

  // Reservación ↔ identidad durable (historial de transacciones en CRM)
  await supabase.from('reservations').update({ occupant_id: occupantId }).eq('id', reservationId)
  return null
}

/** Libera las fechas: reserva → cancelled, oportunidad → perdido. */
export async function releaseQuote(stay: CalendarStay): Promise<string | null> {
  if (stay.kind !== 'reservacion') return 'Solo aplica a reservaciones.'
  const reservationId = stay.key.slice(2)
  const { error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', reservationId)
  if (error) return `No se pudo liberar: ${error.message}`
  await supabase
    .from('crm_opportunities')
    .update({ stage: 'perdido', closed_at: new Date().toISOString() })
    .eq('reservation_id', reservationId)
    .neq('stage', 'ganado')
  return null
}
