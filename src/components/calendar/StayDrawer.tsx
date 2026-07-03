'use client'

// BaW OS — Drawer de detalle de estancia para el calendario de unidades.
// Panel lateral read-only: quién, cuándo, cuánto, estatus, y link al
// instrumento (contrato o reservación). Compartido por las vistas A y B.

import { useEffect, type CSSProperties } from 'react'
import Link from 'next/link'
import { X, FileText, BedDouble, Clock, ExternalLink, Users } from 'lucide-react'
import type { CalendarStay } from '@/lib/calendar-occupancy'
import { diffDaysISO } from '@/lib/calendar-occupancy'
import { formatCurrency, formatDate } from '@/lib/utils'
import { INSTR_VAR, statusChipFor, PAYMENT_STATUS_LABEL, CHANNEL_LABEL } from './calendar-ui'

export default function StayDrawer({
  stay,
  unitLabel,
  onClose,
  onDelete,
}: {
  stay: CalendarStay | null
  unitLabel?: string
  onClose: () => void
  /** Acción destructiva opcional (p.ej. eliminar un bloqueo). El caller decide
   *  para qué kinds pasarla y ejecuta el write + refetch. */
  onDelete?: (() => void) | null
}) {
  useEffect(() => {
    if (!stay) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stay, onClose])

  if (!stay) return null

  const chip = statusChipFor(stay)
  const nights =
    stay.endExclusive !== null ? diffDaysISO(stay.start, stay.endExclusive) : null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside
        className="relative h-full w-full max-w-md overflow-y-auto p-6 space-y-5 shadow-2xl"
        style={{
          backgroundColor: 'var(--baw-surface)',
          borderLeft: '1px solid var(--baw-border)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm muted-text">
            {stay.kind === 'contrato' ? (
              <>
                <FileText className="w-4 h-4" /> Contrato
              </>
            ) : stay.kind === 'reservacion' ? (
              <>
                <BedDouble className="w-4 h-4" /> Reservación
              </>
            ) : (
              <>
                <Clock className="w-4 h-4" /> Hold del booking público
              </>
            )}
            {stay.type && (
              <span className="tl-chip" style={{ '--c': INSTR_VAR[stay.type] } as CSSProperties}>
                {stay.type}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4 muted-text" />
          </button>
        </div>

        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--baw-text)' }}>
            {stay.person}
          </h2>
          {unitLabel && <p className="text-sm muted-text mt-0.5">{unitLabel}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide muted-text mb-0.5">
              {stay.kind === 'contrato' ? 'Inicio' : 'Check-in'}
            </p>
            <p style={{ color: 'var(--baw-text)' }}>{formatDate(stay.start)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide muted-text mb-0.5">
              {stay.kind === 'contrato' ? 'Fin' : 'Check-out'}
            </p>
            <p style={{ color: 'var(--baw-text)' }}>
              {stay.moveOutDay ? formatDate(stay.moveOutDay) : 'Sin fecha de fin'}
            </p>
          </div>
          {nights !== null && stay.kind !== 'contrato' && (
            <div>
              <p className="text-xs uppercase tracking-wide muted-text mb-0.5">Noches</p>
              <p style={{ color: 'var(--baw-text)' }}>{nights}</p>
            </div>
          )}
          {typeof stay.guests === 'number' && stay.guests > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide muted-text mb-0.5">Huéspedes</p>
              <p className="flex items-center gap-1" style={{ color: 'var(--baw-text)' }}>
                <Users className="w-3.5 h-3.5" /> {stay.guests}
              </p>
            </div>
          )}
          {stay.amount > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide muted-text mb-0.5">Monto</p>
              <p className="font-medium" style={{ color: 'var(--baw-text)' }}>
                {formatCurrency(stay.amount)}
                <span className="text-xs muted-text">{stay.amountSuffix}</span>
              </p>
            </div>
          )}
          {stay.channel && (
            <div>
              <p className="text-xs uppercase tracking-wide muted-text mb-0.5">Canal</p>
              <p style={{ color: 'var(--baw-text)' }}>
                {CHANNEL_LABEL[stay.channel] ?? stay.channel}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${chip.cls}`}>
            {chip.label}
          </span>
          {stay.paymentStatus && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
              {PAYMENT_STATUS_LABEL[stay.paymentStatus] ?? stay.paymentStatus}
            </span>
          )}
        </div>

        {stay.notes && (
          <div>
            <p className="text-xs uppercase tracking-wide muted-text mb-1">Notas</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--baw-text)' }}>
              {stay.notes}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          {stay.href && (
            <Link
              href={stay.href}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {stay.kind === 'contrato' ? 'Ver contrato' : 'Ver en Reservaciones'}
            </Link>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-500 border border-red-500/30 hover:bg-red-500/10 transition-colors"
            >
              {stay.kind === 'bloqueo' ? 'Eliminar bloqueo' : 'Eliminar'}
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}
