// BaW OS — Core TypeScript Types
// BaW Design Lab · ZXY Ventures

export type UnitType = 'STR' | 'MTR' | 'LTR' | 'OFFICE' | 'COMMON'
export type UnitStatus = 'available' | 'occupied' | 'maintenance' | 'reserved' | 'inactive'
export type ContractStatus = 'active' | 'expired' | 'terminated' | 'pending' | 'renewed' | 'en_renovacion'
export type PaymentStatus = 'pending' | 'paid' | 'late' | 'partial' | 'waived'
export type IncidentStatus = 'open' | 'in_progress' | 'waiting_parts' | 'resolved' | 'cancelled'
export type IncidentPriority = 'low' | 'medium' | 'high' | 'urgent'
export type ReservationStatus = 'tentative' | 'confirmed' | 'cancelled' | 'checked_in' | 'checked_out'
export type ReservationPaymentStatus = 'pending' | 'partial' | 'paid'
export type BookingMode = 'full' | 'room' | 'bed'
export type OccupantType = 'tenant' | 'guest' | 'owner' | 'staff'
export type ContactType = 'ltr' | 'str' | 'both'
export type MemberRole = 'owner' | 'admin' | 'operator' | 'viewer' | 'agent'

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url?: string
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
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
  amenities?: string[]
  notes?: string
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
  contact_type?: ContactType
  notes?: string
  // Fiscal data (#9, #10)
  rfc?: string
  razon_social?: string
  regimen_fiscal?: string
  cp_fiscal?: string
  email_factura?: string
  requiere_factura?: boolean
  created_at: string
  updated_at: string
  // CRM enrichment (joined)
  reservation_count?: number
  last_reservation?: string
}

export interface Contract {
  id: string
  org_id: string
  unit_id: string
  occupant_id: string
  start_date: string
  end_date?: string
  monthly_amount: number
  deposit_amount?: number
  deposit_paid: boolean
  payment_day: number
  status: ContractStatus
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
  created_at: string
  updated_at: string
  // Relations (joined)
  unit?: Unit
  occupant?: Occupant
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
  notes?: string
  created_at: string
  updated_at: string
  // Relations
  contract?: Contract
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
