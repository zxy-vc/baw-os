// BaW OS — Calendario de unidades: constantes visuales compartidas.
//
// Vive en src/components (no src/lib) porque tailwind.config.ts solo escanea
// src/app, src/components y src/pages — clases declaradas en src/lib no
// entrarían al build JIT.
//
// Paleta por tipo de estancia = la misma que /estancias (TYPE_BADGE):
// STR morado · MTR ámbar · LTR azul. Holds en gris. Temporadas en esmeralda.

import type { CSSProperties } from 'react'
import type { StayKind, StayType } from '@/lib/calendar-occupancy'

export const TYPE_BADGE: Record<StayType, string> = {
  STR: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20',
  MTR: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
  LTR: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
}

/** Barra sólida del timeline / banda del mes. key = type, o 'hold'. */
export const BAR_CLASS: Record<StayType | 'hold', string> = {
  STR: 'bg-purple-500/85 border-purple-400 text-white',
  MTR: 'bg-amber-500/85 border-amber-400 text-amber-950',
  LTR: 'bg-blue-500/85 border-blue-400 text-white',
  hold: 'bg-gray-400/25 border-gray-400/60 text-gray-600 dark:text-gray-300',
}

/** Rayado diagonal para holds (encima de BAR_CLASS.hold). */
export const HOLD_STRIPES: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, transparent, transparent 4px, var(--baw-border) 4px, var(--baw-border) 6px)',
}

export function barClassFor(kind: StayKind, type: StayType | null, tentative: boolean): string {
  const base = kind === 'hold' ? BAR_CLASS.hold : BAR_CLASS[type ?? 'LTR']
  return tentative && kind !== 'hold' ? `${base} opacity-60 border-dashed` : base
}

/** Chips de estatus (mismas combinaciones que /estancias). */
export const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Activo', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  expired: { label: 'Vencido', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  terminated: { label: 'Terminado', cls: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400' },
  pending: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  renewed: { label: 'Renovado', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  en_renovacion: { label: 'En renovación', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
}

export const RES_STATUS: Record<string, { label: string; cls: string }> = {
  tentative: { label: 'Tentativa', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  confirmed: { label: 'Confirmada', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  checked_in: { label: 'Check-in', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  checked_out: { label: 'Check-out', cls: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400' },
  hold: { label: 'Hold (15 min)', cls: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400' },
}

export function statusChipFor(stay: { kind: StayKind; status: string }): { label: string; cls: string } {
  const map = stay.kind === 'contrato' ? CONTRACT_STATUS : RES_STATUS
  return map[stay.status] ?? { label: stay.status, cls: RES_STATUS.checked_out.cls }
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Pago pendiente',
  partial: 'Pago parcial',
  paid: 'Pagado',
}

export const CHANNEL_LABEL: Record<string, string> = {
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  direct: 'Directa',
  expedia: 'Expedia',
}

/** Franja de temporadas (esmeralda = concepto de pricing, no choca con tipos). */
export const SEASON_CHIP =
  'bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
