// BaW OS — Tests de pagination cursor (pure JS reimplementation matching pagination.ts)
// Run: node tests/v1/pagination.test.mjs

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function parsePagination(searchParams) {
  const limitRaw = parseInt(searchParams.get('limit') || '', 10)
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, limitRaw), MAX_LIMIT)
    : DEFAULT_LIMIT
  const cursor = searchParams.get('cursor')
  if (!cursor) return { limit, afterId: null, afterTs: null }
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'))
    return {
      limit,
      afterId: typeof decoded.after_id === 'string' ? decoded.after_id : null,
      afterTs: typeof decoded.after_ts === 'string' ? decoded.after_ts : null,
    }
  } catch {
    return { limit, afterId: null, afterTs: null }
  }
}

function makeCursor(row) {
  return Buffer.from(JSON.stringify({ after_id: row.id, after_ts: row.created_at })).toString('base64')
}

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++ }
  else { console.error(`  ✗ ${name}`); fail++ }
}

const a = parsePagination(new URLSearchParams({}))
assert('default limit', a.limit === DEFAULT_LIMIT)
assert('default afterId null', a.afterId === null)

const b = parsePagination(new URLSearchParams({ limit: '25' }))
assert('limit=25', b.limit === 25)

const c = parsePagination(new URLSearchParams({ limit: '9999' }))
assert('clamps to MAX_LIMIT', c.limit === MAX_LIMIT)

const d = parsePagination(new URLSearchParams({ limit: 'abc' }))
assert('invalid limit falls back to default', d.limit === DEFAULT_LIMIT)

const cur = makeCursor({ id: 'aaa-bbb', created_at: '2024-01-01T00:00:00Z' })
const e = parsePagination(new URLSearchParams({ cursor: cur }))
assert('cursor afterId roundtrip', e.afterId === 'aaa-bbb')
assert('cursor afterTs roundtrip', e.afterTs === '2024-01-01T00:00:00Z')

const f = parsePagination(new URLSearchParams({ cursor: 'not-base64' }))
assert('invalid cursor returns null', f.afterId === null && f.afterTs === null)

console.log(`\nPagination: ${pass}/${pass + fail} pass`)
if (fail > 0) process.exit(1)
