// BaW OS — Llaves del conector v1 (ENG-624).
//
// Una llave por organización × espacio del consumidor (Engrane). NO es una
// credencial de agente: vive en connector_keys, usa prefijo ck_live_ y no
// autoriza nada en /api/v1 (que exige sk_live_/sk_test_). Nunca existe una
// llave de servicio global: toda llave pertenece a UNA org.

import { hashApiKey } from '@/lib/agents/auth'

export const CONNECTOR_KEY_PREFIX = 'ck_live_'
/** 'ck_live_' + 8 hex: lo que se guarda en claro para lookup y para la UI. */
export const CONNECTOR_KEY_LOOKUP_LEN = 16

export const CONNECTOR_CONSUMERS = ['engrane'] as const
export type ConnectorConsumer = (typeof CONNECTOR_CONSUMERS)[number]

export const CONNECTOR_DATASETS = ['units', 'reservations', 'occupancy', 'revenue', 'guests'] as const
export type ConnectorDataset = (typeof CONNECTOR_DATASETS)[number]

export interface ConnectorKeyRow {
  id: string
  org_id: string
  consumer: string
  consumer_ref: string
  label: string
  key_prefix: string
  key_hash: string
  building_ids: string[] | null
  datasets: string[]
  status: 'active' | 'revoked'
  expires_at: string | null
}

/** Columnas seguras para listar llaves (sin hash). */
export const CONNECTOR_KEY_PUBLIC_COLUMNS =
  'id, org_id, consumer, consumer_ref, label, key_prefix, building_ids, datasets, status, expires_at, created_at, created_by, revoked_at, revoked_by'

export function generateConnectorKey(): { plainKey: string; prefix: string } {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const random = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const plainKey = `${CONNECTOR_KEY_PREFIX}${random}`
  return { plainKey, prefix: plainKey.slice(0, CONNECTOR_KEY_LOOKUP_LEN) }
}

/** Mismo SHA-256 que las credenciales de agente (lookup por hash). */
export const hashConnectorKey = hashApiKey

export function isConnectorKeyFormat(token: string): boolean {
  return /^ck_live_[0-9a-f]{48}$/.test(token)
}
