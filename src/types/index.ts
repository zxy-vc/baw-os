// BaW OS — Core TypeScript Types
// Built by ZXY Ventures

export type UnitType = 'STR' | 'MTR' | 'LTR' | 'RETAIL' | 'OFFICE' | 'COMMON'
export type UnitStatus = 'available' | 'occupied' | 'maintenance' | 'reserved' | 'inactive'
export type ContractStatus = 'active' | 'expired' | 'terminated' | 'pending' | 'renewed' | 'en_renovacion'
export type RentType = 'LTR' | 'MTR' | 'STR' // larga / media / corta
export type PaymentStatus = 'pending' | 'paid' | 'late' | 'partial' | 'waived'
export type IncidentStatus = 'open' | 'in_progress' | 'waiting_parts' | 'resolved' | 'cancelled'
export type IncidentPriority = 'low' | 'medium' | 'high' | 'urgent'
export type ReservationStatus = 'tentative' | 'confirmed' | 'cancelled' | 'checked_in' | 'checked_out'
export type ReservationPaymentStatus = 'pending' | 'partial' | 'paid'
export type BookingMode = 'full' | 'room' | 'bed'
// occupants.type en la BD: CHECK IN ('ltr','str','both') — modalidad de renta
// del contacto, no un rol. (migration 20260330_occupants_type.sql)
export type OccupantType = 'ltr' | 'str' | 'both'
// Party: la identidad durable puede ser persona física o empresa (Fase 2b).
export type OccupantKind = 'persona' | 'empresa'
export type AncillaryKind = 'parking' | 'billboard' | 'storage' | 'antenna' | 'other'
export type AncillaryCadence = 'monthly' | 'annual'
export type AncillaryOwnership = 'ours' | 'third_party'
export type AncillaryStatus = 'active' | 'inactive' | 'ended'
export type ContactType = 'ltr' | 'str' | 'both'
export type MemberRole = 'owner' | 'admin' | 'operator' | 'viewer' | 'agent' | 'pm_owner' | 'pm_admin' | 'pm_operator' | 'pm_viewer' | 'client'

export interface Building {
  id: string
  org_id: string
  name: string
  address?: string | null
  city?: string | null
  state?: string | null
  country: string
  postal_code?: string | null
  parking_total?: number // pool de cajones del edificio
  notes?: string | null
  archived_at?: string | null
  created_at: string
  updated_at: string
  // Campos públicos (listing público — 20260523_public_booking.sql)
  slug?: string | null
  public_name?: string | null
  public_description?: string | null
  hero_url?: string | null
  gallery?: unknown
  amenities_common?: unknown
  faq?: unknown
  location_lat?: number | null
  location_lng?: number | null
  is_public_listed?: boolean
}

export interface PropertyOwner {
  id: string
  org_id: string
  user_id?: string | null
  full_name: string
  rfc?: string | null
  email?: string | null
  phone?: string | null
  bank_info?: Record<string, unknown> | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface OwnershipStake {
  id: string
  org_id: string
  building_id: string
  property_owner_id: string
  percentage: number
  starts_on?: string | null // vigencia de propiedad: inicio
  ends_on?: string | null // vigencia de propiedad: fin (null = indefinido)
  mgmt_starts_on?: string | null // vigencia de administración (mandato BaW): inicio
  mgmt_ends_on?: string | null // vigencia de administración: fin (null = indefinido)
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  full_name?: string
  phone?: string
  job_title?: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: MemberRole
  is_active: boolean
  invited_email?: string
  created_at: string
  profile?: UserProfile | null
  email?: string | null
}

export interface Unit {
  id: string
  org_id: string
  number: string
  floor?: number
  type: UnitType
  status: UnitStatus
  area_m2?: number
  bedrooms?: number
  bathrooms?: number
  parking_included?: number // cajones incluidos sin cobro extra
  title?: string
  slug?: string
  description_short?: string
  description_long?: string
  amenities?: string[] | AmenityItem[]
  notes?: string
  archived_at?: string | null
  created_at: string
  updated_at: string
  // Campos públicos (listing público — 20260523 + 20260703)
  building_id?: string | null
  public_name?: string | null
  public_description?: string | null
  hero_url?: string | null
  base_rate_mxn?: number | null
  cleaning_fee_mxn?: number
  max_guests?: number
  min_nights?: number
  monthly_rate_mxn?: number | null
  is_publicly_bookable?: boolean
}

export type SpaceKind = 'bedroom' | 'bathroom' | 'kitchen' | 'living_room' | 'dining_room' | 'workspace' | 'balcony' | 'terrace' | 'laundry' | 'exterior' | 'other'
export type MediaKind = 'image' | 'floorplan' | 'document' | 'video'
export type MediaVisibility = 'internal' | 'public'

export interface AmenityItem {
  label: string
  category?: string
}

export interface UnitSpace {
  id: string
  org_id?: string
  unit_id: string
  name: string
  kind: SpaceKind
  sort_order: number
  description?: string
  cover_asset_id?: string
  created_at: string
  updated_at: string
}

export interface MediaAsset {
  id: string
  org_id?: string
  unit_id: string
  unit_space_id?: string
  kind: MediaKind
  visibility: MediaVisibility
  title?: string
  alt_text?: string
  caption?: string
  storage_bucket?: string
  storage_path?: string
  file_url?: string
  mime_type?: string
  sort_order: number
  is_cover: boolean
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Occupant {
  id: string
  org_id: string
  name: string
  phone?: string
  email?: string
  id_type?: string
  id_number?: string
  type: OccupantType
  kind?: OccupantKind // persona | empresa (Fase 2b); default 'persona'
  contact_type?: ContactType
  notes?: string
  // Fiscal data (#9, #10)
  rfc?: string
  razon_social?: string
  regimen_fiscal?: string
  cp_fiscal?: string
  email_factura?: string
  requiere_factura?: boolean
  archived_at?: string | null
  created_at: string
  updated_at: string
  // CRM enrichment (joined)
  reservation_count?: number
  last_reservation?: string
}

export interface Contract {
  id: string
  org_id: string
  unit_id?: string | null // NULL = contrato independiente (standalone)
  occupant_id: string
  payer_occupant_id?: string | null // quién paga si ≠ inquilino (Fase 2b); NULL = el inquilino
  engagement_id?: string | null // cuenta combinada a la que pertenece (pool); NULL = individual
  start_date: string
  billing_start_date?: string | null // Cobros factura desde aquí; NULL = desde start_date
  end_date?: string
  monthly_amount: number
  deposit_amount?: number
  deposit_paid: boolean
  payment_day: number
  status: ContractStatus
  rent_type?: RentType
  contract_url?: string
  drive_folder_url?: string
  notes?: string
  // Legal data (#15, #16)
  aval?: string
  curp_arrendatario?: string
  domicilio_arrendatario?: string
  // Portal Inquilino
  portal_token?: string
  portal_enabled?: boolean
  // Mifiel digital signature
  mifiel_document_id?: string
  signature_status?: 'none' | 'pending' | 'signed'
  archived_at?: string | null
  created_at: string
  updated_at: string
  // Relations (joined)
  unit?: Unit
  occupant?: Occupant
}

/** Cuenta combinada: agrupa N contratos bajo un mismo pagador (spec §6). */
export interface Engagement {
  id: string
  org_id: string
  name: string
  payer_occupant_id?: string | null
  billing_mode: 'consolidated' | 'per_unit'
  status: 'active' | 'closed'
  notes?: string | null
  created_at: string
  updated_at: string
  // Relations (joined)
  payer?: Occupant
  contracts?: Contract[]
}

export interface Payment {
  id: string
  org_id: string
  contract_id: string
  amount: number
  rent_amount?: number
  water_fee?: number
  amount_paid?: number
  due_date: string
  paid_date?: string
  status: PaymentStatus
  method?: string
  reference?: string
  ancillary_charge_id?: string | null // origen accesorio; null = renta normal
  notes?: string
  created_at: string
  updated_at: string
  // Relations
  contract?: Contract
}

export interface AncillaryAsset {
  id: string
  org_id: string
  building_id?: string | null
  kind: AncillaryKind
  label: string
  ownership: AncillaryOwnership
  status: AncillaryStatus
  notes?: string
  created_at: string
  updated_at: string
  // Relations
  building?: Building
}

export interface AncillaryCharge {
  id: string
  org_id: string
  contract_id: string // invariante: siempre ligado a un contrato
  asset_id?: string | null
  building_id?: string | null
  unit_id?: string | null // NULL si el contrato es independiente
  kind: AncillaryKind
  description?: string
  amount: number // monto por periodo (según cadence)
  cadence: AncillaryCadence
  billing_day: number // 1..28
  quantity: number
  effective_from: string
  effective_to?: string | null
  status: AncillaryStatus
  notes?: string
  created_at: string
  updated_at: string
  // Relations (joined)
  contract?: Contract
  asset?: AncillaryAsset
}

export interface Incident {
  id: string
  org_id: string
  unit_id?: string
  reported_by?: string
  title: string
  description?: string
  status: IncidentStatus
  priority: IncidentPriority
  assigned_to?: string
  assigned_phone?: string
  estimated_cost?: number
  actual_cost?: number
  resolved_at?: string
  notes?: string
  created_at: string
  updated_at: string
  // Relations
  unit?: Unit
}

export interface Reservation {
  id: string
  unit_id: string
  organization_id: string
  guest_name: string
  guest_phone?: string
  guest_email?: string
  check_in: string
  check_out: string
  mode: BookingMode
  rooms_count: number
  beds_count: number
  guests_count: number
  price_per_night: number
  total_price: number
  status: ReservationStatus
  payment_status: ReservationPaymentStatus
  amount_paid: number
  notes?: string
  created_at: string
  updated_at: string
  // Relations
  unit?: Unit
}

export type InvoiceStatus = 'draft' | 'valid' | 'cancelled'

export interface Invoice {
  id: string
  org_id: string
  payment_id?: string
  contract_id?: string
  facturapi_id?: string
  folio_number?: number
  series: string
  status: InvoiceStatus
  cfdi_use: string
  tax_regime: string
  subtotal: number
  tax: number
  total: number
  pdf_url?: string
  xml_url?: string
  customer_rfc: string
  customer_name: string
  customer_email?: string
  notes?: string
  created_at: string
  created_by?: string
}

// Tenant Intake types
export type ApplicationStatus = 'draft' | 'submitted' | 'reviewing' | 'approved' | 'rejected'
export type ContractTypeCode = 'A' | 'B' | 'C' | 'D' | 'E'
export type DocType = 'ine_front' | 'ine_back' | 'income_proof' | 'domicilio_proof' | 'aval_ine' | 'aval_domicilio_proof'

export interface Titular {
  nombre: string
  apellido_paterno: string
  apellido_materno: string
  curp: string
  rfc: string
  email: string
  telefono: string
  domicilio: string
  estado_civil: string
  nacionalidad: string
  fecha_nacimiento: string
  telefono_emergencia: string
}

export interface Aval {
  nombre: string
  rfc: string
  curp: string
  domicilio: string
  telefono: string
  relacion: string
}

export interface TenantApplication {
  id: string
  org_id: string
  unit_id: string | null
  contract_type: ContractTypeCode | null
  status: ApplicationStatus
  token: string
  titulares: Titular[]
  avales: Aval[]
  contract_data: Record<string, unknown>
  empresa: Record<string, unknown> | null
  tercero_pagador: Record<string, unknown> | null
  docs: Partial<Record<DocType, string>>
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Relations (joined)
  unit?: Unit
}

// API Response types
export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  per_page: number
}

// Webhook event types
export type WebhookEventType =
  | 'unit.status_changed'
  | 'payment.received'
  | 'payment.overdue'
  | 'contract.expiring_soon'
  | 'contract.expired'
  | 'incident.opened'
  | 'incident.resolved'
  | 'reservation.confirmed'
  | 'reservation.checked_in'
  | 'reservation.checked_out'

export interface WebhookEvent {
  id: string
  org_id: string
  event_type: WebhookEventType
  payload: Record<string, unknown>
  delivered: boolean
  attempts: number
  created_at: string
}

// ── CRM (clientes + recompra) ───────────────────────────────────────────────
export type CrmSource = 'llamada' | 'whatsapp' | 'referido' | 'portal' | 'anuncio' | 'manual' | 'otro'
export type CrmStatus = 'nuevo' | 'contactado' | 'activo' | 'inactivo' | 'en_seguimiento' | 'recompro' | 'descartado'
export type CrmOppKind = 'recompra' | 'migracion' | 'nueva'
export type CrmOppStage = 'identificado' | 'contactado' | 'interesado' | 'negociacion' | 'ganado' | 'perdido'

// Producto/segmento del cliente. Texto libre (el negocio tiene productos
// heterogéneos y crecientes); esta lista solo sugiere valores en la UI.
export const CRM_PRODUCT_OPTIONS: string[] = [
  'Residencial larga',
  'Residencial media',
  'Residencial corta',
  'Espectacular',
  'Agropecuario',
  'Estacionamiento',
  'Bodega',
  'Otro',
]

export interface CrmContact {
  id: string
  org_id: string
  occupant_id?: string | null
  name: string
  phone?: string | null
  email?: string | null
  source: CrmSource
  is_client: boolean
  status: CrmStatus
  interest_product?: string | null
  owner?: string | null
  next_followup_at?: string | null
  tags: string[]
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface CrmOpportunity {
  id: string
  org_id: string
  contact_id: string
  kind: CrmOppKind
  target_product?: string | null
  unit_id?: string | null
  stage: CrmOppStage
  est_monthly?: number | null
  owner?: string | null
  next_followup_at?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  closed_at?: string | null
}
