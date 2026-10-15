// BaW OS · BAW-15 — In-memory stand-in for the Supabase service client used by
// the public booking checkout route and Stripe webhook. No network, no DB.
//
// It implements only the query-builder calls those two routes make, plus the
// DB-side behaviour they rely on, mirrored from the migrations:
//   · reservation_holds: purge of expired holds before insert
//     (20260703_02 trg_purge_expired_holds), availability guard
//     (20261014010000 trg_guard_hold_availability), EXCLUDE no_overlap_per_hold,
//     UNIQUE idempotency_key, checkout snapshot CHECK on stripe_session_id.
//   · fn_unit_is_available (20260704_quote_flow_crm).
//   · checkout_idempotency.expires_at default (20260523, 24 h).
//   · fn_promote_paid_reservation and fn_record_public_booking_payment_failure
//     (20261014010000), step by step. JS runs each synchronously, which stands
//     in for the SQL transaction + advisory locks; real lock waits, snapshots
//     and deadlocks are NOT exercised here.
// If the SQL changes, update the mirror here.

type Row = Record<string, unknown>
type PgError = { code: string; message: string }
type Result = { data: unknown; error: PgError | null }

function overlaps(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom < bTo && bFrom < aTo
}

export function createFakeDb(opts: { now?: () => Date } = {}) {
  const now = opts.now ?? (() => new Date())
  let seq = 0
  const nextId = (prefix: string) => `${prefix}-${++seq}`

  const tables: Record<string, Row[]> = {
    units: [],
    v_public_units: [],
    checkout_idempotency: [],
    reservation_holds: [],
    reservations: [],
    unit_blocks: [],
    stripe_processed_events: [],
    public_booking_payment_failures: [],
  }

  // Failure injection: table → op → error returned instead of executing.
  const faults: Record<string, Partial<Record<Op, PgError>>> = {}
  const rpcFaults: Record<string, PgError> = {}

  function unitIsAvailable(unitId: string, from: string, to: string): boolean {
    const t = now().toISOString()
    const resBlocked = tables.reservations.some(
      (r) =>
        r.unit_id === unitId &&
        (['confirmed', 'checked_in'].includes(r.status as string) ||
          (r.status === 'tentative' && (r.hold_expires_at == null || (r.hold_expires_at as string) > t))) &&
        overlaps(r.check_in as string, r.check_out as string, from, to),
    )
    const holdBlocked = tables.reservation_holds.some(
      (h) =>
        h.unit_id === unitId &&
        (h.expires_at as string) > t &&
        overlaps(h.from_date as string, h.to_date as string, from, to),
    )
    // unit_blocks.end_date is inclusive ('[]' in SQL)
    const blockBlocked = tables.unit_blocks.some(
      (b) =>
        b.unit_id === unitId &&
        (b.start_date as string) < to &&
        from <= (b.end_date as string),
    )
    return !resBlocked && !holdBlocked && !blockBlocked
  }

  // The whole INSERT statement is atomic in Postgres: if it fails, the purge
  // done by its BEFORE trigger is rolled back too.
  function insertHold(input: Row): Result {
    const snapshot = tables.reservation_holds
    const res = insertHoldStatement(input)
    if (res.error) tables.reservation_holds = snapshot
    return res
  }

  function insertHoldStatement(input: Row): Result {
    const t = now().toISOString()
    // trg_purge_expired_holds (BEFORE INSERT, statement level)
    tables.reservation_holds = tables.reservation_holds.filter((h) => (h.expires_at as string) > t)
    const row: Row = {
      id: nextId('hold'),
      guests_count: 1,
      booking_mode: 'full',
      stripe_session_id: null,
      created_at: t,
      expires_at: new Date(now().getTime() + 15 * 60_000).toISOString(),
      ...input,
    }
    // trg_guard_hold_availability (BEFORE INSERT, row level)
    if (!unitIsAvailable(row.unit_id as string, row.from_date as string, row.to_date as string)) {
      return { data: null, error: { code: '23P01', message: 'Unit is not available' } }
    }
    if (tables.reservation_holds.some((h) => h.idempotency_key === row.idempotency_key)) {
      return { data: null, error: { code: '23505', message: 'duplicate idempotency_key' } }
    }
    if (
      tables.reservation_holds.some(
        (h) =>
          h.unit_id === row.unit_id &&
          overlaps(h.from_date as string, h.to_date as string, row.from_date as string, row.to_date as string),
      )
    ) {
      return { data: null, error: { code: '23P01', message: 'no_overlap_per_hold' } }
    }
    tables.reservation_holds.push(row)
    return { data: row, error: null }
  }

  function checkHoldSnapshot(h: Row): PgError | null {
    if (h.stripe_session_id == null) return null
    const ok =
      h.organization_id != null &&
      h.guest_name != null &&
      typeof h.price_per_night === 'number' && h.price_per_night >= 0 &&
      typeof h.total_price === 'number' && h.total_price >= 0
    return ok ? null : { code: '23514', message: 'reservation_holds_checkout_snapshot_check' }
  }

  function promotePaidReservation(args: Row): Result {
    const sessionId = args.p_stripe_session_id as string
    const amountPaid = args.p_amount_paid as number
    const paidAt = args.p_paid_at as string
    const raise = (message: string, code = 'P0001'): Result => ({ data: null, error: { code, message } })

    if (!sessionId || !sessionId.trim()) return raise('Stripe Checkout session id is required')
    if (amountPaid == null || amountPaid < 0) return raise('Stripe amount_paid must be a non-negative amount')
    if (!paidAt) return raise('Stripe payment timestamp is required')

    // Single exit, as in SQL: every success closes the reconciliation item.
    const succeed = (reservationId: unknown, alreadyPromoted: boolean): Result => {
      for (const f of tables.public_booking_payment_failures) {
        if (f.stripe_session_id === sessionId && f.resolved_at == null) f.resolved_at = now().toISOString()
      }
      return { data: [{ reservation_id: reservationId, already_promoted: alreadyPromoted }], error: null }
    }

    const existing = tables.reservations.find((r) => r.stripe_checkout_session_id === sessionId)
    if (existing) return succeed(existing.id, true)

    const hold = tables.reservation_holds.find((h) => h.stripe_session_id === sessionId)
    if (!hold) return raise(`No hold found for Stripe Checkout session ${sessionId}`)

    if (new Date(paidAt).getTime() >= new Date(hold.expires_at as string).getTime()) {
      return raise(`Hold ${hold.id} expired at ${hold.expires_at} before payment at ${paidAt}`)
    }
    if (hold.organization_id == null || hold.guest_name == null || hold.price_per_night == null || hold.total_price == null) {
      return raise(`Hold ${hold.id} has no complete pre-payment reservation snapshot`)
    }
    if (hold.total_price !== amountPaid) {
      return raise(`Stripe amount ${amountPaid} does not match hold ${hold.id} total ${hold.total_price}`)
    }
    const conflict = tables.reservations.some(
      (r) =>
        r.unit_id === hold.unit_id &&
        ['confirmed', 'checked_in'].includes(r.status as string) &&
        overlaps(r.check_in as string, r.check_out as string, hold.from_date as string, hold.to_date as string),
    )
    if (conflict) return raise(`Unit ${hold.unit_id} already has a confirmed reservation overlapping hold ${hold.id}`, '23P01')

    const reservation: Row = {
      id: nextId('res'),
      unit_id: hold.unit_id,
      organization_id: hold.organization_id,
      guest_name: hold.guest_name,
      guest_email: hold.guest_email,
      guest_phone: hold.guest_phone,
      check_in: hold.from_date,
      check_out: hold.to_date,
      mode: hold.booking_mode,
      guests_count: hold.guests_count,
      price_per_night: hold.price_per_night,
      total_price: hold.total_price,
      status: 'confirmed',
      payment_status: 'paid',
      amount_paid: amountPaid,
      platform: 'direct',
      stripe_checkout_session_id: sessionId,
    }
    if (!['full', 'room', 'bed'].includes(reservation.mode as string)) {
      return raise('reservations_mode_check', '23514')
    }
    tables.reservations.push(reservation)
    tables.reservation_holds = tables.reservation_holds.filter((h) => h.id !== hold.id)
    return succeed(reservation.id, false)
  }

  function recordPaymentFailure(args: Row): Result {
    const sessionId = args.p_stripe_session_id as string
    if (tables.reservations.some((r) => r.stripe_checkout_session_id === sessionId)) {
      return { data: false, error: null }
    }
    const row = tables.public_booking_payment_failures.find((f) => f.stripe_session_id === sessionId)
    const update = {
      stripe_event_id: args.p_stripe_event_id,
      last_error: args.p_error,
      last_failed_at: now().toISOString(),
    }
    if (row) Object.assign(row, update) // resolved_at untouched
    else {
      tables.public_booking_payment_failures.push({
        stripe_session_id: sessionId,
        first_failed_at: now().toISOString(),
        resolved_at: null,
        ...update,
      })
    }
    return { data: true, error: null }
  }

  type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert'

  function from(table: string) {
    const state: {
      op: Op
      payload?: Row
      onConflict?: string
      filters: Array<[string, unknown]>
      returning: boolean
    } = { op: 'select', filters: [], returning: false }

    const matches = (r: Row) => state.filters.every(([k, v]) => r[k] === v)

    function execute(): Result {
      const fault = faults[table]?.[state.op]
      if (fault) return { data: null, error: fault }
      const rows = tables[table]
      if (!rows) return { data: null, error: { code: '42P01', message: `relation "${table}" does not exist` } }

      switch (state.op) {
        case 'select':
          return { data: rows.filter(matches), error: null }
        case 'insert': {
          if (table === 'reservation_holds') {
            const r = insertHold(state.payload!)
            return { data: r.data ? [r.data] : null, error: r.error }
          }
          if (table === 'stripe_processed_events' && rows.some((r) => r.event_id === state.payload!.event_id)) {
            return { data: null, error: { code: '23505', message: 'duplicate key stripe_processed_events_pkey' } }
          }
          const row = { ...state.payload }
          rows.push(row)
          return { data: [row], error: null }
        }
        case 'update': {
          const hit = rows.filter(matches)
          for (const r of hit) {
            const next = { ...r, ...state.payload }
            if (table === 'reservation_holds') {
              const err = checkHoldSnapshot(next)
              if (err) return { data: null, error: err }
            }
            Object.assign(r, state.payload)
          }
          return { data: hit, error: null }
        }
        case 'delete': {
          const hit = rows.filter(matches)
          tables[table] = rows.filter((r) => !matches(r))
          return { data: hit, error: null }
        }
        case 'upsert': {
          const key = state.onConflict!
          const existing = rows.find((r) => r[key] === state.payload![key])
          if (existing) Object.assign(existing, state.payload)
          else {
            const defaults: Row =
              table === 'public_booking_payment_failures'
                ? { first_failed_at: now().toISOString(), resolved_at: null }
                : table === 'checkout_idempotency'
                  ? { expires_at: new Date(now().getTime() + 24 * 60 * 60_000).toISOString() }
                  : {}
            rows.push({ ...defaults, ...state.payload })
          }
          return { data: null, error: null }
        }
      }
    }

    function finish(mode: 'many' | 'single' | 'maybeSingle'): Result {
      const res = execute()
      if (res.error || mode === 'many') return res
      const list = (res.data as Row[] | null) ?? []
      if (list.length === 1) return { data: list[0], error: null }
      if (list.length === 0 && mode === 'maybeSingle') return { data: null, error: null }
      return { data: null, error: { code: 'PGRST116', message: `expected 1 row, got ${list.length}` } }
    }

    const builder = {
      select(_cols?: string) {
        if (state.op !== 'select') state.returning = true
        return builder
      },
      insert(payload: Row) { state.op = 'insert'; state.payload = payload; return builder },
      update(payload: Row) { state.op = 'update'; state.payload = payload; return builder },
      delete() { state.op = 'delete'; return builder },
      upsert(payload: Row, o: { onConflict: string }) {
        state.op = 'upsert'; state.payload = payload; state.onConflict = o.onConflict; return builder
      },
      eq(col: string, val: unknown) { state.filters.push([col, val]); return builder },
      single: () => Promise.resolve(finish('single')),
      maybeSingle: () => Promise.resolve(finish('maybeSingle')),
      then<T>(resolve: (r: Result) => T, reject?: (e: unknown) => T) {
        return Promise.resolve(finish('many')).then(resolve, reject)
      },
    }
    return builder
  }

  async function rpc(name: string, args: Row): Promise<Result> {
    const fault = rpcFaults[name]
    if (fault) return { data: null, error: fault }
    if (name === 'fn_record_public_booking_payment_failure') return recordPaymentFailure(args)
    if (name === 'fn_unit_is_available') {
      return { data: unitIsAvailable(args.p_unit_id as string, args.p_from as string, args.p_to as string), error: null }
    }
    if (name === 'fn_promote_paid_reservation') return promotePaidReservation(args)
    return { data: null, error: { code: '42883', message: `function ${name} does not exist` } }
  }

  return { tables, faults, rpcFaults, client: { from, rpc } }
}

export type FakeDb = ReturnType<typeof createFakeDb>
