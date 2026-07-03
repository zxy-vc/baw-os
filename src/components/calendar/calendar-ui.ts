// BaW OS — Calendario de unidades: helpers visuales compartidos.
//
// La capa visual del calendario vive como CSS de componente en globals.css
// (clases `tl-*` y `cal-*`, adaptación de la spec del kit UI System v1) y se
// parametriza con los tokens de instrumento `--baw-instr-*`. Aquí solo quedan
// los mapeos instrumento→token y los labels de estatus/canal.

import type { StayKind, StayType } from '@/lib/calendar-occupancy'

/** Token CSS del instrumento (se inyecta como `--bar` / `--c` inline). */
export const INSTR_VAR: Record<StayType | 'hold' | 'season' | 'neutral', string> = {
  STR: 'var(--baw-instr-str)',
  MTR: 'var(--baw-instr-mtr)',
  LTR: 'var(--baw-instr-ltr)',
  hold: 'var(--baw-instr-hold)',
  season: 'var(--baw-instr-season)',
  neutral: 'var(--baw-instr-neutral)',
}

export function instrVarFor(kind: StayKind, type: StayType | null): string {
  if (kind === 'hold') return INSTR_VAR.hold
  return INSTR_VAR[type ?? 'LTR']
}

/** Token para el chip de tipo de UNIDAD (STR/MTR/LTR usan su instrumento;
 *  RETAIL/OFFICE/COMMON caen al neutral). */
export function unitTypeVar(type: string): string {
  if (type === 'STR' || type === 'MTR' || type === 'LTR') return INSTR_VAR[type]
  return INSTR_VAR.neutral
}

/** Modificadores de la barra del timeline (la clase base es `tl-bar`). */
export function barModifiers(opts: {
  kind: StayKind
  tentative: boolean
  clippedStart?: boolean
  clippedEnd?: boolean
}): string {
  const mods: string[] = []
  if (opts.kind === 'hold') mods.push('tl-bar--hold')
  else if (opts.tentative) mods.push('tl-bar--tent')
  if (opts.clippedStart) mods.push('tl-bar--contL')
  if (opts.clippedEnd) mods.push('tl-bar--contR')
  return mods.join(' ')
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
