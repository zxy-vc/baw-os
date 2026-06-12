// BaW OS v1 — GET + POST /v1/occupants (inquilinos / contactos)
import { v1Read, v1Write } from '@/lib/agents/v1/handler'
import { v1Ok, v1Error } from '@/lib/agents/v1/responses'
import { parsePagination, makeCursor } from '@/lib/agents/v1/pagination'
import { createServiceClient } from '@/lib/supabase'

export const GET = v1Read({
  scopes: ['occupants:read'],
  handler: async ({ auth, req }) => {
    const { limit, afterTs } = parsePagination(req)
    const type = req.nextUrl.searchParams.get('type')
    const supabase = createServiceClient()

    let q = supabase
      .from('occupants')
      .select('id, org_id, name, phone, email, type, notes, rfc, requiere_factura, created_at')
      .eq('org_id', auth.orgId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    if (type) q = q.eq('type', type)
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

interface OccupantCreateBody {
  name: string
  phone?: string
  email?: string
  type?: 'ltr' | 'str' | 'both'
  notes?: string
  rfc?: string
  razon_social?: string
  regimen_fiscal?: string
  cp_fiscal?: string
  email_factura?: string
  requiere_factura?: boolean
}

// POST /v1/occupants — dar de alta un inquilino/contacto. action_type 'occupant.create'.
export const POST = v1Write<OccupantCreateBody>({
  scopes: ['occupants:write'],
  actionType: 'occupant.create',
  endpoint: '/v1/occupants',
  validate: (raw) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('body must be object')
    const b = raw as Record<string, unknown>
    if (typeof b.name !== 'string' || b.name.trim().length === 0) {
      throw new Error('name is required')
    }
    const type =
      b.type === 'ltr' || b.type === 'str' || b.type === 'both' ? b.type : 'both'
    return {
      name: b.name.trim(),
      phone: typeof b.phone === 'string' ? b.phone : undefined,
      email: typeof b.email === 'string' ? b.email : undefined,
      type,
      notes: typeof b.notes === 'string' ? b.notes : undefined,
      rfc: typeof b.rfc === 'string' ? b.rfc : undefined,
      razon_social: typeof b.razon_social === 'string' ? b.razon_social : undefined,
      regimen_fiscal: typeof b.regimen_fiscal === 'string' ? b.regimen_fiscal : undefined,
      cp_fiscal: typeof b.cp_fiscal === 'string' ? b.cp_fiscal : undefined,
      email_factura: typeof b.email_factura === 'string' ? b.email_factura : undefined,
      requiere_factura: typeof b.requiere_factura === 'boolean' ? b.requiere_factura : false,
    }
  },
  handler: async ({ auth, body, recordAction }) => {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('occupants')
      .insert({
        org_id: auth.orgId,
        name: body.name,
        phone: body.phone ?? null,
        email: body.email ?? null,
        type: body.type ?? 'both',
        notes: body.notes ?? null,
        rfc: body.rfc ?? null,
        razon_social: body.razon_social ?? null,
        regimen_fiscal: body.regimen_fiscal ?? null,
        cp_fiscal: body.cp_fiscal ?? null,
        email_factura: body.email_factura ?? null,
        requiere_factura: body.requiere_factura ?? false,
      })
      .select('id, org_id, name, phone, email, type, created_at')
      .single()

    if (error || !data) {
      return v1Error('insert_error', error?.message || 'failed to create occupant', 500)
    }

    await recordAction({
      actionType: 'occupant.create',
      entityType: 'occupant',
      entityId: data.id as string,
      payload: body as unknown as Record<string, unknown>,
      result: { id: data.id },
      status: 'ok',
    })

    return v1Ok(data)
  },
})
