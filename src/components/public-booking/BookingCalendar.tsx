'use client'

import 'react-day-picker/dist/style.css'
import { DayPicker } from 'react-day-picker'
import { es } from 'date-fns/locale'
import { useMemo } from 'react'
import { parseISODate, toISODate } from '@/lib/public-booking-client/format'
import type { AvailabilityRange } from '@/lib/public-booking-client/api-client'

/**
 * Calendario de reserva con días bloqueados en gris.
 * Selección de rango (from / to). Locale español.
 */
export default function BookingCalendar({
  from,
  to,
  onChange,
  blocked = [],
  minDate,
  maxDate,
}: {
  from?: string
  to?: string
  onChange: (range: { from?: string; to?: string }) => void
  blocked?: AvailabilityRange[]
  minDate?: Date
  maxDate?: Date
}) {
  const selected = useMemo(() => ({
    from: from ? parseISODate(from) ?? undefined : undefined,
    to: to ? parseISODate(to) ?? undefined : undefined,
  }), [from, to])

  const disabledRanges = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const arr: Array<{ from?: Date; to?: Date; before?: Date; after?: Date }> = [
      { before: minDate ?? today },
    ]
    if (maxDate) arr.push({ after: maxDate })
    for (const b of blocked) {
      const f = parseISODate(b.from)
      const t = parseISODate(b.to)
      if (f && t) arr.push({ from: f, to: new Date(t.getTime() - 86400000) })
    }
    return arr
  }, [blocked, minDate, maxDate])

  return (
    <div className="pb-calendar">
      <DayPicker
        mode="range"
        locale={es}
        selected={selected as any}
        onSelect={(range: any) => {
          onChange({
            from: range?.from ? toISODate(range.from) : undefined,
            to: range?.to ? toISODate(range.to) : undefined,
          })
        }}
        disabled={disabledRanges}
        numberOfMonths={1}
        weekStartsOn={1}
        showOutsideDays
      />
      <style>{`
        .pb-calendar {
          --rdp-accent-color: var(--accent);
          --rdp-background-color: var(--accent-soft);
          --rdp-accent-color-dark: var(--accent-2);
          --rdp-cell-size: 40px;
          --rdp-caption-font-size: 16px;
          font-family: var(--font-body);
          color: var(--ink);
        }
        .pb-calendar .rdp { margin: 0; }
        .pb-calendar .rdp-caption_label {
          font-family: var(--font-display);
          font-weight: 400;
          letter-spacing: -0.01em;
          text-transform: capitalize;
        }
        .pb-calendar .rdp-head_cell {
          font-family: var(--font-mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--ink-3);
          font-weight: 500;
        }
        .pb-calendar .rdp-day {
          font-family: var(--font-body);
          font-size: 14px;
          border-radius: 2px;
        }
        .pb-calendar .rdp-day_selected {
          background: var(--accent) !important;
          color: var(--accent-ink) !important;
        }
        .pb-calendar .rdp-day_range_middle {
          background: var(--accent-soft) !important;
          color: var(--ink) !important;
        }
        .pb-calendar .rdp-day_disabled {
          color: var(--ink-4);
          text-decoration: line-through;
          opacity: 0.5;
        }
        .pb-calendar .rdp-button:hover:not([disabled]):not(.rdp-day_selected) {
          background: var(--surface-2);
        }
      `}</style>
    </div>
  )
}
