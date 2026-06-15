// BaW OS v1 — GET + POST /v1/units
import { v1Read, v1Write } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { parsePagination, makeCursor } from '@/lib/agents/v1/pagination'
import { createServiceClient } from '@/lib/supabase'

const UNIT_TYPES = ['STR', 'MTR', 'LTR', 'OFFICE', 'COMMON']
const UNIT_STATUSES = ['available', 'occupied', 'maintenance', 'reserved', 'inactive']

export const GET = v1Read({
  scopes: ['units:read'],
  handler: async ({ auth, req }) => {
    const { limit, afterId, afterTs } = parsePagination(req)
    const status = req.nextUrl.searchParams.get('status')
    const supabase = createServiceClient()

    let q = supabase
      .from('units')
      .select(
        'id, org_id, number, floor, type, status, area_m2, bedrooms, bathrooms, amenities, notes, created_at, updated_at'
      )
      .eq('org_id', auth.orgId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    if (status) q = q.eq('status', status)
    if (afterTs) q = q.lt('created_at', afterTs)

    const { data, error } = await q
    if (error) return v1Error('query_error', error.message, 500)

    const rows = data || []
    const hasMore = rows.length > limit
    const trimmed = hasMore ? rows.slice(0, limit) : rows
    const last = trimmed[trimmed.length - 1]
    const next_cursor = hasMore && last ? makeCursor(last) : null

    return v1Ok(trimmed, { next_cursor, limit })
  },
})

interface UnitCreateBody {
  number: string
  type?: string
  floor?: number
  status?: string
  area_m2?: number
  bedrooms?: number
  bathrooms?: number
  amenities?: string[]
  notes?: string
}

// POST /v1/units — dar de alta una unidad. action_type 'unit.create'.
export const POST = v1Write<UnitCreateBody>({
  scopes: ['units:write'],
  actionType: 'unit.create',
  endpoint: '/v1/units',
  validate: (raw) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('body must be object')
    const b = raw as Record<string, unknown>
    if (typeof b.number !== 'string' || b.number.trim().length === 0) {
      throw new Error('number is required')
    }
    if (b.type !== undefined && !UNIT_TYPES.includes(b.type as string)) {
      throw new Error(`type must be one of: ${UNIT_TYPES.join(', ')}`)
    }
    if (b.status !== undefined && !UNIT_STATUSES.includes(b.status as string)) {
      throw new Error(`status must be one of: ${UNIT_STATUSES.join(', ')}`)
    }
    return {
      number: b.number.trim(),
      type: typeof b.type === 'string' ? b.type : 'LTR',
      floor: typeof b.floor === 'number' ? b.floor : undefined,
      status: typeof b.status === 'string' ? b.status : 'available',
      area_m2: typeof b.area_m2 === 'number' ? b.area_m2 : undefined,
      bedrooms: typeof b.bedrooms === 'number' ? b.bedrooms : undefined,
      bathrooms: typeof b.bathrooms === 'number' ? b.bathrooms : undefined,
      amenities: Array.isArray(b.amenities) ? (b.amenities as string[]) : undefined,
      notes: typeof b.notes === 'string' ? b.notes : undefined,
    }
  },
  handler: async ({ auth, body, recordAction }) => {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('units')
      .insert({
        org_id: auth.orgId,
        number: body.number,
        type: body.type ?? 'LTR',
        floor: body.floor ?? null,
        status: body.status ?? 'available',
        area_m2: body.area_m2 ?? null,
        bedrooms: body.bedrooms ?? null,
        bathrooms: body.bathrooms ?? null,
        amenities: body.amenities ?? null,
        notes: body.notes ?? null,
      })
      .select('id, org_id, number, floor, type, status, created_at')
      .single()

    if (error || !data) {
      // 23505 = unique_violation (org_id, number) — la unidad ya existe
      const dup = (error as { code?: string } | null)?.code === '23505'
      return v1Error(
        dup ? 'duplicate' : 'insert_error',
        dup ? `unit ${body.number} already exists` : error?.message || 'failed to create unit',
        dup ? 409 : 500,
      )
    }

    await recordAction({
      actionType: 'unit.create',
      entityType: 'unit',
      entityId: data.id as string,
      payload: body as unknown as Record<string, unknown>,
      result: { id: data.id },
      status: 'ok',
    })

    return v1Ok(data)
  },
})
