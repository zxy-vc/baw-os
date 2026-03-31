// BaW OS — Core TypeScript Types
// BaW Design Lab · ZXY Ventures

export type UnitType = 'STR' | 'MTR' | 'LTR' | 'OFFICE' | 'COMMON'
export type UnitStatus = 'available' | 'occupied' | 'maintenance' | 'reserved' | 'inactive'
export type ContractStatus = 'active' | 'expired' | 'terminated' | 'pending' | 'renewed'
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
  notes?: string
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
