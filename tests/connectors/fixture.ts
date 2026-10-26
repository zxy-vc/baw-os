// Fixture del conector v1 (ENG-624). Las cifras esperadas de octubre 2026 se
// calcularon A MANO (ver docs/connectors-v1.md §Ejemplo) y se afirman en
// figures.test.ts — si una regla cambia, este archivo dice qué debió cambiar.
//
// Org A · BaW Operations
//   B1 Mateos 809
//     U1 STR  R1 airbnb      28-sep → 03-oct  $5,000.00  pagado $5,000  (2 noches en oct)
//             R2 booking     10-oct → 14-oct  $3,999.99  pagado $0      (4 noches)
//             R3 tentativa   20-oct → 25-oct  (cotización: no existe para el conector)
//             R4 cancelada   15-oct → 17-oct  (se lista; no cuenta)
//             R5 directa     30-oct → 02-nov  $3,000.00  pagado $1,500  (2 noches en oct)
//             bloqueo        05-oct … 06-oct (inclusivo → 2 noches)
//     U2 LTR  contrato activo 01-jun … 15-oct (inclusivo → 15 noches en oct)
//             contrato pending desde 20-oct (no ocupa) · terminado en 2025 (no ocupa)
//             bloqueo 10-oct … 12-oct encima del contrato (cuenta ocupada, no bloqueada)
//     U5 STR  archivada el 21-oct 06:00 hora CDMX → solo 20 noches en oct
//   B2 Torre 2020
//     U3 STR  R6 Lodgify     05-oct → 08-oct  $2,400.00  pagado $2,400  (3 noches)
//             R7 sin fuente  01-oct → 02-oct  $1,000.005 (→ $1,000.01) sin org_id (checkout público)
//             contrato terminated 01-sep … 20-oct (se solapa con oct; no ocupa)
//     U4 COMMON (no entra a ocupación)
// Org B · ajena
//   B3 · U9  R9 10-oct → 12-oct $10,000 — nunca debe aparecer
//   Rx: fila corrupta con unit_id de U1 pero organization_id de Org B — se excluye
import { hashConnectorKey } from '@/lib/connectors/keys'
import type { Row } from './fake-db'

export const ORG_A = '00000000-0000-4000-8000-00000000000a'
export const ORG_B = '00000000-0000-4000-8000-00000000000b'
export const B1 = '10000000-0000-4000-8000-000000000001'
export const B2 = '10000000-0000-4000-8000-000000000002'
export const B3 = '10000000-0000-4000-8000-000000000003'
export const U1 = '20000000-0000-4000-8000-000000000001'
export const U2 = '20000000-0000-4000-8000-000000000002'
export const U3 = '20000000-0000-4000-8000-000000000003'
export const U4 = '20000000-0000-4000-8000-000000000004'
export const U5 = '20000000-0000-4000-8000-000000000005'
export const U9 = '20000000-0000-4000-8000-000000000009'

export const R = {
  R1: '30000000-0000-4000-8000-000000000001',
  R2: '30000000-0000-4000-8000-000000000002',
  R3: '30000000-0000-4000-8000-000000000003',
  R4: '30000000-0000-4000-8000-000000000004',
  R5: '30000000-0000-4000-8000-000000000005',
  R6: '30000000-0000-4000-8000-000000000006',
  R7: '30000000-0000-4000-8000-000000000007',
  R9: '30000000-0000-4000-8000-000000000009',
  Rx: '30000000-0000-4000-8000-00000000000f',
}

/** Llaves en claro (formato real: ck_live_ + 48 hex). */
export const KEYS = {
  /** Org A, toda la org, todos los datasets */
  fullA: 'ck_live_' + 'a1'.repeat(24),
  /** Org A, solo edificio B2 */
  b2Only: 'ck_live_' + 'b2'.repeat(24),
  /** Org A, solo dataset units */
  unitsOnly: 'ck_live_' + 'c3'.repeat(24),
  /** Org A, revocada */
  revoked: 'ck_live_' + 'd4'.repeat(24),
  /** Org A, vencida */
  expired: 'ck_live_' + 'e5'.repeat(24),
  /** Org B, toda la org */
  fullB: 'ck_live_' + 'f6'.repeat(24),
  /** Mismo prefijo que fullA, pero no registrada */
  unknownSamePrefix: 'ck_live_' + 'a1'.repeat(4) + '00'.repeat(20),
}

export const KEY_IDS = {
  fullA: '40000000-0000-4000-8000-000000000001',
  b2Only: '40000000-0000-4000-8000-000000000002',
  unitsOnly: '40000000-0000-4000-8000-000000000003',
  revoked: '40000000-0000-4000-8000-000000000004',
  expired: '40000000-0000-4000-8000-000000000005',
  fullB: '40000000-0000-4000-8000-000000000006',
}

const ALL_DATASETS = ['units', 'reservations', 'occupancy', 'revenue', 'guests']

async function keyRow(
  name: keyof typeof KEY_IDS,
  over: Partial<Row> & { org_id: string; consumer_ref: string },
): Promise<Row> {
  const plain = KEYS[name]
  return {
    id: KEY_IDS[name],
    consumer: 'engrane',
    label: name,
    key_prefix: plain.slice(0, 16),
    key_hash: await hashConnectorKey(plain),
    building_ids: null,
    datasets: ALL_DATASETS,
    status: 'active',
    expires_at: null,
    revoked_at: null,
    ...over,
  }
}

function res(id: string, over: Partial<Row>): Row {
  return {
    id,
    organization_id: ORG_A,
    guest_name: `Huésped ${id.slice(-1)}`,
    guest_phone: '+52 55 0000 0000',
    guest_email: 'huesped@example.com',
    status: 'confirmed',
    payment_status: 'pending',
    total_price: 0,
    amount_paid: 0,
    channel: null,
    platform: null,
    external_id: null,
    guests_count: 2,
    created_at: '2026-09-01T12:00:00Z',
    updated_at: '2026-09-01T12:00:00Z',
    ...over,
  }
}

export async function buildFixture(): Promise<Record<string, Row[]>> {
  return {
    organizations: [
      { id: ORG_A, name: 'BaW Operations' },
      { id: ORG_B, name: 'Otra operadora' },
    ],
    buildings: [
      { id: B1, org_id: ORG_A, name: 'Mateos 809' },
      { id: B2, org_id: ORG_A, name: 'Torre 2020' },
      { id: B3, org_id: ORG_B, name: 'Ajeno' },
    ],
    units: [
      { id: U1, org_id: ORG_A, building_id: B1, number: '101', type: 'STR', status: 'occupied', bedrooms: 1, bathrooms: 1, max_guests: 2, archived_at: null, base_rate_mxn: 1200 },
      { id: U2, org_id: ORG_A, building_id: B1, number: '102', type: 'LTR', status: 'available', bedrooms: 2, bathrooms: 1, max_guests: 4, archived_at: null, base_rate_mxn: null },
      { id: U5, org_id: ORG_A, building_id: B1, number: '105', type: 'STR', status: 'inactive', bedrooms: 1, bathrooms: 1, max_guests: 2, archived_at: '2026-10-21T12:00:00Z', base_rate_mxn: 900 },
      { id: U3, org_id: ORG_A, building_id: B2, number: '201', type: 'STR', status: 'available', bedrooms: 1, bathrooms: 1, max_guests: 3, archived_at: null, base_rate_mxn: 800 },
      { id: U4, org_id: ORG_A, building_id: B2, number: 'Lobby', type: 'COMMON', status: 'available', bedrooms: null, bathrooms: null, max_guests: null, archived_at: null, base_rate_mxn: null },
      { id: U9, org_id: ORG_B, building_id: B3, number: '901', type: 'STR', status: 'available', bedrooms: 1, bathrooms: 1, max_guests: 2, archived_at: null, base_rate_mxn: 5000 },
    ],
    reservations: [
      res(R.R1, { unit_id: U1, check_in: '2026-09-28', check_out: '2026-10-03', status: 'checked_out', total_price: 5000, amount_paid: 5000, payment_status: 'paid', channel: 'airbnb', external_id: 'HMABC123' }),
      res(R.R2, { unit_id: U1, check_in: '2026-10-10', check_out: '2026-10-14', status: 'checked_in', total_price: '3999.99', amount_paid: null, channel: 'booking', external_id: 'BK-998877' }),
      res(R.R3, { unit_id: U1, check_in: '2026-10-20', check_out: '2026-10-25', status: 'tentative', total_price: 6000, channel: 'direct' }),
      res(R.R4, { unit_id: U1, check_in: '2026-10-15', check_out: '2026-10-17', status: 'cancelled', total_price: 2000, amount_paid: 500, platform: 'airbnb' }),
      res(R.R5, { unit_id: U1, check_in: '2026-10-30', check_out: '2026-11-02', status: 'confirmed', total_price: 3000, amount_paid: 1500, payment_status: 'partial', platform: 'direct' }),
      res(R.R6, { unit_id: U3, check_in: '2026-10-05', check_out: '2026-10-08', status: 'confirmed', total_price: 2400, amount_paid: 2400, payment_status: 'paid', channel: 'Lodgify' }),
      res(R.R7, { unit_id: U3, organization_id: null, check_in: '2026-10-01', check_out: '2026-10-02', status: 'checked_out', total_price: '1000.005', amount_paid: null }),
      res(R.R9, { unit_id: U9, organization_id: ORG_B, check_in: '2026-10-10', check_out: '2026-10-12', total_price: 10000, channel: 'airbnb' }),
      res(R.Rx, { unit_id: U1, organization_id: ORG_B, check_in: '2026-10-20', check_out: '2026-10-22', total_price: 7777, channel: 'airbnb' }),
    ],
    contracts: [
      { id: 'c-active', org_id: ORG_A, unit_id: U2, status: 'active', start_date: '2026-06-01', end_date: '2026-10-15', monthly_amount: 15000 },
      { id: 'c-pending', org_id: ORG_A, unit_id: U2, status: 'pending', start_date: '2026-10-20', end_date: '2027-10-19', monthly_amount: 16000 },
      { id: 'c-terminated', org_id: ORG_A, unit_id: U2, status: 'terminated', start_date: '2025-01-01', end_date: '2025-12-31', monthly_amount: 14000 },
      { id: 'c-terminated-oct', org_id: ORG_A, unit_id: U3, status: 'terminated', start_date: '2026-09-01', end_date: '2026-10-20', monthly_amount: 9000 },
      { id: 'c-orgB', org_id: ORG_B, unit_id: U9, status: 'active', start_date: '2026-01-01', end_date: null, monthly_amount: 9000 },
    ],
    unit_blocks: [
      { id: 'blk-u1', org_id: ORG_A, unit_id: U1, start_date: '2026-10-05', end_date: '2026-10-06', reason: 'maintenance' },
      { id: 'blk-u2', org_id: ORG_A, unit_id: U2, start_date: '2026-10-10', end_date: '2026-10-12', reason: 'maintenance' },
    ],
    // Tablas de dinero de contratos: el conector NUNCA las lee (regla de pago).
    payments: [{ id: 'pay-1', org_id: ORG_A, contract_id: 'c-active', amount: 15000, amount_paid: 15000, due_date: '2026-10-01', status: 'paid' }],
    payment_receipts: [{ id: 'rcpt-1', org_id: ORG_A, payment_id: 'pay-1', amount: 15000, paid_date: '2026-10-02' }],
    connector_keys: [
      await keyRow('fullA', { org_id: ORG_A, consumer_ref: 'engrane-space-a' }),
      await keyRow('b2Only', { org_id: ORG_A, consumer_ref: 'engrane-space-torre', building_ids: [B2] }),
      await keyRow('unitsOnly', { org_id: ORG_A, consumer_ref: 'engrane-space-units', datasets: ['units'] }),
      await keyRow('revoked', { org_id: ORG_A, consumer_ref: 'engrane-space-old', status: 'revoked', revoked_at: '2026-10-01T00:00:00Z' }),
      await keyRow('expired', { org_id: ORG_A, consumer_ref: 'engrane-space-exp', expires_at: '2026-01-01T00:00:00Z' }),
      await keyRow('fullB', { org_id: ORG_B, consumer_ref: 'engrane-space-b' }),
    ],
    connector_access_log: [],
    // Para las rutas de admin (sesión humana)
    org_members: [
      { id: 'om-1', org_id: ORG_A, user_id: 'user-admin-a', role: 'pm_admin', is_active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'om-2', org_id: ORG_A, user_id: 'user-viewer-a', role: 'pm_viewer', is_active: true, created_at: '2026-01-01T00:00:00Z' },
    ],
    platform_admins: [],
  }
}
