// BaW OS — Core TypeScript Types
// BaW Design Lab · ZXY Ventures

export type UnitType = 'STR' | 'MTR' | 'LTR' | 'OFFICE' | 'COMMON'
export type UnitStatus = 'available' | 'occupied' | 'maintenance' | 'reserved' | 'inactive'
export type ContractStatus = 'active' | 'expired' | 'terminated' | 'pending' | 'renewed'
export type PaymentStatus = 'pending' | 'paid' | 'late' | 'partial' | 'waived'
export type IncidentStatus = 'open' | 'in_progress' | 'waiting_parts' | 'resolved' | 'cancelled'
export type IncidentPriority = 'low' | 'medium' | 'high' | 'urgent'
export type ReservationStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
export type OccupantType = 'tenant' | 'guest' | 'owner' | 'staff'
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
  notes?: string
  created_at: string
  updated_at: string
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
  org_id: string
  unit_id: string
  guest_id?: string
  check_in: string
  check_out: string
  nights: number
  guests_count: number
  nightly_rate: number
  total_amount: number
  cleaning_fee: number
  status: ReservationStatus
  source: string
  stripe_payment_id?: string
  notes?: string
  created_at: string
  updated_at: string
  // Relations
  unit?: Unit
  guest?: Occupant
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
