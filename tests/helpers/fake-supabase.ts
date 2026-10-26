// Supabase en memoria para tests de org scoping. Solo aplica filtros .eq() e
// .in(); el resto de modificadores (order, gt, gte, lt, lte, limit, range) son
// no-op. Basta para verificar que una query acotada a otra org no encuentra la
// fila.
// No resuelve embeds (`x:tabla(...)`): pedir uno lanza, porque con service-role
// un join no filtra los hijos por org — cada salto debe ser su propia query.
export type Row = Record<string, unknown>

export function makeFakeSupabase(tables: Record<string, Row[]>) {
  function from(table: string) {
    const state = {
      op: 'select' as 'select' | 'insert' | 'update' | 'delete',
      filters: [] as [string, unknown][],
      inFilters: [] as [string, unknown[]][],
      payload: null as Row | null,
      single: null as null | 'single' | 'maybeSingle',
      countOnly: false,
    }
    const exec = () => {
      const all = tables[table] ?? []
      let rows = all.filter(
        (r) =>
          state.filters.every(([k, v]) => r[k] === v) &&
          state.inFilters.every(([k, vs]) => vs.includes(r[k]))
      )
      if (state.op === 'insert') {
        const row = { id: `new-${table}`, ...state.payload }
        tables[table] = [...all, row]
        rows = [row]
      }
      if (state.op === 'update') rows.forEach((r) => Object.assign(r, state.payload))
      if (state.op === 'delete') tables[table] = all.filter((r) => !rows.includes(r))
      if (state.countOnly) return { data: null, count: rows.length, error: null }
      if (state.single === 'single') {
        return rows.length
          ? { data: rows[0], error: null }
          : { data: null, error: { message: 'not found' } }
      }
      if (state.single === 'maybeSingle') return { data: rows[0] ?? null, error: null }
      return { data: rows, error: null }
    }
    const b = {
      select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (cols?.includes('(')) throw new Error(`fake supabase: embed no soportado en ${table}: ${cols}`)
        if (opts?.head) state.countOnly = true
        return b
      },
      eq: (k: string, v: unknown) => {
        state.filters.push([k, v])
        return b
      },
      in: (k: string, vs: unknown[]) => {
        state.inFilters.push([k, vs])
        return b
      },
      order: () => b,
      gt: () => b,
      gte: () => b,
      lt: () => b,
      lte: () => b,
      limit: () => b,
      range: () => b,
      insert: (p: Row) => {
        state.op = 'insert'
        state.payload = p
        return b
      },
      // Basta para los usos actuales (cache de idempotencia): se comporta como insert.
      upsert: (p: Row) => {
        state.op = 'insert'
        state.payload = p
        return b
      },
      update: (p: Row) => {
        state.op = 'update'
        state.payload = p
        return b
      },
      delete: () => {
        state.op = 'delete'
        return b
      },
      single: () => {
        state.single = 'single'
        return b
      },
      maybeSingle: () => {
        state.single = 'maybeSingle'
        return b
      },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(exec()).then(res, rej),
    }
    return b
  }
  // RPCs fire-and-forget (p.ej. touch_agent_credential): no-op.
  const rpc = async () => ({ data: null, error: null })
  return { from, rpc }
}
