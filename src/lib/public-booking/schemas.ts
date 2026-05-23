import { z } from 'zod'

// ── Date helpers ─────────────────────────────────────────────────────────────
export const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
  .refine((s) => !isNaN(Date.parse(s)), 'Must be a valid date')

export const DateRange = z
  .object({ from: DateString, to: DateString })
  .refine((d) => new Date(d.from) < new Date(d.to), {
    message: '"from" must be before "to"',
    path: ['from'],
  })

// ── Guest info ────────────────────────────────────────────────────────────────
export const GuestInfo = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(7).max(20).optional(),
})

// ── Quote request ─────────────────────────────────────────────────────────────
export const QuoteRequest = z.object({
  unit_slug: z.string().min(1),
  from: DateString,
  to: DateString,
  guests: z.coerce.number().int().min(1).max(20),
})

export type QuoteRequestInput = z.infer<typeof QuoteRequest>

// ── Checkout request ──────────────────────────────────────────────────────────
export const CheckoutRequest = z.object({
  unit_slug: z.string().min(1),
  from: DateString,
  to: DateString,
  guests: z.coerce.number().int().min(1).max(20),
  guest: GuestInfo,
})

export type CheckoutRequestInput = z.infer<typeof CheckoutRequest>

// ── Quote response ────────────────────────────────────────────────────────────
export interface QuoteBreakdownItem {
  label: string
  amount_mxn: number
}

export interface Quote {
  unit_slug: string
  from: string
  to: string
  guests: number
  nights: number
  subtotal_mxn: number
  cleaning_fee_mxn: number
  tax_iva_mxn: number
  total_mxn: number
  currency: 'MXN'
  breakdown: QuoteBreakdownItem[]
}

// ── Checkout response ─────────────────────────────────────────────────────────
export interface CheckoutResponse {
  checkout_url: string
  session_id: string
  hold_id: string
  expires_at: string
}

// ── Unit row from v_public_units ──────────────────────────────────────────────
export interface PublicUnit {
  id: string
  slug: string
  building_id: string
  building_slug: string
  name: string | null
  description: string | null
  hero_url: string | null
  amenities: unknown
  base_rate_mxn: number | null
  cleaning_fee_mxn: number
  max_guests: number
  min_nights: number
}

// ── Building row from v_public_buildings ──────────────────────────────────────
export interface PublicBuilding {
  id: string
  slug: string
  name: string | null
  description: string | null
  hero_url: string | null
  gallery: unknown
  amenities: unknown
  faq: unknown
  city: string | null
  state: string | null
  country: string | null
  location_lat: number | null
  location_lng: number | null
}

// ── Availability query params ─────────────────────────────────────────────────
export const AvailabilityQuery = z.object({
  from: DateString,
  to: DateString,
})

export type AvailabilityQueryInput = z.infer<typeof AvailabilityQuery>

// ── Units list query params ───────────────────────────────────────────────────
export const UnitsListQuery = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  guests: z.coerce.number().int().min(1).optional(),
})

export type UnitsListQueryInput = z.infer<typeof UnitsListQuery>
