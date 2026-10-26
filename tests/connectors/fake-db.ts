// Supabase en memoria para las pruebas del conector (ENG-624). A diferencia de
// tests/helpers/fake-supabase.ts, aplica de verdad los filtros de rango, `in`,
// orden, range/limit y la proyección de columnas, porque las cifras del
// conector dependen de qué filas entran al periodo. Registra cada escritura
// para poder afirmar que una lectura no escribe nada fuera de la bitácora.
export type Row = Record<string, unknown>

type Filter = (r: Row) => boolean

export interface FakeDbOptions {
  /** Hace fallar cualquier INSERT a estas tablas (p.ej. la bitácora). */
  failInsert?: Set<string>
  /** Tablas que "no existen" (migración sin aplicar): toda operación falla
   *  como PostgREST (PGRST205). */
  missingTables?: Set<string>
  /** Restricción tipo UNIQUE: devuelve mensaje de error si el insert choca. */
  checkInsert?: (table: string, row: Row, tables: Record<string, Row[]>) => string | null
}

export function makeFakeDb(tables: Record<string, Row[]>, opts: FakeDbOptions = {}) {
  const writes: { table: string; op: 'insert' | 'update' | 'delete'; row: Row }[] = []
  let seq = 0

  function from(table: string) {
    const st = {
      op: 'select' as 'select' | 'insert' | 'update' | 'delete',
      cols: '*',
      filters: [] as Filter[],
      orders: [] as { col: string; asc: boolean }[],
      range: null as [number, number] | null,
      limit: null as number | null,
      payload: null as Row | Row[] | null,
      single: null as null | 'single' | 'maybeSingle',
    }

    const project = (r: Row): Row => {
      if (st.cols.trim() === '*') return { ...r }
      const out: Row = {}
      for (const c of st.cols.split(',').map((s) => s.trim())) out[c] = r[c]
      return out
    }

    const exec = () => {
      if (opts.missingTables?.has(table)) {
        return {
          data: null,
          error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` },
        }
      }
      const all = tables[table] ?? (tables[table] = [])
      let rows: Row[]
      if (st.op === 'insert') {
        if (opts.failInsert?.has(table)) return { data: null, error: { message: `insert into ${table} failed` } }
        const list = Array.isArray(st.payload) ? st.payload : [st.payload as Row]
        rows = []
        for (const p of list) {
          const row = { id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...p }
          const err = opts.checkInsert?.(table, row, tables)
          if (err) return { data: null, error: { message: err } }
          all.push(row)
          writes.push({ table, op: 'insert', row })
          rows.push(row)
        }
      } else {
        rows = all.filter((r) => st.filters.every((f) => f(r)))
        if (st.op === 'update') {
          rows.forEach((r) => {
            Object.assign(r, st.payload)
            writes.push({ table, op: 'update', row: r })
          })
        }
        if (st.op === 'delete') {
          tables[table] = all.filter((r) => !rows.includes(r))
          rows.forEach((r) => writes.push({ table, op: 'delete', row: r }))
        }
      }
      if (st.orders.length) {
        rows = [...rows].sort((a, b) => {
          for (const o of st.orders) {
            const x = a[o.col] as string | number
            const y = b[o.col] as string | number
            if (x === y) continue
            if (x === null || x === undefined) return 1
            if (y === null || y === undefined) return -1
            return (x < y ? -1 : 1) * (o.asc ? 1 : -1)
          }
          return 0
        })
      }
      if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1)
      if (st.limit !== null) rows = rows.slice(0, st.limit)
      const data = rows.map(project)
      if (st.single === 'single') {
        return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: 'not found' } }
      }
      if (st.single === 'maybeSingle') return { data: data[0] ?? null, error: null }
      return { data, error: null }
    }

    const cmp = (k: string, pred: (v: any) => boolean) => {
      st.filters.push((r) => pred(r[k]))
      return b
    }
    const b: any = {
      select: (cols = '*') => {
        if (cols.includes('(')) throw new Error(`fake db: embed no soportado en ${table}: ${cols}`)
        st.cols = cols
        return b
      },
      eq: (k: string, v: unknown) => cmp(k, (x) => x === v),
      neq: (k: string, v: unknown) => cmp(k, (x) => x !== v),
      in: (k: string, vs: unknown[]) => cmp(k, (x) => vs.includes(x)),
      is: (k: string, v: unknown) => cmp(k, (x) => (x ?? null) === v),
      gt: (k: string, v: any) => cmp(k, (x) => x !== null && x !== undefined && x > v),
      gte: (k: string, v: any) => cmp(k, (x) => x !== null && x !== undefined && x >= v),
      lt: (k: string, v: any) => cmp(k, (x) => x !== null && x !== undefined && x < v),
      lte: (k: string, v: any) => cmp(k, (x) => x !== null && x !== undefined && x <= v),
      order: (col: string, o?: { ascending?: boolean }) => {
        st.orders.push({ col, asc: o?.ascending !== false })
        return b
      },
      range: (a: number, z: number) => {
        st.range = [a, z]
        return b
      },
      limit: (n: number) => {
        st.limit = n
        return b
      },
      insert: (p: Row | Row[]) => {
        st.op = 'insert'
        st.payload = p
        return b
      },
      update: (p: Row) => {
        st.op = 'update'
        st.payload = p
        return b
      },
      delete: () => {
        st.op = 'delete'
        return b
      },
      single: () => {
        st.single = 'single'
        return b
      },
      maybeSingle: () => {
        st.single = 'maybeSingle'
        return b
      },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
    }
    return b
  }

  return { from, tables, writes }
}
