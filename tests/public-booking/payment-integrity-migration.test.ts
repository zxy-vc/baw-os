// BaW OS · BAW-15 — Static checks on the payment-integrity migration.
// The migration is NOT executed here (nor anywhere from this lane): these tests
// read the SQL text and assert the safety properties Fran relies on to apply it.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  path.resolve(__dirname, '../../supabase/migrations/20261014010000_public_booking_payment_integrity.sql'),
  'utf8',
)
// Drop line comments so assertions only look at executable SQL.
const code = sql
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n')

describe('20261014010000_public_booking_payment_integrity.sql', () => {
  it('corre en una sola transacción', () => {
    expect(code.trim().startsWith('BEGIN;')).toBe(true)
    expect(code.trim().endsWith('COMMIT;')).toBe(true)
  })

  it('aborta limpio si faltan reservation_holds o stripe_processed_events, antes de cualquier cambio', () => {
    const guard = code.indexOf('DO $$')
    const firstChange = code.search(/\b(ALTER|CREATE|DROP)\s/)
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(firstChange)

    const block = code.slice(guard, code.indexOf('$$;', guard))
    for (const table of ['reservation_holds', 'stripe_processed_events', 'reservations']) {
      expect(block).toMatch(
        new RegExp(`IF to_regclass\\('public\\.${table}'\\) IS NULL THEN\\s+RAISE EXCEPTION`),
      )
    }
  })

  it('es idempotente: cada CREATE/ADD/trigger se puede re-ejecutar', () => {
    for (const m of Array.from(code.matchAll(/CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)\s+(?!IF NOT EXISTS)/g))) {
      throw new Error(`CREATE ${m[2]} without IF NOT EXISTS at offset ${m.index}`)
    }
    for (const m of Array.from(code.matchAll(/CREATE\s+FUNCTION/g))) {
      throw new Error(`CREATE FUNCTION without OR REPLACE at offset ${m.index}`)
    }
    for (const m of Array.from(code.matchAll(/ADD COLUMN\s+(?!IF NOT EXISTS)/g))) {
      throw new Error(`ADD COLUMN without IF NOT EXISTS at offset ${m.index}`)
    }
    for (const [, name] of Array.from(code.matchAll(/ADD CONSTRAINT\s+(\w+)/g))) {
      const dropped = code.includes(`DROP CONSTRAINT IF EXISTS ${name};`)
      const guarded = code.includes(`conname = '${name}'`)
      expect(dropped || guarded, `${name} is neither dropped first nor guarded by pg_constraint`).toBe(true)
    }
    for (const [, name, table] of Array.from(code.matchAll(/CREATE POLICY\s+(\w+)\s+ON\s+([\w.]+)/g))) {
      expect(code).toContain(`DROP POLICY IF EXISTS ${name} ON ${table};`)
    }
    expect(code).toMatch(/INSERT INTO public\.public_booking_payment_failures[\s\S]*?ON CONFLICT \(stripe_session_id\) DO NOTHING;/)
    for (const [, name, table] of Array.from(code.matchAll(/CREATE TRIGGER\s+(\w+)[\s\S]*?ON\s+([\w.]+)/g))) {
      expect(code).toContain(`DROP TRIGGER IF EXISTS ${name} ON ${table};`)
    }
  })

  it('las funciones SECURITY DEFINER no son ejecutables por anon ni authenticated', () => {
    const definers = Array.from(code.matchAll(/CREATE OR REPLACE FUNCTION\s+(public\.\w+)\(([^)]*)\)[\s\S]*?SECURITY DEFINER/g))
    expect(definers.map((d) => d[1])).toEqual([
      'public.fn_guard_hold_availability',
      'public.fn_promote_paid_reservation',
      'public.fn_record_public_booking_payment_failure',
    ])
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION public\.fn_record_public_booking_payment_failure\(text, text, text\)\s+FROM PUBLIC, anon, authenticated;/,
    )
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION public\.fn_promote_paid_reservation\(text, numeric, timestamptz\)\s+FROM PUBLIC, anon, authenticated;/,
    )
    expect(code).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.fn_promote_paid_reservation\(text, numeric, timestamptz\)\s+TO service_role;/,
    )
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.fn_guard_hold_availability\(\) FROM PUBLIC, anon, authenticated;/)
  })

  it('la promoción inserta la reserva y borra el hold en la misma función, idempotente por sesión', () => {
    const fn = code.slice(code.indexOf('FUNCTION public.fn_promote_paid_reservation('))
    expect(fn).toMatch(/ON CONFLICT \(stripe_checkout_session_id\) WHERE stripe_checkout_session_id IS NOT NULL\s+DO NOTHING/)
    expect(fn).toMatch(/DELETE FROM public\.reservation_holds WHERE id = v_hold\.id;/)
    expect(fn).toMatch(/IF p_paid_at >= v_hold\.expires_at THEN\s+RAISE EXCEPTION/)
    expect(fn).toMatch(/FOR UPDATE;/)
    expect(fn).toMatch(/pg_advisory_xact_lock/)
  })

  it('exige BAW-1 (user_org_ids) y no oculta los holds al calendario interno', () => {
    expect(code).toMatch(/IF to_regprocedure\('public\.user_org_ids\(uuid\)'\) IS NULL THEN\s+RAISE EXCEPTION/)
    expect(code).toMatch(/ALTER TABLE public\.reservation_holds ENABLE ROW LEVEL SECURITY;/)
    expect(code).toMatch(
      /CREATE POLICY reservation_holds_select ON public\.reservation_holds\s+FOR SELECT TO authenticated[\s\S]*?user_org_ids\(auth\.uid\(\)\)/,
    )
    expect(code).not.toMatch(/CREATE POLICY \w+ ON public\.reservation_holds\s+FOR (INSERT|UPDATE|DELETE|ALL)/)
    expect(code).toMatch(/ALTER TABLE public\.stripe_processed_events ENABLE ROW LEVEL SECURITY;/)
    expect(code).toMatch(/ALTER TABLE public\.checkout_idempotency ENABLE ROW LEVEL SECURITY;/)
  })

  it('garantiza el EXCLUDE anti doble reserva para todos los escritores', () => {
    expect(code).toMatch(
      /IF NOT EXISTS \([\s\S]*?conname = 'no_overlap_per_unit'[\s\S]*?ADD CONSTRAINT no_overlap_per_unit\s+EXCLUDE USING gist/,
    )
  })

  it('cada salida exitosa de la promoción cierra la conciliación (también already_promoted)', () => {
    const fn = code.slice(code.indexOf('FUNCTION public.fn_promote_paid_reservation('))
    const body = fn.slice(0, fn.indexOf('$$;'))
    // single RETURN QUERY, preceded by the resolved_at update
    expect(body.match(/RETURN QUERY/g)).toHaveLength(1)
    expect(body.indexOf('SET resolved_at = now()')).toBeLessThan(body.indexOf('RETURN QUERY'))
  })

  it('promoción y registro de fallos se serializan con el mismo candado por sesión', () => {
    const lock = "pg_advisory_xact_lock(hashtextextended('public_booking_session:' || p_stripe_session_id, 0))"
    const promote = code.slice(code.indexOf('FUNCTION public.fn_promote_paid_reservation('))
    const record = code.slice(code.indexOf('FUNCTION public.fn_record_public_booking_payment_failure('))
    expect(promote.slice(0, promote.indexOf('$$;'))).toContain(lock)
    expect(record.slice(0, record.indexOf('$$;'))).toContain(lock)
    // session lock is taken before the hold row lock
    expect(promote.indexOf(lock)).toBeLessThan(promote.indexOf('FOR UPDATE'))
  })

  it('no hay nombres de archivo viejos en los mensajes de error', () => {
    expect(sql).not.toContain('20260720_')
  })
})
